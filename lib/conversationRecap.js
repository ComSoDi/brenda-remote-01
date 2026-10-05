// lib/conversationRecap.js
// "Shall we carry on with what we were talking about?" (Mike, 2026-10-05).
// After a conversation ends, one small Gemini call writes a recap of it —
// topic + where it stopped + the last few lines — saved on the conversation
// doc as `recap`. The next greeting (TALK or TEXT) within RECAP_WINDOW_HOURS
// offers to carry on, once per recap. If the user says yes, Brenda already
// has the context: TEXT through its history, TALK through a line added to
// the voice setup (recapPromptLine).
// The recap call is charged to the user's Text Brendys ("recap" feature).

import { recordFeatureUsage } from "./featureUsage.js";

const WINDOW_HOURS = Number(process.env.RECAP_WINDOW_HOURS) || 24;
const MIN_MESSAGES = 4;      // a quick "hi / bye" isn't worth carrying on
const MAX_MESSAGES = 30;     // most recent lines considered
const LAST_LINES = 4;        // given to Brenda verbatim when resuming
// After the offer, TALK sessions starting within this long get the recap.
const RESUME_CONTEXT_MS = 30 * 60 * 1000;

export const recapWindowMs = () => WINDOW_HOURS * 3600 * 1000;

function msgTime(m) {
  const t = new Date(m?.timestamp || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Writes (or refreshes) the recap of the user's latest conversation, if
 * there's something new since the last recap. Returns the recap or null.
 * @param {{ cutOff?: boolean, localeVariant?: string }} opts
 */
export async function writeRecap(db, session, { cutOff = false, localeVariant = "en-US" } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
  if (!apiKey || !session?.userId || session.isAnonymous) return null;

  const conv = await db.collection("conversations").findOne(
    { userId: session.userId },
    { projection: { messages: { $slice: -MAX_MESSAGES }, recap: 1 } }
  );
  const since = conv?.recap?.coveredUntil ? new Date(conv.recap.coveredUntil).getTime() : 0;
  const msgs = (conv?.messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
    // Only the latest conversation: stop at a gap of 3 h or more.
    .reduceRight((acc, m) => {
      if (acc.done) return acc;
      const prev = acc.list[0];
      if (prev && msgTime(prev) - msgTime(m) > 3 * 3600 * 1000) acc.done = true;
      else acc.list.unshift(m);
      return acc;
    }, { list: [], done: false }).list;

  const last = msgs[msgs.length - 1];
  if (!last || msgTime(last) <= since) return null;                       // nothing new
  if (Date.now() - msgTime(last) > recapWindowMs()) return null;          // too old to offer
  if (msgs.filter((m) => m.role === "user").length < MIN_MESSAGES / 2 || msgs.length < MIN_MESSAGES) return null;

  const lang = String(localeVariant).startsWith("es") ? "Spanish" : "English";
  const transcript = msgs
    .map((m) => `${m.role === "user" ? "User" : "Brenda"}: ${String(m.content).replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  const prompt = [
    "Below is the end of a conversation between a user and Brenda, their AI companion.",
    `In ${lang}, return ONLY JSON: {"topic":"...","stoppedAt":"...","worthResuming":true|false}`,
    '- topic: what they were talking about, 3-8 words, as Brenda would say it TO the user (e.g. "your granddaughter\'s wedding plans" / "los planes de boda de tu nieta"). No quotes, no trailing period.',
    "- stoppedAt: one short sentence on where the conversation stopped.",
    "- worthResuming: false if it was only small talk, greetings or goodbyes, or the topic was clearly finished.",
    "",
    transcript,
  ].join("\n");

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!r.ok) throw new Error(`recap HTTP ${r.status}`);
  const data = await r.json();
  recordFeatureUsage({ db, session, feature: "recap", model, data });

  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
  const parsed = JSON.parse(raw);
  const topic = String(parsed?.topic || "").trim().replace(/[.。]+$/, "");

  const recap = {
    topic: topic || null,
    stoppedAt: String(parsed?.stoppedAt || "").trim() || null,
    worthResuming: parsed?.worthResuming !== false && !!topic,
    cutOff: !!cutOff,
    lastLines: msgs.slice(-LAST_LINES).map((m) => ({ role: m.role, content: String(m.content).slice(0, 400) })),
    endedAt: new Date(msgTime(last)),
    coveredUntil: new Date(msgTime(last)),
    createdAt: new Date(),
    offeredAt: null,
  };
  await db.collection("conversations").updateOne({ userId: session.userId }, { $set: { recap } });
  return recap;
}

/**
 * For the greeting: the recap to offer now (marking it offered), or null.
 * Writes the recap first if the latest conversation has none yet (TEXT has
 * no hang-up to trigger it).
 */
export async function takeRecapOffer(db, session, { localeVariant } = {}) {
  if (!session?.userId || session.isAnonymous) return null;
  let recap = null;
  try {
    recap = await writeRecap(db, session, { localeVariant });
  } catch (e) {
    console.error("[recap/write]", e?.message || e);
  }
  if (!recap) {
    const conv = await db.collection("conversations").findOne({ userId: session.userId }, { projection: { recap: 1 } });
    recap = conv?.recap || null;
  }
  if (!recap?.worthResuming || recap.offeredAt) return null;
  if (Date.now() - new Date(recap.endedAt).getTime() > recapWindowMs()) return null;

  await db.collection("conversations").updateOne(
    { userId: session.userId, "recap.createdAt": recap.createdAt },
    { $set: { "recap.offeredAt": new Date() } }
  );
  return { topic: recap.topic, cutOff: !!recap.cutOff };
}

/**
 * One line for the TALK setup right after an offer, so if the user says
 * "yes" Brenda knows where they were. Empty otherwise (no always-on tokens).
 */
export function recapPromptLine(recap) {
  if (!recap?.offeredAt || !recap.topic) return "";
  if (Date.now() - new Date(recap.offeredAt).getTime() > RESUME_CONTEXT_MS) return "";
  const lines = (recap.lastLines || [])
    .map((m) => `${m.role === "user" ? "User" : "Brenda"}: ${m.content}`)
    .join("\n");
  return (
    `\n\nYou have just offered to carry on your previous conversation (${recap.topic}). ` +
    (recap.stoppedAt ? `Where it stopped: ${recap.stoppedAt} ` : "") +
    `If the user wants to, continue naturally from there. Its last lines were:\n${lines}`
  );
}
