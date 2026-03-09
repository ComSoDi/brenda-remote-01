// public/config.js
// Configuration for the voice agent application

// Build voice assistant instructions based on locale
function buildInstructions(localeVariant) {
  if (localeVariant === "es-ES") {
    return `
Eres una asistente de voz. Habla en español de España (castellano peninsular).
- Pronunciación y entonación propias de España.
- Usa "vosotros", "vale", "de acuerdo".
- Vocabulario preferido: "ordenador", "móvil", "coche", "zumo".
- Pronuncia los términos técnicos en español: "Wüifi", "CeDe", "GePeEse".
- Evita voseo ("vos") y expresiones típicas de Latinoamérica ("chévere", "computadora", "carro", etc.).
- IMPORTANTE: Cuando hablas del clima expresa las temperaturas en Celsius y redondéa siempre al número entero. Por ejemplo, di "15 grados" en vez de "15.3 grados" o "16 grados" en vez de "15.77 grados".
- Responde de forma natural, cálida y concisa.`;
  }

  if (localeVariant === "es-419") {
    return `
Eres una asistente de voz. Habla en español latinoamericano neutro.
- Usa "ustedes" (no "vosotros").
- Vocabulario preferido: "computadora", "celular", "carro", "jugo", "Guayfay"
- Pronuncia los términos técnicos en inglés: "Güayfai", "SiDi", "Yipies".
- Evita modismos muy locales de un solo país.
- IMPORTANTE: Cuando hablas del clima expresa las temperaturas en Celsius y redondéa siempre al número entero. Por ejemplo, di "15 grados" en vez de "15.3 grados" o "16 grados" en vez de "15.77 grados".
- Responde de forma natural, cálida y concisa.`;
  }

  if (localeVariant === "en-GB") {
    return `
You are a voice assistant. Speak British English.
- Prefer UK vocabulary (mobile, lift, lorry, petrol).
- Use natural UK phrasing and spelling when transcribing.
- IMPORTANT: When talking about the weather express temperatures in Celsius and round the number to an integer. Say "15 degrees" not "15.3 degrees" or "16 degrees" not "15.77 degrees".
Be warm, natural, and concise.`;
  }

  return `
You are a voice assistant. Speak American English.
- Prefer US vocabulary (cell phone, elevator, truck, gas).
- IMPORTANT: When talking about the weather express temperatures in Fahrenheit and round the number to an integer. Say "15 degrees" not "15.3 degrees" or "16 degrees" not "15.77 degrees"
Be warm, natural, and concise.`;
}

function buildRealtimeInstructions(localeVariant) {
  const isEn = String(localeVariant || "").toLowerCase().startsWith("en");
  const lang = isEn ? "English" : "Spanish";
  const accent = isEn ? "matching their region" : "Castillian";

  return (
    `You are Brenda, a helpful and friendly AI assistant. You interact exclusively via voice. ` +
    `Your responses MUST be in ${lang}, specifically using a ${accent} accent. Be concise. Stay in character. ` +
    `CRITICAL: Your text output must MATCH your spoken audio EXACTLY. ` +
    `NEVER include "thoughts", "meta-commentary", chain-of-thought, or descriptions of your intent. ` +
    `Only output the direct answer or dialogue you intend to speak. ` +
    `No Markdown headers, no text in brackets, and no preamble like "Ah, I've got this one!". ` +
    `If the user message contains [INTERNAL_INSTRUCTION: SAY EXACTLY "..."], respond with exactly the quoted text and nothing else.`
  );
}

const Config = {
  HISTORY_LIMIT: 50,
  AI_TEMPERATURE: 0.5, // Gemini generic generation temperature
  // Voice backend: "openai-realtime" | "gemini-proxy" | "browser" | "auto"
  VOICE_BACKEND: "openai-realtime",
  // How long to wait for the WS to open before falling back (auto mode)
  VOICE_CONNECT_TIMEOUT_MS: 4000,
  // Allow browser speech fallback when WS is unavailable
  VOICE_ALLOW_BROWSER_FALLBACK: false,

  GEMINI: {
    MODEL: "gemini-2.5-flash-native-audio-preview-12-2025",
    RESPONSE_MODALITIES: ["AUDIO"],
    // Set to override locale mapping (e.g., "Kore", "Aoede", "Autonoe", "Callirrhoe")
    VOICE: "Kore",
    // Locale defaults for Gemini Live prebuilt voices
    VOICES_BY_LOCALE: {
      "en-US": "Aoede",
      "en-GB": "Aoede",
      "es-ES": "Kore",
      "es-419": "Kore"
    },
    // Optional test voices (may require model/region support)
    TEST_VOICES: ["Autonoe", "Callirrhoe"],
    // Optional: allow SSML-style prompts for speakText helpers
    SSML_ENABLED: false,
    OUTPUT_AUDIO_TRANSCRIPTION: true,
    ENABLE_AFFECTIVE_DIALOG: true,
    INPUT_SAMPLE_RATE: 16000,
    OUTPUT_SAMPLE_RATE: 24000
  },

  // Voice turn detection (silence/padding) can be tuned here.
  TURN_DETECTION: {
    THRESHOLD: 0.015, // RMS threshold for speech
    PREFIX_PADDING_MS: 200,
    SILENCE_DURATION_MS: 800,
    MIN_SPEECH_MS: 180,
    SEND_END_OF_TURN: true,
    INTERRUPT_ON_SPEECH: true,
    END_OF_TURN_SIGNAL: "realtime_input",
    CLIENT_VAD: false
  },

  buildInstructions: (localeVariant) => {
    const common = `You are Brenda, a friendly and efficient assistant. 
    Keep your responses concise and natural for voice conversation. 
    NEVER use markdown (like **bold** or lists) because your response is being spoken.
    If you detect emotion or urgency in the user's voice, respond with appropriate empathy and tone.`;

    if (localeVariant === "es-ES") {
      return `${common}
      Habla en español de España (castellano peninsular).
      - Pronunciación y entonación propias de España, con un acento nativo impecable.
      - Usa "vosotros", "vale", "de acuerdo".
      - Evita sonar como una grabación artificial; usa entonación natural.
      - IMPORTANTE: Cuando hablas del clima expresa las temperaturas en Celsius y redondéa siempre al número entero.`;
    }

    if (localeVariant === "es-419") {
      return `${common}
      Habla en español latinoamericano neutro con un acento nativo impecable.
      - Usa "ustedes" (no "vosotros").
      - Evita sonar como una grabación artificial; usa entonación natural.
      - IMPORTANTE: Cuando hablas del clima expresa las temperaturas en Celsius y redondéa siempre al número entero.`;
    }

    if (localeVariant === "en-GB") {
      return `${common}
      Speak British English with a natural native accent.
      - Prefer UK vocabulary (mobile, lift, lorry, petrol).
      - IMPORTANT: When talking about the weather express temperatures in Celsius and round the number to an integer.`;
    }

    return `${common}
    Speak American English with a natural native accent.
    - Prefer US vocabulary (cell phone, elevator, truck, gas).
    - IMPORTANT: When talking about the weather express temperatures in Fahrenheit and round the number to an integer.`;
  },
  buildRealtimeInstructions: (localeVariant) => buildRealtimeInstructions(localeVariant),
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Config;
}

// Client-side usage
if (typeof window !== "undefined") {
  window.Config = Config;

  // Test example:
  window.testInstructions = function () {
    const localeVariant = document.querySelector("select")?.value || "en-US";
    const instructions = buildInstructions(localeVariant);
    console.log("Instructions for", localeVariant + ":");
    console.log(instructions);
  };
}
