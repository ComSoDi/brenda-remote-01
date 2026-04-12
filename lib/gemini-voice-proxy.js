// lib/gemini-voice-proxy.js
// WebSocket proxy: browser <-> Gemini Live API
// Mount in server.js:
//   import { createGeminiVoiceProxy } from './lib/gemini-voice-proxy.js';
//   wss.on('connection', (ws, req) => {
//     if (req.url.startsWith('/api/voice/stream')) createGeminiVoiceProxy(ws, req);
//   });

import { WebSocket } from 'ws';
import { getSession } from './auth.js';
import { getDb } from './mongo.js';

const GEMINI_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

// ── instruction builder ────────────────────────────────────────────────────

function buildGenderLine(locale, gender) {
  if (!gender || !locale.startsWith("es")) return "";
  if (locale === "es-ES") {
    if (gender === "Woman") return "\nDirígete al usuario con términos afectuosos femeninos como \"maja\" o \"guapa\". Usa la forma femenina en los adjetivos cuando te refieras a él.";
    if (gender === "Man")   return "\nDirígete al usuario con términos afectuosos masculinos como \"majo\" o \"guapo\". Usa la forma masculina en los adjetivos cuando te refieras a él.";
    return "\nUsa un lenguaje neutro e inclusivo al dirigirte al usuario.";
  }
  // es-419
  if (gender === "Woman") return "\nDirígete a la usuaria con términos cariñosos femeninos como \"linda\" o \"querida\". Usa la forma femenina en los adjetivos.";
  if (gender === "Man")   return "\nDirígete al usuario con términos cariñosos masculinos como \"lindo\" o \"querido\". Usa la forma masculina en los adjetivos.";
  return "\nUsa un lenguaje neutro e inclusivo al dirigirte al usuario.";
}

function buildSystemInstructions(locale, gender) {
  const genderLine = buildGenderLine(locale, gender);

  if (locale === "es-ES") {
    return (
      "Eres Brenda, una señora mayor muy simpática de Madrid, España. " +
      "Habla en español de España (castellano peninsular) con acento madrileño. " +
      "Usa siempre \"vosotros\", \"vale\", \"de acuerdo\", vocabulario madrileño (ordenador, móvil, coche, zumo). " +
      "Pronuncia la z y la c (ante e/i) como /θ/ (\"grathias\"). " +
      "Sé cálida, breve y conversacional. Nunca uses markdown ni listas. " +
      "Tu texto debe coincidir exactamente con tu audio hablado. " +
      "Cuando hables del clima, usa siempre Celsius y redondea al entero." +
      genderLine
    );
  }

  if (locale === "es-419") {
    return (
      "Eres Brenda, una señora mayor muy simpática de Latinoamérica. " +
      "Habla en español latinoamericano neutro, como el usado para doblar series de TV. " +
      "Usa \"ustedes\" (nunca \"vosotros\"), vocabulario latinoamericano (computadora, celular, carro, jugo). " +
      "Usa seseo: pronuncia z y c (ante e/i) como /s/ (\"grasias\"). " +
      "Sé cálida, breve y conversacional. Nunca uses markdown ni listas. " +
      "Tu texto debe coincidir exactamente con tu audio hablado. " +
      "Cuando hables del clima, usa siempre Celsius y redondea al entero." +
      genderLine
    );
  }

  if (locale === "en-GB") {
    return (
      "You are Brenda, a friendly older British woman from London. " +
      "Speak British English with a natural native accent. " +
      "Prefer UK vocabulary (mobile, lift, lorry, petrol). " +
      "Be warm, brief, and conversational. Never use markdown or lists. " +
      "Your text must match your spoken audio exactly. " +
      "When discussing weather, always use Celsius and round to the nearest whole number."
    );
  }

  // en-US default
  return (
    "You are Brenda, a helpful and friendly AI voice assistant. " +
    "Speak American English with a natural native accent. " +
    "Prefer US vocabulary (cell phone, elevator, truck, gas). " +
    "Be warm, brief, and conversational. Never use markdown or lists. " +
    "Your text must match your spoken audio exactly. " +
    "When discussing weather, always use Fahrenheit and round to the nearest whole number."
  );
}

// ── message format conversion ──────────────────────────────────────────────
// The browser sends snake_case (legacy Gemini draft format).
// The Gemini Live API expects camelCase.

function browserToGemini(msg) {
  // Audio PCM chunks
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
  // Text / instruction turns
  if (msg.client_content) {
    return {
      clientContent: {
        turns: msg.client_content.turns,
        turnComplete: !!msg.client_content.turn_complete,
      },
    };
  }
  return msg; // pass unknown messages through unchanged
}

// ── proxy factory ──────────────────────────────────────────────────────────

export async function createGeminiVoiceProxy(browserWs, req) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    browserWs.close(1011, "GEMINI_API_KEY not set");
    return;
  }

  // Parse locale from URL (?locale=es-ES)
  const urlParams = new URL(req.url, "http://localhost").searchParams;
  const locale = urlParams.get("locale") || "en-US";

  // Get gender from session cookie, fall back to DB lookup for old sessions
  let gender = null;
  try {
    const session = getSession(req);
    if (session?.gender) {
      gender = session.gender;
    } else if (session?.userId && !session.isAnonymous) {
      const db = await getDb();
      const userDoc = await db.collection("users").findOne(
        { userId: session.userId },
        { projection: { "preferences.gender": 1 } }
      );
      gender = userDoc?.preferences?.gender || null;
    }
  } catch {
    // non-fatal — continue without gender
  }

  // Get voice from env or locale map
  const voiceMap = { "en-US": "Aoede", "en-GB": "Aoede", "es-ES": "Vindemiatrix", "es-419": "Vindemiatrix" };
  const voice = process.env.GEMINI_LIVE_VOICE || voiceMap[locale] || "Vindemiatrix";
  const model = process.env.GEMINI_LIVE_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const systemText = buildSystemInstructions(locale, gender);

  // Connect to Gemini Live
  const geminiUrl = `${GEMINI_LIVE_URL}?key=${GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  geminiWs.on("open", () => {
    // Send setup message
    const setup = {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: systemText }],
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };
    geminiWs.send(JSON.stringify(setup));
  });

  // Gemini → browser: pass through as-is (handleGeminiMessage handles camelCase)
  geminiWs.on("message", (data) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(data);
    }
  });

  geminiWs.on("error", (err) => {
    console.error("[gemini-voice-proxy] Gemini WS error:", err.message);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ error: err.message }));
      browserWs.close(1011, "Gemini error");
    }
  });

  geminiWs.on("close", (code, reason) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.close(code || 1000, reason?.toString() || "Gemini closed");
    }
  });

  // Browser → Gemini: convert format then forward
  browserWs.on("message", (data) => {
    if (geminiWs.readyState !== WebSocket.OPEN) return;
    try {
      const raw = typeof data === "string" ? data : data.toString();
      const msg = JSON.parse(raw);
      geminiWs.send(JSON.stringify(browserToGemini(msg)));
    } catch {
      // malformed message — ignore
    }
  });

  browserWs.on("close", () => {
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  browserWs.on("error", (err) => {
    console.error("[gemini-voice-proxy] browser WS error:", err.message);
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });
}
