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
    textInput:   0.000075,  // $0.075 / 1M
    audioInput:  null,      // not applicable for text REST
    textOutput:  0.0003,    // $0.300 / 1M
    audioOutput: null,
  },

  // Gemini 2.5 Flash Native Audio Preview — Gemini Live / voice proxy
  // ⚠ Preview pricing — verify audio rates at https://ai.google.dev/pricing
  "gemini-2.5-flash-native-audio-preview-12-2025": {
    textInput:   0.000075,  // $0.075 / 1M
    audioInput:  0.001,     // $1.00  / 1M  (spoken user input)
    textOutput:  0.0003,    // $0.300 / 1M
    audioOutput: 0.002,     // $2.00  / 1M  (Brenda's spoken reply)
  },

  // Fallback for any unlisted model
  default: {
    textInput:   0.000075,
    audioInput:  0.001,
    textOutput:  0.0003,
    audioOutput: 0.002,
  },
};

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

  const totalInputTokens  = textInputTokens  + audioInputTokens;
  const totalOutputTokens = textOutputTokens + audioOutputTokens;

  return {
    textInputTokens,
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

export function calculateCosts(model, usage) {
  const p = pricingForModel(model);
  const textInputCost   = round6((usage.textInputTokens   / 1000) * (p.textInput   ?? 0));
  const audioInputCost  = round6((usage.audioInputTokens  / 1000) * (p.audioInput  ?? p.textInput ?? 0));
  const textOutputCost  = round6((usage.textOutputTokens  / 1000) * (p.textOutput  ?? 0));
  const audioOutputCost = round6((usage.audioOutputTokens / 1000) * (p.audioOutput ?? p.textOutput ?? 0));
  const thoughtsCost    = round6(((usage.thoughtsTokens || 0) / 1000) * (p.textOutput ?? 0));
  const total = round6(textInputCost + audioInputCost + textOutputCost + audioOutputCost + thoughtsCost);
  return {
    textInput:   textInputCost,
    audioInput:  audioInputCost,
    textOutput:  textOutputCost,
    audioOutput: audioOutputCost,
    thoughts:    thoughtsCost,
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
      textInput: 0, audioInput: 0, textOutput: 0, audioOutput: 0, thoughts: 0, total: 0,
    },
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
  b.cost.total       = round6(b.cost.textInput + b.cost.audioInput + b.cost.textOutput + b.cost.audioOutput + b.cost.thoughts);
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

// ─── Voice usage recording ──────────────────────────────────────────────────
// Collections: gemini_voice_usage_events, gemini_voice_usage_summary

export async function recordVoiceUsage({
  db, userId, voiceSessionId, responseId, model, usage, now = new Date(),
}) {
  const cleanModel = String(model || "").trim().replace(/^models\//, "") || "unknown";
  const isAudioModel = /audio|native/i.test(cleanModel);
  const normalizedUsage = normalizeUsage(usage, { assumeAudio: isAudioModel });
  const cost = calculateCosts(cleanModel, normalizedUsage);

  const insertRes = await db.collection("gemini_voice_usage_events").updateOne(
    { userId, voiceSessionId, responseId },
    {
      $setOnInsert: {
        userId, voiceSessionId, responseId,
        model: cleanModel, usage: normalizedUsage, cost,
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

export async function recordChatUsage({
  db, userId, chatRequestId, chatSessionId, callIndex = 0, model, usage, now = new Date(),
}) {
  const normalizedUsage = normalizeUsage(usage);
  const cleanModel = String(model || "").trim().replace(/^models\//, "") || "unknown";
  const cost = calculateCosts(cleanModel, normalizedUsage);
  const responseId = `${chatRequestId}_${callIndex}`;

  const insertRes = await db.collection("gemini_chat_usage_events").updateOne(
    { userId, chatRequestId, callIndex },
    {
      $setOnInsert: {
        userId, chatRequestId, chatSessionId: chatSessionId || null, callIndex, responseId,
        model: cleanModel, usage: normalizedUsage, cost,
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
