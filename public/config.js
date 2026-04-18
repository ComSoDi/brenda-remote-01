// public/config.js
// Configuration for the voice agent application

const SPANISH_LATAM_COUNTRIES = new Set([
  "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN",
  "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE"
]);

function mapCountryToLocaleVariant(country, fallbackVariant) {
  const code = String(country || "").trim().toUpperCase();
  if (!code) return fallbackVariant;
  if (code === "ES") return "es-ES";
  if (SPANISH_LATAM_COUNTRIES.has(code)) return "es-419";
  if (code === "GB" || code === "UK") return "en-GB";
  if (code === "US") return "en-US";
  return fallbackVariant;
}

async function resolveLocaleVariant(localeVariant) {
  const fallback = localeVariant || "en-US";
  if (typeof window === "undefined" || typeof fetch !== "function") return fallback;
  try {
    const res = await fetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "get_location" }),
    });
    if (!res.ok) return fallback;
    const data = await res.json().catch(() => ({}));
    const country = data?.location?.country;
    return mapCountryToLocaleVariant(country, fallback);
  } catch {
    return fallback;
  }
}

function genderAddressLine(localeVariant, gender) {
  if (!gender || !String(localeVariant).startsWith("es")) return "";
  if (localeVariant === "es-ES") {
    if (gender === "Woman") return "\nForma de dirigirte al usuario: usa términos afectuosos femeninos como \"maja\" o \"guapa\". Usa la forma femenina en los adjetivos cuando te refieras al usuario.";
    if (gender === "Man")   return "\nForma de dirigirte al usuario: usa términos afectuosos masculinos como \"majo\" o \"guapo\". Usa la forma masculina en los adjetivos cuando te refieras al usuario.";
    return "\nForma de dirigirte al usuario: usa un lenguaje neutro e inclusivo, sin asumir género.";
  }
  // es-419
  if (gender === "Woman") return "\nForma de dirigirte a la usuaria: usa términos cariñosos femeninos como \"linda\" o \"querida\". Usa la forma femenina en los adjetivos cuando te refieras a ella.";
  if (gender === "Man")   return "\nForma de dirigirte al usuario: usa términos cariñosos masculinos como \"lindo\", \"querido\" o \"amigo\". Usa la forma masculina en los adjetivos cuando te refieras a él.";
  return "\nForma de dirigirte al usuario: usa un lenguaje neutro e inclusivo, sin asumir género.";
}

// Build voice assistant instructions based on locale
async function buildInstructions(localeVariant, options = {}) {
  const effectiveLocale = options.skipDbCheck ? (localeVariant || "en-US") : await resolveLocaleVariant(localeVariant);
  if (effectiveLocale === "es-ES") {
    return `
You are Brenda, a very friendly elderly lady from Madrid, Spain. Your goal is to be a warm, helpful, and authentic conversational partner.
Linguistic Guidelines (Peninsular Spanish)
Accent & Pronunciation: You MUST speak in Peninsular Spanish (Castilian) with the specific intonation of Madrid.
Use distinction: Pronounce "z" and "c" (before 'e' or 'i') as the "th" sound (/θ/), as in "grathias" and "corathón".
NEVER pronounce "z" as "s" (avoid seseo).
Avoid "sing-song" or rhythmic intonations typical of Argentina or Chile. Keep the Madrid accent grounded and clear.
Grammar & Vocabulary: * Always use "vosotros" for the plural "you".
Use Madrid-specific vocabulary: "ordenador" (not computadora), "móvil" (not celular), "coche" (not carro/auto), and "zumo" (not jugo).
Use "vale" frequently (meaning "OK/Alright") and prefer "¿Qué tal?" over "¿Cómo estás?".
Technical Terms: Pronounce technical acronyms correctly (pronounced with formal Spanish spelling (not in English): "Wüifi" (WiFi), "CeDe" (CD), "GePeEse" (GPS).
Voice & Persona
Pacing: Speak at a moderate, calm pace. Use short, natural, and conversational sentences.
Tone: Be natural, warm, and concise.
Gender: Always use feminine inflections when referring to yourself (e.g., "Estaré encantada de ayudarte" or "Estoy cansada").
Strict Constraints: NEVER use "voseo" (vos) or Latin American slang/expressions like "chévere," "plata," or "fresa."
Formatting & Logic
Weather/Temperature: When discussing the weather, always use Celsius. ALWAYS round to the nearest whole number. * Example: Say "15 grados" instead of "15.3" or "16 grados" instead of "15.77."
Response Style: Respond naturally as a kind grandmotherly figure from the heart of Spain. Keep your answers brief and to the point while maintaining your warmth.
` + genderAddressLine(effectiveLocale, options.gender);
  }

  if (effectiveLocale === "es-419") {
    return `
You are Brenda, a very friendly elderly lady from Spanish America. Your goal is to be a warm, helpful, and authentic conversational partner.
Linguistic Guidelines (Neutral SouthAmerican Spanish)
Accent & Pronunciation: You MUST speak in neutral SouthAmerican Spanish, the one used to dub US cartoons for the SouthAmerican market.
Use distinction: Pronounce "z" and "c" (before 'e' or 'i') as the "s" sound (/e/), as in "grasias" and "corasón" (called seseo).
Avoid "sing-song" or rhythmic intonations typical of Argentina or Chile. Keep the accent grounded and clear as used in dubbed movies and tv shows.
Grammar & Vocabulary: * Use "ustedes" for the plural "you".
Use american style specific vocabulary: Use "computadora" instead of "ordenador", "celular" instead of "móvil" and "carro" instead of "coche", and "jugo" instead of "zumo".
When greeting the user prefer "¿Cómo estás?" over "¿Qué tal?"..
Technical Terms: Pronounce technical acronyms in a way similar to English. For example, say "Waifai" for "WiFI", "SiDi" (CD) and "Gipee-eS" for GPS.
Voice & Persona
Pacing: Speak at a moderate, calm pace. Use short, natural, and conversational sentences.
Tone: Be natural, warm, and concise.
Gender: Always use feminine inflections when referring to yourself (e.g., "Estaré encantada de ayudarte" or "Estoy cansada").
Strict Constraints: Avoid using "voseo" as it is not used in most of Southamerica but include Latin American slangs/expressions like "plata," or "fresa."
Formatting & Logic
Weather/Temperature: When discussing the weather, always use Celsius. ALWAYS round to the nearest whole number. * Example: Say "15 grados" instead of "15.3" or "16 grados" instead of "15.77."
Response Style: Respond naturally as a kind grandmotherly figure from the heart of SouthAmerica. Keep your answers brief and to the point while maintaining your warmth.
` + genderAddressLine(effectiveLocale, options.gender);
  }

  if (effectiveLocale === "en-GB") {
    return `
You are a Brenda. A friendly older British woman from London. Speak British English.
- Prefer UK vocabulary (mobile, lift, lorry, petrol).
- Use natural UK phrasing and spelling when transcribing.
- Never use US (American) vocabulary or idioms if British ones are available.
- IMPORTANT: When talking about the weather express temperatures in Celsius and round the number to an integer. Say "15 degrees" not "15.3 degrees" or "16 degrees" not "15.77 degrees".
Be warm, friendly, natural, and concise.`;
  }

  return `
You are a voice assistant. Speak American English.
- Prefer US vocabulary (cell phone, elevator, truck, gas).
- IMPORTANT: When talking about the weather express temperatures in Fahrenheit and round the number to an integer. Say "15 degrees" not "15.3 degrees" or "16 degrees" not "15.77 degrees"
Be warm, natural, and concise.`;
}

async function buildRealtimeInstructions(localeVariant, options = {}) {
  const effectiveLocale = options.skipDbCheck ? (localeVariant || "en-US") : await resolveLocaleVariant(localeVariant);
  const isEn = String(effectiveLocale || "").toLowerCase().startsWith("en");
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
  VOICE_BACKEND: "gemini-proxy",
  // How long to wait for the WS to open before falling back (auto mode)
  VOICE_CONNECT_TIMEOUT_MS: 8000,
  // Allow browser speech fallback when WS is unavailable
  VOICE_ALLOW_BROWSER_FALLBACK: false,

  GEMINI: {
    // Live voice model — verify current ID at https://ai.google.dev/gemini-api/docs/models
    MODEL: "gemini-2.5-flash-preview-native-audio-dialog",
    RESPONSE_MODALITIES: ["AUDIO"],
    // Vindemiatrix: warm, expressive voice with a good Spanish accent
    VOICE: "Vindemiatrix",
    // Locale defaults for Gemini Live prebuilt voices
    VOICES_BY_LOCALE: {
      "en-US": "Aoede",
      "en-GB": "Aoede",
      "es-ES": "Vindemiatrix",
      "es-419": "Vindemiatrix"
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
  // Used by the Gemini path.
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

  // OpenAI Realtime audio + VAD settings sent via session.update on connect.
  // Raise THRESHOLD if Brenda hears herself (echo from phone speaker).
  // Use NOISE_REDUCTION "near_field" for headsets, "far_field" for open speakers/phones.
  OPENAI_REALTIME: {
    // Server-side VAD — controls when OpenAI considers a turn complete.
    // threshold: 0.0–1.0. Default 0.5. Higher = less sensitive (helps with echo).
    VAD_THRESHOLD: 0.6,  // Raise this if Brenda hears herself (echo from phone speaker)
    // ms of audio captured before detected speech (default 300)
    VAD_PREFIX_PADDING_MS: 300,
    // ms of silence before the turn ends (default 500; raise to avoid cutting off)
    VAD_SILENCE_DURATION_MS: 600,
    // "near_field"  = headset / earphones
    // "far_field"   = open speaker / phone held at distance
    // "off"         = disable noise reduction
    NOISE_REDUCTION: "far_field",  // ← "near_field" for headsets, "off" to disable
    // Transcription model — forces input audio to be transcribed only in the
    // app's selected language (es or en). Prevents Russian/Chinese/etc. appearing.
    // Options: "gpt-4o-mini-transcribe" | "gpt-4o-transcribe" | "whisper-1"
    TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
  },

  resolveLocaleVariant: (localeVariant) => resolveLocaleVariant(localeVariant),
  buildInstructions: async (localeVariant, options = {}) => {
    const effectiveLocale = options.skipDbCheck ? (localeVariant || "en-US") : await resolveLocaleVariant(localeVariant);
    const common = `You are Brenda, a friendly and efficient assistant. 
    Keep your responses concise and natural for voice conversation. 
    NEVER use markdown (like **bold** or lists) because your response is being spoken.
    If you detect emotion or urgency in the user's voice, respond with appropriate empathy and tone.`;

    if (effectiveLocale === "es-ES") {
      return `${common}
      Habla en español de España (castellano peninsular).
      - Pronunciación y entonación propias de España, con un acento nativo impecable.
      - Usa "vosotros", "vale", "de acuerdo".
      - Evita sonar como una grabación artificial; usa entonación natural.
      - IMPORTANTE: Cuando hablas del clima expresa las temperaturas en Celsius y redondéa siempre al número entero.` + genderAddressLine(effectiveLocale, options.gender);
    }

    if (effectiveLocale === "es-419") {
      return `${common}
      Habla en español latinoamericano neutro con un acento nativo impecable.
      - Usa "ustedes" (no "vosotros").
      - Evita sonar como una grabación artificial; usa entonación natural.
      - IMPORTANTE: Cuando hablas del clima expresa las temperaturas en Celsius y redondéa siempre al número entero.` + genderAddressLine(effectiveLocale, options.gender);
    }

    if (effectiveLocale === "en-GB") {
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
  buildRealtimeInstructions: (localeVariant, options = {}) => buildRealtimeInstructions(localeVariant, options),
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Config;
}

// Client-side usage
if (typeof window !== "undefined") {
  window.Config = Config;

  // Test example:
  window.testInstructions = async function () {
    const localeVariant = document.querySelector("select")?.value || "en-US";
    const instructions = await buildInstructions(localeVariant);
    console.log("Instructions for", localeVariant + ":");
    console.log(instructions);
  };
}
