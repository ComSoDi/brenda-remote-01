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
import historyHandler from "./api/history.js";
import weatherHandler from "./api/weather.js";
import realtimeKeyHandler from "./api/voice/realtime-key.js";
import appendHandler from "./api/conversation/append.js";
import transcriptCorrectHandler from "./api/transcript/correct.js";
import greetingHandler from "./api/greeting.js";
import medicationsHandler from "./api/medications.js";
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
import { getDb } from "./lib/mongo.js";
import { recordVoiceUsage } from "./lib/usage.js";
import { getRdsProfile, buildRdsSystemAddendum, extractRdsItems, addRdsItem } from "./lib/rdsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = path.join(__dirname, "public");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

dns.setServers((process.env.DNS_SERVERS || "1.1.1.1, 8.8.8.8").split(/[,\s]+/).filter(Boolean));

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(STATIC_DIR));

app.post("/api/auth/login", loginHandler);
app.get("/api/auth/me", meHandler);
app.post("/api/auth/anonymous", anonymousHandler);
app.post("/api/auth/logout", logoutHandler);

app.post("/api/conversation/append", appendHandler);

app.get("/api/history", historyHandler);

app.post("/api/chat", chatHandler);
app.post("/api/weather", weatherHandler);
app.post("/api/voice/realtime-key", realtimeKeyHandler);

app.all("/api/greeting", greetingHandler);
app.all("/api/medications", medicationsHandler);

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

function buildMedSystemBlock(meds, locale) {
  if (!meds || !meds.length) return "";
  const isEs = locale.startsWith("es");
  const lines = meds.map((med) => {
    const times = (med.recurrence?.times || []).join(", ");
    const dir = med.directions ? ` — ${med.directions}` : "";
    return times ? `- ${med.name}${dir}: ${times}` : `- ${med.name}${dir}`;
  });
  if (isEs) {
    return (
      "\n\nMEDICAMENTOS DEL USUARIO (guardados en el sistema):\n" + lines.join("\n") +
      "\n\nCuando el usuario pregunte por sus medicamentos:\n" +
      "1. Confirma con entusiasmo que puedes ayudar.\n" +
      "2. Avisa brevemente que puedes cometer errores y que siempre es mejor confirmar con la receta médica oficial o con el farmacéutico.\n" +
      "3. Lee cada medicamento con su horario en formato 24 horas.\n" +
      "4. Termina siempre con: «No olvides confirmar siempre con la receta médica oficial.»"
    );
  }
  return (
    "\n\nUSER MEDICATIONS (saved in system):\n" + lines.join("\n") +
    "\n\nWhen the user asks about their medications:\n" +
    "1. Warmly confirm you can help.\n" +
    "2. Add a brief disclaimer: you can make mistakes and they should always confirm with the doctor's prescription or pharmacist.\n" +
    "3. List each medication with its scheduled times.\n" +
    "4. Always end with: 'Remember to always confirm with the official medical prescription.'"
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

    // Resolve userId, gender, medications, and RDS profile from session / DB (non-fatal)
    let gender = null;
    let activeMeds = [];
    let userId = null;
    let isAuthenticated = false;
    let rdsProfile = null;
    let rdsUsername = "";
    try {
      const session = getSession(req);
      if (session?.userId) userId = session.userId;
      if (session?.gender) gender = session.gender;
      if (session?.userId && !session.isAnonymous) {
        isAuthenticated = true;
        rdsUsername = session.displayName || session.username || "";
        const db = await getDb();
        const [userDoc, meds, profile] = await Promise.all([
          db.collection("users").findOne(
            { userId: session.userId },
            { projection: { "preferences.gender": 1, "preferences.location": 1 } }
          ),
          db.collection("medications").find({ userId: session.userId, active: true }).sort({ name: 1 }).toArray(),
          getRdsProfile(db, session.userId),
        ]);
        if (!gender) gender = userDoc?.preferences?.gender || null;
        activeMeds = meds || [];
        rdsProfile = profile || null;
        const savedLoc = userDoc?.preferences?.location || null;
        ws.savedLocation = savedLoc;
      }
    } catch {
      // non-fatal
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      ws.userLocale = locale;
      ws.userGender = gender;
      ws.activeMeds = activeMeds;
      ws.isAuthenticated = isAuthenticated;
      ws.rdsProfile = rdsProfile;
      ws.rdsUsername = rdsUsername;
      console.log(`📡 WS upgraded — locale: ${locale}, gender: ${gender || "unknown"}`);
      wss.emit("connection", ws, req);
    });
  } else {
    console.log("❌ Refusing upgrade for non-voice path");
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  console.log("🔌 Proxy: Client connected. Opening Gemini upstream...");

  const voiceSessionId = randomUUID();
  let voiceResponseCounter = 0;
  const userId = ws.userId || null;

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
    + buildMedSystemBlock(ws.activeMeds || [], locale)
    + locationLine
    + (ws.rdsProfile ? "\n\n" + buildRdsSystemAddendum(ws.rdsProfile, locale, ws.rdsUsername || "") : "");

  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  const messageBuffer = [];
  let isReady = false;
  let setupFallbackTimer = null;
  let inputTranscriptBuf = "";
  let outputTranscriptBuf = "";

  geminiWs.on("open", () => {
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
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(text);
    }
    try {
      const parsed = JSON.parse(text);

      // Gemini signals setup is accepted — now safe to forward client content turns
      if (!isReady && parsed?.setupComplete !== undefined) {
        isReady = true;
        if (setupFallbackTimer) { clearTimeout(setupFallbackTimer); setupFallbackTimer = null; }
        console.log("✅ Gemini setup complete — flushing message buffer");
        while (messageBuffer.length > 0) geminiWs.send(messageBuffer.shift());
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
            .then(db => db && recordVoiceUsage({ db, userId, voiceSessionId, responseId, model: MODEL, usage: usageMeta }))
            .catch(e => console.error("[voice-proxy/usage]", e.message));
        }
      }

      // RDS: accumulate transcripts and extract on turn complete
      const sc = parsed?.serverContent;
      if (sc && ws.isAuthenticated && userId && ws.rdsProfile) {
        if (sc.inputTranscription?.text)  inputTranscriptBuf  += sc.inputTranscription.text;
        if (sc.outputTranscription?.text) outputTranscriptBuf += sc.outputTranscription.text;

        if (sc.turnComplete) {
          const userMsg = inputTranscriptBuf.trim();
          const aiReply = outputTranscriptBuf.trim();
          inputTranscriptBuf  = "";
          outputTranscriptBuf = "";

          if (userMsg && aiReply) {
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
