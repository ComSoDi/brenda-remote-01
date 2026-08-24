import newrelic from 'newrelic';
globalThis.__newrelicLoaded = true; // lets lib/mongo.js know it's safe to record custom events —
// standalone scripts (backup-db.js etc.) import lib/mongo.js without ever loading newrelic,
// and requiring it there would start the agent's own timers and keep those scripts from exiting.
import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import dns from "dns";
import { randomUUID } from "crypto";
import { WebSocket, WebSocketServer } from "ws";
import chatHandler from "./api/chat.js";
import loginHandler from "./api/auth/login.js";
import meHandler from "./api/auth/me.js";
import anonymousHandler from "./api/auth/anonymous.js";
import logoutHandler from "./api/auth/logout.js";
import consentHandler from "./api/auth/consent.js";
import declineConsentHandler from "./api/auth/decline-consent.js";
import talkDisclaimerHandler from "./api/auth/talk-disclaimer.js";
import policyAcceptHandler from "./api/auth/policy-accept.js";
import deleteAccountHandler from "./api/auth/delete-account.js";
import historyHandler from "./api/history.js";
import usageHandler from "./api/user/usage.js";
import plansHandler from "./api/plans.js";
import planSwitchHandler from "./api/user/plan.js";
import topUpHandler from "./api/user/topup.js";
import weatherHandler from "./api/weather.js";
import realtimeKeyHandler from "./api/voice/realtime-key.js";
import appendHandler from "./api/conversation/append.js";
import updateMessageHandler from "./api/conversation/update-message.js";
import transcriptCorrectHandler from "./api/transcript/correct.js";
import greetingHandler from "./api/greeting.js";
import tasksHandler from "./api/tasks.js";
import categoriesHandler from "./api/brenda/categories.js";
import headlinesHandler from "./api/brenda/headlines.js";
import gossipHandler from "./api/brenda/gossip.js";
import greetNewsHandler from "./api/brenda/greet.js";
import searchHandler from "./api/brenda/search.js";

import googleHandler         from "./api/auth/google.js";
import googleCallbackHandler from "./api/auth/google-callback.js";
import dashUsersHandler      from "./api/dashboard/users.js";
import dashVoiceHandler      from "./api/dashboard/voice-events.js";
import dashChatHandler       from "./api/dashboard/chat-events.js";
import rdsStateHandler       from "./api/rds/state.js";
import rdsInterestsHandler   from "./api/rds/interests.js";
import rdsTopicStarterHandler from "./api/rds/topic-starter.js";

import { getSession } from "./lib/auth.js";
import { requestContext } from "./lib/requestContext.js";
import { getDb } from "./lib/mongo.js";
import { recordVoiceUsage } from "./lib/usage.js";
import { resolvePlanForUsage, getOrCreateSubscription, getUsageSinceDate, computeStatus } from "./lib/subscriptions.js";
import { PLAN_ANONYMOUS } from "./lib/plans.js";
import { getRdsProfile, buildRdsSystemAddendum, extractRdsItems, addRdsItem } from "./lib/rdsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = path.join(__dirname, "public");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Render sets this automatically on every deploy -- no manual version
// bookkeeping needed to facet New Relic events by "which deploy produced this".
// Truncated to the standard git short-SHA length (7 chars) so it's actually
// readable as a chart legend/facet label instead of a 40-char hex blob.
const GIT_SHA = process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null;

dns.setServers((process.env.DNS_SERVERS || "1.1.1.1, 8.8.8.8").split(/[,\s]+/).filter(Boolean));

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/.well-known", express.static(path.join(STATIC_DIR, ".well-known"), { dotfiles: "allow" }));
app.use(express.static(STATIC_DIR, {
  // No content hashing/versioning on these assets (no build step), so force
  // revalidation on every load -- otherwise a stale cached app.js/voiceAgent.js
  // can get stuck indefinitely in caches that are hard to clear (e.g. the
  // Google Play TWA/WebView container, which has no user-facing hard-refresh).
  setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
}));

// Tags the current New Relic transaction with userId so APM (Transactions,
// errors, traces) can be faceted/filtered per user. addCustomAttribute only
// attaches to an active transaction, so this must run inside Express's
// request cycle -- it does NOT reach the voice WS flow (a raw server.on
// ("upgrade") hijack outlives any transaction); that path already tags its
// own recordCustomEvent() calls with userId directly (VoiceSessionStart,
// VoiceTurnLatency).
app.use((req, res, next) => {
  if (GIT_SHA) newrelic.addCustomAttribute("gitSha", GIT_SHA);
  const session = getSession(req);
  const userId = session?.userId || null;
  if (userId) {
    newrelic.addCustomAttribute("userId", userId);
    const displayName = session?.displayName || session?.username || null;
    if (displayName) newrelic.addCustomAttribute("userDisplayName", displayName);
  }
  requestContext.run({ userId }, next);
});

app.post("/api/auth/login", loginHandler);
app.get("/api/auth/me", meHandler);
app.post("/api/auth/anonymous", anonymousHandler);
app.post("/api/auth/logout", logoutHandler);
app.post("/api/auth/consent", consentHandler);
app.post("/api/auth/decline-consent", declineConsentHandler);
app.post("/api/auth/talk-disclaimer", talkDisclaimerHandler);
app.post("/api/auth/policy-accept", policyAcceptHandler);
app.post("/api/auth/delete-account", deleteAccountHandler);

app.post("/api/conversation/append", appendHandler);
app.post("/api/conversation/update-message", updateMessageHandler);

app.get("/api/history", historyHandler);
app.get("/api/user/usage", usageHandler);
app.get("/api/plans", plansHandler);
app.post("/api/user/plan", planSwitchHandler);
app.post("/api/user/topup", topUpHandler);

app.post("/api/chat", chatHandler);
app.post("/api/weather", weatherHandler);
app.post("/api/voice/realtime-key", realtimeKeyHandler);

app.all("/api/greeting", greetingHandler);
app.all("/api/tasks", tasksHandler);

app.all("/api/brenda/categories", categoriesHandler);
app.all("/api/brenda/headlines", headlinesHandler);
app.get("/api/brenda/headlines/:userId", headlinesHandler);
app.post("/api/brenda/gossip", gossipHandler);
app.post("/api/brenda/greet", greetNewsHandler);
app.post("/api/brenda/search", searchHandler);

app.post("/api/transcript/correct", transcriptCorrectHandler);

app.get("/api/auth/google",          (req, res) => googleHandler(req, res));
app.get("/api/auth/google-callback", (req, res) => googleCallbackHandler(req, res));
app.get("/api/dashboard/users",       (req, res) => dashUsersHandler(req, res));
app.get("/api/dashboard/voice-events",(req, res) => dashVoiceHandler(req, res));
app.get("/api/dashboard/chat-events", (req, res) => dashChatHandler(req, res));

app.get("/api/rds/state",          (req, res) => rdsStateHandler(req, res));
app.post("/api/rds/state",         (req, res) => rdsStateHandler(req, res));
app.get("/api/rds/interests",      (req, res) => rdsInterestsHandler(req, res));
app.post("/api/rds/interests",     (req, res) => rdsInterestsHandler(req, res));
app.post("/api/rds/topic-starter", (req, res) => rdsTopicStarterHandler(req, res));

app.get("*", (_req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

const server = app.listen(PORT, () => console.log(`🚀 Brenda 01 listening on port ${PORT}`));

// ── System instruction builder (mirrors api/chat.js logic) ─────────────────

function buildGenderLine(locale, gender) {
  if (!gender || !locale.startsWith("es")) return "";
  if (locale === "es-ES") {
    if (gender === "Woman") return "\nDirígete a la usuaria con términos afectuosos femeninos de forma natural y frecuente: \"maja\", \"guapa\", \"amiga\", \"querida\", \"bonita\". Usa siempre la forma femenina en los adjetivos que se refieran a ella (ej. \"¡qué lista eres!\", \"estás muy atenta\").";
    if (gender === "Man")   return "\nDirígete al usuario con términos afectuosos masculinos de forma natural y frecuente: \"majo\", \"guapo\", \"amigo\", \"querido\". Usa siempre la forma masculina en los adjetivos que se refieran a él (ej. \"¡qué listo eres!\", \"estás muy atento\").";
    return "\nDirígete al usuario con lenguaje neutro e inclusivo, sin usar términos marcados por género.";
  }
  // es-419
  if (gender === "Woman") return "\nDirígete a la usuaria con términos cariñosos femeninos de forma natural y frecuente: \"linda\", \"querida\", \"amiga\", \"hermosa\". Usa siempre la forma femenina en los adjetivos que se refieran a ella (ej. \"¡qué lista eres!\", \"qué amable eres\").";
  if (gender === "Man")   return "\nDirígete al usuario con términos cariñosos masculinos de forma natural y frecuente: \"lindo\", \"querido\", \"amigo\". Usa siempre la forma masculina en los adjetivos que se refieran a él (ej. \"¡qué listo eres!\", \"qué amable eres\").";
  return "\nDirígete al usuario con lenguaje neutro e inclusivo, sin usar términos marcados por género.";
}

function buildSystemInstruction(locale, gender) {
  const genderLine = buildGenderLine(locale, gender);

  if (locale === "es-ES") {
    return (
      "Eres Brenda, una señora mayor muy simpática de Madrid, España. " +
      "Habla en español de España (castellano peninsular) con acento madrileño impecable. " +
      "Usa siempre \"vosotros\", \"vale\", \"de acuerdo\", vocabulario madrileño (ordenador, móvil, coche, zumo). " +
      "Pronuncia la z y la c (ante e/i) como /θ/ (\"grathias\"). " +
      "Sé cálida, breve y conversacional. Nunca uses markdown ni listas. " +
      "Tu texto debe coincidir exactamente con tu audio hablado. " +
      "Cuando hables del clima, usa siempre Celsius y redondea al entero. " +
      "Si el mensaje del usuario contiene [INTERNAL_INSTRUCTION: SAY EXACTLY \"...\"], responde exactamente con ese texto y nada más." +
      genderLine
    );
  }

  if (locale === "es-419") {
    return (
      "Eres Brenda, una señora mayor muy simpática de Latinoamérica. " +
      "Habla en español latinoamericano neutro, como el usado para doblar series de TV. " +
      "Usa \"ustedes\" (nunca \"vosotros\"), vocabulario latinoamericano (computadora, celular, carro, jugo). " +
      "Seseo: pronuncia z y c (ante e/i) como /s/ (\"grasias\"). " +
      "Sé cálida, breve y conversacional. Nunca uses markdown ni listas. " +
      "Tu texto debe coincidir exactamente con tu audio hablado. " +
      "Cuando hables del clima, usa siempre Celsius y redondea al entero. " +
      "Si el mensaje del usuario contiene [INTERNAL_INSTRUCTION: SAY EXACTLY \"...\"], responde exactamente con ese texto y nada más." +
      genderLine
    );
  }

  if (locale === "en-GB") {
    return (
      "You are Brenda, a friendly older British woman from London. " +
      "Speak British English with a natural native accent. Prefer UK vocabulary (mobile, lift, lorry, petrol). " +
      "Be warm, brief, and conversational. Never use markdown or lists. " +
      "Your text must match your spoken audio exactly. " +
      "Express temperatures in Celsius and round to the nearest whole number. " +
      "If the user message contains [INTERNAL_INSTRUCTION: SAY EXACTLY \"...\"], respond with exactly that text and nothing else."
    );
  }

  // en-US default
  return (
    "You are Brenda, a helpful and friendly AI voice assistant. " +
    "Speak American English with a natural native accent. Prefer US vocabulary (cell phone, elevator, truck, gas). " +
    "Be warm, brief, and conversational. Never use markdown or lists. " +
    "Your text must match your spoken audio exactly. " +
    "Express temperatures in Fahrenheit and round to the nearest whole number. " +
    "If the user message contains [INTERNAL_INSTRUCTION: SAY EXACTLY \"...\"], respond with exactly that text and nothing else."
  );
}

function buildTaskSystemBlock(tasks, locale) {
  if (!tasks || !tasks.length) return "";
  const isEs = locale.startsWith("es");
  const lines = tasks.map((task) => {
    const times = (task.recurrence?.times || []).join(", ");
    const dir = task.directions ? ` — ${task.directions}` : "";
    return times ? `- ${task.name}${dir}: ${times}` : `- ${task.name}${dir}`;
  });
  if (isEs) {
    return (
      "\n\nTAREAS DEL USUARIO (guardados en el sistema):\n" + lines.join("\n") +
      "\n\nCuando el usuario pregunte por sus tareas:\n" +
      "1. Confirma con entusiasmo que puedes ayudar.\n" +
      "2. Avisa brevemente que puedes cometer errores y que siempre es mejor confirmar con las indicaciones del experto.\n" +
      "3. Lee cada tarea con su horario en formato 24 horas.\n" +
      "4. Termina siempre con: «No olvides confirmar siempre con las indicaciones del experto.»"
    );
  }
  return (
    "\n\nUSER TASKS (saved in system):\n" + lines.join("\n") +
    "\n\nWhen the user asks about their tasks:\n" +
    "1. Warmly confirm you can help.\n" +
    "2. Add a brief disclaimer: you can make mistakes and they should always confirm with the expert's instructions.\n" +
    "3. List each task with its scheduled times.\n" +
    "4. Always end with: 'Remember to always confirm with the official expert instructions.'"
  );
}

// ── WebSocket proxy (Gemini Live) ───────────────────────────────────────────

// Gemini 3.1 Live no longer accepts client_content mid-session — text must go
// through realtime_input.text instead. client_content is only valid for seeding
// initial history in 3.1 (which Brenda doesn't use). For 2.5, pass through as-is.
function processClientMessage(rawData, isGemini31) {
  if (!isGemini31) return rawData;
  try {
    const str = typeof rawData === "string" ? rawData : rawData.toString();
    const msg = JSON.parse(str);

    // media_chunks deprecated in 3.1 — use realtime_input.audio instead
    if (msg.realtime_input?.media_chunks?.length) {
      const chunk = msg.realtime_input.media_chunks[0];
      return JSON.stringify({
        realtime_input: {
          audio: {
            mime_type: chunk.mime_type || "audio/pcm;rate=16000",
            data: chunk.data,
          },
        },
      });
    }

    // client_content mid-session invalid in 3.1 — use realtime_input.text instead
    if (msg.client_content) {
      const text = (msg.client_content.turns || [])
        .flatMap(t => t.parts || [])
        .filter(p => typeof p.text === "string")
        .map(p => p.text)
        .join(" ")
        .trim();
      if (text) {
        console.log("[voice-proxy] 3.1: client_content → realtime_input.text");
        return JSON.stringify({ realtime_input: { text } });
      }
    }
  } catch { }
  return rawData;
}

// Gemini Live's automatic_activity_detection (server-side VAD) — tunable via
// env so "Brenda didn't respond, had to repeat myself" reports can be dialed
// out without a redeploy of the setup message shape itself. See
// docs/voice-vad-tuning.md for what each knob does and how to read the
// [voice-vad] diagnostic logs below.
function resolveVadSensitivity(envVal, fallback) {
  const v = String(envVal || "").trim().toUpperCase();
  return v === "HIGH" || v === "LOW" ? v : fallback;
}

function buildAutomaticActivityDetectionConfig() {
  return {
    disabled: false,
    start_of_speech_sensitivity: `START_SENSITIVITY_${resolveVadSensitivity(process.env.GEMINI_VAD_START_SENSITIVITY, "HIGH")}`,
    end_of_speech_sensitivity: `END_SENSITIVITY_${resolveVadSensitivity(process.env.GEMINI_VAD_END_SENSITIVITY, "LOW")}`,
    prefix_padding_ms: Number(process.env.GEMINI_VAD_PREFIX_PADDING_MS) || 300,
    silence_duration_ms: Number(process.env.GEMINI_VAD_SILENCE_DURATION_MS) || 800,
  };
}

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  console.log(`🔍 Upgrade request for: ${pathname}`);

  if (pathname === "/api/voice/stream") {
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not set; refusing voice WebSocket");
      socket.destroy();
      return;
    }
    const locale = url.searchParams.get("locale") || "es-ES";

    // Voice requires a valid, non-anonymous session. Anonymous users are
    // blocked from TALK by design (see PRD); this also closes the hole where
    // a client bypassing the app UI entirely (e.g. opening this WS directly
    // from devtools) could get free, unmetered, untracked Gemini Live voice
    // access with no account at all — previously nothing here checked for a
    // session before accepting the upgrade.
    const session = getSession(req);
    if (!session?.userId || session.isAnonymous) {
      console.warn("[voice-proxy] refusing upgrade — no valid authenticated session");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Resolve gender, tasks, and RDS profile from session / DB (non-fatal)
    let gender = session.gender || null;
    let activeTasks = [];
    const userId = session.userId;
    const isAuthenticated = true;
    let rdsProfile = null;
    const rdsUsername = session.displayName || session.username || "";
    let planId = PLAN_ANONYMOUS;
    let planDisplayName = "Anonymous";
    let savedLocation = null;
    let voiceQuotaExhausted = false;
    const profileLookupStartAt = Date.now();
    await requestContext.run({ userId }, async () => {
    try {
      const db = await getDb();
      // Each lookup is isolated with its own .catch() — one failing lookup
      // (e.g. RDS profile) must not silently blank out the others, and a
      // failed plan lookup must never be indistinguishable from a genuinely
      // anonymous session (that's what caused plan to show "Anonymous" for
      // authenticated users — see 2026-07-19 bugfix).
      const [userDoc, tasks, profile, planInfo, voiceStatus] = await Promise.all([
        db.collection("users").findOne(
          { userId },
          { projection: { "preferences.gender": 1, "preferences.location": 1 } }
        ).catch(e => { console.error("[voice-proxy] users lookup failed:", e.message); return null; }),
        db.collection("tasks").find({ userId, active: true }).sort({ name: 1 }).toArray()
          .catch(e => { console.error("[voice-proxy] tasks lookup failed:", e.message); return []; }),
        getRdsProfile(db, userId)
          .catch(e => { console.error("[voice-proxy] rds profile lookup failed:", e.message); return null; }),
        resolvePlanForUsage(db, userId, false)
          .catch(e => { console.error(`[voice-proxy] plan resolution failed for userId=${userId}:`, e.message); return null; }),
        // Fail-open on error — a transient DB hiccup shouldn't lock out a
        // legitimate user, matching the fallback philosophy of the lookups above.
        getOrCreateSubscription(db, userId)
          .then((sub) => getUsageSinceDate(db, userId, sub.periodStartDate)
            .then((u) => computeStatus(u.voiceTokensUsed, sub.voiceQuota)))
          .catch(e => { console.error(`[voice-proxy] quota check failed for userId=${userId}:`, e.message); return "active"; }),
      ]);
      if (!gender) gender = userDoc?.preferences?.gender || null;
      activeTasks = tasks || [];
      rdsProfile = profile || null;
      savedLocation = userDoc?.preferences?.location || null;
      if (planInfo) {
        planId = planInfo.planId;
        planDisplayName = planInfo.planDisplayName;
      } else {
        planId = null;
        planDisplayName = "Unknown";
        console.warn(`[voice-proxy] plan lookup failed for authenticated userId=${userId} — labeling event "Unknown", not "Anonymous"`);
      }
      voiceQuotaExhausted = voiceStatus === "exhausted";
    } catch (e) {
      console.error("[voice-proxy] session/profile resolution failed:", e?.message || e);
    }
    });

    if (voiceQuotaExhausted) {
      console.log(`[voice-proxy] blocked — voice quota exhausted userId=${userId}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      ws.userLocale = locale;
      ws.userGender = gender;
      ws.activeTasks = activeTasks;
      ws.isAuthenticated = isAuthenticated;
      ws.rdsProfile = rdsProfile;
      ws.rdsUsername = rdsUsername;
      ws.planId = planId;
      ws.planDisplayName = planDisplayName;
      ws.savedLocation = savedLocation;
      ws.msProfileLookup = Date.now() - profileLookupStartAt;
      console.log(`📡 WS upgraded — locale: ${locale}, gender: ${gender || "unknown"}`);
      wss.emit("connection", ws, req);
    });
  } else {
    console.log("❌ Refusing upgrade for non-voice path");
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  requestContext.run({ userId: ws.userId || null }, () => {
  console.log("🔌 Proxy: Client connected. Opening Gemini upstream...");

  const voiceSessionId = randomUUID();
  let voiceResponseCounter = 0;
  const userId = ws.userId || null;
  // ws.planId can legitimately be null (authenticated user, lookup failed —
  // labeled "Unknown"), so only fall back to Anonymous when truly unset.
  const planId = ws.planId !== undefined ? ws.planId : PLAN_ANONYMOUS;
  const planDisplayName = ws.planDisplayName !== undefined ? ws.planDisplayName : "Anonymous";

  const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const modelPath = MODEL.startsWith("models/") ? MODEL : `models/${MODEL}`;
  const IS_GEMINI_31 = MODEL.startsWith("gemini-3") || MODEL.includes("3.1-flash-live");
  console.log(`[voice-proxy] session=${voiceSessionId} userId=${userId ?? "null"} model=${MODEL}`);

  const locale = ws.userLocale || "es-ES";
  const voiceMap = { "en-US": "Aoede", "en-GB": "Aoede", "es-ES": "Vindemiatrix", "es-419": "Vindemiatrix" };
  const VOICE = process.env.GEMINI_LIVE_VOICE || voiceMap[locale] || "Vindemiatrix";

  const savedLoc = ws.savedLocation || null;
  const locationLine = savedLoc?.city
    ? `\n\nThe user's saved home location is ${savedLoc.city}${savedLoc.country ? `, ${savedLoc.country}` : ""}. Use this city for weather and time queries when no city is specified.`
    : "";

  const systemText = buildSystemInstruction(locale, ws.userGender || null)
    + buildTaskSystemBlock(ws.activeTasks || [], locale)
    + locationLine
    + (ws.rdsProfile ? "\n\n" + buildRdsSystemAddendum(ws.rdsProfile, locale, ws.rdsUsername || "") : "");

  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  const messageBuffer = [];
  let isReady = false;
  let setupFallbackTimer = null;
  let inputTranscriptBuf = "";
  let outputTranscriptBuf = "";

  // New Relic voice-flow latency instrumentation — purely observational,
  // doesn't gate or alter any existing behavior. Mirrors voice-proxy/index.js.
  // See docs/voice-vad-tuning.md sibling: the [voice-vad] console logs below
  // for the qualitative picture, this for the quantitative one (queryable
  // via NRQL as VoiceSessionStart / VoiceTurnLatency events).
  const geminiWsCreatedAt = Date.now();
  let msGeminiWsOpen = null;
  let sessionStartRecorded = false;
  let lastInputTranscriptionAt = null;
  let turnFirstAudioAt = null;
  let relayMsSum = 0;
  let relayMsMax = 0;
  let relayCount = 0;

  geminiWs.on("open", () => {
    msGeminiWsOpen = Date.now() - geminiWsCreatedAt;
    console.log(`📡 Gemini WS open — sending setup. model: ${MODEL}, voice: ${VOICE}`);

    const compressionTargetTokens = process.env.GEMINI_CONTEXT_COMPRESSION_TOKENS
      ? Number(process.env.GEMINI_CONTEXT_COMPRESSION_TOKENS)
      : null;

    const generation_config = {
      response_modalities: ["AUDIO"],
      speech_config: {
        voice_config: { prebuilt_voice_config: { voice_name: VOICE } },
      },
      ...(IS_GEMINI_31 ? { thinking_config: { thinking_level: "low" } } : {}),
    };

    const setupMessage = {
      setup: {
        model: modelPath,
        generation_config,
        input_audio_transcription: {},
        output_audio_transcription: {},
        realtime_input_config: {
          automatic_activity_detection: buildAutomaticActivityDetectionConfig(),
        },
        system_instruction: {
          parts: [{ text: systemText }]
        },
        tools: [{ google_search: {} }],
        ...(compressionTargetTokens
          ? { context_window_compression: { sliding_window: { target_tokens: compressionTargetTokens } } }
          : {}),
      }
    };
    geminiWs.send(JSON.stringify(setupMessage));

    // Do NOT flush the buffer or set isReady yet. Gemini must send setupComplete
    // before it is ready to accept client_content turns. Flushing immediately
    // causes the first client message (e.g. the proactive greeting) to be dropped.
    // Fallback: force ready after 6 s in case setupComplete never arrives.
    setupFallbackTimer = setTimeout(() => {
      if (!isReady) {
        console.warn("[voice-proxy] setupComplete not received within 6 s — forcing ready");
        isReady = true;
        while (messageBuffer.length > 0) geminiWs.send(messageBuffer.shift());
      }
    }, 6000);
  });

  ws.on("message", (data) => {
    const processed = processClientMessage(data, IS_GEMINI_31);
    if (isReady) {
      geminiWs.send(processed);
    } else {
      messageBuffer.push(processed);
    }
  });

  geminiWs.on("message", (data) => {
    const text = data.toString();
    const relayStart = Date.now();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(text);
    }
    const relayMs = Date.now() - relayStart;
    relayMsSum += relayMs;
    if (relayMs > relayMsMax) relayMsMax = relayMs;
    relayCount++;
    try {
      const parsed = JSON.parse(text);

      // Gemini signals setup is accepted — now safe to forward client content turns
      if (!isReady && parsed?.setupComplete !== undefined) {
        isReady = true;
        if (setupFallbackTimer) { clearTimeout(setupFallbackTimer); setupFallbackTimer = null; }
        console.log("✅ Gemini setup complete — flushing message buffer");
        while (messageBuffer.length > 0) geminiWs.send(messageBuffer.shift());
      }

      if (!sessionStartRecorded && parsed?.setupComplete !== undefined) {
        sessionStartRecorded = true;
        newrelic.recordCustomEvent("VoiceSessionStart", {
          voiceSessionId, userId, locale, model: MODEL, source: "server", gitSha: GIT_SHA,
          msProfileLookup: ws.msProfileLookup ?? null, msGeminiWsOpen,
          msSetupComplete: Date.now() - geminiWsCreatedAt,
        });
      }

      if (parsed?.error) {
        console.error("❌ Gemini upstream error payload:", JSON.stringify(parsed.error));
      }

      // Usage tracking — check both top-level and serverContent-nested locations
      // (3.1 Live may deliver usageMetadata inside serverContent rather than top-level)
      const usageMeta = parsed?.usageMetadata ?? parsed?.serverContent?.usageMetadata ?? null;
      if (usageMeta) {
        console.log(`[voice-proxy] usageMetadata userId=${userId ?? "null"}`, JSON.stringify(usageMeta));
        if (userId) {
          const responseId = `${voiceSessionId}_${voiceResponseCounter++}`;
          getDb()
            .then(db => db && recordVoiceUsage({
              db, userId, voiceSessionId, responseId, model: MODEL, usage: usageMeta,
              planId, planDisplayName,
            }))
            .catch(e => console.error("[voice-proxy/usage]", e.message));
        }
      }

      // Voice VAD diagnostics + RDS: accumulate transcripts on every session
      // (not just RDS-enabled ones) so a "Brenda didn't respond" report can
      // be traced to what Gemini's own turn-detection actually decided — see
      // docs/voice-vad-tuning.md. RDS extraction itself stays gated below.
      const sc = parsed?.serverContent;
      if (sc) {
        if (sc.inputTranscription?.text) {
          inputTranscriptBuf += sc.inputTranscription.text;
          // Gemini's own signal that it was still hearing/transcribing the
          // user — a far more reliable "end of user turn" marker than raw
          // client WS messages, which stream continuously (mic stays open
          // during Brenda's reply too, for barge-in) and don't correlate
          // with when the user actually stopped talking.
          lastInputTranscriptionAt = Date.now();
        }
        if (sc.outputTranscription?.text) outputTranscriptBuf += sc.outputTranscription.text;

        if (turnFirstAudioAt === null && lastInputTranscriptionAt !== null) {
          const hasAudio = sc.modelTurn?.parts?.some(
            (p) => p.inlineData?.mimeType?.startsWith("audio/pcm")
          );
          if (hasAudio) turnFirstAudioAt = Date.now();
        }

        if (sc.interrupted) {
          console.log(`🗣️ [voice-vad] session=${voiceSessionId} userId=${userId ?? "null"} — Gemini reported an interruption (serverContent.interrupted)`);
          lastInputTranscriptionAt = null;
          turnFirstAudioAt = null;
          relayMsSum = 0; relayMsMax = 0; relayCount = 0;
        }

        if (sc.turnComplete) {
          const userMsg = inputTranscriptBuf.trim();
          const aiReply = outputTranscriptBuf.trim();
          console.log(`🗣️ [voice-vad] session=${voiceSessionId} userId=${userId ?? "null"} — turn complete. user="${userMsg}" brenda="${aiReply}"`);
          inputTranscriptBuf  = "";
          outputTranscriptBuf = "";

          if (lastInputTranscriptionAt !== null) {
            const now = Date.now();
            newrelic.recordCustomEvent("VoiceTurnLatency", {
              voiceSessionId,
              responseId: `${voiceSessionId}_${voiceResponseCounter}`,
              userId, locale, model: MODEL, gitSha: GIT_SHA,
              msToFirstAudio: turnFirstAudioAt ? turnFirstAudioAt - lastInputTranscriptionAt : null,
              msTurnTotal: now - lastInputTranscriptionAt,
              msMaxRelayOverhead: relayMsMax,
              msAvgRelayOverhead: relayCount ? Math.round(relayMsSum / relayCount) : 0,
            });
          }
          lastInputTranscriptionAt = null;
          turnFirstAudioAt = null;
          relayMsSum = 0; relayMsMax = 0; relayCount = 0;

          if (userMsg && aiReply && ws.isAuthenticated && userId && ws.rdsProfile) {
            const extractModel = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
            extractRdsItems(GEMINI_API_KEY, extractModel, userMsg, aiReply, ws.rdsUsername || "")
              .then(async ({ extractions }) => {
                if (!extractions?.length) return;
                const db = await getDb();
                if (!db) return;
                for (const ex of extractions) {
                  if (ex?.domain && ex?.item) {
                    await addRdsItem(db, userId, ex.domain, ex.item)
                      .catch(e => console.error("[rds/voice/addItem]", e.message));
                  }
                }
              })
              .catch(e => console.error("[rds/voice/extract]", e.message));
          }
        }
      }
    } catch { }
  });

  geminiWs.on("close", (code, reason) => {
    console.log(`💀 Gemini upstream closed. Code: ${code}, Reason: ${reason}`);
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  geminiWs.on("error", (err) => {
    console.error("❌ Gemini upstream error:", err.message);
  });

  ws.on("close", () => {
    console.log("🔻 Client disconnected from proxy");
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });
  });
});
