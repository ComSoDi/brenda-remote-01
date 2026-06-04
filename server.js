import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import dns from "dns";
import { randomUUID } from "crypto";
import { WebSocket, WebSocketServer } from "ws";
import chatHandler from "./api/chat.js";
import subjectsHandler from "./api/subjects.js";
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
import { getSession } from "./lib/auth.js";
import { getDb } from "./lib/mongo.js";
import { recordVoiceUsage } from "./lib/usage.js";

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
app.all("/api/subjects", subjectsHandler);
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

    // Resolve userId, gender + medications from session cookie / DB (non-fatal)
    let gender = null;
    let activeMeds = [];
    let userId = null;
    try {
      const session = getSession(req);
      if (session?.userId) userId = session.userId;
      if (session?.gender) gender = session.gender;
      if (session?.userId && !session.isAnonymous) {
        const db = await getDb();
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
    } catch {
      // non-fatal
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      ws.userLocale = locale;
      ws.userGender = gender;
      ws.activeMeds = activeMeds;
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
  console.log(`[voice-proxy] session=${voiceSessionId} userId=${userId ?? "null"}`);

  const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const modelPath = MODEL.startsWith("models/") ? MODEL : `models/${MODEL}`;

  const locale = ws.userLocale || "es-ES";
  const voiceMap = { "en-US": "Aoede", "en-GB": "Aoede", "es-ES": "Vindemiatrix", "es-419": "Vindemiatrix" };
  const VOICE = process.env.GEMINI_LIVE_VOICE || voiceMap[locale] || "Vindemiatrix";

  const systemText = buildSystemInstruction(locale, ws.userGender || null) + buildMedSystemBlock(ws.activeMeds || [], locale);

  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  const messageBuffer = [];
  let isReady = false;

  geminiWs.on("open", () => {
    isReady = true;
    console.log(`✅ Gemini upstream ready — model: ${MODEL}, voice: ${VOICE}`);

    const compressionTargetTokens = process.env.GEMINI_CONTEXT_COMPRESSION_TOKENS
      ? Number(process.env.GEMINI_CONTEXT_COMPRESSION_TOKENS)
      : null;

    const setupMessage = {
      setup: {
        model: modelPath,
        generation_config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: { prebuilt_voice_config: { voice_name: VOICE } }
          }
        },
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

    while (messageBuffer.length > 0) {
      geminiWs.send(messageBuffer.shift());
    }
  });

  ws.on("message", (data) => {
    if (isReady) {
      geminiWs.send(data);
    } else {
      messageBuffer.push(data);
    }
  });

  geminiWs.on("message", (data) => {
    const text = data.toString();
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) {
        console.error("❌ Gemini upstream error payload:", JSON.stringify(parsed.error));
      }
      if (parsed?.usageMetadata) {
        console.log(`[voice-proxy] usageMetadata seen userId=${userId ?? "null"}`, JSON.stringify(parsed.usageMetadata));
      }
      if (parsed?.usageMetadata && userId) {
        const responseId = `${voiceSessionId}_${voiceResponseCounter++}`;
        getDb()
          .then(db => db && recordVoiceUsage({ db, userId, voiceSessionId, responseId, model: MODEL, usage: parsed.usageMetadata }))
          .catch(e => console.error("[voice-proxy/usage]", e.message));
      }
    } catch { }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(text);
    }
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
