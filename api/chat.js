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

function brendaSystemPrompt(localeVariant = "en-US") {
  const baseInstructions = `You are Brenda, a helpful AI assistant with access to real-time weather information.

When users ask about weather:
1. If no location is provided and there is no saved location, ask for the city (and country/state if needed).
2. If multiple locations match, ask which one they mean, offering short options (city, state, country).
3. If they provide a city name (and optional state/country), use the get_weather function to fetch current conditions and forecasts.
4. When presenting weather data, be conversational and helpful. Convert probability of precipitation to percentages (e.g., 0.35 = 35% chance).
5. For temperature, use Celsius (metric system) and round to the nearest whole number.
6. When you provide weather information, add a short, friendly follow-up question to keep the conversation active.
7. When the user asks about weather for a city that is DIFFERENT from their saved location, fetch weather for that specific city but DO NOT save it as their new default location. Their default stays unchanged.

If a tool response includes code "missing_location", ask the user for the city (and country/state if needed).
If a tool response includes code "multiple_locations" with a candidates list, ask the user to pick one by name.
If a tool response includes code "city_not_found", ask the user to try again with another city and optionally a country/state.

When users ask about the current time:
- Use get_weather to get the timezone for the user's saved location (or the city they specify).
- Present the time in natural conversational language — NEVER as raw digits like "HH:MM" or "10:30".
- Spanish: "Son las tres y cuarto de la tarde", "Es la una y media de la mañana", "Son las diez y siete minutos de la noche".
- English: "It's quarter past three in the afternoon", "It's half past ten in the morning".
- NEVER present UTC time. Always use the timezone of the user's location.
- If a user provides a city in the context of a previous time query (after you asked "where are you?"), call get_weather for that city to get the timezone, then state the local time.

When users explicitly ask to CHANGE their default/home location (e.g., "set my location to Málaga", "cambia mi ubicación a Madrid", "de ahora en adelante estoy en Sevilla", "I've moved to Barcelona", "fix my location to..."):
- Call set_home_location with the new city (and country/state if known).
- Do NOT call set_home_location just because a user asks about weather in a different city.
- After saving, confirm to the user in the conversation language.
- Spanish: "He actualizado tu ubicación a Málaga, España."
- English: "Your location has been updated to Málaga, Spain."

Always be warm, clear, and concise in your responses.`;

  if (localeVariant === "es-ES") {
    return baseInstructions + "\n\nResponde en español de España (castellano peninsular).";
  }
  if (localeVariant === "es-419") {
    return baseInstructions + "\n\nResponde en español latinoamericano neutro.";
  }
  if (localeVariant === "en-GB") {
    return baseInstructions + "\n\nReply in British English.";
  }
  return baseInstructions + "\n\nReply in American English.";
}

function isWeatherQuery(text, localeVariant = "en-US") {
  const raw = String(text || "").toLowerCase();
  if (!raw) return false;
  const esKeywords = [
    "tiempo", "clima", "pronóstico", "pronostico", "llover", "lluvia",
    "temperatura", "humedad", "viento", "nieve", "tormenta", "soleado", "nublado"
  ];
  const enKeywords = [
    "weather", "forecast", "rain", "raining", "rainy", "temperature",
    "humidity", "wind", "snow", "storm", "sunny", "cloudy"
  ];
  const isSpanish = String(localeVariant || "").toLowerCase().startsWith("es");
  const list = isSpanish ? esKeywords : enKeywords;
  return list.some((k) => raw.includes(k));
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

// Extract city/country from a weather query message.
// Returns { city, state, country } or null (null = use saved location).
//
// FOLLOW-UP path runs FIRST so that disambiguation responses like
// "Madrid en España" / "Madrid, España" are handled before weather-keyword
// patterns (which would otherwise grab "España" as the city via "en …").
function parseWeatherCityFromMessage(text, lang, isFollowUp = false) {
  if (!text) return null;
  const trimmed = text.trim().replace(/[.,;!?]+$/, "").trim();

  // ── FOLLOW-UP: user is answering "which city?" or "which Madrid?" ───────
  // These patterns handle disambiguation responses before any keyword search.
  if (isFollowUp) {
    // "city, country" / "city, state, country"  — comma-separated
    if (trimmed.includes(",")) return splitCityCountry(trimmed);

    // "city en país" / "city in country"  — preposition before country name
    const cityInCountry = lang === "es"
      ? trimmed.match(/^(.+?)\s+(?:en|de)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s]*)$/i)
      : trimmed.match(/^(.+?)\s+(?:in|from)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s]*)$/i);
    if (cityInCountry) {
      const city = cityInCountry[1].trim();
      const country = countryNameToCode(cityInCountry[2].trim());
      if (city) return { city, state: null, country };
    }

    // Short bare response — ≤4 words, only letters/spaces/commas → treat as city name
    // (handles "Madrid", "Buenos Aires", "Madrid España" w/ implicit country)
    const words = trimmed.split(/\s+/);
    if (words.length <= 4 && /^[A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]+$/.test(trimmed)) {
      return splitCityCountry(trimmed);
    }
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

  const esPatterns = [
    /(?:tiempo|clima|temperatura|lluvia|nieve|pronóstico|pronostico)(?:\s+\w+){0,3}?\s+(?:en|de)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)(?:\?|$|\.)/i,
    /(?:en|de)\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,20}?)\s+(?:tiempo|clima|temperatura)/i,
    /(?:va a llover|lloverá|nieva|nevará)(?:\s+\w+){0,4}?\s+en\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)(?:\?|$)/i,
    // "quiero saber el pronóstico del tiempo en Madrid"
    /\b(?:tiempo|clima|pronóstico|pronostico|lluvia|temperatura)\b.{0,40}?\ben\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)\s*$/i,
    // "quiero consultarla en Madrid" / "quiero el tiempo en Madrid" — no weather keyword required
    // Safe: only fires on initial queries (isFollowUp=false), and the extracted text
    // is passed through splitCityCountry which will detect a trailing country name.
    /\b(?:consultarl[ao]|saber|conocer|darme|decirme|ver)\b.{0,30}?\ben\s+([A-Za-zÀ-ÿ\u00f1\u00d1][A-Za-zÀ-ÿ\u00f1\u00d1\s,]{1,30}?)\s*$/i,
  ];

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

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
    if (!OPENAI_API_KEY) return json(res, 500, { error: "OPENAI_API_KEY not set" });

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
    const conv = await db.collection("conversations").findOne(
      { userId: session.userId },
      { projection: { messages: { $slice: -50 } } }
    );

    const history = Array.isArray(conv?.messages) ? conv.messages : [];
    const historyMsgs = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.content || "") }));

    const system = brendaSystemPrompt(localeVariant);
    const lastUserText = [...inputMessages].reverse().find((m) => m.role === "user")?.content || "";

    const weatherIntent = isWeatherQuery(lastUserText, localeVariant) || !!body.weatherPending;
    const timeIntent = detectTimeIntent(lastUserText, localeVariant);
    const userDoc = await db.collection("users").findOne(
      { userId: session.userId },
      { projection: { "preferences.location": 1 } }
    );
    const savedLocation = userDoc?.preferences?.location || null;
    const hasSavedLocation = !!savedLocation?.city;

    // ────────────────────────────────────────────────────────────────────────
    // TIME QUERY BRANCH — bypass OpenAI for simple clock lookups
    // ────────────────────────────────────────────────────────────────────────
    if (timeIntent) {
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
          saveLocation: !hasSavedLocation && !!wCity,
        }),
      });

      const wData = await wResponse.json().catch(() => ({}));

      if (!wResponse.ok || !wData.ok) {
        // Disambiguation: multiple cities with that name
        if (wData.code === "multiple_locations") {
          const candidates = wData.candidates || [];
          const labels = candidates.map((c, i) => formatCandidateLabel(c, i, candidates, lang));
          const first = labels[0] || "";
          const rest  = labels.slice(1).join(", ");
          const disambigMsg = lang === "es"
            ? `Hay varios lugares con ese nombre. ¿Te refieres a ${first}${rest ? `, ${rest}` : ""}? ¿Cuál es el que te interesa?`
            : `There are several places with that name. Did you mean ${first}${rest ? `, ${rest}` : ""}? Which one would you like?`;
          return json(res, 200, {
            reply: disambigMsg,
            meta: { weather: { status: "needs_disambiguation", candidates: wData.candidates } },
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

      // One OpenAI call to format the weather data as natural language
      const locationParts = [wData.location?.city, wData.location?.state, wData.location?.country].filter(Boolean);
      const weatherFormatR = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OPENAI_CHAT_MODEL,
          messages: [
            { role: "system", content: brendaSystemPrompt(localeVariant) },
            ...historyMsgs,
            ...inputMessages,
            {
              role: "system",
              content:
                `WEATHER DATA FOR ${locationParts.join(", ")} (already fetched — do NOT ask for a location): ` +
                JSON.stringify(wData) +
                `\n\nRespond with a natural, conversational weather report. ` +
                `End with one brief friendly follow-up question.`,
            },
          ],
          temperature: 0.7,
        }),
      });

      const wFormatText = await weatherFormatR.text().catch(() => "{}");
      let wFormatData;
      try { wFormatData = JSON.parse(wFormatText); } catch { wFormatData = {}; }
      const weatherReply = wFormatData.choices?.[0]?.message?.content ||
        (lang === "es" ? "No pude obtener el tiempo." : "I couldn't get the weather.");

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

    const systemMessages = [{ role: "system", content: system }];

    // ────────────────────────────────────────────────────────────────────────
    // TOOLS — weather lookup + explicit home-location change
    // ────────────────────────────────────────────────────────────────────────
    const tools = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description:
            "Get current weather and forecast. If the user doesn't specify a city, use their saved location preference. " +
            "Use this when the user asks about weather, temperature, rain, or atmospheric conditions. " +
            "Also use this to get the timezone when the user asks what time it is.",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "The city name, e.g. 'Madrid', 'London', 'New York'. Optional — if not provided, use the user's saved location.",
              },
              state: {
                type: "string",
                description: "Optional state/region for disambiguation, e.g. 'Texas' or 'CA'.",
              },
              country: {
                type: "string",
                description: "Optional 2-letter country code, e.g. 'ES', 'GB', 'US'",
              },
              lat: {
                type: "number",
                description: "Optional latitude for more precise weather lookup",
              },
              lon: {
                type: "number",
                description: "Optional longitude for more precise weather lookup",
              },
            },
            required: [],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "set_home_location",
          description:
            "Save or update the user's default home location for all future weather and time queries. " +
            "Call this ONLY when the user explicitly asks to change or set their default location " +
            "(e.g., 'set my location to Málaga', 'cambia mi ubicación a Sevilla', 'de ahora en adelante fija mi ciudad en Barcelona', 'I moved to London'). " +
            "Do NOT call this when the user just asks about weather or time in a different city.",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "The city to save as the user's new default, e.g. 'Málaga', 'London'",
              },
              state: {
                type: "string",
                description: "Optional state or region, e.g. 'Andalucía', 'Texas'",
              },
              country: {
                type: "string",
                description: "Optional 2-letter country code, e.g. 'ES', 'US', 'GB'",
              },
            },
            required: ["city"],
          },
        },
      },
    ];

    // Weather is handled above deterministically; only set_home_location reaches here.
    const toolChoice = "auto";

    // Call OpenAI with function calling support
    console.log("📞 Calling OpenAI with tools enabled");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        messages: [
          ...systemMessages,
          ...historyMsgs,
          ...inputMessages,
        ],
        tools: tools,
        tool_choice: toolChoice,
        temperature: 0.7,
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      console.error("OpenAI error:", raw);
      return json(res, 502, {
        error: "OpenAI chat request failed",
        status: r.status,
        detail: raw.slice(0, 2000),
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json(res, 502, { error: "Bad JSON from OpenAI", detail: raw.slice(0, 2000) });
    }

    const message = data.choices?.[0]?.message;
    if (!message) {
      return json(res, 502, { error: "No message in response", detail: data });
    }

    console.log("✅ OpenAI response received");
    if (message.tool_calls) {
      console.log("🎯 FUNCTION CALL DETECTED:", message.tool_calls[0]?.function?.name);
    }

    // ────────────────────────────────────────────────────────────────────────
    // TOOL CALL HANDLING
    // ────────────────────────────────────────────────────────────────────────
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const functionName = toolCall.function.name;
      let functionArgs = {};
      try {
        functionArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        return json(res, 400, { error: "Invalid tool arguments" });
      }

      // Shared finalizer — sends tool result back to OpenAI and streams reply to client
      const finalizeWithTool = async ({ toolContent, fallbackReply, meta }) => {
        const secondR = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: OPENAI_CHAT_MODEL,
            messages: [
              ...systemMessages,
              ...historyMsgs,
              ...inputMessages,
              message,
              {
                role: "tool",
                tool_call_id: toolCall.id,
                content: toolContent,
              },
            ],
            temperature: 0.7,
          }),
        });

        const secondText = await secondR.text();
        let secondData;
        try {
          secondData = JSON.parse(secondText);
        } catch {
          secondData = {};
        }
        const reply = secondData.choices?.[0]?.message?.content || fallbackReply;

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
    const reply = message.content || "";

    if (!reply) return json(res, 502, { error: "No reply content", detail: data });

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

    return json(res, 200, { reply });
  } catch (err) {
    console.error("Chat error:", err);
    return json(res, 500, { error: "Server error", detail: String(err?.message || err) });
  }
}
