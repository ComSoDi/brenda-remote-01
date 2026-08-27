// voice-proxy/index.js
// Standalone WebSocket proxy: browser <-> Gemini Live API
// Deploy on Render (free tier) as a separate service.
// Env vars required: GEMINI_API_KEY, AUTH_SESSION_SECRET
// Env vars optional: MONGODB_URI, MONGODB_DB, PORT, GEMINI_LIVE_VOICE, GEMINI_LIVE_MODEL,
//                     NEW_RELIC_LICENSE_KEY, NEW_RELIC_APP_NAME

import newrelic from 'newrelic';
import crypto from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { MongoClient } from "mongodb";

// ── session verification (mirrors lib/auth.js) ────────────────────────────

const COOKIE_NAME = "brenda_session";
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || "default_secret";

function getSession(req) {
  // Try session cookie first (same-domain / local dev)
  let token;
  const raw = req.headers.cookie || "";
  const pair = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE_NAME + "="));
  if (pair) {
    token = decodeURIComponent(pair.split("=")[1]);
  } else {
    // Cross-domain fallback: short-lived voice token passed as ?vt= URL param.
    // Issued by /api/auth/me and stored in window.Config.VOICE_TOKEN on the frontend.
    try {
      const vt = new URL(req.url, "http://localhost").searchParams.get("vt");
      if (vt) token = vt;
    } catch { /* ignore */ }
  }
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [head, p, sig] = parts;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(`${head}.${p}`).digest("base64url");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }
}

// ── MongoDB (non-fatal gender lookup) ─────────────────────────────────────

let _mongoClient = null;

async function getDb() {
  if (!process.env.MONGODB_URI) return null;
  if (!_mongoClient) {
    _mongoClient = new MongoClient(process.env.MONGODB_URI);
    await _mongoClient.connect();
  }
  return _mongoClient.db(process.env.MONGODB_DB || "ai_chat");
}

// ── subscription / quota (mirrors lib/subscriptions.js + lib/plans.js) ────
// Standalone deploy (rootDir: voice-proxy in render.yaml) can't import from
// the main repo's lib/ folder, hence the duplication — keep in sync by hand.

const PLAN_FREE = "brenda_free";

// "Monthly" means calendar month (UTC) while Google Play billing isn't wired
// up yet — mirrors lib/subscriptions.js, keep in sync by hand (see note above).
function startOfMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfNextMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function isSameUTCMonth(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

async function getPlan(db, planId) {
  return db.collection("plans").findOne({ planId });
}

async function getOrCreateSubscription(db, userId) {
  const now = new Date();
  const subs = db.collection("subscriptions");

  const sub = await subs.findOne({ userId, status: "active" });
  if (sub && isSameUTCMonth(sub.periodStartDate, now)) return sub;

  // A pending (deferred) downgrade takes over here, at rollover — never mid-period.
  const planId = sub?.pendingPlanId || sub?.planId || PLAN_FREE;
  const plan = await getPlan(db, planId);

  const newSub = {
    userId,
    planId,
    planDisplayName: plan?.displayName || "Free",
    status: "active",
    periodStartDate: startOfMonthUTC(now),
    periodEndDate: startOfNextMonthUTC(now),
    createdAt: now,
    updatedAt: now,
    voiceQuota: plan?.voiceQuota ?? 0,
    chatQuota: plan?.chatQuota ?? 0,
    previousPlanId: sub?.planId ?? null,
    previousPurchaseToken: null,
    planChangedAt: null,
    pendingPlanId: null,
    pendingPlanChangedAt: null,
    voiceExhaustedAt: null,
    chatExhaustedAt: null,
    gp: {
      purchaseToken: null, latestOrderId: null, linkedPurchaseToken: null,
      subscriptionState: null, acknowledgementState: null, regionCode: null,
      startTime: null, environment: null, lineItems: null,
      externalAccountIdentifiers: null, lastVerifiedAt: null, rawResponse: null,
    },
  };

  if (sub) {
    await subs.updateOne({ _id: sub._id }, { $set: { status: "expired", updatedAt: now } });
  }
  const insertRes = await subs.insertOne(newSub);
  newSub._id = insertRes.insertedId;
  return newSub;
}

async function getVoiceTokensUsedSince(db, userId, sinceDate) {
  const [agg] = await db.collection("gemini_voice_usage_events")
    .aggregate([
      { $match: { userId, createdAt: { $gte: sinceDate } } },
      { $group: { _id: null, total: { $sum: "$usage.totalTokens" } } },
    ])
    .toArray();
  return agg?.total || 0;
}

function computeStatus(used, quota) {
  return used >= quota ? "exhausted" : "active";
}

// ── voice usage recording (minimal — mirrors lib/usage.js recordVoiceUsage) ─
// Only captures what the quota check needs (usage.totalTokens) plus a
// zeroed cost stub so dashboard reads don't hit missing fields. Does NOT
// replicate per-modality cost breakdown or the gemini_voice_usage_summary
// rollup — full-fidelity cost accounting for this proxy path is a known,
// accepted gap; the quota gate itself is accurate since it only needs tokens.
async function recordVoiceUsageMinimal(db, { userId, voiceSessionId, responseId, model, usage, planId, planDisplayName }) {
  const totalInput  = Number(usage?.promptTokenCount ?? 0) || 0;
  const totalOutput = Number(usage?.responseTokenCount ?? usage?.candidatesTokenCount ?? 0) || 0;
  const thoughtsTokens = Number(usage?.thoughtsTokenCount ?? 0) || 0;
  const normalizedUsage = {
    textInputTokens: 0, audioInputTokens: totalInput,
    textOutputTokens: 0, audioOutputTokens: totalOutput,
    thoughtsTokens,
    totalInputTokens: totalInput, totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput + thoughtsTokens,
  };
  const now = new Date();
  await db.collection("gemini_voice_usage_events").updateOne(
    { userId, voiceSessionId, responseId },
    {
      $setOnInsert: {
        userId, voiceSessionId, responseId,
        model: String(model || "").replace(/^models\//, "") || "unknown",
        usage: normalizedUsage,
        cost: { textInput: 0, audioInput: 0, textOutput: 0, audioOutput: 0, thoughts: 0, total: 0 },
        planId, planDisplayName,
        createdAt: now, updatedAt: now,
      },
    },
    { upsert: true }
  ).catch(e => console.error("[voice-proxy/usage]", e.message));
}

// ── system instruction builder (mirrors lib/gemini-voice-proxy.js) ─────────

function buildGenderLine(locale, gender) {
  if (!gender || !locale.startsWith("es")) return "";
  if (locale === "es-ES") {
    if (gender === "Woman") return "\nDirígete a la usuaria con términos afectuosos femeninos de forma natural y frecuente: \"maja\", \"guapa\", \"amiga\", \"querida\", \"bonita\". Usa siempre la forma femenina en los adjetivos que se refieran a ella (ej. \"¡qué lista eres!\", \"estás muy atenta\").";
    if (gender === "Man")   return "\nDirígete al usuario con términos afectuosos masculinos de forma natural y frecuente: \"majo\", \"guapo\", \"amigo\", \"querido\". Usa siempre la forma masculina en los adjetivos que se refieran a él (ej. \"¡qué listo eres!\", \"estás muy atento\").";
    return "\nDirígete al usuario con lenguaje neutro e inclusivo, sin usar términos marcados por género.";
  }
  if (gender === "Woman") return "\nDirígete a la usuaria con términos cariñosos femeninos de forma natural y frecuente: \"linda\", \"querida\", \"amiga\", \"hermosa\". Usa siempre la forma femenina en los adjetivos que se refieran a ella (ej. \"¡qué lista eres!\", \"qué amable eres\").";
  if (gender === "Man")   return "\nDirígete al usuario con términos cariñosos masculinos de forma natural y frecuente: \"lindo\", \"querido\", \"amigo\". Usa siempre la forma masculina en los adjetivos que se refieran a él (ej. \"¡qué listo eres!\", \"qué amable eres\").";
  return "\nDirígete al usuario con lenguaje neutro e inclusivo, sin usar términos marcados por género.";
}

function buildSystemInstructions(locale, gender) {
  const g = buildGenderLine(locale, gender);
  if (locale === "es-ES") return "Eres Brenda, una señora mayor muy simpática de Madrid, España. Habla en español de España (castellano peninsular) con acento madrileño. Usa siempre \"vosotros\", \"vale\", \"de acuerdo\", vocabulario madrileño (ordenador, móvil, coche, zumo). Pronuncia la z y la c (ante e/i) como /θ/ (\"grathias\"). Sé cálida, breve y conversacional. Nunca uses markdown ni listas. Tu texto debe coincidir exactamente con tu audio hablado. Cuando hables del clima, usa siempre Celsius y redondea al entero." + g;
  if (locale === "es-419") return "Eres Brenda, una señora mayor muy simpática de Latinoamérica. Habla en español latinoamericano neutro, como el usado para doblar series de TV. Usa \"ustedes\" (nunca \"vosotros\"), vocabulario latinoamericano (computadora, celular, carro, jugo). Usa seseo: pronuncia z y c (ante e/i) como /s/ (\"grasias\"). Sé cálida, breve y conversacional. Nunca uses markdown ni listas. Tu texto debe coincidir exactamente con tu audio hablado. Cuando hables del clima, usa siempre Celsius y redondea al entero." + g;
  if (locale === "en-GB")  return "You are Brenda, a friendly older British woman from London. Speak British English with a natural native accent. Prefer UK vocabulary (mobile, lift, lorry, petrol). Be warm, brief, and conversational. Never use markdown or lists. Your text must match your spoken audio exactly. When discussing weather, always use Celsius and round to the nearest whole number.";
  return "You are Brenda, a helpful and friendly AI voice assistant. Speak American English with a natural native accent. Prefer US vocabulary (cell phone, elevator, truck, gas). Be warm, brief, and conversational. Never use markdown or lists. Your text must match your spoken audio exactly. When discussing weather, always use Fahrenheit and round to the nearest whole number.";
}

// ── task schedule for system prompt ─────────────────────────────────

function formatVoiceMedTime(hhmm, locale) {
  const [hStr, mStr] = String(hhmm || "").split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (isNaN(h)) return hhmm;
  if (locale.startsWith("es")) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const period = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function buildMedSystemBlock(meds, locale, isAuthenticated) {
  const isEs = locale.startsWith("es");
  const hasMeds = meds && meds.length > 0;

  if (!isAuthenticated) return "";  // anonymous — no reminder data expected

  if (!hasMeds) {
    return isEs
      ? "\n\nNOTA: Este usuario no tiene recordatorios de tareas guardados. Si pregunta por sus tareas o recordatorios, dile amablemente que no ves recordatorios guardados y que puede añadirlos desde el botón «Tareas». NO digas que no tienes acceso a esa información."
      : "\n\nNOTE: This user has no task reminders saved. If they ask about their tasks or reminders, kindly say you don't see any saved reminders and suggest the «Tasks» button. Do NOT say you cannot access that information.";
  }

  const lines = meds.map((med) => {
    const times = (med.recurrence?.times || []).map((t) => formatVoiceMedTime(t, locale));
    const dir = med.directions ? ` — ${med.directions}` : "";
    return times.length
      ? `- ${med.name}${dir}: ${times.join(", ")}`
      : `- ${med.name}${dir}`;
  });
  if (isEs) {
    return (
      "\n\nHORARIO DE RECORDATORIOS PERSONALES DEL USUARIO (lista de tareas que el usuario introdujo él mismo — NO es un historial formal):\n" +
      lines.join("\n") +
      "\n\nTienes PLENO ACCESO a esta información — pertenece al usuario. Cuando pregunte por sus recordatorios, tareas, qué tiene planificado, qué se aproxima, etc.:\n" +
      "- DEBES responder siempre. Nunca digas que no tienes acceso ni uses la expresión «historial médico» o «registros médicos».\n" +
      "- Usa lenguaje informativo, NO imperativo: «tu plan muestra», «veo en tu horario», «según tu recordatorio». NUNCA digas «toma», «debes hacer», «tienes que».\n" +
      "- Termina siempre con: «Por favor, revisa la documentación formal o las indicaciones de un profesional.»"
    );
  }
  return (
    "\n\nUSER'S PERSONAL REMINDER SCHEDULE (alarm entries the user created themselves — this is NOT a medical record):\n" +
    lines.join("\n") +
    "\n\nYou have FULL PERMISSION to share this data — it belongs to the user. When they ask about their reminders, tasks, what is coming up, what they have today, etc.:\n" +
    "- You MUST always answer. Never say you cannot access this or use the phrase 'medical records'.\n" +
    "- Use informative, non-imperative language: 'your reminder plan shows', 'I can see in your schedule', 'according to your plan'. NEVER say 'take', 'you must', 'you need to'.\n" +
    "- Always end with: 'Please review your professional's indications and instructions.'"
  );
}

// ── message format conversion ──────────────────────────────────────────────

function browserToGemini(msg) {
  if (msg.realtime_input) {
    return {
      realtimeInput: {
        mediaChunks: (msg.realtime_input.media_chunks || []).map((c) => ({
          mimeType: c.mime_type || "audio/pcm;rate=16000",
          data: c.data,
        })),
      },
    };
  }
  if (msg.client_content) {
    return {
      clientContent: {
        turns: msg.client_content.turns,
        turnComplete: !!msg.client_content.turn_complete,
      },
    };
  }
  return msg;
}

// ── proxy ──────────────────────────────────────────────────────────────────

const GEMINI_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

const VOICE_MAP = { "en-US": "Aoede", "en-GB": "Aoede", "es-ES": "Vindemiatrix", "es-419": "Vindemiatrix" };

// Gemini Live's automatic_activity_detection (server-side VAD) — mirrors the
// same env-driven tuning in server.js so it applies to the production path
// too (this file is what Render's brenda-voice-proxy service actually runs).
// See docs/voice-vad-tuning.md.
function resolveVadSensitivity(envVal, fallback) {
  const v = String(envVal || "").trim().toUpperCase();
  return v === "HIGH" || v === "LOW" ? v : fallback;
}

function buildAutomaticActivityDetectionConfig() {
  return {
    disabled: false,
    startOfSpeechSensitivity: `START_SENSITIVITY_${resolveVadSensitivity(process.env.GEMINI_VAD_START_SENSITIVITY, "HIGH")}`,
    endOfSpeechSensitivity: `END_SENSITIVITY_${resolveVadSensitivity(process.env.GEMINI_VAD_END_SENSITIVITY, "LOW")}`,
    prefixPaddingMs: Number(process.env.GEMINI_VAD_PREFIX_PADDING_MS) || 300,
    silenceDurationMs: Number(process.env.GEMINI_VAD_SILENCE_DURATION_MS) || 800,
  };
}

async function createGeminiVoiceProxy(browserWs, req) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    browserWs.close(1011, "GEMINI_API_KEY not set");
    return;
  }

  const urlParams = new URL(req.url, "http://localhost").searchParams;
  const locale = urlParams.get("locale") || "en-US";

  // Voice requires a valid, non-anonymous session — anonymous users are
  // blocked from TALK by design, and this proxy previously accepted ANY
  // connection with no auth check at all (free, unmetered, untracked Gemini
  // Live access for anyone who found this URL).
  const session = getSession(req);
  if (!session?.userId || session.isAnonymous) {
    console.warn("[voice-proxy] refusing connection — no valid authenticated session");
    browserWs.close(1008, "unauthorized");
    return;
  }
  const userId = session.userId;

  // Gender, tasks, and quota lookup from session + DB (non-fatal
  // except the quota check itself, which fails open on a DB error).
  let gender = session.gender || null;
  let activeMeds = [];
  const isAuthenticated = true;
  let planId = null;
  let planDisplayName = "Unknown";
  let voiceQuotaExhausted = false;
  const profileLookupStartAt = Date.now();
  try {
    const db = await getDb();
    if (db) {
      const [userDoc, tasks, sub] = await Promise.all([
        db.collection("users").findOne(
          { userId },
          { projection: { "preferences.gender": 1 } }
        ).catch(e => { console.error("[voice-proxy] users lookup failed:", e.message); return null; }),
        db.collection("tasks").find({ userId, active: true }).sort({ name: 1 }).toArray()
          .catch(e => { console.error("[voice-proxy] tasks lookup failed:", e.message); return []; }),
        getOrCreateSubscription(db, userId)
          .catch(e => { console.error(`[voice-proxy] subscription lookup failed for userId=${userId}:`, e.message); return null; }),
      ]);
      if (!gender) gender = userDoc?.preferences?.gender || null;
      activeMeds = tasks || [];
      if (sub) {
        planId = sub.planId;
        planDisplayName = sub.planDisplayName;
        const voiceTokensUsed = await getVoiceTokensUsedSince(db, userId, sub.periodStartDate)
          .catch(e => { console.error(`[voice-proxy] usage lookup failed for userId=${userId}:`, e.message); return 0; });
        voiceQuotaExhausted = computeStatus(voiceTokensUsed, sub.voiceQuota) === "exhausted";
      }
    }
  } catch (e) {
    console.error("[voice-proxy] session/profile resolution failed:", e?.message || e);
  }

  if (voiceQuotaExhausted) {
    console.log(`[voice-proxy] blocked — voice quota exhausted userId=${userId}`);
    browserWs.close(1008, "voice_quota_exhausted");
    return;
  }

  // New Relic voice-flow latency instrumentation — purely observational,
  // doesn't gate or alter any existing behavior. See docs/voice-vad-tuning.md
  // sibling: the [voice-vad] console logs below for the qualitative picture,
  // this for the quantitative one (queryable via NRQL as VoiceSessionStart /
  // VoiceTurnLatency events).
  const msProfileLookup = Date.now() - profileLookupStartAt;

  const voice = process.env.GEMINI_LIVE_VOICE || VOICE_MAP[locale] || "Vindemiatrix";
  const model = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const systemText = buildSystemInstructions(locale, gender) + buildMedSystemBlock(activeMeds, locale, isAuthenticated);

  const voiceSessionId = crypto.randomUUID();
  let voiceResponseCounter = 0;
  let vadInputBuf = "";
  let vadOutputBuf = "";

  const geminiWsCreatedAt = Date.now();
  let msGeminiWsOpen = null;
  let sessionStartRecorded = false;
  let lastInputTranscriptionAt = null;
  let firstInputTranscriptionAt = null;
  let turnFirstAudioAt = null;
  let relayMsSum = 0;
  let relayMsMax = 0;
  let relayCount = 0;

  const geminiWs = new WebSocket(`${GEMINI_LIVE_URL}?key=${GEMINI_API_KEY}`);

  geminiWs.on("open", () => {
    msGeminiWsOpen = Date.now() - geminiWsCreatedAt;
    geminiWs.send(JSON.stringify({
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
        systemInstruction: { parts: [{ text: systemText }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: buildAutomaticActivityDetectionConfig(),
        },
      },
    }));
  });

  geminiWs.on("message", (data) => {
    const relayStart = Date.now();
    if (browserWs.readyState === WebSocket.OPEN) browserWs.send(data);
    const relayMs = Date.now() - relayStart;
    relayMsSum += relayMs;
    if (relayMs > relayMsMax) relayMsMax = relayMs;
    relayCount++;
    try {
      const msg = JSON.parse(data.toString());

      if (!sessionStartRecorded && msg.setupComplete !== undefined) {
        sessionStartRecorded = true;
        newrelic.recordCustomEvent("VoiceSessionStart", {
          voiceSessionId, userId, locale, model, source: "voice-proxy",
          msProfileLookup, msGeminiWsOpen,
          msSetupComplete: Date.now() - geminiWsCreatedAt,
        });
      }

      if (msg.usageMetadata) {
        const responseId = `${voiceSessionId}_${voiceResponseCounter++}`;
        getDb()
          .then(db => db && recordVoiceUsageMinimal(db, {
            userId, voiceSessionId, responseId, model, usage: msg.usageMetadata,
            planId, planDisplayName,
          }))
          .catch(e => console.error("[voice-proxy/usage]", e.message));
      }

      // Voice VAD diagnostics — logs Gemini's own turn-detection decisions so
      // a "Brenda didn't respond" report can be traced to a missed/merged
      // turn vs. something else. See docs/voice-vad-tuning.md.
      const sc = msg.serverContent;
      if (sc) {
        if (sc.inputTranscription?.text) {
          vadInputBuf += sc.inputTranscription.text;
          // Gemini's own signal that it was still hearing/transcribing the
          // user — a far more reliable "end of user turn" marker than raw
          // client WS messages, which stream continuously (mic stays open
          // during Brenda's reply too, for barge-in) and don't correlate
          // with when the user actually stopped talking.
          // First fragment of the user turn ≈ when they started talking; the
          // last one ≈ when they stopped. The delta is msUserSpeech below.
          if (firstInputTranscriptionAt === null) firstInputTranscriptionAt = Date.now();
          lastInputTranscriptionAt = Date.now();
        }
        if (sc.outputTranscription?.text) vadOutputBuf += sc.outputTranscription.text;

        if (turnFirstAudioAt === null && lastInputTranscriptionAt !== null) {
          const hasAudio = sc.modelTurn?.parts?.some(
            (p) => p.inlineData?.mimeType?.startsWith("audio/pcm")
          );
          if (hasAudio) turnFirstAudioAt = Date.now();
        }

        if (sc.interrupted) {
          console.log(`🗣️ [voice-vad] session=${voiceSessionId} userId=${userId ?? "null"} — Gemini reported an interruption (serverContent.interrupted)`);
          lastInputTranscriptionAt = null;
          firstInputTranscriptionAt = null;
          turnFirstAudioAt = null;
          relayMsSum = 0; relayMsMax = 0; relayCount = 0;
        }

        if (sc.turnComplete) {
          console.log(`🗣️ [voice-vad] session=${voiceSessionId} userId=${userId ?? "null"} — turn complete. user="${vadInputBuf.trim()}" brenda="${vadOutputBuf.trim()}"`);
          if (lastInputTranscriptionAt !== null) {
            const now = Date.now();
            newrelic.recordCustomEvent("VoiceTurnLatency", {
              voiceSessionId,
              responseId: `${voiceSessionId}_${voiceResponseCounter}`,
              turnNumber: voiceResponseCounter,
              userId, locale, model,
              msToFirstAudio: turnFirstAudioAt ? turnFirstAudioAt - lastInputTranscriptionAt : null,
              msTurnTotal: now - lastInputTranscriptionAt,
              msUserSpeech: firstInputTranscriptionAt ? lastInputTranscriptionAt - firstInputTranscriptionAt : null,
              msMaxRelayOverhead: relayMsMax,
              msAvgRelayOverhead: relayCount ? Math.round(relayMsSum / relayCount) : 0,
            });
          }
          lastInputTranscriptionAt = null;
          firstInputTranscriptionAt = null;
          turnFirstAudioAt = null;
          relayMsSum = 0; relayMsMax = 0; relayCount = 0;
          vadInputBuf = "";
          vadOutputBuf = "";
        }
      }
    } catch { /* not JSON — ignore */ }
  });

  geminiWs.on("error", (err) => {
    console.error("[proxy] Gemini WS error:", err.message);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ error: err.message }));
      browserWs.close(1011, "Gemini error");
    }
  });

  geminiWs.on("close", (code, reason) => {
    if (browserWs.readyState === WebSocket.OPEN)
      browserWs.close(code || 1000, reason?.toString() || "Gemini closed");
  });

  browserWs.on("message", (data) => {
    if (geminiWs.readyState !== WebSocket.OPEN) return;
    try {
      const msg = JSON.parse(typeof data === "string" ? data : data.toString());
      geminiWs.send(JSON.stringify(browserToGemini(msg)));
    } catch {
      // malformed — ignore
    }
  });

  browserWs.on("close", () => {
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  browserWs.on("error", (err) => {
    console.error("[proxy] browser WS error:", err.message);
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });
}

// ── HTTP + WebSocket server ────────────────────────────────────────────────

const app = express();
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  next();
});
app.get("/health", (_, res) => res.json({ ok: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/voice/stream" });

wss.on("connection", (ws, req) => {
  createGeminiVoiceProxy(ws, req);
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => console.log(`[brenda-voice-proxy] listening on port ${PORT}`));

// ── Tasks reminder scheduler ─────────────────────────────────────────

async function startScheduler() {
  if (!process.env.MONGODB_URI) {
    console.log("[scheduler] MONGODB_URI not set — tasks reminders disabled");
    return;
  }

  const { default: Agenda } = await import("agenda");

  const agenda = new Agenda({
    db: { address: process.env.MONGODB_URI, collection: "agendaJobs" },
    processEvery: "1 minute",
  });

  // ── helper: current time parts in a given IANA timezone ─────────────────
  function tzParts(timezone) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone:  timezone || "UTC",
      hour:      "2-digit", minute: "2-digit", hour12: false,
      weekday:   "long",
      year:      "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const get = t => parts.find(p => p.type === t)?.value ?? "";
    const hh = get("hour").padStart(2, "0");
    const mm = get("minute").padStart(2, "0");
    return {
      hhmm:    `${hh}:${mm}`,
      weekday: get("weekday").toLowerCase(),
      date:    `${get("year")}-${get("month")}-${get("day")}`,
    };
  }

  // ── helper: is a task due right now? ──────────────────────────────────────
  function isDue(task) {
    const { type, times, daysOfWeek, nextDue } = task.recurrence || {};
    if (!times?.length) return null;

    const { hhmm, weekday, date } = tzParts(task.timezone);
    const startDate = task.startDate || "1970-01-01";
    if (date < startDate) return null;
    if (task.endDate && date > task.endDate) return null;

    const timeMatch = times.find(t => t === hhmm);
    if (!timeMatch) return null;

    if (type === "daily") return "standard";
    if (type === "weekly") {
      const days = (daysOfWeek || []).map(d => d.toLowerCase());
      return days.includes(weekday) ? "standard" : null;
    }
    if (type === "interval") {
      if (!nextDue) return null;
      return date >= nextDue.slice(0, 10) ? "standard" : null;
    }
    return null;
  }

  // ── helper: is a limited-course task ending tomorrow? ────────────────────
  function isCourseEndingTomorrow(task) {
    if (!task.endDate) return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    return task.endDate === tomorrowStr;
  }

  // ── main check job ───────────────────────────────────────────────────────
  agenda.define("check-task-reminders", async () => {
    const db = await getDb();
    if (!db) return;

    const tasks = await db.collection("tasks").find({ active: true }).toArray();

    for (const task of tasks) {
      // Course-ending-tomorrow check (independent of time match)
      if (isCourseEndingTomorrow(task)) {
        const { date } = tzParts(task.timezone);
        const alreadySent = await db.collection("task_reminders").findOne({
          taskId: task.id,
          reminderType: "course-ending",
          dueAt: { $gte: new Date(date + "T00:00:00Z") },
        });
        if (!alreadySent) {
          await db.collection("task_reminders").insertOne({
            userId: task.userId, taskId: task.id, taskName: task.name,
            reminderType: "course-ending", dueAt: new Date(),
            delivered: false, createdAt: new Date(),
          });
        }
      }

      const reminderType = isDue(task);
      if (!reminderType) continue;

      // Deduplicate: don't fire twice in the same 10-minute window
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recent = await db.collection("task_reminders").findOne({
        taskId: task.id,
        reminderType: { $ne: "course-ending" },
        dueAt: { $gte: tenMinAgo },
      });
      if (recent) continue;

      const type = task.endDate ? "limited-course" : "standard";

      await db.collection("task_reminders").insertOne({
        userId: task.userId, taskId: task.id, taskName: task.name,
        reminderType: type, dueAt: new Date(),
        delivered: false, createdAt: new Date(),
      });

      // Advance nextDue for interval tasks
      if (task.recurrence?.type === "interval") {
        const next = new Date();
        next.setDate(next.getDate() + (task.recurrence.intervalDays || 1));
        await db.collection("tasks").updateOne(
          { id: task.id },
          { $set: { "recurrence.nextDue": next.toISOString().slice(0, 10) } }
        );
      }

      // Deactivate if past endDate
      if (task.endDate) {
        const { date } = tzParts(task.timezone);
        if (date >= task.endDate) {
          await db.collection("tasks").updateOne(
            { id: task.id }, { $set: { active: false } }
          );
        }
      }
    }

    // Process schedule sync queue (new/rescheduled/cancelled tasks)
    await db.collection("task_schedule_sync").updateMany(
      { processedAt: null },
      { $set: { processedAt: new Date() } }
    );
  });

  await agenda.start();
  await agenda.every("1 minute", "check-task-reminders");
  console.log("[scheduler] Task reminder scheduler started");
}

startScheduler().catch(e => console.error("[scheduler] Failed to start:", e.message));
