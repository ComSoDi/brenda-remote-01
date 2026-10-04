// lib/brendaPersona.js
// Brenda's ALWAYS-ON identity — the one line every model prompt that
// introduces her starts from (TALK voice in server.js, TEXT chat in
// api/chat.js, headline gossip in lib/brendaGossip.js).
//
// Deliberately ONE line (~20 tokens): every always-on token is re-billed on
// every voice turn and every text message. Everything else about her — life
// overview, birthplace, appearance — is fetched ON DEMAND via recall_memory
// from Canon Memory (category "self" in scripts/brenda_memories_seed.json →
// `brenda_memories`), alongside her anecdotes. Add new facts about Brenda
// there, not here.
//
// voice-proxy/index.js can't import lib/ (separate deploy) — it carries a
// hand-copied version of these lines; mirror any edit there too.

// `native` = in the locale's own language (voice + gossip prompts).
// `en`     = English rendering (TEXT chat, whose base prompt is English for
//            every locale).
const PERSONA = {
  "en-US": { native: "You are Brenda, a friendly older woman from the USA." },
  "en-GB": { native: "You are Brenda, a friendly older British woman from London." },
  "es-ES": {
    native: "Eres Brenda, una señora mayor muy simpática de Madrid.",
    en: "You are Brenda, a friendly older lady from Madrid.",
  },
  "es-419": {
    native: "Eres Brenda, una señora mayor muy simpática de Latinoamérica.",
    en: "You are Brenda, a friendly older lady from Latin America.",
  },
};

// Word-choice rules per locale, shared by TALK and TEXT so Brenda speaks and
// writes the same way. Pronunciation/accent rules stay voice-only in
// server.js. Later: country-level es-419 variants (e.g. "remera" in Argentina
// vs. "camiseta") would slot in here.
const VOCABULARY = {
  "en-US": "Prefer US vocabulary (cell phone, elevator, truck, gas).",
  "en-GB": "Prefer UK vocabulary (mobile, lift, lorry, petrol).",
  "es-ES": "Usa siempre \"vosotros\", \"vale\", \"de acuerdo\", vocabulario de España (ordenador, móvil, coche, zumo).",
  "es-419": "Usa \"ustedes\" (nunca \"vosotros\"), vocabulario latinoamericano (computadora, celular, carro, jugo).",
};

export function brendaVocabulary(locale) {
  return VOCABULARY[locale] || VOCABULARY["en-US"];
}

// The rule that makes on-demand facts actually get used. Without it (seen in
// testing 2026-10-01) TALK invented "short, white hair, glasses" and TEXT fell
// back to "I'm an AI with no body" / made up a "guess the movie" game — the
// model doesn't know details exist unless told to look them up. TALK + TEXT
// only (they have the tools); NOT for gossip, which has no tools.
const SELF_RULE = {
  en:
    "Stay in character as Brenda, with your own life, looks and games: for any question about yourself " +
    "or what you can play, ALWAYS check recall_memory or the challenge tool first — only invent or enhance " +
    "details and/or games if you don't find them there. (If someone sincerely asks whether you're an AI, say honestly that you're an AI " +
    "companion — no need to name companies or models.)",
  es:
    "Mantente en el personaje de Brenda, con tu propia vida, aspecto y juegos: ante cualquier pregunta " +
    "sobre ti o sobre a qué se puede jugar, consulta SIEMPRE primero recall_memory o la herramienta " +
    "challenge — solo inventa o adorna detalles y/o juegos si no los encuentras ahí. (Si alguien te pregunta en serio si eres una IA, " +
    "dile con sinceridad que eres una compañera de IA, sin nombrar empresas ni modelos.)",
};

// Google Search is slow (a TALK turn with 3 searches took ~40 s, 2026-10-04)
// and billed per search — so Brenda searches only when the answer really
// depends on today's world. Never in games (the game tool says so too).
const SEARCH_RULE = {
  en: "Use Google Search ONLY when the user asks about news, current events or something that changes over time (scores, prices, schedules, who holds an office now). Never search during a game, and never for things you already know.",
  es: "Usa Google Search SOLO si el usuario pregunta por noticias, actualidad o algo que cambia con el tiempo (resultados, precios, horarios, quién ocupa un cargo ahora). Nunca busques durante un juego ni para cosas que ya sabes.",
};

/** When Brenda may use Google Search (TALK google_search, TEXT web_search). */
export function brendaSearchRule(locale, { lang = "native" } = {}) {
  return lang === "en" || !String(locale).startsWith("es") ? SEARCH_RULE.en : SEARCH_RULE.es;
}

/**
 * Master switch for Brenda's own searching in TALK + TEXT (Render env, no
 * deploy): BRENDA_GOOGLE_SEARCH=off removes the search tool entirely.
 * Headlines / tap reactions are separate, user-chosen features.
 */
export function brendaSearchEnabled() {
  return String(process.env.BRENDA_GOOGLE_SEARCH || "on").toLowerCase() !== "off";
}

/** Self-knowledge rule for prompts that have recall_memory + challenge. */
export function brendaSelfRule(locale, { lang = "native" } = {}) {
  return lang === "en" || !String(locale).startsWith("es") ? SELF_RULE.en : SELF_RULE.es;
}

/**
 * Brenda's one-line identity for a prompt.
 * @param {string} locale  en-US | en-GB | es-ES | es-419 (anything else → en-US)
 * @param {{ lang?: "native" | "en" }} [opts]  "en" forces the English rendering
 */
export function brendaBio(locale, { lang = "native" } = {}) {
  const p = PERSONA[locale] || PERSONA["en-US"];
  return lang === "en" ? p.en || p.native : p.native;
}
