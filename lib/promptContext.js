// lib/promptContext.js
// Ground-truth date/time appended to Brenda's system prompt on BOTH paths
// (api/chat.js text, server.js voice) so the model never has to guess when a
// query slips past the deterministic time branch. UTC is the single source of
// truth; the model converts to the user's city on request.
//
// IMPORTANT: this is reference data only — Brenda must NOT volunteer the date
// or time. She only states it when the user explicitly asks.

/**
 * @param {string} localeVariant  e.g. "es-ES", "en-US"
 * @param {{ city?: string, country?: string } | null} savedLocation  users.preferences.location
 * @param {Date} [now]  injectable for tests
 * @returns {string}  leading "\n\n" + the reference block (empty-safe)
 */
export function buildNowContext(localeVariant = "en-US", savedLocation = null, now = new Date()) {
  const lang = String(localeVariant || "").startsWith("es") ? "es" : "en";
  const stamp = new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(now);
  const city = savedLocation?.city
    ? `${savedLocation.city}${savedLocation.country ? `, ${savedLocation.country}` : ""}`
    : null;

  if (lang === "es") {
    return "\n\nDATOS DE REFERENCIA (no los menciones a menos que te los pidan):\n"
      + `- Fecha y hora actuales en UTC: ${stamp} UTC.\n`
      + (city ? `- Ciudad de referencia del usuario: ${city}.\n` : "")
      + "- SOLO si el usuario pregunta explícitamente la hora o la fecha: dásela para su ciudad"
      + (city ? "" : " (pregúntale en qué ciudad está si no lo sabes)")
      + " usando su huso horario local; nunca digas la hora en UTC. Nunca menciones la fecha ni la hora si no te lo piden.";
  }
  return "\n\nREFERENCE FACTS (do not mention unless asked):\n"
    + `- Current date and time in UTC: ${stamp} UTC.\n`
    + (city ? `- User's reference city: ${city}.\n` : "")
    + "- ONLY if the user explicitly asks for the time or date: give it for their city"
    + (city ? "" : " (ask which city they are in if unknown)")
    + " in its local timezone; never state the time in UTC. Never bring up the date or time unless asked.";
}
