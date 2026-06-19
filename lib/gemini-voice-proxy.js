// lib/gemini-voice-proxy.js
// WebSocket proxy: browser <-> Gemini Live API
// Mount in server.js:
//   import { createGeminiVoiceProxy } from './lib/gemini-voice-proxy.js';
//   wss.on('connection', (ws, req) => {
//     if (req.url.startsWith('/api/voice/stream')) createGeminiVoiceProxy(ws, req);
//   });

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { getSession } from './auth.js';
import { getDb } from './mongo.js';
import { recordVoiceUsage } from './usage.js';
import { getRdsProfile, buildRdsSystemAddendum, extractRdsItems, addRdsItem } from './rdsService.js';

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

function buildMedBlock(meds, locale, isAuthenticated) {
  const isEs = locale.startsWith("es");
  const hasMeds = meds && meds.length > 0;

  if (!isAuthenticated) return "";   // anonymous — no reminder data expected

  if (!hasMeds) {
    // Authenticated but nothing saved — instruct Gemini what to say instead of refusing
    return isEs
      ? "\n\nNOTA: Este usuario no tiene recordatorios de medicamentos guardados. Si pregunta por sus medicamentos o recordatorios, dile amablemente que no ves recordatorios guardados y que puede añadirlos desde el botón «Medicamentos». NO digas que no tienes acceso a información médica."
      : "\n\nNOTE: This user has no medication reminders saved. If they ask about their medications or reminders, kindly say you don't see any saved reminders and suggest the Medications button. Do NOT say you cannot access medical information.";
  }

  const lines = meds.map((med) => {
    const times = (med.recurrence?.times || []).join(", ");
    const dir = med.directions ? ` — ${med.directions}` : "";
    return times ? `- ${med.name}${dir}: ${times}` : `- ${med.name}${dir}`;
  });
  if (isEs) {
    return (
      "\n\nHORARIO DE RECORDATORIOS PERSONALES DEL USUARIO (lista de alarmas que el usuario introdujo él mismo — NO es un historial médico):\n" +
      lines.join("\n") +
      "\n\nTienes PLENO ACCESO a esta información — pertenece al usuario. Cuando pregunte por sus recordatorios, medicamentos, qué tiene planificado, qué se aproxima, etc.:\n" +
      "- DEBES responder siempre. Nunca digas que no tienes acceso ni uses la expresión «historial médico».\n" +
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

  // Per-connection usage tracking state
  const voiceSessionId = randomUUID();
  let voiceResponseCounter = 0;
  let userId = null;

  // Get gender, medications, and RDS profile from session / DB (non-fatal)
  let gender = null;
  let activeMeds = [];
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
      if (db) {
        const [userDoc, meds, profile] = await Promise.all([
          db.collection("users").findOne(
            { userId: session.userId },
            { projection: { "preferences.gender": 1 } }
          ),
          db.collection("medications").find({ userId: session.userId, active: true }).sort({ name: 1 }).toArray(),
          getRdsProfile(db, session.userId),
        ]);
        if (!gender) gender = userDoc?.preferences?.gender || null;
        activeMeds = meds || [];
        rdsProfile = profile || null;
      }
    }
  } catch {
    // non-fatal — continue without gender / meds / rds
  }

  // Get voice from env or locale map
  const voiceMap = { "en-US": "Aoede", "en-GB": "Aoede", "es-ES": "Vindemiatrix", "es-419": "Vindemiatrix" };
  const voice = process.env.GEMINI_LIVE_VOICE || voiceMap[locale] || "Vindemiatrix";
  const model = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
  const systemText = buildSystemInstructions(locale, gender)
    + buildMedBlock(activeMeds, locale, isAuthenticated)
    + (rdsProfile ? "\n\n" + buildRdsSystemAddendum(rdsProfile, locale, rdsUsername) : "");

  console.log(`[voice-proxy] session start voiceSessionId=${voiceSessionId} userId=${userId ?? "anonymous"}`);

  // RDS transcript buffers — accumulated per turn, extracted on turnComplete
  let inputTranscriptBuf = "";
  let outputTranscriptBuf = "";

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

  // Gemini → browser: forward first (no latency), then process non-blocking
  geminiWs.on("message", (data) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(data);
    }
    try {
      const msg = JSON.parse(data.toString());

      // Usage tracking
      if (msg.usageMetadata && userId) {
        const responseId = `${voiceSessionId}_${voiceResponseCounter++}`;
        console.log(`[voice-proxy] usageMetadata responseId=${responseId}`, JSON.stringify(msg.usageMetadata));
        getDb()
          .then(db => db && recordVoiceUsage({
            db, userId, voiceSessionId, responseId,
            model, usage: msg.usageMetadata,
          }))
          .catch(e => console.error("[voice-proxy/usage]", e.message));
      }

      // RDS: accumulate transcripts and extract on turn complete
      const sc = msg.serverContent;
      if (sc && isAuthenticated && userId && rdsProfile) {
        if (sc.inputTranscription?.text)  inputTranscriptBuf  += sc.inputTranscription.text;
        if (sc.outputTranscription?.text) outputTranscriptBuf += sc.outputTranscription.text;

        if (sc.turnComplete) {
          const userMsg = inputTranscriptBuf.trim();
          const aiReply = outputTranscriptBuf.trim();
          inputTranscriptBuf  = "";
          outputTranscriptBuf = "";

          if (userMsg && aiReply) {
            const GEMINI_API_KEY_ENV = process.env.GEMINI_API_KEY;
            const extractModel = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
            extractRdsItems(GEMINI_API_KEY_ENV, extractModel, userMsg, aiReply, rdsUsername)
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
    } catch { /* not JSON — ignore */ }
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
