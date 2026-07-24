// api/chat.js (Vercel Serverless Function)
// POST { localeVariant, message } -> { reply }  OR { messages:[...] } -> reply
/*
import { requireSession } from "../lib/auth.js";
import { getDb } from "../lib/mongo.js";
import { ObjectId } from "mongodb";
*/

import { requireSession } from "../lib/auth.js";
import { getDb } from "../lib/mongo.js";
import { ObjectId } from "mongodb";
import { randomUUID } from "crypto";
import { recordChatUsage } from "../lib/usage.js";
import { resolvePlanForUsage } from "../lib/subscriptions.js";
import {
  getRdsProfile, buildRdsSystemAddendum, detectRdsIntent, buildMemoryNarrative,
  extractRdsItems, addRdsItem, removeRdsItem, parseForgetTag,
} from "../lib/rdsService.js";

// Expanded time keywords — catches common natural language patterns in both languages
const TIME_KEYWORDS = {
  en: ["what time", "time is it", "current time", "o'clock", "what's the time",
       "tell me the time", "time now", "the time in", "time zone", "local time"],
  es: ["qué hora", "que hora", "qué horas", "que horas", "hora es", "hora son",
       "hora local", "hora en", "dime la hora", "me dices la hora", "la hora"],
};

const LOCATION_PROMPTS = {
  en: "Where are you located so I can tell you the local time?",
  es: "¿En qué ciudad estás para darte la hora local?",
};

function detectTimeIntent(text, localeVariant = "en-US") {
  if (!text) return false;
  const lang = localeVariant.startsWith("es") ? "es" : "en";
  const lower = text.toLowerCase();
  return TIME_KEYWORDS[lang].some((kw) => lower.includes(kw));
}

function parseLocationFromTimeRequest(text) {
  if (!text) return null;
  const match = text.match(/(?:in|en)\s+([A-Za-zÀ-ÿ\u00f1\u00d1\s]+)/i);
  return match ? match[1].trim() : null;
}

// Detect explicit user requests to change/update their default/home location
function parseLocationChangeRequest(text, lang) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const esPatterns = [
    /(?:fija|cambia|actualiza|pon|establece|modifica)\s+mi\s+(?:ubicaci[oó]n|ciudad|localidad|domicilio|lugar)\s+(?:a|en|como|por)\s+([A-Za-zÀ-ÿ\u00f1\u00d1\s,]+)/i,
    /(?:de ahora en adelante|a partir de ahora|en el futuro)[^.]*(?:\ben\b|\ba\b)\s+([A-Za-zÀ-ÿ\u00f1\u00d1\s,]+)/i,
    /(?:me he mudado|ahora vivo|me mud[eé])\s+a\s+([A-Za-zÀ-ÿ\u00f1\u00d1\s,]+)/i,
    /mi\s+(?:ciudad|ubicaci[oó]n)\s+(?:es|ahora es|será)\s+([A-Za-zÀ-ÿ\u00f1\u00d1\s,]+)/i,
    /(?:quiero que fijes|fija)\s+mi\s+ubicaci[oó]n\s+en\s+([A-Za-zÀ-ÿ\u00f1\u00d1\s,]+)/i,
  ];
  const enPatterns = [
    /(?:change|update|set|fix|move)\s+my\s+(?:location|city|home|place|default)\s+to\s+([A-Za-zÀ-ÿ\s,]+)/i,
    /(?:from now on|in the future)[^.]*(?:in|to)\s+([A-Za-zÀ-ÿ\s,]+)/i,
    /i(?:'ve|\s+have)?\s+moved\s+to\s+([A-Za-zÀ-ÿ\s,]+)/i,
    /my\s+(?:location|city|home)\s+is\s+(?:now\s+)?([A-Za-zÀ-ÿ\s,]+)/i,
    /(?:i now live|i live)\s+in\s+([A-Za-zÀ-ÿ\s,]+)/i,
  ];

  const patterns = lang === "es" ? esPatterns : enPatterns;
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/[.,;!?]+$/, "").trim();
    }
  }
  return null;
}

// Natural language Spanish time formatter
// Returns strings like:
//   "Son las diez y siete minutos de la mañana"
//   "Es la una y media de la tarde"
//   "Son las doce menos cuarto de la noche"
function formatSpanishTime(hours, minutes) {
  const hourWords = [
    "doce", "una", "dos", "tres", "cuatro", "cinco", "seis",
    "siete", "ocho", "nueve", "diez", "once", "doce",
  ];

  const minuteWords = [
    "", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete",
    "ocho", "nueve", "diez", "once", "doce", "trece", "catorce",
    "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
    "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro",
    "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
    "treinta", "treinta y uno", "treinta y dos", "treinta y tres", "treinta y cuatro",
    "treinta y cinco", "treinta y seis", "treinta y siete", "treinta y ocho", "treinta y nueve",
    "cuarenta", "cuarenta y uno", "cuarenta y dos", "cuarenta y tres", "cuarenta y cuatro",
    "cuarenta y cinco", "cuarenta y seis", "cuarenta y siete", "cuarenta y ocho", "cuarenta y nueve",
    "cincuenta", "cincuenta y uno", "cincuenta y dos", "cincuenta y tres", "cincuenta y cuatro",
    "cincuenta y cinco", "cincuenta y seis", "cincuenta y siete", "cincuenta y ocho", "cincuenta y nueve",
  ];

  // Determine period of day
  const getPeriod = (h) => {
    if (h >= 0 && h <= 5)  return "de la madrugada";
    if (h >= 6 && h <= 11) return "de la mañana";
    if (h === 12)          return "del mediodía";
    if (h >= 13 && h <= 20) return "de la tarde";
    return "de la noche"; // 21-23
  };

  // Special case: :45 → "menos cuarto" using next hour
  if (minutes === 45) {
    const nextHour = (hours + 1) % 24;
    const nextH12 = nextHour % 12;
    const nextWord = hourWords[nextH12];
    const verb = nextH12 === 1 ? "Es la" : "Son las";
    const period = getPeriod(nextHour);
    return `${verb} ${nextWord} menos cuarto ${period}`;
  }

  const h12 = hours % 12;
  const hourWord = hourWords[h12];
  const verb = h12 === 1 ? "Es la" : "Son las";
  const period = getPeriod(hours);

  let minStr = "";
  if (minutes === 0) {
    minStr = "";
  } else if (minutes === 15) {
    minStr = " y cuarto";
  } else if (minutes === 30) {
    minStr = " y media";
  } else {
    const plural = minutes !== 1 ? "s" : "";
    minStr = ` y ${minuteWords[minutes]} minuto${plural}`;
  }

  return `${verb} ${hourWord}${minStr} ${period}`;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ── Gemini API helpers ────────────────────────────────────────────────────

/** Map OpenAI-style history (role: assistant) to Gemini contents (role: model). */
function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));
}

/**
 * Call Gemini generateContent.
 * Returns the raw Response so callers can check r.ok before parsing.
 */
async function geminiGenerate(apiKey, model, { systemPrompt, contents, tools, temperature = 0.7 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    generationConfig: { temperature },
    contents,
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  if (tools?.length)  body.tools = tools;

  return fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Extract text or functionCall from a Gemini generateContent response body.
 * Returns { text, functionCall, contentObj } where contentObj is the model turn
 * (for appending to contents in a multi-turn call).
 */
function extractGemini(data) {
  const content = data?.candidates?.[0]?.content;
  if (!content) return { text: null, functionCall: null, contentObj: null };
  const parts   = content.parts || [];
  const textPart = parts.find((p) => typeof p.text === "string");
  const fnPart   = parts.find((p) => p.functionCall);
  return {
    text:         textPart?.text  ?? null,
    functionCall: fnPart?.functionCall ?? null,
    contentObj:   content,
  };
}

// ── Gemini function declarations (replaces OpenAI tools format) ────────────

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_weather",
        description:
          "Get current weather and forecast. If the user doesn't specify a city, use their saved location preference. " +
          "Use this when the user asks about weather, temperature, rain, or atmospheric conditions. " +
          "Also use this to get the timezone when the user asks what time it is.",
        parameters: {
          type: "object",
          properties: {
            city:    { type: "string",  description: "The city name, e.g. 'Madrid'. Optional — uses saved location if omitted." },
            state:   { type: "string",  description: "Optional state/region for disambiguation, e.g. 'Texas'." },
            country: { type: "string",  description: "Optional 2-letter country code, e.g. 'ES'." },
            lat:     { type: "number",  description: "Optional latitude for precise lookup." },
            lon:     { type: "number",  description: "Optional longitude for precise lookup." },
          },
          required: [],
        },
      },
      {
        name: "set_home_location",
        description:
          "Save or update the user's default home location for future weather and time queries. " +
          "Call ONLY when the user explicitly asks to change or set their default location. " +
          "Do NOT call this when the user just asks about weather in a different city.",
        parameters: {
          type: "object",
          properties: {
            city:    { type: "string", description: "City to save as new default, e.g. 'Málaga'." },
            state:   { type: "string", description: "Optional state or region." },
            country: { type: "string", description: "Optional 2-letter country code." },
          },
          required: ["city"],
        },
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

function genderAddressLine(localeVariant, gender) {
  if (!gender || !localeVariant.startsWith("es")) return "";
  if (localeVariant === "es-ES") {
    if (gender === "Woman") return "\nDirígete a la usuaria con términos afectuosos femeninos de forma natural y frecuente: \"maja\", \"guapa\", \"amiga\", \"querida\", \"bonita\". Usa siempre la forma femenina en los adjetivos que se refieran a ella (ej. \"¡qué lista eres!\", \"estás muy atenta\", \"qué amable eres\").";
    if (gender === "Man")   return "\nDirígete al usuario con términos afectuosos masculinos de forma natural y frecuente: \"majo\", \"guapo\", \"amigo\", \"querido\". Usa siempre la forma masculina en los adjetivos que se refieran a él (ej. \"¡qué listo eres!\", \"estás muy atento\", \"qué amable eres\").";
    return "\nDirígete al usuario con lenguaje neutro e inclusivo, sin usar términos marcados por género. Evita adjetivos con forma masculina o femenina cuando sea posible.";
  }
  // es-419
  if (gender === "Woman") return "\nDirígete a la usuaria con términos cariñosos femeninos de forma natural y frecuente: \"linda\", \"querida\", \"amiga\", \"hermosa\". Usa siempre la forma femenina en los adjetivos que se refieran a ella (ej. \"¡qué lista eres!\", \"qué amable eres\").";
  if (gender === "Man")   return "\nDirígete al usuario con términos cariñosos masculinos de forma natural y frecuente: \"lindo\", \"querido\", \"amigo\". Usa siempre la forma masculina en los adjetivos que se refieran a él (ej. \"¡qué listo eres!\", \"qué amable eres\").";
  return "\nDirígete al usuario con lenguaje neutro e inclusivo, sin usar términos marcados por género. Evita adjetivos con forma masculina o femenina cuando sea posible.";
}

function brendaSystemPrompt(localeVariant = "en-US", gender = null) {
  const baseInstructions = `You are Brenda, a warm, curious, and knowledgeable AI companion. You love to talk about any subject — history, science, art, travel, cooking, literature, health, technology, current events, personal stories, and much more. You engage people like a caring and witty friend who is genuinely interested in ideas and in the person you are talking with.

GENERAL CONVERSATION:
- Discuss any topic openly and with enthusiasm. You have broad knowledge and real opinions.
- NEVER say you lack information about general topics or redirect users to weather only.
- Ask follow-up questions and share interesting perspectives to keep the conversation alive.
- Be warm, concise, and natural — never stiff or robotic.

WEATHER (when the user asks about weather, temperature, forecast, rain, wind, etc.):
0. When calling any tool (weather lookup, location update), go directly to the function call — NEVER output filler text before it ("¡Seguro! Lo busco", "Dame un momento", "One moment", "Just a second", "Let me check", "Looking it up", or similar). The function result will be returned and you will compose your full reply then.
1. If no location is provided and there is no saved location, ask for the city (and country/state if needed).
2. If multiple locations match, ask which one they mean, offering short options (city, state, country).
3. Use the get_weather function to fetch current conditions and forecast.
4. Present weather data conversationally. Convert precipitation probability to percentages (e.g., 0.35 → 35% chance of rain).
5. Temperature: use Celsius and round to the nearest whole number.
6. When the user asks about weather for a city DIFFERENT from their saved location, fetch for that city but do NOT save it as their default.
7. After weather info, add a short friendly follow-up to keep the conversation going.
8. Do NOT volunteer weather information unprompted more than once per conversation. If weather has already come up, only return to it when the user asks.

If a tool response includes code "missing_location", ask the user for the city (and country/state if needed).
If a tool response includes code "multiple_locations" with a candidates list, ask the user to pick one by name.
If a tool response includes code "city_not_found", ask the user to try a different city name or include the country.

TIME (when the user asks what time it is):
- Use get_weather to get the timezone for the user's saved location (or the city they specify).
- Present time in natural spoken language — NEVER as raw digits like "10:30".
- Spanish: "Son las tres y cuarto de la tarde", "Es la una y media de la mañana", "Son las diez y siete minutos de la noche".
- English: "It's quarter past three in the afternoon", "It's half past ten in the morning".
- NEVER present UTC time. Always use the local timezone.

HOME LOCATION (when the user explicitly asks to change or set their default location):
- Call set_home_location with the new city (and country/state if known).
- Do NOT call set_home_location just because a user asks about weather in a different city.
- Confirm the update in the conversation language.
- Spanish: "He actualizado tu ubicación a Málaga, España."
- English: "Your location has been updated to Málaga, Spain."

PERSONAL REMINDER SCHEDULE (medication reminders the user entered themselves — this is like a phone alarm list, not a medical record):
- NEVER say you cannot access this information. NEVER use the phrase "medical records". This is the user's own personal reminder list, equivalent to entries they made in their own calendar.
- You have full permission to read and share this data — it belongs to the user.
- The system retrieves the reminder list automatically. When responding, use informative non-imperative language: "your reminder plan shows", "I can see in your schedule", "according to your plan". NEVER say "take", "you must", "you need to".
- If no reminders are on record, say warmly that you don't see any saved reminders and suggest the Medications section of the app.
- Always end with: "Please review your doctor's prescription or your pharmacist's suggestions."`;

  if (localeVariant === "es-ES") {
    return baseInstructions + "\n\nResponde en español de España (castellano peninsular)." + genderAddressLine(localeVariant, gender);
  }
  if (localeVariant === "es-419") {
    return baseInstructions + "\n\nResponde en español latinoamericano neutro." + genderAddressLine(localeVariant, gender);
  }
  if (localeVariant === "en-GB") {
    return baseInstructions + "\n\nReply in British English.";
  }
  return baseInstructions + "\n\nReply in American English.";
}

// ── Medication query detection & formatting ────────────────────────────────

function isMedicationQuery(text, locale) {
  const lower = String(text || "").toLowerCase();
  // Always check BOTH languages — users often mix or switch
  const esWords = [
    "medicamento", "medicina", "pastilla", "medicaci", "remedio",
    "píldora", "pildora", "comprimido", "dosis", "mis medic",
  ];
  const enWords = [
    "medication", "medicine", "pill", "pills", "meds", "tablet",
    "tablets", "prescription", "my meds", "my med",
  ];
  if ([...esWords, ...enWords].some((w) => lower.includes(w))) return true;
  // Natural-language schedule queries (no explicit med noun needed) — check both
  const esPhrases = [
    "tengo que tomar", "debo tomar", "que tomar", "cuando tomo", "cuándo tomo",
    "cuándo tengo que", "cuando tengo que",
    "qué tengo hoy", "que tengo hoy", "qué hay programado", "que hay programado",
    "cuándo toca", "cuando toca", "qué toca", "que toca",
    "próxima dosis", "proxima dosis", "tengo hoy",
    "qué me corresponde", "que me corresponde", "algo que tomar",
    "recordatorio", "mis recordatorios",
  ];
  const enPhrases = [
    "need to take", "have to take", "supposed to take", "should i take",
    "when do i take", "what do i take",
    "coming up", "what do i have", "what's due", "what is due",
    "scheduled today", "planned for today", "anything to take",
    "anything scheduled", "my schedule", "what's on my list",
    "due today", "any reminders", "today's dose", "today's meds",
    "do i have anything", "what have i got", "my reminder",
  ];
  return [...esPhrases, ...enPhrases].some((p) => lower.includes(p));
}

function formatMedTime(hhmm, locale) {
  const [hStr, mStr] = String(hhmm || "").split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (isNaN(h)) return hhmm;
  if (locale.startsWith("es")) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const period = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function buildMedReplyParts(meds, locale) {
  const isEs = locale.startsWith("es");

  // Expand meds to sorted {name, time} entries
  const entries = [];
  for (const med of meds) {
    const times = med.recurrence?.times || [];
    if (times.length) {
      for (const t of times) entries.push({ name: med.name, time: t, directions: med.directions || null });
    } else {
      entries.push({ name: med.name, time: null, directions: med.directions || null });
    }
  }
  entries.sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  let listText = null;
  if (entries.length) {
    const parts = entries.map((e) => {
      const dir = e.directions ? ` (${e.directions})` : "";
      if (!e.time) return e.name + dir;
      const tf = formatMedTime(e.time, locale);
      return (isEs ? `${e.name} a las ${tf}` : `${e.name} at ${tf}`) + dir;
    });
    if (parts.length === 1) {
      listText = parts[0];
    } else {
      const last = parts.pop();
      listText = parts.join(", ") + (isEs ? " y " : " and ") + last;
    }
  }

  if (isEs) {
    return [
      "¡Claro, con mucho gusto!",
      "Ten en cuenta que puedo cometer errores, así que lo ideal es que siempre consultes la receta médica oficial o a tu farmacéutico de confianza.",
      listText
        ? `En tu plan veo lo siguiente: ${listText}.`
        : "No parece que tenga medicamentos guardados para ti. Por favor, usa el botón «Medicamentos» en el menú superior.",
      "Por favor, revisa la receta de tu médico o las indicaciones de tu farmacéutico.",
    ];
  }
  return [
    "Sure, happy to help!",
    "Just keep in mind I can make mistakes — it's always best to check with your doctor's prescription or your pharmacist.",
    listText
      ? `Your plan shows: ${listText}.`
      : "I don't seem to have any medications on record for you. Please check the Medications button in the top menu.",
    "Please review your doctor's prescription or your pharmacist's suggestions.",
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

// "tiempo" is ambiguous in Spanish — it means both "weather" and "time/duration"
// ("¿cuánto tiempo tardo en llegar?" = travel duration, not weather). These
// patterns catch the "time" sense so isWeatherQuery() doesn't misfire on it.
const TIEMPO_AS_TIME_PATTERNS = [
  // "cuánto/cuantos tiempo" — the classic "how long" phrasing
  /\bcu[aá]nto(?:s)?\s+tiempo\b/,
  // duration/travel verbs near "tiempo", either order
  /\btiempo\b.{0,25}\b(tard[oa]s?|tardan|tardamos|toma(?:s|n|mos)?|llev[oa]s?|llevan|llevamos|dura(?:s|n)?|falta(?:s|n)?|qued[ao]n?)\b/,
  /\b(tard[oa]s?|tardan|tardamos|toma(?:s|n|mos)?|llev[oa]s?|llevan|llevamos|dura(?:s|n)?|falta(?:s|n)?|qued[ao]n?)\b.{0,25}\btiempo\b/,
  // fixed idioms where "tiempo" clearly isn't weather
  /\btiempo\s+libre\b/,
  /\bal\s+mismo\s+tiempo\b/,
  /\bhace\s+tiempo\b/,
  /\btiempo\s+real\b/,
  /\b(?:gan|perd|pierd)\w*\s+(?:el\s+|su\s+|mi\s+|tu\s+|tanto\s+|mucho\s+)?tiempo\b/,
  /\btiempo\s+de\s+espera\b/,
  /\btiempo\s+r[eé]cord\b/,
];

// Other Spanish weather keywords that are never ambiguous — if any of these is
// present, "tiempo" elsewhere in the message can't override a real weather signal.
const UNAMBIGUOUS_ES_WEATHER_KEYWORDS = [
  "clima", "pronóstico", "pronostico", "llover", "lluvia",
  "temperatura", "humedad", "viento", "nieve", "tormenta", "soleado", "nublado"
];

// True unless "tiempo" is the only weather-ish word in the message AND it's
// clearly being used in its "time/duration" sense (see TIEMPO_AS_TIME_PATTERNS).
function tiempoLooksLikeWeather(raw) {
  if (!raw.includes("tiempo")) return true;
  if (UNAMBIGUOUS_ES_WEATHER_KEYWORDS.some((k) => raw.includes(k))) return true;
  return !TIEMPO_AS_TIME_PATTERNS.some((re) => re.test(raw));
}

function isWeatherQuery(text, localeVariant = "en-US") {
  const raw = String(text || "").toLowerCase();
  if (!raw) return false;
  const esKeywords = ["tiempo", ...UNAMBIGUOUS_ES_WEATHER_KEYWORDS];
  const enKeywords = [
    "weather", "forecast", "rain", "raining", "rainy", "temperature",
    "humidity", "wind", "snow", "storm", "sunny", "cloudy"
  ];
  const isSpanish = String(localeVariant || "").toLowerCase().startsWith("es");
  const list = isSpanish ? esKeywords : enKeywords;
  return list.some((k) => {
    if (!raw.includes(k)) return false;
    if (isSpanish && k === "tiempo" && !tiempoLooksLikeWeather(raw)) {
      return false; // "tiempo" here means duration/time, not weather
    }
    return true;
  });
}

// Country name (lowercase) → ISO 3166-1 alpha-2 code
const COUNTRY_CODE_MAP = {
  "españa": "ES", "spain": "ES",
  "france": "FR", "francia": "FR",
  "germany": "DE", "alemania": "DE",
  "italy": "IT", "italia": "IT",
  "portugal": "PT",
  "united kingdom": "GB", "uk": "GB", "reino unido": "GB", "england": "GB", "gran bretaña": "GB",
  "united states": "US", "usa": "US", "estados unidos": "US",
  "argentina": "AR",
  "mexico": "MX", "méxico": "MX",
  "colombia": "CO",
  "chile": "CL",
  "peru": "PE", "perú": "PE",
  "venezuela": "VE",
  "brazil": "BR", "brasil": "BR",
  "canada": "CA", "canadá": "CA",
  "australia": "AU",
  "netherlands": "NL", "holanda": "NL",
  "belgium": "BE", "bélgica": "BE",
  "switzerland": "CH", "suiza": "CH",
  "austria": "AT",
  "russia": "RU", "rusia": "RU",
  "china": "CN",
  "japan": "JP", "japón": "JP",
};

function countryNameToCode(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (COUNTRY_CODE_MAP[n]) return COUNTRY_CODE_MAP[n];
  // Accept bare ISO codes like "ES", "FR", "US"
  if (/^[A-Za-z]{2}$/.test(n)) return n.toUpperCase();
  return null;
}

// Split a raw city string that may contain country info.
// "Madrid, España"  → { city: "Madrid", state: null, country: "ES" }
// "Madrid España"   → { city: "Madrid", state: null, country: "ES" }
// "Madrid, ES"      → { city: "Madrid", state: null, country: "ES" }
// "Buenos Aires"    → { city: "Buenos Aires", state: null, country: null }
function splitCityCountry(raw) {
  const text = raw.trim();

  // Comma-separated: "city, country" or "city, state, country"
  if (text.includes(",")) {
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    const city = parts[0];
    let state = null;
    let country = null;
    for (let i = 1; i < parts.length; i++) {
      const code = countryNameToCode(parts[i]);
      if (code) country = code;
      else state = state || parts[i];
    }
    return { city, state, country };
  }

  // Space-separated: try last word(s) as a known country
  const words = text.split(/\s+/);
  if (words.length >= 2) {
    const last = words[words.length - 1];
    const code = countryNameToCode(last);
    if (code) return { city: words.slice(0, -1).join(" "), state: null, country: code };
    if (words.length >= 3) {
      const lastTwo = words.slice(-2).join(" ");
      const code2 = countryNameToCode(lastTwo);
      if (code2) return { city: words.slice(0, -2).join(" "), state: null, country: code2 };
    }
  }

  return { city: text, state: null, country: null };
}

// Words that are never city names when they appear as the first token of a
// disambiguation response (common Spanish/English function words & interjections).
const NON_CITY_WORDS = new Set([
  "no", "si", "sí", "vale", "ok", "okay", "oye", "oiga", "bueno",
  "yo", "me", "te", "se", "le", "lo", "la", "los", "las",
  "un", "una", "el", "the", "a", "i",
]);

// Extract city/country from a weather query message.
// Returns { city, state, country } or null (null = use saved location).
//
// FOLLOW-UP path runs FIRST so that disambiguation responses like
// "Madrid en España" / "Madrid, España" are handled before weather-keyword
// patterns (which would otherwise grab "España" as the city via "en …").
function parseWeatherCityFromMessage(text, lang, isFollowUp = false) {
  if (!text) return null;
  const trimmed = text.trim().replace(/[.,;!?]+$/, "").trim();

  // "aquí", "acá", "here" always means the saved location — never geocode these.
  if (/\b(aqu[ií]|ac[aá]|here)\b/i.test(trimmed)) return null;

  // ── FOLLOW-UP: user is answering "which city?" or "which Madrid?" ───────
  // These patterns handle disambiguation responses before any keyword search.
  if (isFollowUp) {
    // Long messages are new questions, not disambiguation responses.
    // Skip short-response heuristics and fall through to the initial-query patterns.
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount <= 8) {
      // "city, country" / "city, state, country" — comma-separated
      // Guard: skip if the first token is a common non-city word (e.g. "sí", "no", "vale").
      if (trimmed.includes(",")) {
        const parts    = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
        const firstWord = parts[0].split(/\s+/)[0].toLowerCase();
        if (parts.length <= 3 && !NON_CITY_WORDS.has(firstWord)) {
          return splitCityCountry(trimmed);
        }
      }

      // "city en país" / "city in country"
      // Guard: only return when the country is recognised AND the city part is short.
      const cityInCountry = lang === "es"
        ? trimmed.match(/^(.+?)\s+(?:en|de)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s]*)$/i)
        : trimmed.match(/^(.+?)\s+(?:in|from)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s]*)$/i);
      if (cityInCountry) {
        const city    = cityInCountry[1].trim();
        const country = countryNameToCode(cityInCountry[2].trim());
        if (city && country && city.split(/\s+/).length <= 4) {
          return { city, state: null, country };
        }
      }

      // Short bare response — ≤4 words, only letters/spaces/commas → treat as city name
      // (handles "Madrid", "Buenos Aires", "Madrid España" w/ implicit country)
      const words    = trimmed.split(/\s+/);
      const firstWord = words[0].toLowerCase();
      if (words.length <= 4
          && /^[A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]+$/.test(trimmed)
          && !NON_CITY_WORDS.has(firstWord)) {
        return splitCityCountry(trimmed);
      }
    }
    // wordCount > 8, or no short-response pattern matched → fall through to
    // the initial-query patterns below (handles "va a llover en Madrid" etc.)
  }

  // ── INITIAL QUERY: extract city from a full weather sentence ────────────
  // No catch-all patterns — they mis-fire on "city en country" follow-ups.
  // Only match when a weather keyword anchors the extraction.
  const enPatterns = [
    /(?:weather|forecast|temperature|rain|snow|climate)(?:\s+\w+){0,3}?\s+(?:in|for|at)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)(?:\?|$|\.)/i,
    /(?:in|for|at)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,20}?)\s+(?:weather|forecast|temperature|rain|snow)/i,
    /what(?:'s| is)\s+(?:the\s+)?(?:weather|forecast|temperature)(?:\s+like)?\s+in\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)(?:\?|$|\.)/i,
    /(?:going to rain|will it rain|will it snow)(?:\s+\w+){0,4}?\s+in\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)(?:\?|$)/i,
    // "I want to know the weather in Paris" / "tell me the weather for London"
    /\b(?:weather|forecast)\s+(?:in|for)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)\s*$/i,
  ];

  // Patterns anchored on "tiempo" specifically — skipped below when "tiempo"
  // is being used in its time/duration sense, so a message like "¿cuánto
  // tiempo tardo en llegar?" doesn't get a bogus "city" extracted from it.
  const esPatternsTiempoAnchored = [
    /(?:tiempo|clima|temperatura|lluvia|nieve|pronóstico|pronostico)(?:\s+\w+){0,3}?\s+(?:en|de)\s+([A-Za-zÀ-ÿñÑ][A-Za-zÀ-ÿñÑ\s,]{1,30}?)(?:\?|$|\.)/i,
    /(?:en|de)\s+([A-Za-zÀ-ÿñÑ][A-Za-zÀ-ÿñÑ\s,]{1,20}?)\s+(?:tiempo|clima|temperatura)/i,
    // "quiero saber el pronóstico del tiempo en Madrid"
    /\b(?:tiempo|clima|pronóstico|pronostico|lluvia|temperatura)\b.{0,40}?\ben\s+([A-Za-zÀ-ÿñÑ][A-Za-zÀ-ÿñÑ\s,]{1,30}?)\s*$/i,
  ];
  const esPatternsOther = [
    /(?:va a llover|lloverá|nieva|nevará)(?:\s+\w+){0,4}?\s+en\s+([A-Za-zÀ-ÿñÑ][A-Za-zÀ-ÿñÑ\s,]{1,30}?)(?:\?|$)/i,
    // "quiero consultarla en Madrid" / "quiero el tiempo en Madrid" — no weather keyword required
    // Safe: only fires on initial queries (isFollowUp=false), and the extracted text
    // is passed through splitCityCountry which will detect a trailing country name.
    /\b(?:consultarl[ao]|saber|conocer|darme|decirme|ver)\b.{0,30}?\ben\s+([A-Za-zÀ-ÿñÑ][A-Za-zÀ-ÿñÑ\s,]{1,30}?)\s*$/i,
  ];
  const esPatterns = tiempoLooksLikeWeather(trimmed.toLowerCase())
    ? [...esPatternsTiempoAnchored, ...esPatternsOther]
    : esPatternsOther;

  const patterns = lang === "es" ? esPatterns : enPatterns;
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const raw = match[1].trim().replace(/[.,;!?]+$/, "").trim();
      return splitCityCountry(raw);
    }
  }

  return null;
}

// Format a disambiguation candidate for display in a voice/text response.
// When multiple candidates share the same city name in the same country,
// label the first as "(capital)" and same-name states as "(comunidad/region)".
function formatCandidateLabel(candidate, index, allCandidates, lang) {
  const { city, state, country } = candidate;
  const sameNameCount = allCandidates.filter(
    (c) => c.city.toLowerCase() === city.toLowerCase() && c.country === country
  ).length;

  if (sameNameCount > 1) {
    const stateLower = (state || "").toLowerCase();
    const cityLower  = city.toLowerCase();
    if (stateLower === cityLower || stateLower.startsWith(cityLower + " ")) {
      // The state/community has the same name as the city → it is the region
      const suffix = lang === "es" ? "comunidad" : "region";
      return country ? `${city} (${suffix}), ${country}` : `${city} (${suffix})`;
    }
    if (index === 0) {
      // First result from OWM is the most prominent — label as the capital/main city
      const suffix = lang === "es" ? "capital" : "city";
      return country ? `${city} (${suffix}), ${country}` : `${city} (${suffix})`;
    }
  }

  return [city, state, country].filter(Boolean).join(", ");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const session = requireSession(req, res);
    if (!session) return;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
    if (!GEMINI_API_KEY) return json(res, 500, { error: "GEMINI_API_KEY not set" });

    const body = await readJson(req);
    /*
    const localeVariant = body.localeVariant || "en-US";
    const userText = typeof body.message === "string" ? body.message.trim() : "";
    */
    const localeVariant = body.localeVariant || "en-US";
    const userText = typeof body.message === "string" ? body.message.trim() : "";

    // Derive language once — used throughout this handler
    const lang = localeVariant.startsWith("es") ? "es" : "en";

    // Support either: {message:"..."} or {messages:[{role,content}]}
    let inputMessages = [];
    if (Array.isArray(body.messages) && body.messages.length) {
      inputMessages = body.messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role, content: String(m.content || "") }));
    } else if (userText) {
      inputMessages = [{ role: "user", content: userText }];
    } else {
      return json(res, 400, { error: "Provide message or messages[]" });
    }

    // Load conversation history from Mongo
    const db = await getDb();

    // Usage tracking — one chatRequestId per HTTP request, callIndex per Gemini call
    const chatRequestId = randomUUID();
    const chatSessionId = typeof body.chatSessionId === "string" ? body.chatSessionId : null;
    let _callIdx = 0;
    // Resolved lazily/in parallel with the rest of the handler — never awaited
    // on the request's critical path, only by the fire-and-forget usage write.
    const _planInfoPromise = db
      ? resolvePlanForUsage(db, session.userId, session.isAnonymous)
      : Promise.resolve(null);
    const _chatRecord = (d) => {
      if (!d?.usageMetadata || !db) return;
      const callIndex = _callIdx++;
      _planInfoPromise.then((planInfo) => recordChatUsage({
        db, userId: session.userId, chatRequestId, chatSessionId,
        callIndex, model: GEMINI_CHAT_MODEL,
        usage: d.usageMetadata,
        planId: planInfo?.planId ?? null,
        planDisplayName: planInfo?.planDisplayName ?? null,
      })).catch(e => console.error("[chat/usage]", e.message));
    };

    const conv = await db.collection("conversations").findOne(
      { userId: session.userId },
      { projection: { messages: { $slice: -50 } } }
    );

    const history = Array.isArray(conv?.messages) ? conv.messages : [];
    const historyMsgs = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.content || "") }));

    // Load user preferences (gender + location) once — used for system prompt and weather
    const userPrefsDoc = await db.collection("users").findOne(
      { userId: session.userId },
      { projection: { "preferences.gender": 1, "preferences.location": 1 } }
    );
    const userGender = userPrefsDoc?.preferences?.gender || null;

    // Load RDS profile (non-fatal — companion memory layer)
    let rdsProfile = null;
    const rdsUsername = session.displayName || session.username || "";
    if (!session.isAnonymous) {
      try { rdsProfile = await getRdsProfile(db, session.userId); } catch { /* non-fatal */ }
    }

    const system = brendaSystemPrompt(localeVariant, userGender) +
      (rdsProfile ? "\n\n" + buildRdsSystemAddendum(rdsProfile, localeVariant, rdsUsername) : "");
    const lastUserText = [...inputMessages].reverse().find((m) => m.role === "user")?.content || "";

    // RDS: memory query — bypass Gemini, build narrative directly from stored profile
    if (!session.isAnonymous && rdsProfile && detectRdsIntent(lastUserText).isMemoryQuery) {
      const narrative = buildMemoryNarrative(rdsProfile, localeVariant, rdsUsername);
      await db.collection("conversations").updateOne(
        { userId: session.userId },
        {
          $setOnInsert: { userId: session.userId, createdAt: new Date() },
          $push: {
            messages: {
              $each: [
                ...inputMessages.map(m => ({
                  id: new ObjectId(), role: m.role, content: m.content,
                  timestamp: new Date(), fromChannel: "text",
                })),
                { id: new ObjectId(), role: "assistant", content: narrative, timestamp: new Date(), fromChannel: "text" },
              ],
            },
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );
      return json(res, 200, { reply: narrative });
    }

    const weatherIntent = isWeatherQuery(lastUserText, localeVariant) || !!body.weatherPending;
    const timeIntent = detectTimeIntent(lastUserText, localeVariant);
    const medicationIntent = !session.isAnonymous && isMedicationQuery(lastUserText, localeVariant);
    let savedLocation = userPrefsDoc?.preferences?.location || null;
    let hasSavedLocation = !!savedLocation?.city;
    let savedLocationLoaded = true;
    const loadSavedLocation = async () => {
      if (savedLocationLoaded) return;
      const userDoc = await db.collection("users").findOne(
        { userId: session.userId },
        { projection: { "preferences.location": 1 } }
      );
      savedLocation = userDoc?.preferences?.location || null;
      hasSavedLocation = !!savedLocation?.city;
      savedLocationLoaded = true;
    };

    // ────────────────────────────────────────────────────────────────────────
    // TIME QUERY BRANCH — bypass OpenAI for simple clock lookups
    // ────────────────────────────────────────────────────────────────────────
    if (timeIntent) {
      await loadSavedLocation();
      const explicitLocation = parseLocationFromTimeRequest(lastUserText);
      const targetLocation = explicitLocation || (savedLocation?.city ? savedLocation.city : null);

      if (!targetLocation) {
        // No location known — ask the user
        await db.collection("conversations").updateOne(
          { userId: session.userId },
          {
            $setOnInsert: { userId: session.userId, createdAt: new Date() },
            $push: {
              messages: {
                $each: [
                  {
                    id: new ObjectId(),
                    role: "user",
                    content: userText,
                    timestamp: new Date(),
                    fromChannel: "text",
                  },
                  {
                    id: new ObjectId(),
                    role: "assistant",
                    content: LOCATION_PROMPTS[lang],
                    timestamp: new Date(),
                    fromChannel: "text",
                  },
                ],
              },
            },
            $set: { updatedAt: new Date() },
          },
          { upsert: true }
        );

        return json(res, 200, { reply: LOCATION_PROMPTS[lang] });
      }

      const baseUrl = req.headers.host?.startsWith("localhost")
        ? `http://${req.headers.host}`
        : `https://${req.headers.host}`;

      // When using the saved (default) location, pass its stored coordinates so
      // weather.js can skip the geocoding API call entirely.  Only geocode when
      // the user asked for an explicit city that differs from the saved one.
      const usingExplicitCity = !!explicitLocation;
      const timeWeatherBody = {
        action: "get_forecast",
        city: usingExplicitCity ? explicitLocation : targetLocation,
        saveLocation: !hasSavedLocation,
      };
      if (!usingExplicitCity && savedLocation?.lat && savedLocation?.lon) {
        timeWeatherBody.lat = savedLocation.lat;
        timeWeatherBody.lon = savedLocation.lon;
      }

      const weatherResponse = await fetch(`${baseUrl}/api/weather`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: req.headers.cookie || "",
        },
        body: JSON.stringify(timeWeatherBody),
      });

      const weatherPayload = await weatherResponse.json().catch(() => ({}));

      if (!weatherResponse.ok || !weatherPayload.ok) {
        const fallback =
          weatherPayload.code === "missing_location"
            ? LOCATION_PROMPTS[lang]
            : weatherPayload.code === "city_not_found"
              ? lang === "es"
                ? "No encontré esa ciudad. ¿Puedes darme otra?"
                : "I couldn't find that city. Could you try a different one?"
              // Fix B: generic fallback must respect the conversation language
              : lang === "es"
                ? "Lo siento, no pude determinar la hora ahora mismo."
                : "Sorry, I couldn't determine the time right now.";

        return json(res, 200, { reply: fallback });
      }

      // FIX: Use UTC timestamp as-is — Intl.DateTimeFormat handles timezone conversion.
      // Do NOT add timezone_offset here (that was causing double-offset: wrong time).
      const utcDate = new Date(weatherPayload.current.dt * 1000);
      const tz = weatherPayload.location.timezone;

      let reply;
      if (lang === "es") {
        // Extract local hours + minutes via formatToParts (no double-offset)
        const parts = new Intl.DateTimeFormat("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: tz,
        }).formatToParts(utcDate);
        const hours   = parseInt(parts.find((p) => p.type === "hour")?.value   || "0", 10);
        const minutes = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
        const naturalTime = formatSpanishTime(hours, minutes);
        reply = `${naturalTime} en ${weatherPayload.location.city}.`;
      } else {
        // English — standard formatted time is fine
        const timeString = new Intl.DateTimeFormat(localeVariant, {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: tz,
        }).format(utcDate);
        reply = `It's ${timeString} in ${weatherPayload.location.city}.`;
      }

      await db.collection("conversations").updateOne(
        { userId: session.userId },
        {
          $setOnInsert: { userId: session.userId, createdAt: new Date() },
          $push: {
            messages: {
              $each: [
                {
                  id: new ObjectId(),
                  role: "user",
                  content: userText,
                  timestamp: new Date(),
                  fromChannel: "text",
                },
                {
                  id: new ObjectId(),
                  role: "assistant",
                  content: reply,
                  timestamp: new Date(),
                  fromChannel: "text",
                },
              ],
            },
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );

      return json(res, 200, { reply });
    }

    // ────────────────────────────────────────────────────────────────────────
    // MEDICATION QUERY BRANCH — deterministic, no Gemini needed
    // ────────────────────────────────────────────────────────────────────────
    if (medicationIntent) {
      const activeMeds = await db.collection("medications")
        .find({ userId: session.userId, active: true })
        .sort({ name: 1 })
        .toArray();

      const parts = buildMedReplyParts(activeMeds, localeVariant);
      const combinedReply = parts.join(" ");

      await db.collection("conversations").updateOne(
        { userId: session.userId },
        {
          $setOnInsert: { userId: session.userId, createdAt: new Date() },
          $push: {
            messages: {
              $each: [
                ...inputMessages.map((m) => ({
                  id: new ObjectId(), role: m.role, content: m.content,
                  timestamp: new Date(), fromChannel: "text",
                })),
                { id: new ObjectId(), role: "assistant", content: combinedReply, timestamp: new Date(), fromChannel: "text" },
              ],
            },
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );

      return json(res, 200, { reply: combinedReply, replyParts: parts });
    }

    // ────────────────────────────────────────────────────────────────────────
    // DETERMINISTIC WEATHER BRANCH
    // Bypass OpenAI tool-calling for weather — fetch directly, format once.
    // This prevents the model from ever asking for a location it already has.
    // ────────────────────────────────────────────────────────────────────────
    if (weatherIntent) {
      const isFollowUp = !!body.weatherPending;
      const explicitLoc = parseWeatherCityFromMessage(lastUserText, lang, isFollowUp);

      // Resolve which location to query.
      // explicitLoc is { city, state, country } when the user named a city,
      // or null when we should fall back to their saved location.
      const hasExplicit = !!explicitLoc?.city;
      const skipSavedLocation = hasExplicit && !isFollowUp;
      if (!skipSavedLocation) {
        await loadSavedLocation();
      }
      let wCity    = hasExplicit ? explicitLoc.city    : (hasSavedLocation ? savedLocation.city    : null);
      let wState   = hasExplicit ? (explicitLoc.state   || null) : (hasSavedLocation ? savedLocation.state   : null);
      let wCountry = hasExplicit ? (explicitLoc.country || null) : (hasSavedLocation ? savedLocation.country : null);
      // Use saved coordinates when querying the saved city to skip geocoding
      let wLat = (!hasExplicit && hasSavedLocation) ? savedLocation.lat : null;
      let wLon = (!hasExplicit && hasSavedLocation) ? savedLocation.lon : null;

      if (!wCity && !wLat) {
        // No location anywhere — ask the user
        const askMsg = lang === "es"
          ? "¿En qué ciudad quieres consultar el tiempo?"
          : "Which city would you like the weather for?";
        return json(res, 200, { reply: askMsg, meta: { weather: { status: "needs_location" } } });
      }

      const baseUrlW = req.headers.host?.startsWith("localhost")
        ? `http://${req.headers.host}`
        : `https://${req.headers.host}`;

      const shouldSaveLocation = !hasSavedLocation && !!wCity && !skipSavedLocation;
      const wResponse = await fetch(`${baseUrlW}/api/weather`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: req.headers.cookie || "" },
        body: JSON.stringify({
          action: "get_forecast",
          city: wCity,
          state: wState || "",
          country: wCountry || "",
          lat: wLat,
          lon: wLon,
          saveLocation: shouldSaveLocation,
          skipSavedLocation: skipSavedLocation,
        }),
      });

      const wData = await wResponse.json().catch(() => ({}));

      if (!wResponse.ok || !wData.ok) {
        // Disambiguation: multiple cities with that name
        if (wData.code === "multiple_locations") {
          let candidates = wData.candidates || [];

          // If the user didn't supply a country but has a saved location,
          // auto-filter by the saved country (e.g. "Valencia" → Valencia, ES).
          // This avoids asking "which Valencia?" when the answer is obvious.
          if (!wCountry && hasSavedLocation && savedLocation.country) {
            const savedCountry = savedLocation.country.toUpperCase();
            const filtered = candidates.filter(
              (c) => String(c.country || "").toUpperCase() === savedCountry
            );
            // If filtering leaves exactly one match, use it directly.
            if (filtered.length === 1) {
              const auto = filtered[0];
              const autoResponse = await fetch(`${baseUrlW}/api/weather`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Cookie: req.headers.cookie || "" },
                body: JSON.stringify({
                  action: "get_forecast",
                  city: auto.city,
                  state: auto.state || "",
                  country: auto.country || "",
                  saveLocation: false,   // never overwrite saved location for a different-city query
                }),
              });
              const autoData = await autoResponse.json().catch(() => ({}));
              if (autoResponse.ok && autoData.ok) {
                // Fall through to the formatting step below by re-assigning wData
                // We do this by returning the same formatting logic inline.
                const autoParts = [autoData.location?.city, autoData.location?.state, autoData.location?.country].filter(Boolean);
                const autoFormatR = await geminiGenerate(GEMINI_API_KEY, GEMINI_CHAT_MODEL, {
                  systemPrompt: brendaSystemPrompt(localeVariant, userGender),
                  contents: [
                    ...toGeminiContents([...historyMsgs, ...inputMessages]),
                    {
                      role: "user",
                      parts: [{
                        text:
                          `WEATHER DATA FOR ${autoParts.join(", ")} (already fetched — do NOT ask for a location): ` +
                          JSON.stringify(autoData) +
                          `\n\nRespond with a natural, conversational weather report. ` +
                          `End with one brief friendly follow-up question.`,
                      }],
                    },
                  ],
                });
                const autoFormatText = await autoFormatR.text().catch(() => "{}");
                let autoFormatData;
                try { autoFormatData = JSON.parse(autoFormatText); } catch { autoFormatData = {}; }
                _chatRecord(autoFormatData);
                const { text: autoReplyText } = extractGemini(autoFormatData);
                const autoReply = autoReplyText || (lang === "es" ? "No pude obtener el tiempo." : "I couldn't get the weather.");
                const autoMsgs = [
                  ...inputMessages.map((m) => ({ id: new ObjectId(), role: m.role, content: m.content, timestamp: new Date(), fromChannel: "text" })),
                  { id: new ObjectId(), role: "assistant", content: autoReply, timestamp: new Date(), fromChannel: "text" },
                ];
                await db.collection("conversations").updateOne(
                  { userId: session.userId },
                  { $setOnInsert: { userId: session.userId, createdAt: new Date() }, $push: { messages: { $each: autoMsgs } }, $set: { updatedAt: new Date() } },
                  { upsert: true }
                );
                return json(res, 200, { reply: autoReply, meta: { weather: { status: "complete" } } });
              }
            }
            // Multiple matches even after country filter — show only those
            if (filtered.length > 1) candidates = filtered;
            // Zero matches after filter — fall back to full candidate list
          }

          const labels = candidates.map((c, i) => formatCandidateLabel(c, i, candidates, lang));
          const first = labels[0] || "";
          const rest  = labels.slice(1).join(", ");
          const disambigMsg = lang === "es"
            ? `Hay varios lugares con ese nombre. ¿Te refieres a ${first}${rest ? `, ${rest}` : ""}? ¿Cuál es el que te interesa?`
            : `There are several places with that name. Did you mean ${first}${rest ? `, ${rest}` : ""}? Which one would you like?`;
          return json(res, 200, {
            reply: disambigMsg,
            meta: { weather: { status: "needs_disambiguation", candidates } },
          });
        }
        if (wData.code === "city_not_found") {
          const notFoundMsg = lang === "es"
            ? "No encontré esa ciudad. ¿Puedes especificar mejor, por ejemplo con el país?"
            : "I couldn't find that city. Could you be more specific, for example by adding the country?";
          return json(res, 200, { reply: notFoundMsg, meta: { weather: { status: "needs_location" } } });
        }
        const errMsg = lang === "es"
          ? "Lo siento, no pude obtener el tiempo ahora mismo."
          : "Sorry, I couldn't get the weather right now.";
        return json(res, 200, { reply: errMsg, meta: { weather: { status: "error" } } });
      }

      // One Gemini call to format the weather data as natural language
      const locationParts = [wData.location?.city, wData.location?.state, wData.location?.country].filter(Boolean);
      const weatherFormatR = await geminiGenerate(GEMINI_API_KEY, GEMINI_CHAT_MODEL, {
        systemPrompt: brendaSystemPrompt(localeVariant, userGender),
        contents: [
          ...toGeminiContents([...historyMsgs, ...inputMessages]),
          {
            role: "user",
            parts: [{
              text:
                `WEATHER DATA FOR ${locationParts.join(", ")} (already fetched — do NOT ask for a location): ` +
                JSON.stringify(wData) +
                `\n\nRespond with a natural, conversational weather report. ` +
                `End with one brief friendly follow-up question.`,
            }],
          },
        ],
      });

      const wFormatText = await weatherFormatR.text().catch(() => "{}");
      let wFormatData;
      try { wFormatData = JSON.parse(wFormatText); } catch { wFormatData = {}; }
      _chatRecord(wFormatData);
      const { text: weatherReplyText } = extractGemini(wFormatData);
      const weatherReply = weatherReplyText || (lang === "es" ? "No pude obtener el tiempo." : "I couldn't get the weather.");

      // Persist
      const wMsgs = [
        ...inputMessages.map((m) => ({
          id: new ObjectId(), role: m.role, content: m.content,
          timestamp: new Date(), fromChannel: "text",
        })),
        { id: new ObjectId(), role: "assistant", content: weatherReply, timestamp: new Date(), fromChannel: "text" },
      ];
      await db.collection("conversations").updateOne(
        { userId: session.userId },
        {
          $setOnInsert: { userId: session.userId, createdAt: new Date() },
          $push: { messages: { $each: wMsgs } },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );

      return json(res, 200, { reply: weatherReply, meta: { weather: { status: "complete" } } });
    }

    // Call Gemini with function calling support
    console.log("📞 Calling Gemini with tools enabled");
    const r = await geminiGenerate(GEMINI_API_KEY, GEMINI_CHAT_MODEL, {
      systemPrompt: system,
      contents: toGeminiContents([...historyMsgs, ...inputMessages]),
      tools: GEMINI_TOOLS,
    });

    const raw = await r.text();

    if (!r.ok) {
      console.error("Gemini error:", raw);
      return json(res, 502, {
        error: "Gemini chat request failed",
        status: r.status,
        detail: raw.slice(0, 2000),
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json(res, 502, { error: "Bad JSON from Gemini", detail: raw.slice(0, 2000) });
    }

    _chatRecord(data);
    const { text: geminiReplyText, functionCall, contentObj } = extractGemini(data);
    if (!contentObj) {
      return json(res, 502, { error: "No content in Gemini response", detail: data });
    }

    console.log("✅ Gemini response received");
    if (functionCall) {
      console.log("🎯 FUNCTION CALL DETECTED:", functionCall.name);
    }

    // ────────────────────────────────────────────────────────────────────────
    // TOOL CALL HANDLING
    // ────────────────────────────────────────────────────────────────────────
    if (functionCall) {
      const functionName = functionCall.name;
      const functionArgs = functionCall.args || {};

      // Shared finalizer — sends tool result back to Gemini and returns reply to client
      const finalizeWithTool = async ({ toolContent, fallbackReply, meta }) => {
        let toolResponse;
        try { toolResponse = JSON.parse(toolContent); } catch { toolResponse = { result: toolContent }; }

        const secondR = await geminiGenerate(GEMINI_API_KEY, GEMINI_CHAT_MODEL, {
          systemPrompt: system,
          contents: [
            ...toGeminiContents([...historyMsgs, ...inputMessages]),
            contentObj,  // model turn that made the function call
            {
              role: "user",
              parts: [{ functionResponse: { name: functionName, response: toolResponse } }],
            },
          ],
        });

        const secondText = await secondR.text();
        let secondData;
        try {
          secondData = JSON.parse(secondText);
        } catch {
          secondData = {};
        }
        _chatRecord(secondData);
        const { text: secondReplyText } = extractGemini(secondData);
        const reply = secondReplyText || fallbackReply;

        // Persist messages
        const newMessages = [
          ...inputMessages.map((m) => ({
            id: new ObjectId(),
            role: m.role,
            content: m.content,
            timestamp: new Date(),
            fromChannel: "text",
          })),
          {
            id: new ObjectId(),
            role: "assistant",
            content: reply,
            timestamp: new Date(),
            fromChannel: "text",
          },
        ];

        await db.collection("conversations").updateOne(
          { userId: session.userId },
          {
            $setOnInsert: { userId: session.userId, createdAt: new Date() },
            $push: { messages: { $each: newMessages } },
            $set: { updatedAt: new Date() },
          },
          { upsert: true }
        );

        return json(res, 200, meta ? { reply, meta } : { reply });
      };

      // ── get_weather ──────────────────────────────────────────────────────
      if (functionName === "get_weather") {
        console.log("🌤️ Weather requested for:", functionArgs.city);

        // Call our weather API
        const baseUrl = req.headers.host?.startsWith("localhost")
          ? `http://${req.headers.host}`
          : `https://${req.headers.host}`;

        // Get saved location directly from DB (we already have db connection)
        let resolvedSavedLocation = savedLocation;
        if (!resolvedSavedLocation) {
          const uDoc = await db.collection("users").findOne(
            { userId: session.userId },
            { projection: { "preferences.location": 1 } }
          );
          resolvedSavedLocation = uDoc?.preferences?.location || null;
        }
        const hasSaved = !!resolvedSavedLocation?.city;

        // Resolve saved location if city/coords not provided
        let resolvedCity    = functionArgs.city;
        let resolvedState   = functionArgs.state;
        let resolvedCountry = functionArgs.country;
        let resolvedLat     = functionArgs.lat;
        let resolvedLon     = functionArgs.lon;

        if (!resolvedCity && !resolvedLat && !resolvedLon) {
          if (hasSaved) {
            resolvedCity    = resolvedSavedLocation.city;
            resolvedState   = resolvedSavedLocation.state;
            resolvedCountry = resolvedSavedLocation.country;
            resolvedLat     = resolvedSavedLocation.lat;
            resolvedLon     = resolvedSavedLocation.lon;
            console.log("[chat] Using saved location:", resolvedSavedLocation.city);
          }
        }

        // If OpenAI supplied a city name but no coordinates, and it matches the saved
        // location city, inject the saved lat/lon to skip the geocoding API call entirely.
        if (resolvedCity && !resolvedLat && !resolvedLon && hasSaved) {
          const savedCityNorm = (resolvedSavedLocation.city || "").toLowerCase().trim();
          const queryCityNorm = resolvedCity.toLowerCase().trim();
          if (savedCityNorm === queryCityNorm) {
            resolvedLat     = resolvedSavedLocation.lat;
            resolvedLon     = resolvedSavedLocation.lon;
            resolvedState   = resolvedSavedLocation.state   || resolvedState;
            resolvedCountry = resolvedSavedLocation.country || resolvedCountry;
            console.log("[chat] City matches saved location — using saved coordinates for:", resolvedCity);
          }
        }

        if (!resolvedCity && !resolvedLat && !resolvedLon) {
          return await finalizeWithTool({
            toolContent: JSON.stringify({
              error: "No location provided and no saved location",
              code: "missing_location",
            }),
            fallbackReply: "Please tell me which city you'd like the weather for.",
            meta: { weather: { status: "needs_location" } },
          });
        }

        // Only auto-save if user doesn't have a location set yet.
        // Prevents overwriting their home location when they check weather elsewhere.
        const shouldSave = !hasSaved && !!resolvedCity;

        const weatherResponse = await fetch(`${baseUrl}/api/weather`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.cookie || "",
          },
          body: JSON.stringify({
            action: "get_forecast",
            city: resolvedCity,
            state: resolvedState,
            country: resolvedCountry,
            lat: resolvedLat,
            lon: resolvedLon,
            saveLocation: shouldSave,
          }),
        });

        const weatherText = await weatherResponse.text();
        let weatherData;
        try {
          weatherData = JSON.parse(weatherText);
        } catch {
          weatherData = null;
        }

        const weatherOk = weatherResponse.ok && weatherData && weatherData.ok;
        console.log(
          "🌤️ Weather API response:",
          weatherOk ? "Success" : `Failed: ${weatherData?.error || "Non-JSON response"}`
        );

        if (!weatherOk) {
          const errorPayload = {
            error:
              weatherData?.error ||
              `Weather API returned ${weatherResponse.status} with non-JSON body: ${weatherText.slice(0, 200)}`,
            code: weatherData?.code,
            candidates: weatherData?.candidates,
          };
          const status =
            errorPayload.code === "missing_location" || errorPayload.code === "city_not_found"
              ? "needs_location"
              : errorPayload.code === "multiple_locations"
                ? "needs_disambiguation"
                : "error";

          return await finalizeWithTool({
            toolContent: JSON.stringify(errorPayload),
            fallbackReply: "Sorry, I couldn't get the weather information.",
            meta: { weather: { status, candidates: errorPayload.candidates } },
          });
        }

        return await finalizeWithTool({
          toolContent: JSON.stringify(weatherData),
          fallbackReply: "Here's the weather information.",
          meta: { weather: { status: "complete" } },
        });
      }

      // ── set_home_location ────────────────────────────────────────────────
      if (functionName === "set_home_location") {
        const { city, state, country } = functionArgs;
        console.log("📍 set_home_location called for:", city, state || "", country || "");

        if (!city) {
          return await finalizeWithTool({
            toolContent: JSON.stringify({ error: "No city provided", code: "missing_city" }),
            fallbackReply: lang === "es"
              ? "No entendí la ciudad. ¿Puedes repetirlo?"
              : "I didn't catch the city name. Could you repeat it?",
          });
        }

        const baseUrl = req.headers.host?.startsWith("localhost")
          ? `http://${req.headers.host}`
          : `https://${req.headers.host}`;

        // Delegate geocoding + saving to weather.js (get_forecast with saveLocation: true
        // always overwrites the saved location — this is the desired behaviour for an
        // explicit user request to change their home city).
        const weatherResponse = await fetch(`${baseUrl}/api/weather`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.cookie || "",
          },
          body: JSON.stringify({
            action: "get_forecast",
            city,
            state: state || "",
            country: country || "",
            saveLocation: true,          // ← force-save regardless of existing location
          }),
        });

        const weatherText = await weatherResponse.text();
        let weatherData;
        try {
          weatherData = JSON.parse(weatherText);
        } catch {
          weatherData = null;
        }

        if (!weatherResponse.ok || !weatherData?.ok) {
          const errorPayload = {
            error: weatherData?.error || "Could not find or save that location",
            code: weatherData?.code,
            candidates: weatherData?.candidates,
          };
          const status = errorPayload.code === "multiple_locations"
            ? "needs_disambiguation"
            : "error";

          console.log("❌ set_home_location failed:", errorPayload.code);
          return await finalizeWithTool({
            toolContent: JSON.stringify(errorPayload),
            fallbackReply: lang === "es"
              ? "No pude guardar esa ubicación. ¿Puedes ser más específico?"
              : "I couldn't save that location. Could you be more specific?",
            meta: { weather: { status, candidates: errorPayload.candidates } },
          });
        }

        console.log("✅ Home location updated to:", weatherData.location?.city, weatherData.location?.country);
        return await finalizeWithTool({
          toolContent: JSON.stringify({
            saved: true,
            location: weatherData.location,
            current: weatherData.current,
          }),
          fallbackReply: lang === "es"
            ? `Tu ubicación ha sido actualizada a ${weatherData.location?.city}.`
            : `Your location has been updated to ${weatherData.location?.city}.`,
          meta: { weather: { status: "complete" } },
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // NORMAL (non-tool) response
    // ────────────────────────────────────────────────────────────────────────
    let reply = geminiReplyText || "";

    if (!reply) return json(res, 502, { error: "No reply content", detail: data });

    // RDS: strip [FORGET: ...] tag from reply and schedule item removal
    let forgetDescription = null;
    if (rdsProfile) {
      const { cleanText, forgetDescription: fd } = parseForgetTag(reply);
      if (fd) {
        forgetDescription = fd;
        reply = cleanText;
        removeRdsItem(db, session.userId, fd).catch(e => console.error("[rds/forget]", e.message));
      }
    }

    // Persist user + assistant messages into Mongo
    const newMessages = [
      ...inputMessages.map((m) => ({
        id: new ObjectId(),
        role: m.role,
        content: m.content,
        timestamp: new Date(),
        fromChannel: "text",
      })),
      {
        id: new ObjectId(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
        fromChannel: "text",
      },
    ];

    await db.collection("conversations").updateOne(
      { userId: session.userId },
      {
        $setOnInsert: { userId: session.userId, createdAt: new Date() },
        $push: { messages: { $each: newMessages } },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );

    // RDS: async extraction of new personal facts from this turn (fire-and-forget)
    // Use lastUserText (from messages array) — body.message is empty when frontend sends messages[]
    if (rdsProfile && !session.isAnonymous && lastUserText && reply && !forgetDescription) {
      extractRdsItems(GEMINI_API_KEY, GEMINI_CHAT_MODEL, lastUserText, reply, rdsUsername)
        .then(async ({ extractions }) => {
          for (const ex of (extractions || [])) {
            if (ex?.domain && ex?.item) {
              await addRdsItem(db, session.userId, ex.domain, ex.item)
                .catch(e => console.error("[rds/addItem]", e.message));
            }
          }
        })
        .catch(e => console.error("[rds/extract]", e.message));
    }

    return json(res, 200, { reply });
  } catch (err) {
    console.error("Chat error:", err);
    return json(res, 500, { error: "Server error", detail: String(err?.message || err) });
  }
}
