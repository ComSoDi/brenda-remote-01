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
    createdAt: new Date(),
  };
  await db.collection("rds_profiles").insertOne(empty);
  return empty;
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

export async function addRdsItem(db, userId, domain, text) {
  console.log("[rdsService] addRdsItem:", userId, domain, text);
  if (!DOMAINS.includes(domain) && domain !== "life_stories") {
    console.warn("[rdsService] addRdsItem: unknown domain:", domain);
    return;
  }
  const item = { id: randomUUID(), text: String(text).trim(), addedAt: new Date() };
  if (domain === "life_stories") {
    await db.collection("rds_profiles").updateOne(
      { userId },
      { $push: { lifeStories: item } },
      { upsert: true }
    );
  } else {
    await db.collection("rds_profiles").updateOne(
      { userId },
      {
        $push: { [`domains.${domain}.items`]: item },
        $set:  { [`domains.${domain}.lastTouched`]: new Date() },
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

export function buildRdsSystemAddendum(profile, localeVariant, username) {
  const isEs = String(localeVariant || "").toLowerCase().startsWith("es");
  const name  = username || (isEs ? "el usuario" : "the user");
  const sessionNum = (profile.sessionCount || 0) + 1;

  const knownLines = [];
  for (const domain of DOMAINS) {
    const items = profile.domains?.[domain]?.items || [];
    if (items.length) knownLines.push(`- ${domain}: ${items.map(i => i.text).join("; ")}`);
  }
  if (profile.lifeStories?.length) {
    knownLines.push(`- life stories: ${profile.lifeStories.map(s => s.text).join("; ")}`);
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
