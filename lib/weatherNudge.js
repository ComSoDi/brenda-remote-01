// lib/weatherNudge.js
// When Brenda may bring up the weather ON HER OWN (TALK + TEXT). Asked-for
// weather is unaffected. Policy (Mike, 2026-10-02):
//   - default: never volunteer weather;
//   - once per local day, 06:00–12:59 local: she MAY mention today's weather;
//   - once per local day, 16:00–20:59 local: she MAY mention tomorrow's forecast;
//   - "local" needs the user's saved location; without one → never volunteer.
// The time zone is fetched ONCE (OpenWeather) in the background and stored on
// users.preferences.location.timezone — it never delays a reply. Offers are
// recorded in users.preferences.weatherNudges {morning, evening: "YYYY-MM-DD"}
// when her reply actually mentions the weather.

const MORNING = [6 * 60, 13 * 60];      // [start, end) local minutes
const EVENING = [16 * 60, 21 * 60];

const LINES = {
  never: {
    en: "WEATHER: never bring up the weather or forecasts on your own — only when the user asks.",
    es: "TIEMPO METEOROLÓGICO: nunca saques el tema del tiempo ni de previsiones por tu cuenta — solo si el usuario lo pide.",
  },
  // TEXT: the prompt is rebuilt every message, so "once" is enforced by the
  // server (window marked used → next message gets the "never" line).
  morning: {
    en: (city) => `WEATHER: don't bring up the weather on your own, EXCEPT once today: if it fits naturally, casually mention today's weather in ${city} (check it first). Only once.`,
    es: (city) => `TIEMPO METEOROLÓGICO: no saques el tema del tiempo por tu cuenta, SALVO una vez hoy: si encaja con naturalidad, comenta de pasada el tiempo de hoy en ${city} (consúltalo antes). Solo una vez.`,
  },
  evening: {
    en: (city) => `WEATHER: don't bring up the weather on your own, EXCEPT once this evening: if it fits naturally, casually mention tomorrow's forecast for ${city} (check it first). Only once.`,
    es: (city) => `TIEMPO METEOROLÓGICO: no saques el tema del tiempo por tu cuenta, SALVO una vez esta tarde: si encaja con naturalidad, comenta de pasada la previsión de mañana para ${city} (consúltala antes). Solo una vez.`,
  },
  // TALK: the instruction is fixed for the whole call (Gemini 3.1 Live can't
  // update it mid-call), so the permission is pinned to the opening greeting —
  // otherwise she kept returning to the forecast later in the same call.
  voiceMorning: {
    en: (city) => `WEATHER: you may mention today's weather in ${city} ONLY in your opening greeting of this call (check it first). After that, never bring up the weather again in this call unless the user asks.`,
    es: (city) => `TIEMPO METEOROLÓGICO: puedes comentar el tiempo de hoy en ${city} SOLO en tu saludo inicial de esta llamada (consúltalo antes). Después, no vuelvas a sacar el tema del tiempo en esta llamada salvo que el usuario lo pida.`,
  },
  voiceEvening: {
    en: (city) => `WEATHER: you may mention tomorrow's forecast for ${city} ONLY in your opening greeting of this call (check it first). After that, never bring up the weather again in this call unless the user asks.`,
    es: (city) => `TIEMPO METEOROLÓGICO: puedes comentar la previsión de mañana para ${city} SOLO en tu saludo inicial de esta llamada (consúltala antes). Después, no vuelvas a sacar el tema del tiempo en esta llamada salvo que el usuario lo pida.`,
  },
};

function localNow(timeZone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const inFlightTz = new Set();
// One OpenWeather call per user, ever — fire-and-forget, never awaited by a reply.
function fetchAndStoreTimezone(db, userId, location) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key || !location?.lat || !location?.lon || inFlightTz.has(userId)) return;
  inFlightTz.add(userId);
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${location.lat}&lon=${location.lon}` +
    `&exclude=current,minutely,hourly,daily,alerts&appid=${key}`;
  fetch(url, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d?.timezone && db.collection("users").updateOne({ userId }, { $set: { "preferences.location.timezone": d.timezone } }))
    .catch((e) => console.error("[weatherNudge] timezone lookup failed:", e?.message || e))
    .finally(() => inFlightTz.delete(userId));
}

/**
 * The prompt line for this turn/session + what (if anything) is on offer.
 * @param prefs users.preferences (needs location + weatherNudges)
 * @param opts.channel "text" (default) | "voice" — voice pins the mention to the greeting
 * @returns {{ line: string, kind: null | "morning" | "evening", localDate?: string }}
 */
export function weatherNudge(db, userId, locale, prefs, now = new Date(), { channel = "text" } = {}) {
  const lang = String(locale || "").startsWith("es") ? "es" : "en";
  const loc = prefs?.location;
  const never = { line: LINES.never[lang], kind: null };
  if (!loc?.city || !userId) return never;
  if (!loc.timezone) { fetchAndStoreTimezone(db, userId, loc); return never; }

  let local;
  try { local = localNow(loc.timezone, now); } catch { return never; }
  const done = prefs?.weatherNudges || {};
  const kind =
    local.minutes >= MORNING[0] && local.minutes < MORNING[1] && done.morning !== local.date ? "morning"
    : local.minutes >= EVENING[0] && local.minutes < EVENING[1] && done.evening !== local.date ? "evening"
    : null;
  if (!kind) return never;
  const lineKey = channel === "voice" ? (kind === "morning" ? "voiceMorning" : "voiceEvening") : kind;
  return { line: LINES[lineKey][lang](loc.city), kind, localDate: local.date };
}

// Did her reply actually talk about the weather? Shared word list + the
// "tiempo" weather-phrase allowlist (public/weatherWords.js, also used by the
// browser), so "hace buen tiempo" counts but "llevamos mucho tiempo" doesn't.
export { mentionsWeather } from "../public/weatherWords.js";

export async function markWeatherNudge(db, userId, kind, localDate) {
  if (!kind || !localDate) return;
  await db.collection("users").updateOne({ userId }, { $set: { [`preferences.weatherNudges.${kind}`]: localDate } });
}
