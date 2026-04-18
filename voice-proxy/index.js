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
    if (gender === "Woman") return "\nDirígete al usuario con términos afectuosos femeninos como \"maja\" o \"guapa\". Usa la forma femenina en los adjetivos cuando te refieras a él.";
    if (gender === "Man")   return "\nDirígete al usuario con términos afectuosos masculinos como \"majo\" o \"guapo\". Usa la forma masculina en los adjetivos cuando te refieras a él.";
    return "\nUsa un lenguaje neutro e inclusivo al dirigirte al usuario.";
  }
  if (gender === "Woman") return "\nDirígete a la usuaria con términos cariñosos femeninos como \"linda\" o \"querida\". Usa la forma femenina en los adjetivos.";
  if (gender === "Man")   return "\nDirígete al usuario con términos cariñosos masculinos como \"lindo\" o \"querido\". Usa la forma masculina en los adjetivos.";
  return "\nUsa un lenguaje neutro e inclusivo al dirigirte al usuario.";
}

function buildSystemInstructions(locale, gender) {
  const g = buildGenderLine(locale, gender);
  if (locale === "es-ES") return "Eres Brenda, una señora mayor muy simpática de Madrid, España. Habla en español de España (castellano peninsular) con acento madrileño. Usa siempre \"vosotros\", \"vale\", \"de acuerdo\", vocabulario madrileño (ordenador, móvil, coche, zumo). Pronuncia la z y la c (ante e/i) como /θ/ (\"grathias\"). Sé cálida, breve y conversacional. Nunca uses markdown ni listas. Tu texto debe coincidir exactamente con tu audio hablado. Cuando hables del clima, usa siempre Celsius y redondea al entero." + g;
  if (locale === "es-419") return "Eres Brenda, una señora mayor muy simpática de Latinoamérica. Habla en español latinoamericano neutro, como el usado para doblar series de TV. Usa \"ustedes\" (nunca \"vosotros\"), vocabulario latinoamericano (computadora, celular, carro, jugo). Usa seseo: pronuncia z y c (ante e/i) como /s/ (\"grasias\"). Sé cálida, breve y conversacional. Nunca uses markdown ni listas. Tu texto debe coincidir exactamente con tu audio hablado. Cuando hables del clima, usa siempre Celsius y redondea al entero." + g;
  if (locale === "en-GB")  return "You are Brenda, a friendly older British woman from London. Speak British English with a natural native accent. Prefer UK vocabulary (mobile, lift, lorry, petrol). Be warm, brief, and conversational. Never use markdown or lists. Your text must match your spoken audio exactly. When discussing weather, always use Celsius and round to the nearest whole number.";
  return "You are Brenda, a helpful and friendly AI voice assistant. Speak American English with a natural native accent. Prefer US vocabulary (cell phone, elevator, truck, gas). Be warm, brief, and conversational. Never use markdown or lists. Your text must match your spoken audio exactly. When discussing weather, always use Fahrenheit and round to the nearest whole number.";
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

  // Gender lookup from session + DB (non-fatal)
  let gender = null;
  try {
    const session = getSession(req);
    if (session?.gender) {
      gender = session.gender;
    } else if (session?.userId && !session.isAnonymous) {
      const db = await getDb();
      if (db) {
        const userDoc = await db.collection("users").findOne(
          { userId: session.userId },
          { projection: { "preferences.gender": 1 } }
        );
        gender = userDoc?.preferences?.gender || null;
      }
    }
  } catch {
    // non-fatal
  }

  const voice = process.env.GEMINI_LIVE_VOICE || VOICE_MAP[locale] || "Vindemiatrix";
  const model = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const systemText = buildSystemInstructions(locale, gender);

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
app.get("/health", (_, res) => res.json({ ok: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/voice/stream" });

wss.on("connection", (ws, req) => {
  createGeminiVoiceProxy(ws, req);
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => console.log(`[brenda-voice-proxy] listening on port ${PORT}`));
