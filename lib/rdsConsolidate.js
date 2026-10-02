// lib/rdsConsolidate.js
// RDS profile consolidation — merges near-duplicate facts, drops passing
// moments, resolves outdated facts toward the newest, and caps each domain.
// Why: every stored fact is re-sent with every message (2026-10-01: Maria had
// 599 facts ≈ 7,850 tokens/message). Shared by the one-time clean-up script
// (scripts/consolidate-rds.js) and the daily in-server job (server.js).
//
// Safety: one Gemini call per domain; on ANY failure (HTTP, bad JSON, empty
// result, lost protected facts) that domain is left exactly as it was. Items
// added while a run is in progress are preserved. Writes only when !dryRun.

import { randomUUID } from "crypto";

export const RDS_DOMAINS = ["identity", "family", "friends", "hobbies", "food", "entertainment", "places", "health", "values"];
const CAP_PER_DOMAIN = Number(process.env.RDS_CAP_PER_DOMAIN) || 25;
const CAP_LIFE_STORIES = Number(process.env.RDS_CAP_LIFE_STORIES) || 15;

function buildPrompt(name, domain, items, cap) {
  const list = items.map((it, i) => `f${i + 1}: ${it.text}`).join("\n");
  return [
    `You maintain the long-term memory of a companion app about its user, ${name}.`,
    `Below are the stored facts in the "${domain}" category, oldest first (f1 = oldest).`,
    ``,
    `Rewrite them as a clean list:`,
    `1. Merge facts that say the same or closely related things into ONE concise fact (under 25 words), keeping every distinct detail: names, places, titles, numbers, dates.`,
    `2. Drop passing moments and one-off activities with no lasting value ("just finished a leg workout", "is going to the gym now"). If one contains a lasting detail (e.g. a brother's dog is called Sebastian), keep only that detail.`,
    `   Also drop scheduled or dated events — appointments, plans, anything tied to a specific day or hour ("appointment at the health center at 3:30 PM", "has doctors today", "cousin's birthday party on Saturday"). These are reminders, not lasting facts.`,
    `3. When facts conflict, the newer one (higher number) wins — e.g. "moved gym day to Saturday" replaces "goes on Fridays".`,
    `4. NEVER drop: people's names and relationships, health facts, or likes/dislikes that name a specific thing.`,
    `5. At most ${cap} facts. If more remain, merge the least important ones more broadly instead of deleting them.`,
    `6. Third person, same language as the original facts. No invented details.`,
    ``,
    `FACTS:`,
    list,
    ``,
    `Return ONLY JSON: {"facts":[{"text":"...","from":["f1","f4"]}]} — "from" lists the source facts each line merges.`,
  ].join("\n");
}

// Long lists time out in a single call (Maria's identity, 2026-10-01): merge
// in chunks, then one final pass over the merged results.
const CHUNK = 60;
async function consolidateList(apiKey, model, name, domain, items, cap) {
  if (items.length <= CHUNK) return consolidateOnce(apiKey, model, name, domain, items, cap);
  const partial = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    partial.push(...(await consolidateOnce(apiKey, model, name, domain, items.slice(i, i + CHUNK), CHUNK)));
  }
  partial.sort((a, b) => a.addedAt - b.addedAt);
  return partial.length > cap || partial.length > CHUNK
    ? consolidateList(apiKey, model, name, domain, partial, cap)
    : consolidateOnce(apiKey, model, name, domain, partial, cap);
}

async function consolidateOnce(apiKey, model, name, domain, items, cap) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(name, domain, items, cap) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const parsed = JSON.parse(raw);
  const facts = Array.isArray(parsed?.facts) ? parsed.facts : null;
  if (!facts || !facts.length) throw new Error("empty result");

  return facts
    .filter((f) => f && typeof f.text === "string" && f.text.trim())
    .slice(0, cap)
    .map((f) => {
      const src = (Array.isArray(f.from) ? f.from : [])
        .map((id) => items[Number(String(id).replace(/\D/g, "")) - 1])
        .filter(Boolean);
      // Recency = newest source fact, so "recent facts first" ranking survives merging.
      const addedAt = src.length ? new Date(Math.max(...src.map((s) => new Date(s.addedAt || 0).getTime()))) : new Date();
      return { id: randomUUID(), text: f.text.trim(), addedAt, mergedFrom: src.length };
    });
}

/**
 * Consolidates one user's RDS profile.
 * @returns {Promise<{userId, changed: boolean, domains: Array<{domain, before, after, error?}>}>}
 *   before/after are arrays of fact texts (for review reports).
 */
export async function consolidateRdsProfile(db, apiKey, model, userId, { dryRun = true, minItems = 2 } = {}) {
  const col = db.collection("rds_profiles");
  const profile = await col.findOne({ userId });
  const readAt = new Date();
  const name = String(userId || "").replace(/^user_/, "") || "the user";
  const report = { userId, changed: false, domains: [] };
  if (!profile) return report;
  if (profile.consolidationExempt) return { ...report, exempt: true }; // comparison copies stay original

  const targets = [
    ...RDS_DOMAINS.map((d) => ({ domain: d, path: `domains.${d}.items`, items: profile.domains?.[d]?.items || [], cap: CAP_PER_DOMAIN })),
    { domain: "life_stories", path: "lifeStories", items: profile.lifeStories || [], cap: CAP_LIFE_STORIES },
  ];

  const updates = {};
  for (const t of targets) {
    if (t.items.length < minItems) continue;
    const sorted = [...t.items].sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0));
    const before = sorted.map((i) => i.text);
    try {
      const after = await consolidateList(apiKey, model, name, t.domain, sorted, t.cap);
      report.domains.push({ domain: t.domain, before, after: after.map((a) => a.text) });
      updates[t.path] = after;
    } catch (e) {
      report.domains.push({ domain: t.domain, before, after: before, error: e?.message || String(e) });
    }
  }

  if (!Object.keys(updates).length) return report;
  report.changed = true;
  if (dryRun) return report;

  // Keep anything added while we were consolidating (chat keeps running).
  const fresh = await col.findOne({ userId });
  for (const [path, items] of Object.entries(updates)) {
    const current = path === "lifeStories" ? fresh?.lifeStories || [] : fresh?.domains?.[path.split(".")[1]]?.items || [];
    const lateArrivals = current.filter((i) => new Date(i.addedAt || 0) > readAt);
    updates[path] = [...items.map(({ mergedFrom, ...rest }) => rest), ...lateArrivals];
  }
  await col.updateOne({ userId }, { $set: { ...updates, lastConsolidatedAt: new Date() } });
  return report;
}

// ── Daily job ────────────────────────────────────────────────────────────
// Runs once a day at CONSOLIDATION_UTC (default 05:30 — Mike's choice for the
// quieter EU/Americas window). Invisible to users: seconds per profile, no
// locking, facts saved mid-run are kept. Only profiles with a fact added
// since their last consolidation are processed. A Mongo lock doc in `jobs`
// guarantees one run per UTC day across restarts/instances; if the server
// was asleep at the scheduled time it catches up on the next check.

const JOB_ID = "rds-consolidation";

// Single source of the run time (server.js logs this too). Env overrides.
export const CONSOLIDATION_UTC = process.env.RDS_CONSOLIDATION_UTC || "05:30";

function scheduledMinutes() {
  const [h, m] = String(CONSOLIDATION_UTC).split(":").map(Number);
  return (Number.isFinite(h) ? h : 5) * 60 + (Number.isFinite(m) ? m : 30);
}

/** Consolidates (writes) every profile changed since its last consolidation. */
export async function consolidateChangedProfiles(db, apiKey, model) {
  const changed = await db.collection("rds_profiles").find(
    {
      lastFactAddedAt: { $exists: true },
      consolidationExempt: { $ne: true }, // e.g. Mariaorg/Rickorg comparison copies
      $or: [
        { lastConsolidatedAt: { $exists: false } },
        { $expr: { $gt: ["$lastFactAddedAt", "$lastConsolidatedAt"] } },
      ],
    },
    { projection: { userId: 1 } }
  ).toArray();

  const totals = { profiles: 0, before: 0, after: 0, errors: 0 };
  for (const { userId } of changed) {
    try {
      const r = await consolidateRdsProfile(db, apiKey, model, userId, { dryRun: false });
      totals.profiles++;
      totals.before += r.domains.reduce((s, d) => s + d.before.length, 0);
      totals.after += r.domains.reduce((s, d) => s + d.after.length, 0);
      totals.errors += r.domains.filter((d) => d.error).length;
      if (!r.changed) {
        await db.collection("rds_profiles").updateOne({ userId }, { $set: { lastConsolidatedAt: new Date() } });
      }
    } catch (e) {
      totals.errors++;
      console.error(`[rds-consolidation] ${userId} failed:`, e?.message || e);
    }
  }
  return totals;
}

/** Called on an interval by server.js. Runs at most once per UTC day. */
export async function maybeRunDailyConsolidation(db, apiKey, model) {
  const now = new Date();
  if (now.getUTCHours() * 60 + now.getUTCMinutes() < scheduledMinutes()) return;
  const today = now.toISOString().slice(0, 10);

  // Claim today's run atomically; a stale lock (crashed run) expires after 2 h.
  const claim = await db.collection("jobs").findOneAndUpdate(
    {
      _id: JOB_ID,
      lastRunDate: { $ne: today },
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + 2 * 3600 * 1000), startedAt: now } },
    { returnDocument: "after" }
  ).catch(async (e) => {
    if (e?.code === 11000) return null; // another instance claimed it first
    throw e;
  });
  if (!claim) {
    // First-ever run: create the job doc (unique _id makes this race-safe).
    const exists = await db.collection("jobs").findOne({ _id: JOB_ID });
    if (exists) return;
    try {
      await db.collection("jobs").insertOne({ _id: JOB_ID, lockedUntil: new Date(now.getTime() + 2 * 3600 * 1000), startedAt: now });
    } catch (e) {
      if (e?.code === 11000) return;
      throw e;
    }
  }

  const t0 = Date.now();
  const totals = await consolidateChangedProfiles(db, apiKey, model);
  await db.collection("jobs").updateOne(
    { _id: JOB_ID },
    { $set: { lastRunDate: today, lastRunAt: new Date(), lastTotals: totals }, $unset: { lockedUntil: "" } }
  );
  console.log(
    `[rds-consolidation] ${today}: ${totals.profiles} profiles, ${totals.before} → ${totals.after} facts, ` +
    `${totals.errors} errors, ${Math.round((Date.now() - t0) / 1000)} s`
  );
}

/** Rough prompt cost of a profile's facts (chars/4), for before/after reporting. */
export function factTokens(texts) {
  return Math.round(texts.join("; ").length / 4);
}
