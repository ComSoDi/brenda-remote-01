// lib/rdsService.js
// Relationship Discovery System — state management and chat integration

import { randomUUID } from "crypto";

const DOMAINS = ["identity", "family", "friends", "hobbies", "food", "entertainment", "places", "health", "values"];

// ── State ─────────────────────────────────────────────────────────────────

export async function getRdsProfile(db, userId) {
  const existing = await db.collection("rds_profiles").findOne({ userId });
  if (existing) return existing;
  const empty = {
    userId,
    introShown: false,
    sessionCount: 0,
    lastSessionDate: null,
    declaredInterests: [],
    domains: Object.fromEntries(DOMAINS.map(d => [d, { items: [], lastTouched: null }])),
    lifeStories: [],
    conversationPrefs: { humor: null, depth: null, storytelling: null, preferredSessionLength: null },
    coverageNotes: {},
    heardMemories: [],   // Canon Memory PRD §5.2 — per-user "have I told them this" tracking
    createdAt: new Date(),
  };
  await db.collection("rds_profiles").insertOne(empty);
  return empty;
}

// ── Canon Memory (brenda-canon-memory-prd.md §5.2) ──────────────────────────
// heardMemories lives on this same SUP (rds_profiles) document — per-memory,
// per-user "have I told them this" tracking. Small array (bounded by how many
// memories exist in brenda_memories), so a read-modify-write of the whole
// array is simplest and matches this file's existing update style.

export function getHeardMemoriesMap(profile) {
  const map = new Map();
  for (const m of profile?.heardMemories || []) {
    if (m?.memoryId) map.set(m.memoryId, m);
  }
  return map;
}

export async function recordMemoryMention(db, userId, memoryId, monthKey) {
  const profile = await getRdsProfile(db, userId);
  const list = Array.isArray(profile.heardMemories) ? profile.heardMemories.slice() : [];
  const idx = list.findIndex((m) => m?.memoryId === memoryId);
  const now = new Date();

  const updated = idx === -1
    ? { memoryId, heardCount: 1, monthlyHeardCount: 1, monthKey, lastMentionedAt: now }
    : {
        memoryId,
        heardCount: (list[idx].heardCount || 0) + 1,
        monthlyHeardCount: (list[idx].monthKey === monthKey ? (list[idx].monthlyHeardCount || 0) : 0) + 1,
        monthKey,
        lastMentionedAt: now,
      };

  if (idx === -1) list.push(updated); else list[idx] = updated;

  await db.collection("rds_profiles").updateOne(
    { userId },
    { $set: { heardMemories: list } },
    { upsert: true }
  );
  return updated;
}

export async function markRdsIntroShown(db, userId) {
  console.log("[rdsService] markRdsIntroShown:", userId);
  const result = await db.collection("rds_profiles").updateOne(
    { userId },
    { $set: { introShown: true } },
    { upsert: true }
  );
  console.log("[rdsService] markRdsIntroShown result:", JSON.stringify(result));
}

export async function incrementRdsSession(db, userId) {
  console.log("[rdsService] incrementRdsSession:", userId);
  await db.collection("rds_profiles").updateOne(
    { userId },
    { $inc: { sessionCount: 1 }, $set: { lastSessionDate: new Date() } },
    { upsert: true }
  );
}

// Replace the full declaredInterests array (user-editable seed topics).
// Values are trimmed; empty strings are discarded.
export async function setDeclaredInterests(db, userId, interests) {
  const cleaned = (Array.isArray(interests) ? interests : [])
    .map(s => String(s || "").trim())
    .filter(Boolean);
  await db.collection("rds_profiles").updateOne(
    { userId },
    { $set: { declaredInterests: cleaned } },
    { upsert: true }
  );
  return cleaned;
}

// ── Near-duplicate guard ──────────────────────────────────────────────────
// Every fact is re-sent with every message, so duplicates cost tokens on every
// turn (2026-10-01: Maria had 599 facts ≈ 7,850 tokens/message, many of them
// rewordings like "Rick goes to the gym" ×10). This cheap word-overlap check
// blocks repeats at save time; deeper same-meaning merging is done by the
// daily consolidation (lib/rdsConsolidate.js).
const STOPWORDS = new Set((
  "the a an to of in on at for and or but is are was were be been being has have had do does did his her their " +
  "they them he she it its this that with from by as about very really just also currently usually often " +
  "el la los las un una unos unas de del al en y o pero es son fue era ser estar esta está su sus le les lo con por para muy " +
  "que se ya también"
).split(" "));

function factKey(text, username) {
  const name = String(username || "").toLowerCase();
  return new Set(
    String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && w !== name)
      .map((w) => w.slice(0, 5)) // crude stem: "loves"/"loved", "goes"/"goes"
  );
}

export function isNearDuplicateFact(text, existingTexts, username = "") {
  const a = factKey(text, username);
  if (!a.size) return true; // nothing meaningful left — not worth storing
  return existingTexts.some((t) => {
    const b = factKey(t, username);
    if (!b.size) return false;
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    // Same words, or one fact's words almost entirely contained in the other.
    return shared / Math.min(a.size, b.size) >= 0.8 && Math.min(a.size, b.size) >= 2
      || (a.size === b.size && shared === a.size);
  });
}

export async function addRdsItem(db, userId, domain, text) {
  console.log("[rdsService] addRdsItem:", userId, domain, text);
  if (!DOMAINS.includes(domain) && domain !== "life_stories") {
    console.warn("[rdsService] addRdsItem: unknown domain:", domain);
    return;
  }
  const existing = await db.collection("rds_profiles").findOne(
    { userId },
    { projection: { [`domains.${domain}.items.text`]: 1, "lifeStories.text": 1, username: 1 } }
  );
  const existingTexts = domain === "life_stories"
    ? (existing?.lifeStories || []).map((s) => s.text)
    : (existing?.domains?.[domain]?.items || []).map((i) => i.text);
  const username = String(userId || "").replace(/^user_/, "");
  if (isNearDuplicateFact(text, existingTexts, username)) {
    console.log("[rdsService] addRdsItem: skipped near-duplicate:", domain, text);
    return;
  }
  const item = { id: randomUUID(), text: String(text).trim(), addedAt: new Date() };
  // lastFactAddedAt lets the daily consolidation pick only profiles that
  // changed since their last clean-up (lastConsolidatedAt).
  if (domain === "life_stories") {
    await db.collection("rds_profiles").updateOne(
      { userId },
      { $push: { lifeStories: item }, $set: { lastFactAddedAt: item.addedAt } },
      { upsert: true }
    );
  } else {
    await db.collection("rds_profiles").updateOne(
      { userId },
      {
        $push: { [`domains.${domain}.items`]: item },
        $set:  { [`domains.${domain}.lastTouched`]: new Date(), lastFactAddedAt: item.addedAt },
      },
      { upsert: true }
    );
  }
}

// Remove domain items whose text loosely matches `description`.
// Returns array of removed items.
export async function removeRdsItem(db, userId, description) {
  const lower = String(description || "").toLowerCase().trim();
  if (!lower) return [];

  const profile = await getRdsProfile(db, userId);
  const updates = {};
  const removed = [];

  for (const domain of DOMAINS) {
    const items = profile.domains?.[domain]?.items || [];
    const keep = items.filter(it => {
      const t = it.text.toLowerCase();
      return !t.includes(lower) && !lower.includes(t.split(" ").slice(0, 4).join(" "));
    });
    if (keep.length < items.length) {
      removed.push(...items.filter(it => !keep.some(k => k.id === it.id)));
      updates[`domains.${domain}.items`] = keep;
    }
  }

  const stories = profile.lifeStories || [];
  const keepStories = stories.filter(s => !s.text.toLowerCase().includes(lower));
  if (keepStories.length < stories.length) {
    removed.push(...stories.filter(s => !keepStories.some(k => k.id === s.id)));
    updates.lifeStories = keepStories;
  }

  if (Object.keys(updates).length) {
    await db.collection("rds_profiles").updateOne({ userId }, { $set: updates });
  }
  return removed;
}

// ── Chat integration ──────────────────────────────────────────────────────

// RDS_PROMPT_MODE — ROLLBACK SWITCH (Render env, no deploy needed):
//   "core" (default): only ~15 key facts go into every prompt; the rest is
//          fetched on demand via the recall_user_facts tool. Keeps per-message
//          cost flat however much Brenda learns.
//   "full": every stored fact in every prompt — exactly the pre-2026-10-02
//          behaviour. Set this if response lag or personality changes appear.
export const RDS_PROMPT_MODE = process.env.RDS_PROMPT_MODE === "full" ? "full" : "core";
const CORE_FACTS_MAX = Number(process.env.RDS_CORE_FACTS) || 15;
// Always represented in the core (safety + who matters to them), newest first.
const CORE_PRIORITY = { identity: 3, family: 3, health: 3 };

const byNewest = (a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0);

function allFacts(profile) {
  const facts = [];
  for (const domain of DOMAINS) {
    for (const it of profile.domains?.[domain]?.items || []) facts.push({ domain, text: it.text, addedAt: it.addedAt });
  }
  for (const s of profile.lifeStories || []) facts.push({ domain: "life stories", text: s.text, addedAt: s.addedAt });
  return facts;
}

function coreFacts(profile) {
  const facts = allFacts(profile);
  const picked = [];
  for (const [domain, n] of Object.entries(CORE_PRIORITY)) {
    picked.push(...facts.filter((f) => f.domain === domain).sort(byNewest).slice(0, n));
  }
  const rest = facts.filter((f) => !picked.includes(f)).sort(byNewest);
  return [...picked, ...rest].slice(0, CORE_FACTS_MAX);
}

function factLines(facts) {
  const by = new Map();
  for (const f of facts) by.set(f.domain, [...(by.get(f.domain) || []), f.text]);
  return [...by].map(([d, t]) => `- ${d}: ${t.join("; ")}`);
}

export function buildRdsSystemAddendum(profile, localeVariant, username) {
  const isEs = String(localeVariant || "").toLowerCase().startsWith("es");
  const name  = username || (isEs ? "el usuario" : "the user");
  const sessionNum = (profile.sessionCount || 0) + 1;

  const all = allFacts(profile);
  const shown = RDS_PROMPT_MODE === "full" ? all : coreFacts(profile);
  const knownLines = factLines(shown);
  if (shown.length < all.length) {
    knownLines.push(
      `(You know more about ${name} than listed here — when the conversation touches their life, family, ` +
      `tastes or past, call recall_user_facts with the topic before answering; never claim you don't know without checking.)`
    );
  }

  const untouched = DOMAINS.filter(d => !(profile.domains?.[d]?.items?.length));

  const declaredInterests = profile.declaredInterests?.filter(Boolean) || [];
  const declaredSection = declaredInterests.length
    ? `Topics ${name} has said they enjoy talking about: ${declaredInterests.join(", ")}.`
    : null;

  const factsSection = knownLines.length
    ? `Known facts about ${name}:\n${knownLines.join("\n")}`
    : `No personal facts about ${name} on record yet. This is one of your first conversations.`;

  const untouchedSection = untouched.length
    ? `Topics not yet explored through conversation: ${untouched.join(", ")}.`
    : "You have explored a wide range of topics with this person already.";

  return `
== RELATIONSHIP MEMORY — INTERNAL, DO NOT MENTION OR QUOTE THIS SECTION TO THE USER ==

You are in an ongoing friendship with ${name}. This is approximately session #${sessionNum}.
${declaredSection ? `\n${declaredSection}` : ""}
${factsSection}

${untouchedSection}

Conversation guidance:
- NEVER ask bare biographical questions ("Tell me about yourself", "Do you have children?", "Where are you from?"). These feel like a form to fill out, not a conversation.
- Use the bait-not-interrogate method: share a small observation, opinion, or story to invite them to respond — never demand they do.
- At most ONE follow-up question per response, and only when already inside a thread they started.
- If there is a natural (not forced) connection to something from a previous session, make it — but don't shoehorn it.
- Quietly prioritize topics from the untouched list when a real opening arises; never change subject abruptly just to cover them.

SPECIAL COMMANDS — handle these directly when the user's message matches:
- "What do you remember about me?" / "What do you know about me?" / "¿Qué recuerdas de mí?" / "¿Qué sabes de mí?" and variations → respond with a warm, personal narrative of what you know. No bullet lists — speak like a friend thinking back on your shared conversations.
- "Forget that" / "Don't remember that" / "Olvida eso" / "Borra eso" / "No lo recuerdes" and variations → briefly confirm you will forget, identify WHAT in one short phrase, then continue warmly. REQUIRED format: include [FORGET: <concise description of what to forget>] somewhere in your response — this tag will be stripped from what the user sees and used to update the database.

DISCLAIMER RULES — apply every time the topic is relevant, not just once:
- ACUTE health signal (chest tightness, difficulty breathing, stroke symptoms, a fall with possible injury, severe pain, medical emergency): your VERY FIRST sentence must direct them to call emergency services or their doctor immediately. Warmth follows, urgency leads.
- ONGOING low-acuteness health topic (sore joints, poor sleep, mild fatigue, chronic symptom): respond warmly, but always include an explicit nudge to mention it to their doctor — do not skip, soften into a joke, or bury it at the end.
- LEGAL or FINANCIAL topic where the user sounds confused or at risk: state clearly and directly that you are not a lawyer or financial advisor and they should speak to one. Warmth is in the tone, not in softening the message.
`.trim();
}

// ── recall_user_facts (on-demand facts about the USER) ─────────────────────
// Pure in-memory search over the profile — no extra AI call; the caller reads
// the profile fresh from Mongo (one indexed findOne) so facts learned earlier
// in the same voice call are included. Only exposed when RDS_PROMPT_MODE is
// "core" (in "full" mode every fact is already in the prompt).

export const RECALL_USER_FACTS_TOOL = {
  name: "recall_user_facts",
  description:
    "What you know about the user beyond the facts in your instructions. Call it when the conversation " +
    "touches their family, friends, tastes, health, places or past, or they ask what you remember about them.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "English + user-language keywords, e.g. 'family, hijos' or 'everything'" },
    },
    required: ["topic"],
  },
};

// Topic words that point at a whole domain (EN + ES).
const DOMAIN_WORDS = {
  identity: ["identity", "job", "work", "age", "trabajo", "edad", "profesion", "personality", "personalidad"],
  family: ["family", "familia", "children", "kids", "son", "daughter", "hijos", "hijo", "hija", "nietos", "grandchildren", "husband", "wife", "marido", "esposa", "esposo", "parents", "padres", "brother", "sister", "hermano", "hermana", "pets", "mascotas", "cat", "dog", "gato", "perro"],
  friends: ["friends", "amigos", "amigas", "friend", "amigo", "amiga"],
  hobbies: ["hobbies", "hobby", "aficiones", "pasatiempos", "sports", "deporte", "gym", "gimnasio"],
  food: ["food", "comida", "eat", "comer", "cooking", "cocina", "drink", "bebida", "restaurant", "restaurante"],
  entertainment: ["entertainment", "books", "libros", "movies", "peliculas", "music", "musica", "series", "tv", "television", "television", "games", "juegos"],
  places: ["places", "lugares", "travel", "viajes", "city", "ciudad", "country", "pais", "home", "casa"],
  health: ["health", "salud", "doctor", "medico", "diet", "dieta", "illness", "enfermedad", "pain", "dolor"],
  values: ["values", "valores", "beliefs", "creencias", "religion", "politics"],
  "life stories": ["story", "stories", "historia", "historias", "past", "pasado", "youth", "juventud", "memories", "recuerdos"],
};
const EVERYTHING = new Set(["everything", "all", "todo", "remember", "recuerdas", "sabes", "know"]);
const normWord = (w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function searchUserFacts(profile, topic, { limit = 10 } = {}) {
  const facts = allFacts(profile || {});
  if (!facts.length) return { found: false };
  const words = String(topic || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(normWord);

  if (words.some((w) => EVERYTHING.has(w))) {
    // Broad recall ("what do you remember about me?"): a few newest per domain.
    const per = new Map();
    for (const f of facts.sort(byNewest)) if ((per.get(f.domain) || []).length < 3) per.set(f.domain, [...(per.get(f.domain) || []), f]);
    return { found: true, facts: [...per.values()].flat().slice(0, 20).map((f) => `${f.domain}: ${f.text}`) };
  }

  const domains = new Set(Object.entries(DOMAIN_WORDS).filter(([, ws]) => ws.some((w) => words.includes(w))).map(([d]) => d));
  const key = factKey(words.join(" "));
  const scored = facts.map((f) => {
    let score = domains.has(f.domain) ? 2 : 0;
    for (const w of factKey(f.text)) if (key.has(w)) score += 3;
    return { f, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score || byNewest(a.f, b.f));

  if (!scored.length) return { found: false };
  return { found: true, facts: scored.slice(0, limit).map((s) => `${s.f.domain}: ${s.f.text}`) };
}

export function buildMemoryNarrative(profile, localeVariant, username) {
  const isEs = String(localeVariant || "").toLowerCase().startsWith("es");
  const name  = username ? `, ${username}` : "";

  const allItems = [];
  for (const domain of DOMAINS) {
    for (const it of profile.domains?.[domain]?.items || []) {
      allItems.push({ domain, text: it.text });
    }
  }
  for (const s of profile.lifeStories || []) {
    allItems.push({ domain: "life_stories", text: s.text });
  }

  if (!allItems.length) {
    return isEs
      ? `Honestamente${name}, todavía no sé mucho de ti. Acabamos de empezar a conocernos — ¡eso es lo bueno de las nuevas amistades!`
      : `Honestly${name}, I don't know all that much about you yet. We're still just getting to know each other — which is the fun part!`;
  }

  const grouped = {};
  for (const it of allItems) {
    (grouped[it.domain] = grouped[it.domain] || []).push(it.text);
  }

  const DOMAIN_LABELS_ES = {
    identity:      "sobre ti",
    family:        "tu familia",
    friends:       "tus amigos",
    hobbies:       "tus aficiones",
    food:          "comida",
    entertainment: "entretenimiento",
    places:        "los lugares",
    health:        "tu salud",
    values:        "tus valores",
    life_stories:  "historias que me has contado",
  };
  const DOMAIN_LABELS_EN = {
    identity:      "about you",
    family:        "your family",
    friends:       "your friends",
    hobbies:       "your hobbies",
    food:          "food",
    entertainment: "entertainment",
    places:        "places",
    health:        "your health",
    values:        "your values",
    life_stories:  "stories you've shared",
  };
  const labels = isEs ? DOMAIN_LABELS_ES : DOMAIN_LABELS_EN;

  const parts = Object.entries(grouped).map(([dom, items]) => {
    const label = labels[dom] || dom;
    return isEs ? `${label}: ${items.join(", ")}` : `${label}: ${items.join(", ")}`;
  });

  const intro = isEs
    ? `A ver, déjame pensar${name}...`
    : `Let me think${name}...`;
  const outro = isEs
    ? "No está mal para ir empezando, ¿no?"
    : "Not bad for a start, I think!";

  return `${intro} ${parts.join(". ")}. ${outro}`;
}

// ── Intent detection ──────────────────────────────────────────────────────

export function detectRdsIntent(text) {
  const lower = String(text || "").toLowerCase().trim();

  const memoryPhrases = [
    "what do you remember", "what do you know about me", "what have you learned",
    "what have i told you", "what do you recall", "tell me what you remember",
    "what's in your memory", "what do you know about me",
    "qué recuerdas", "qué sabes de mí", "qué sabes sobre mí",
    "qué has aprendido", "qué te he contado", "qué recuerdo tienes de mí",
  ];

  const forgetPhrases = [
    "forget that", "don't remember that", "please forget", "forget what i said",
    "don't keep that", "erase that", "remove that from your memory",
    "olvida eso", "no recuerdes eso", "borra eso", "elimina eso",
    "olvídate de eso", "no guardes eso", "no lo recuerdes",
  ];

  return {
    isMemoryQuery:   memoryPhrases.some(p => lower.includes(p)),
    isForgetRequest: forgetPhrases.some(p => lower.includes(p)),
  };
}

export function classifyHealthRisk(text) {
  const lower = String(text || "").toLowerCase();

  const acuteTerms = [
    "chest pain", "chest tight", "can't breathe", "cannot breathe",
    "difficulty breathing", "hard to breathe", "heart attack", "stroke",
    "fell down", "i fell", "i've fallen", "severe pain", "emergency",
    "call 911", "call an ambulance", "unconscious", "can't move", "cannot move",
    "blurred vision", "slurred speech", "dizzy and", "passing out",
    // Spanish
    "dolor en el pecho", "pecho apretado", "no puedo respirar",
    "dificultad al respirar", "ataque al corazón", "infarto", "derrame cerebral",
    "me caí", "me he caído", "caída grave", "dolor muy intenso", "emergencia",
    "llama a una ambulancia", "inconsciente", "no me puedo mover",
    "visión borrosa", "habla arrastrando", "me estoy desmayando",
  ];

  const medicalTerms = [
    "doctor", "hospital", "pain", "hurt", "ache", "sick", "ill",
    "symptoms", "knee", "back pain", "tired", "can't sleep", "headache",
    "medicine", "medication", "health",
    "médico", "hospital", "dolor", "herido", "enfermo", "síntomas",
    "rodilla", "dolor de espalda", "cansado", "no puedo dormir",
    "dolor de cabeza", "medicina", "medicamento", "salud",
  ];

  const legalTerms = [
    "lawyer", "attorney", "court", "lawsuit", "sue", "legal action",
    "contract", "will", "estate", "inheritance", "my rights",
    "abogado", "tribunal", "demanda", "demandar", "contrato",
    "testamento", "herencia", "mis derechos", "acción legal",
  ];

  const financialTerms = [
    "bank account", "investment", "fraud", "scam", "loan", "debt",
    "financial advisor", "wire transfer", "someone called me about money",
    "cuenta bancaria", "inversión", "fraude", "estafa", "préstamo",
    "deuda", "asesor financiero", "transferencia bancaria",
  ];

  const isAcute     = acuteTerms.some(t => lower.includes(t));
  const isMedical   = isAcute || medicalTerms.some(t => lower.includes(t));
  const isLegal     = legalTerms.some(t => lower.includes(t));
  const isFinancial = financialTerms.some(t => lower.includes(t));

  return { isMedical, isLegal, isFinancial, isAcute };
}

// ── Async extraction ──────────────────────────────────────────────────────

// Extract personal facts from a single conversation turn via Gemini.
// Runs non-blocking — caller must not await the returned Promise.
export async function extractRdsItems(geminiApiKey, model, userMsg, aiReply, username) {
  const name = username || "the user";
  const prompt = [
    `You are a personal-fact extractor for a friendly AI companion. From the conversation turn below, extract personal facts that ${name} revealed about themselves — including explicit preferences, favorites, opinions, and life details.`,
    ``,
    `EXTRACT (be inclusive):`,
    `- Explicit favorites: "My favorite book is X", "I love music by Y", "I hate Z food"`,
    `- Named preferences: specific book titles, authors, musicians, artists, films, foods, places they say they like or dislike`,
    `- Personal facts: age, job, family, where they live or grew up, health details`,
    `- Life stories and significant experiences they share`,
    `- Values, beliefs, or personality traits they express`,
    ``,
    `SKIP:`,
    `- Pure general knowledge not tied to ${name}'s personal taste ("Shakespeare was English")`,
    `- Hypothetical or clearly fictional scenarios`,
    `- Things said about other people that reveal nothing about ${name}`,
    `- Passing moments and one-off activities ("just finished a leg workout", "is going to the gym now", "had pasta today") — only store LASTING facts ("goes to the gym regularly", "loves pasta"). If a passing moment reveals something lasting (e.g. a brother's dog's name), store just that lasting part.`,
    `- Scheduled or dated events — appointments, plans, anything tied to a specific day or hour ("appointment at 3:30 PM", "has doctors today", "party on Saturday"). Those are reminders, not personal facts.`,
    ``,
    `User said: "${String(userMsg).slice(0, 800)}"`,
    `Assistant replied: "${String(aiReply).slice(0, 500)}"`,
    ``,
    `Domain guide: entertainment = books, movies, TV, music, games | hobbies = activities, sports, crafts | food = foods, drinks, restaurants | places = cities, countries, spots they like or have lived | values = beliefs, principles | health = physical or mental health facts | identity = name, age, job, personality traits`,
    ``,
    `Return ONLY valid JSON, no prose, no code fences:`,
    `{"extractions":[{"domain":"identity|family|friends|hobbies|food|entertainment|places|health|values|life_stories","item":"concise fact in third person, e.g. loves García Márquez novels"}]}`,
    `If nothing new was revealed, return {"extractions":[]}`,
    `Rules: Max 5 items. Under 20 words each. When ${name} names specific titles, authors, or artists they like, ALWAYS include them.`,
  ].join("\n");

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    console.error("[rds/extract] Gemini HTTP error:", r.status, errBody.slice(0, 200));
    return { extractions: [] };
  }

  let data;
  try {
    data = JSON.parse(await r.text());
  } catch {
    console.error("[rds/extract] Failed to parse Gemini response envelope");
    return { extractions: [] };
  }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!raw) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "empty";
    console.error("[rds/extract] No text in Gemini response, reason:", reason);
    return { extractions: [] };
  }

  const stripped = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // Gemini sometimes adds preamble ("Here is the JSON requested:") — extract the object directly
  const jsonStart = stripped.indexOf("{");
  const jsonEnd   = stripped.lastIndexOf("}");
  const jsonStr   = jsonStart >= 0 && jsonEnd > jsonStart ? stripped.slice(jsonStart, jsonEnd + 1) : stripped;
  try {
    const result = JSON.parse(jsonStr);
    if (result?.extractions?.length) {
      console.log("[rds/extract] Saved:", JSON.stringify(result.extractions));
    }
    return result;
  } catch {
    console.error("[rds/extract] JSON parse failed on:", jsonStr.slice(0, 200));
    return { extractions: [] };
  }
}

// ── Topic progression ─────────────────────────────────────────────────────

// Sanitize a user-provided topic string for use as a MongoDB field key.
function sanitizeTopicKey(str) {
  return String(str || "").replace(/[.\$\[\]]/g, "_").trim();
}

// Return all domain observations and the list of angles already used for
// this topic in prior sessions.
export async function getTopicStarterContext(db, userId, subject) {
  const profile = await getRdsProfile(db, userId);

  const allObservations = [];
  for (const domain of DOMAINS) {
    for (const item of profile.domains?.[domain]?.items || []) {
      allObservations.push(item.text);
    }
  }
  for (const s of profile.lifeStories || []) {
    allObservations.push(s.text);
  }

  const key = sanitizeTopicKey(subject);
  const pastAngles = profile.topicStarterLog?.[key] || [];

  return { allObservations, pastAngles };
}

// Append a brief angle summary to the topic's progression log (capped at 10).
export async function recordTopicAngle(db, userId, subject, angle) {
  const key = sanitizeTopicKey(subject);
  const doc = await db.collection("rds_profiles")
    .findOne({ userId }, { projection: { [`topicStarterLog.${key}`]: 1 } });
  const existing = doc?.topicStarterLog?.[key] || [];
  const updated = [...existing, String(angle).trim()].slice(-10);
  await db.collection("rds_profiles").updateOne(
    { userId },
    { $set: { [`topicStarterLog.${key}`]: updated } },
    { upsert: true }
  );
}

// Parse and strip [FORGET: description] from Gemini's reply text.
// Returns { cleanText, forgetDescription }.
export function parseForgetTag(replyText) {
  const match = String(replyText || "").match(/\[FORGET:\s*([^\]]+)\]/i);
  if (!match) return { cleanText: replyText, forgetDescription: null };
  return {
    cleanText: replyText.replace(match[0], "").replace(/\s{2,}/g, " ").trim(),
    forgetDescription: match[1].trim(),
  };
}
