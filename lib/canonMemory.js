// lib/canonMemory.js
// Brenda Canon Memory (brenda-canon-memory-prd.md) — a fixed, author-authored
// set of facts about BRENDA (the inverse of RDS/SUP, which accumulates facts
// about the user). Retrieved on demand, in-turn, via the live voice session's
// `recall_memory` function call — never a preemptive context injection, never
// a second LLM call to "enhance" the anecdote (PRD §6-7).
//
// Per-user "have I told them this" tracking (`heardMemories`) lives on the
// existing SUP document (rds_profiles) — see lib/rdsService.js. This file
// owns the `brenda_memories` collection itself and the matching/eligibility
// logic (PRD §5.1, §6).
//
// Content is entirely author-controlled (PRD §8) — nothing in this app writes
// to brenda_memories; it's seeded out-of-band. NOT SEEDED YET as of this file
// existing — recallMemory() will simply find no candidates until it is.

import { getRdsProfile, getHeardMemoriesMap, recordMemoryMention } from "./rdsService.js";

export const CANON_MEMORY_COLLECTION = "brenda_memories";

// PRD §9 — deliberately configurable, expected to be tuned after real usage.
const MONTHLY_CAP = Number(process.env.CANON_MEMORY_MONTHLY_CAP) || 5;
const RECENCY_WINDOW_DAYS = Number(process.env.CANON_MEMORY_RECENCY_DAYS) || 3;

function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

let _indexPromise = null;
export function ensureCanonMemoryIndexes(db) {
  if (!_indexPromise) {
    _indexPromise = Promise.all([
      db.collection(CANON_MEMORY_COLLECTION).createIndex({ tags: 1, active: 1 }),
      db.collection(CANON_MEMORY_COLLECTION).createIndex({ memoryId: 1 }, { unique: true }),
    ]).catch((e) => {
      _indexPromise = null; // let a later call retry
      console.error("[canonMemory] index create failed:", e?.message || e);
    });
  }
  return _indexPromise;
}

// locales absent/empty ⇒ eligible in every app locale (en-US, en-GB, es-ES,
// es-419) — a memory only needs `locales` set when it should be RESTRICTED
// (PRD §5.1's example list omitting es-ES was confirmed NOT an exclusion).
function localeEligible(memory, locale) {
  if (!Array.isArray(memory.locales) || memory.locales.length === 0) return true;
  return memory.locales.includes(locale);
}

/**
 * The recall_memory tool's implementation. One query for candidates, one read
 * of the SUP profile for heard-tracking, one write to record the mention —
 * single hop, no second LLM call (PRD §7). Call this the instant a `tool_call`
 * for "recall_memory" is received; see the note in the PRD about
 * gemini-3.1-flash-live-preview not emitting turnComplete until the tool
 * response is sent back.
 *
 * @returns {Promise<{elements: object, tone: string, heardCount: number} | null>}
 *   heardCount is the count BEFORE this mention (0 = never told before).
 */
export async function recallMemory(db, userId, topic, locale) {
  await ensureCanonMemoryIndexes(db);

  // Strip punctuation, not just whitespace — the model's topic string comes
  // back comma-separated ("freedom, travel, exploring somewhere new"), and a
  // naive whitespace split leaves "travel," attached to its comma, which then
  // never exact-matches the clean tag "travel" in the $in lookup below.
  // (Confirmed live: this exact case silently produced a false "not found".)
  const keywords = String(topic || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!keywords.length) return null;

  const allCandidates = await db.collection(CANON_MEMORY_COLLECTION)
    .find({ tags: { $in: keywords }, active: true })
    .sort({ weight: -1 })
    .toArray();

  const candidates = allCandidates.filter((m) => localeEligible(m, locale));
  if (!candidates.length) return null;

  const profile = await getRdsProfile(db, userId);
  const heard = getHeardMemoriesMap(profile);
  const monthKey = getMonthKey();

  const eligible = candidates.filter((mem) => {
    const meta = heard.get(mem.memoryId);
    if (!meta) return true; // never told before — always eligible
    const monthlyCount = meta.monthKey === monthKey ? (meta.monthlyHeardCount || 0) : 0;
    if (monthlyCount >= MONTHLY_CAP) return false;
    const lastAt = meta.lastMentionedAt ? new Date(meta.lastMentionedAt).getTime() : 0;
    const daysSince = (Date.now() - lastAt) / 86400000;
    return daysSince >= RECENCY_WINDOW_DAYS;
  });

  // Fall back to the full candidate list if the filters leave nothing —
  // better to repeat something than go silent on a clearly relevant topic.
  const pool = eligible.length ? eligible : candidates;
  const chosen = pool.slice().sort((a, b) => {
    const aAt = heard.get(a.memoryId)?.lastMentionedAt ? new Date(heard.get(a.memoryId).lastMentionedAt).getTime() : 0;
    const bAt = heard.get(b.memoryId)?.lastMentionedAt ? new Date(heard.get(b.memoryId).lastMentionedAt).getTime() : 0;
    return aAt - bAt; // least-recently-mentioned first
  })[0];

  const priorMeta = heard.get(chosen.memoryId);
  await recordMemoryMention(db, userId, chosen.memoryId, monthKey);

  return {
    elements: chosen.elements,
    tone: chosen.tone,
    heardCount: priorMeta?.heardCount ?? 0,
  };
}

// Gemini function declaration — text matches the PRD §6 verbatim. Wired into
// the voice setup.tools in server.js alongside google_search.
export const RECALL_MEMORY_TOOL = {
  name: "recall_memory",
  description:
    "Recall a personal memory or anecdote from Brenda's own life. Call this in two situations: " +
    "(1) the conversation naturally touches on a related topic (travel, pets, past relationships, hobbies, career, family, etc.) and a memory of your own would fit naturally; " +
    "(2) the user directly asks you about something specific from your own life — a name, place, pet, or past experience (e.g. 'tell me about Carla', 'what about your cat', 'have you been scuba diving?') — even if it doesn't ring a bell right away. Check here BEFORE saying you don't recall or asking the user to remind you who/what they mean. " +
    "If heardCount > 0 in the result, you may briefly and warmly acknowledge you've told this before, then tell it again with natural variation — don't recite it the same way twice.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "keywords describing what the user just brought up" },
    },
  },
};
