// lib/usage.js
// Token usage normalization, cost calculation, and DB rollups for all Gemini calls.
//
// NOTE — system vs user token split:
//   Gemini's usageMetadata.promptTokenCount includes system instruction +
//   conversation history + current user message with no API-level breakdown.
//   Separating them would require a separate countTokens call (adds latency)
//   or character-count estimation (rough). We store the combined total.
//
// Pricing source: https://ai.google.dev/pricing — verify when rates change.

// ─── Pricing per 1 000 tokens ──────────────────────────────────────────────
// null fields mean the modality is not billed / not applicable for that model.
const PRICING_PER_1K = {
  // Gemini 2.5 Flash — text REST API (api/chat.js)
  "gemini-2.5-flash": {
    textInput:   0.0003,    // $0.30 / 1M
    audioInput:  null,      // not applicable for text REST
    textOutput:  0.0025,    // $2.50 / 1M
    audioOutput: null,      // not applicable for text REST
  },

  // Gemini 2.5 Flash Native Audio Preview — Gemini Live / voice proxy
  // ✓ Confirmed against official non-promotional pricing sheet (2026-07-09)
  "gemini-2.5-flash-native-audio-preview-12-2025": {
    textInput:   0.0005,    // $0.50 / 1M
    audioInput:  0.003,     // $3.00  / 1M  (spoken user input)
    textOutput:  0.002,     // $2.00 / 1M
    audioOutput: 0.012,     // $12.00  / 1M  (Brenda's spoken reply)
  },

  // Gemini 3.1 Flash Live Preview — Gemini Live / voice proxy
  // ⚠ Preview pricing — verify at https://ai.google.dev/pricing before billing goes live
  "gemini-3.1-flash-live-preview": {
    textInput:   0.00075,    // $0.75 / 1M 
    audioInput:  0.003,      // $3.00  / 1M
    // audioInputTime: 0.005,   // $0.005 / min
    textOutput:  0.0003,     // $0.300 / 1M
    audioOutput: 0.012,      // $12.00 / 1M  (Brenda's spoken reply)
    // audioOutputTime: 0.018,  // $0.018 / min
  },

  // Fallback for any unlisted model
  default: {
    textInput:   0.00075,    // $0.75 / 1M
    audioInput:  0.003,      // $3.00  / 1M
    // audioInputTime: 0.005,   // $0.005 / min
    textOutput:  0.0003,     // $0.300 / 1M
    audioOutput: 0.012,      // $12.00 / 1M
    // audioOutputTime: 0.018,  // $0.018 / min
  },
};

// ─── Google Search grounding fee ──────────────────────────────────────────
// Billed per search, not per token (Google pricing, checked 2026-10-04):
//   Gemini 2.5 models: $35 / 1,000 grounded REQUESTS (one fee per request
//     that searched, however many queries the model ran inside it).
//   Gemini 3 models:   $14 / 1,000 search QUERIES (a request can run 10-15).
// The free allowances (1,500/day on 2.5, 5,000/month on 3) are app-wide, so
// they're deliberately ignored: every search is costed and charged (Mike,
// 2026-10-04 — "be on the safe side").
const SEARCH_FEE = {
  perRequest: 0.035,  // 2.5 models
  perQuery:   0.014,  // 3.x models (incl. 3.1 Flash Live)
};

// Search fees are charged to users in Brendys at the text-OUTPUT token price
// ($2.50 / 1M): $0.035 = 14,000 Brendys, $0.014 = 5,600 (Mike, 2026-10-04).
export const BRENDY_USD = 2.5 / 1e6;

/**
 * Search fee for one Gemini response, from its groundingMetadata.
 * Returns null when the model didn't search.
 */
export function searchCharge(model, groundingMetadata) {
  if (!groundingMetadata) return null;
  const queries = Array.isArray(groundingMetadata.webSearchQueries) ? groundingMetadata.webSearchQueries.length : 0;
  const searched = queries > 0 || (groundingMetadata.groundingChunks?.length || 0) > 0;
  if (!searched) return null;
  const clean = String(model || "").replace(/^models\//, "");
  const perRequest = /^gemini-2\./.test(clean);
  const count = perRequest ? 1 : Math.max(1, queries);
  const unitPrice = perRequest ? SEARCH_FEE.perRequest : SEARCH_FEE.perQuery;
  const cost = round6(count * unitPrice);
  return {
    unit: perRequest ? "request" : "query",
    count,
    queries,
    unitPrice,
    cost,
    brendys: Math.round(cost / BRENDY_USD),
  };
}

function round6(n) {
  return Math.round(Number(n || 0) * 1e6) / 1e6;
}

function pricingForModel(model) {
  // Accept both "gemini-2.5-flash" and "models/gemini-2.5-flash"
  const key = String(model || "").trim().replace(/^models\//, "");
  return PRICING_PER_1K[key] || PRICING_PER_1K.default;
}

// ─── Usage normalization ────────────────────────────────────────────────────

function modalityCounts(details = []) {
  const text  = details.find(d => (d.modality || "").toUpperCase() === "TEXT")?.tokenCount  || 0;
  const audio = details.find(d => (d.modality || "").toUpperCase() === "AUDIO")?.tokenCount || 0;
  return { text, audio };
}

/**
 * Normalize raw Gemini usageMetadata into a structured usage object.
 *
 * REST generateContent: promptTokenCount / candidatesTokenCount (text-only,
 *   no per-modality detail arrays).
 * Live BidiGenerateContent: may include promptTokensDetails / responseTokensDetails
 *   with per-modality (TEXT / AUDIO) breakdowns.
 */
export function normalizeUsage(raw = {}, { assumeAudio = false } = {}) {
  const inputDetail  = modalityCounts(
    raw.promptTokensDetails   || raw.inputTokensDetails    || []
  );
  const outputDetail = modalityCounts(
    raw.responseTokensDetails || raw.candidatesTokensDetails || raw.outputTokensDetails || []
  );

  const totalInput  = Number(
    raw.promptTokenCount  ?? raw.input_tokens  ?? raw.inputTokens  ?? raw.prompt_tokens ?? 0
  ) || 0;
  const totalOutput = Number(
    raw.responseTokenCount ?? raw.candidatesTokenCount ??
    raw.output_tokens      ?? raw.outputTokens ?? raw.completion_tokens ?? 0
  ) || 0;

  const hasInputDetail  = (inputDetail.text  + inputDetail.audio)  > 0;
  const hasOutputDetail = (outputDetail.text + outputDetail.audio) > 0;

  const textInputTokens   = hasInputDetail  ? inputDetail.text   : (assumeAudio ? 0 : totalInput);
  const audioInputTokens  = hasInputDetail  ? inputDetail.audio  : (assumeAudio ? totalInput : 0);
  const textOutputTokens  = hasOutputDetail ? outputDetail.text  : (assumeAudio ? 0 : totalOutput);
  const audioOutputTokens = hasOutputDetail ? outputDetail.audio : (assumeAudio ? totalOutput : 0);

  const thoughtsTokens = Number(raw.thoughtsTokenCount ?? raw.thoughts_token_count ?? 0) || 0;

  // Google Search results the model read (grounding) — billed as text input
  // but reported outside promptTokenCount. Before 2026-10-04 these were missed.
  const toolUseTokens = Number(raw.toolUsePromptTokenCount ?? 0) || 0;
  const textInputWithTools = textInputTokens + toolUseTokens;

  const totalInputTokens  = textInputWithTools + audioInputTokens;
  const totalOutputTokens = textOutputTokens + audioOutputTokens;

  return {
    textInputTokens: textInputWithTools,
    audioInputTokens,
    textOutputTokens,
    audioOutputTokens,
    thoughtsTokens,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens + thoughtsTokens,
  };
}

// Backward-compat alias
export const normalizeVoiceUsage = normalizeUsage;

// ─── Cost calculation ───────────────────────────────────────────────────────

export function calculateCosts(model, usage, search = null) {
  const p = pricingForModel(model);
  const textInputCost   = round6((usage.textInputTokens   / 1000) * (p.textInput   ?? 0));
  const audioInputCost  = round6((usage.audioInputTokens  / 1000) * (p.audioInput  ?? p.textInput ?? 0));
  const textOutputCost  = round6((usage.textOutputTokens  / 1000) * (p.textOutput  ?? 0));
  const audioOutputCost = round6((usage.audioOutputTokens / 1000) * (p.audioOutput ?? p.textOutput ?? 0));
  const thoughtsCost    = round6(((usage.thoughtsTokens || 0) / 1000) * (p.textOutput ?? 0));
  const searchCost      = round6(search?.cost || 0);
  const total = round6(textInputCost + audioInputCost + textOutputCost + audioOutputCost + thoughtsCost + searchCost);
  return {
    textInput:   textInputCost,
    audioInput:  audioInputCost,
    textOutput:  textOutputCost,
    audioOutput: audioOutputCost,
    thoughts:    thoughtsCost,
    search:      searchCost,
    total,
    pricingPer1K: p,
  };
}

// Backward-compat alias
export const calculateTokenCosts = calculateCosts;

// ─── Date bucket helpers ────────────────────────────────────────────────────

function dayKey(date)  { return date.toISOString().slice(0, 10); }

function weekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function initBucket(key) {
  return {
    key,
    tokens: {
      textInput: 0, audioInput: 0, textOutput: 0, audioOutput: 0, thoughts: 0,
      totalInput: 0, totalOutput: 0, total: 0,
    },
    cost: {
      textInput: 0, audioInput: 0, textOutput: 0, audioOutput: 0, thoughts: 0, search: 0, total: 0,
    },
    searches: 0,
    searchBrendys: 0,
  };
}

function addToBucket(bucket, usage, cost) {
  const b = bucket || initBucket("n/a");
  b.tokens.textInput    += usage.textInputTokens;
  b.tokens.audioInput   += usage.audioInputTokens;
  b.tokens.textOutput   += usage.textOutputTokens;
  b.tokens.audioOutput  += usage.audioOutputTokens;
  b.tokens.thoughts     += (usage.thoughtsTokens || 0);
  b.tokens.totalInput    = b.tokens.textInput  + b.tokens.audioInput;
  b.tokens.totalOutput   = b.tokens.textOutput + b.tokens.audioOutput;
  b.tokens.total         = b.tokens.totalInput + b.tokens.totalOutput + b.tokens.thoughts;

  b.cost.textInput   = round6((b.cost.textInput   || 0) + cost.textInput);
  b.cost.audioInput  = round6((b.cost.audioInput  || 0) + cost.audioInput);
  b.cost.textOutput  = round6((b.cost.textOutput  || 0) + cost.textOutput);
  b.cost.audioOutput = round6((b.cost.audioOutput || 0) + cost.audioOutput);
  b.cost.thoughts    = round6((b.cost.thoughts    || 0) + (cost.thoughts || 0));
  b.cost.search      = round6((b.cost.search      || 0) + (cost.search   || 0));
  b.cost.total       = round6(b.cost.textInput + b.cost.audioInput + b.cost.textOutput + b.cost.audioOutput + b.cost.thoughts + b.cost.search);
  b.searches         = (b.searches      || 0) + (usage.searches      || 0);
  b.searchBrendys    = (b.searchBrendys || 0) + (usage.searchBrendys || 0);
  return b;
}

function resetBucketIfNeeded(bucket, key) {
  if (!bucket || bucket.key !== key) return initBucket(key);
  return bucket;
}

// ─── Summary rollup (shared by chat + voice) ───────────────────────────────

async function updateUsageSummary(col, { userId, model, usage, cost, now, sessionId, responseId }) {
  const existing = await col.findOne({ userId, model });
  const day   = dayKey(now);
  const week  = weekKey(now);
  const month = monthKey(now);

  const daily   = addToBucket(resetBucketIfNeeded(existing?.daily,   day),   usage, cost);
  const weekly  = addToBucket(resetBucketIfNeeded(existing?.weekly,  week),  usage, cost);
  const monthly = addToBucket(resetBucketIfNeeded(existing?.monthly, month), usage, cost);
  const totals  = addToBucket(resetBucketIfNeeded(existing?.totals,  "all"), usage, cost);

  const updated = {
    daily, weekly, monthly, totals,
    updatedAt: now,
    lastSessionId: sessionId,
    lastResponseId: responseId,
  };

  await col.updateOne(
    { userId, model },
    { $set: updated, $setOnInsert: { createdAt: now, userId, model } },
    { upsert: true }
  );
  return { userId, model, ...updated };
}

// Search fields live on usage so every quota sum can add them:
// Brendys charged = usage.totalTokens + usage.searchBrendys.
function withSearch(usage, search) {
  return { ...usage, searches: search?.count || 0, searchBrendys: search?.brendys || 0 };
}

// ─── Voice usage recording ──────────────────────────────────────────────────
// Collections: gemini_voice_usage_events, gemini_voice_usage_summary

export async function recordVoiceUsage({
  db, userId, voiceSessionId, responseId, model, usage, now = new Date(),
  planId = null, planDisplayName = null, grounding = null,
}) {
  const cleanModel = String(model || "").trim().replace(/^models\//, "") || "unknown";
  const isAudioModel = /audio|native|live/i.test(cleanModel);
  const search = searchCharge(cleanModel, grounding);
  const normalizedUsage = withSearch(normalizeUsage(usage, { assumeAudio: isAudioModel }), search);
  const cost = calculateCosts(cleanModel, normalizedUsage, search);

  const insertRes = await db.collection("gemini_voice_usage_events").updateOne(
    { userId, voiceSessionId, responseId },
    {
      $setOnInsert: {
        userId, voiceSessionId, responseId,
        model: cleanModel, usage: normalizedUsage, cost, search,
        planId, planDisplayName,
        createdAt: now, updatedAt: now,
      },
    },
    { upsert: true }
  );

  const inserted = insertRes.upsertedCount > 0;
  let summary = null;
  if (inserted) {
    summary = await updateUsageSummary(
      db.collection("gemini_voice_usage_summary"),
      { userId, model: cleanModel, usage: normalizedUsage, cost, now, sessionId: voiceSessionId, responseId }
    );
  }
  return { inserted, usage: normalizedUsage, cost, summary };
}

// ─── Chat usage recording ───────────────────────────────────────────────────
// Collections: gemini_chat_usage_events, gemini_chat_usage_summary
// Each HTTP request gets a chatRequestId; each Gemini call within it gets
// an incrementing callIndex (main call = 0, tool-call follow-up = 1, etc.)

// `feature` tags usage outside the main chat reply: "news" (headlines, tap
// reaction, news greeting — the dashboard's NEWS block), "topic" ("Cambia
// tema"), "search" (news questions routed to /api/brenda/search). All of it
// is charged to the user's Text Brendys like chat.
export async function recordChatUsage({
  db, userId, chatRequestId, chatSessionId, callIndex = 0, model, usage, now = new Date(),
  planId = null, planDisplayName = null, grounding = null, feature = null,
}) {
  const cleanModel = String(model || "").trim().replace(/^models\//, "") || "unknown";
  const search = searchCharge(cleanModel, grounding);
  const normalizedUsage = withSearch(normalizeUsage(usage), search);
  const cost = calculateCosts(cleanModel, normalizedUsage, search);
  const responseId = `${chatRequestId}_${callIndex}`;

  const insertRes = await db.collection("gemini_chat_usage_events").updateOne(
    { userId, chatRequestId, callIndex },
    {
      $setOnInsert: {
        userId, chatRequestId, chatSessionId: chatSessionId || null, callIndex, responseId,
        feature, model: cleanModel, usage: normalizedUsage, cost, search,
        planId, planDisplayName,
        createdAt: now, updatedAt: now,
      },
    },
    { upsert: true }
  );

  const inserted = insertRes.upsertedCount > 0;
  let summary = null;
  if (inserted) {
    summary = await updateUsageSummary(
      db.collection("gemini_chat_usage_summary"),
      { userId, model: cleanModel, usage: normalizedUsage, cost, now, sessionId: chatSessionId || chatRequestId, responseId }
    );
  }
  return { inserted, usage: normalizedUsage, cost, summary };
}

// ─── Clean-up (housekeeping) usage ──────────────────────────────────────────
// Collection: gemini_cleanup_usage_events. Background work done FOR a user
// but not chosen by them — recorded and costed per user, NOT charged in
// Brendys (cost of business until Mike decides otherwise, 2026-10-04).
// Many small calls fold into one row per bucket:
//   job "rds_consolidation" — bucket = one run (all topic calls of that run)
//   job "rds_extract"       — bucket = UTC day (fact learning after each turn)
//   job "transcript_fix"    — bucket = UTC day (TALK transcript clean-up)

export async function recordCleanupUsage({ db, userId, job, bucket, model, usage, now = new Date() }) {
  if (!db || !userId || !usage) return;
  const cleanModel = String(model || "").trim().replace(/^models\//, "") || "unknown";
  const u = normalizeUsage(usage);
  const c = calculateCosts(cleanModel, u);
  await db.collection("gemini_cleanup_usage_events").updateOne(
    { userId, job, bucket: bucket || dayKey(now), model: cleanModel },
    {
      $inc: {
        calls: 1,
        "usage.textInputTokens": u.textInputTokens,
        "usage.audioInputTokens": u.audioInputTokens,
        "usage.textOutputTokens": u.textOutputTokens,
        "usage.audioOutputTokens": u.audioOutputTokens,
        "usage.thoughtsTokens": u.thoughtsTokens,
        "usage.totalInputTokens": u.totalInputTokens,
        "usage.totalOutputTokens": u.totalOutputTokens,
        "usage.totalTokens": u.totalTokens,
        "cost.textInput": c.textInput,
        "cost.audioInput": c.audioInput,
        "cost.textOutput": c.textOutput,
        "cost.audioOutput": c.audioOutput,
        "cost.thoughts": c.thoughts,
        "cost.total": c.total,
      },
      $set: { "cost.pricingPer1K": c.pricingPer1K, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}
