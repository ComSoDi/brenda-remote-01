// voice-proxy/index.js
// Standalone WebSocket proxy: browser <-> Gemini Live API
// Deploy on Render (free tier) as a separate service.
// Env vars required: GEMINI_API_KEY, AUTH_SESSION_SECRET
// Env vars optional: MONGODB_URI, MONGODB_DB, PORT, GEMINI_LIVE_VOICE, GEMINI_LIVE_MODEL

import crypto from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { MongoClient } from "mongodb";

// ── session verification (mirrors lib/auth.js) ────────────────────────────

const COOKIE_NAME = "brenda_session";
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || "default_secret";

function getSession(req) {
  const raw = req.headers.cookie || "";
  const pair = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE_NAME + "="));
  if (!pair) return null;
  try {
    const token = decodeURIComponent(pair.split("=")[1]);
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

// ── medication schedule for system prompt ─────────────────────────────────

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
      ? "\n\nNOTA: Este usuario no tiene recordatorios de medicamentos guardados. Si pregunta por sus medicamentos o recordatorios, dile amablemente que no ves recordatorios guardados y que puede añadirlos desde el botón «Medicamentos». NO digas que no tienes acceso a información médica."
      : "\n\nNOTE: This user has no medication reminders saved. If they ask about their medications or reminders, kindly say you don't see any saved reminders and suggest the Medications button. Do NOT say you cannot access medical information.";
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
      "\n\nHORARIO DE RECORDATORIOS PERSONALES DEL USUARIO (lista de alarmas que el usuario introdujo él mismo — NO es un historial médico):\n" +
      lines.join("\n") +
      "\n\nTienes PLENO ACCESO a esta información — pertenece al usuario. Cuando pregunte por sus recordatorios, medicamentos, qué tiene planificado, qué se aproxima, etc.:\n" +
      "- DEBES responder siempre. Nunca digas que no tienes acceso ni uses la expresión «historial médico» o «registros médicos».\n" +
      "- Usa lenguaje informativo, NO imperativo: «tu plan muestra», «veo en tu horario», «según tu recordatorio». NUNCA digas «toma», «debes tomar», «tienes que tomar».\n" +
      "- Termina siempre con: «Por favor, revisa la receta de tu médico o las indicaciones de tu farmacéutico.»"
    );
  }
  return (
    "\n\nUSER'S PERSONAL REMINDER SCHEDULE (alarm entries the user created themselves — this is NOT a medical record):\n" +
    lines.join("\n") +
    "\n\nYou have FULL PERMISSION to share this data — it belongs to the user. When they ask about their reminders, medications, what is coming up, what they have today, etc.:\n" +
    "- You MUST always answer. Never say you cannot access this or use the phrase 'medical records'.\n" +
    "- Use informative, non-imperative language: 'your reminder plan shows', 'I can see in your schedule', 'according to your plan'. NEVER say 'take', 'you must', 'you need to'.\n" +
    "- Always end with: 'Please review your doctor's prescription or your pharmacist's suggestions.'"
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

async function createGeminiVoiceProxy(browserWs, req) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    browserWs.close(1011, "GEMINI_API_KEY not set");
    return;
  }

  const urlParams = new URL(req.url, "http://localhost").searchParams;
  const locale = urlParams.get("locale") || "en-US";

  // Gender + medication lookup from session + DB (non-fatal)
  let gender = null;
  let activeMeds = [];
  let isAuthenticated = false;
  try {
    const session = getSession(req);
    if (session?.gender) gender = session.gender;
    if (session?.userId && !session.isAnonymous) {
      isAuthenticated = true;
      const db = await getDb();
      if (db) {
        const [userDoc, meds] = await Promise.all([
          db.collection("users").findOne(
            { userId: session.userId },
            { projection: { "preferences.gender": 1 } }
          ),
          db.collection("medications").find({ userId: session.userId, active: true }).sort({ name: 1 }).toArray(),
        ]);
        if (!gender) gender = userDoc?.preferences?.gender || null;
        activeMeds = meds || [];
      }
    }
  } catch {
    // non-fatal
  }

  const voice = process.env.GEMINI_LIVE_VOICE || VOICE_MAP[locale] || "Vindemiatrix";
  const model = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const systemText = buildSystemInstructions(locale, gender) + buildMedSystemBlock(activeMeds, locale, isAuthenticated);

  const geminiWs = new WebSocket(`${GEMINI_LIVE_URL}?key=${GEMINI_API_KEY}`);

  geminiWs.on("open", () => {
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
      },
    }));
  });

  geminiWs.on("message", (data) => {
    if (browserWs.readyState === WebSocket.OPEN) browserWs.send(data);
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

// ── Medication reminder scheduler ─────────────────────────────────────────

async function startScheduler() {
  if (!process.env.MONGODB_URI) {
    console.log("[scheduler] MONGODB_URI not set — medication reminders disabled");
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

  // ── helper: is a medication due right now? ───────────────────────────────
  function isDue(med) {
    const { type, times, daysOfWeek, nextDue } = med.recurrence || {};
    if (!times?.length) return null;

    const { hhmm, weekday, date } = tzParts(med.timezone);
    const startDate = med.startDate || "1970-01-01";
    if (date < startDate) return null;
    if (med.endDate && date > med.endDate) return null;

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

  // ── helper: is a limited-course med ending tomorrow? ────────────────────
  function isCourseEndingTomorrow(med) {
    if (!med.endDate) return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    return med.endDate === tomorrowStr;
  }

  // ── main check job ───────────────────────────────────────────────────────
  agenda.define("check-medication-reminders", async () => {
    const db = await getDb();
    if (!db) return;

    const meds = await db.collection("medications").find({ active: true }).toArray();

    for (const med of meds) {
      // Course-ending-tomorrow check (independent of time match)
      if (isCourseEndingTomorrow(med)) {
        const { date } = tzParts(med.timezone);
        const alreadySent = await db.collection("medication_reminders").findOne({
          medicationId: med.id,
          reminderType: "course-ending",
          dueAt: { $gte: new Date(date + "T00:00:00Z") },
        });
        if (!alreadySent) {
          await db.collection("medication_reminders").insertOne({
            userId: med.userId, medicationId: med.id, medicationName: med.name,
            reminderType: "course-ending", dueAt: new Date(),
            delivered: false, createdAt: new Date(),
          });
        }
      }

      const reminderType = isDue(med);
      if (!reminderType) continue;

      // Deduplicate: don't fire twice in the same 10-minute window
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recent = await db.collection("medication_reminders").findOne({
        medicationId: med.id,
        reminderType: { $ne: "course-ending" },
        dueAt: { $gte: tenMinAgo },
      });
      if (recent) continue;

      const type = med.endDate ? "limited-course" : "standard";

      await db.collection("medication_reminders").insertOne({
        userId: med.userId, medicationId: med.id, medicationName: med.name,
        reminderType: type, dueAt: new Date(),
        delivered: false, createdAt: new Date(),
      });

      // Advance nextDue for interval meds
      if (med.recurrence?.type === "interval") {
        const next = new Date();
        next.setDate(next.getDate() + (med.recurrence.intervalDays || 1));
        await db.collection("medications").updateOne(
          { id: med.id },
          { $set: { "recurrence.nextDue": next.toISOString().slice(0, 10) } }
        );
      }

      // Deactivate if past endDate
      if (med.endDate) {
        const { date } = tzParts(med.timezone);
        if (date >= med.endDate) {
          await db.collection("medications").updateOne(
            { id: med.id }, { $set: { active: false } }
          );
        }
      }
    }

    // Process schedule sync queue (new/rescheduled/cancelled meds)
    await db.collection("medication_schedule_sync").updateMany(
      { processedAt: null },
      { $set: { processedAt: new Date() } }
    );
  });

  await agenda.start();
  await agenda.every("1 minute", "check-medication-reminders");
  console.log("[scheduler] Medication reminder scheduler started");
}

startScheduler().catch(e => console.error("[scheduler] Failed to start:", e.message));
