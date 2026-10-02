// public/weatherWords.js
// Shared by the browser (public/app.js) and the server (api/chat.js,
// lib/weatherNudge.js) — one list, no drift.
//
// Spanish "tiempo" means both weather and time. The old approach treated it
// as weather UNLESS it matched a list of "time" phrases (a blacklist), which
// let "tengo poco tiempo" or "no le veo hace mucho tiempo" through as weather
// questions. Now it's an ALLOWLIST: "tiempo" counts as weather only inside a
// recognisable weather phrase; everything else is time.
//
// NB: JavaScript's \b treats accented letters (á, é, ñ…) as non-letters, so
// "hará\b" never matches. Patterns use Unicode letter boundaries instead.

const B = "(?<![\\p{L}\\p{N}])"; // start of word
const E = "(?![\\p{L}\\p{N}])";  // end of word
const rx = (src) => new RegExp(src.replaceAll("‹", B).replaceAll("›", E), "u");

const TIEMPO_WEATHER_PATTERNS = [
  // ¿Qué tiempo hace / hará / va a hacer / hizo…?
  rx("‹qu[eé]\\s+tiempo\\s+(?:hace|har[aá]|va\\s+a\\s+hacer|hizo|hac[ií]a|tendremos|habr[aá])›"),
  // buen / mal tiempo ("hace buen tiempo", "¿hará mal tiempo?")
  rx("‹(?:buen|mal|mejor|peor)\\s+tiempo›"),
  // ¿Cómo / qué tal está / estará / será / va a estar el tiempo…?
  rx("‹(?:c[oó]mo|qu[eé]\\s+tal)\\s+(?:(?:est[aá]|estar[aá]|ser[aá]|va\\s+a\\s+(?:estar|ser)|viene|sale)\\s+)?el\\s+tiempo›"),
  // el tiempo de/para hoy, mañana, esta tarde, el fin de semana…
  rx("‹el\\s+tiempo\\s+(?:de\\s+|para\\s+)?(?:hoy|ma[nñ]ana|pasado\\s+ma[nñ]ana|esta\\s+(?:tarde|noche|semana)|este\\s+fin|el\\s+fin\\s+de\\s+semana|la\\s+semana)›"),
  // "¿El tiempo en Madrid?" — only as a short whole question (place of ≤3 words),
  // so "paso el tiempo en casa" / "el tiempo en el trabajo se me hace eterno" aren't weather
  rx("^[^\\p{L}]*(?:y\\s+|dime\\s+|mira\\s+)?el\\s+tiempo\\s+en\\s+\\p{L}+(?:\\s+\\p{L}+){0,2}[^\\p{L}]*$"),
  // previsión / parte / pronóstico / información del tiempo
  rx("‹(?:previsi[oó]n|parte|pron[oó]stico|informaci[oó]n)\\s+del\\s+tiempo›"),
  // tiempo soleado / lluvioso / nublado / frío…
  rx("‹tiempo\\s+(?:soleado|lluvioso|nublado|fr[ií]o|caluroso|seco|h[uú]medo|templado|despejado|inestable|primaveral|veraniego|invernal|agradable|estupendo|horrible)›"),
];

/** True only when "tiempo" is used in a weather phrase. */
export function tiempoMeansWeather(text) {
  const raw = String(text || "").toLowerCase();
  return raw.includes("tiempo") && TIEMPO_WEATHER_PATTERNS.some((re) => re.test(raw));
}

// Words that are always about the weather (no "tiempo" ambiguity).
const WEATHER_WORDS = rx(
  "‹(?:weather|forecast|rain\\p{L}*|sunny|cloud\\p{L}*|snow\\p{L}*|degrees|temperature|humidity|clima|lluvi\\p{L}*|llover|llueve|llover[aá]|soleado|nublado|nubes|nieve|nevar\\p{L}*|grados|temperatura|humedad|previsi[oó]n|pron[oó]stico|tormenta\\p{L}*)›"
);

/** Does this text talk about the weather? (Used to detect Brenda's own mentions.) */
export function mentionsWeather(text) {
  const raw = String(text || "").toLowerCase();
  return WEATHER_WORDS.test(raw) || tiempoMeansWeather(raw);
}
