// Shared helpers to normalize and store voice usage with token + cost rollups.
// Costs are approximate defaults; adjust if your account has different pricing.

const PRICING_PER_1K = {
  default: { input: 0.000075, output: 0.0003 },
  "models/gemini-2.0-flash-exp": { input: 0, output: 0 },
  "models/gemini-3-flash": { input: 0.000075, output: 0.0003 },
};

function round6(n) {
  return Math.round(Number(n || 0) * 1e6) / 1e6;
}

function pricingForModel(model) {
  const key = String(model || "").trim();
  return PRICING_PER_1K[key] || PRICING_PER_1K.default;
}

export function normalizeVoiceUsage(raw = {}) {
  const inputTokens =
    Number(raw.input_tokens ?? raw.inputTokens ?? raw.prompt_tokens ?? 0) || 0;
  const outputTokens =
    Number(raw.output_tokens ?? raw.outputTokens ?? raw.completion_tokens ?? 0) || 0;
  const totalTokens =
    Number(raw.total_tokens ?? raw.totalTokens ?? inputTokens + outputTokens) || 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function calculateTokenCosts(model, usage) {
  const pricing = pricingForModel(model);
  const costInput = round6((usage.inputTokens / 1000) * pricing.input);
  const costOutput = round6((usage.outputTokens / 1000) * pricing.output);
  const costTotal = round6(costInput + costOutput);

  return {
    input: costInput,
    output: costOutput,
    total: costTotal,
    pricingPer1K: pricing,
  };
}

function dayKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

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
    tokens: { input: 0, output: 0, total: 0 },
    cost: { input: 0, output: 0, total: 0 },
  };
}

function addToBucket(bucket, usage, cost) {
  const next = bucket || initBucket("n/a");
  next.tokens.input += usage.inputTokens;
  next.tokens.output += usage.outputTokens;
  next.tokens.total = next.tokens.input + next.tokens.output;

  next.cost.input = round6((next.cost.input || 0) + cost.input);
  next.cost.output = round6((next.cost.output || 0) + cost.output);
  next.cost.total = round6(next.cost.input + next.cost.output);
  return next;
}

function resetBucketIfNeeded(bucket, key) {
  if (!bucket || bucket.key !== key) return initBucket(key);
  return bucket;
}

async function updateVoiceUsageSummary(db, { userId, model, usage, cost, now, voiceSessionId, responseId }) {
  const col = db.collection("gemini_voice_usage_summary");
  const existing = await col.findOne({ userId, model });

  const day = dayKey(now);
  const week = weekKey(now);
  const month = monthKey(now);

  const daily = addToBucket(resetBucketIfNeeded(existing?.daily, day), usage, cost);
  const weekly = addToBucket(resetBucketIfNeeded(existing?.weekly, week), usage, cost);
  const monthly = addToBucket(resetBucketIfNeeded(existing?.monthly, month), usage, cost);
  const totals = addToBucket(resetBucketIfNeeded(existing?.totals, "all"), usage, cost);

  const updated = {
    daily,
    weekly,
    monthly,
    totals,
    updatedAt: now,
    lastVoiceSessionId: voiceSessionId,
    lastResponseId: responseId,
  };

  await col.updateOne(
    { userId, model },
    {
      $set: updated,
      $setOnInsert: { createdAt: now, userId, model },
    },
    { upsert: true }
  );

  return { userId, model, ...updated };
}

export async function recordVoiceUsage({
  db,
  userId,
  voiceSessionId,
  responseId,
  model,
  usage,
  now = new Date(),
}) {
  const normalizedUsage = normalizeVoiceUsage(usage);
  const cleanModel = String(model || "").trim() || "unknown";
  const cost = calculateTokenCosts(cleanModel, normalizedUsage);

  const events = db.collection("gemini_voice_usage_events");
  const insertRes = await events.updateOne(
    { userId, voiceSessionId, responseId },
    {
      $setOnInsert: {
        userId,
        voiceSessionId,
        responseId,
        model: cleanModel,
        usage: normalizedUsage,
        cost,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  const inserted = insertRes.upsertedCount > 0;
  let summary = null;

  if (inserted) {
    summary = await updateVoiceUsageSummary(db, {
      userId,
      model: cleanModel,
      usage: normalizedUsage,
      cost,
      now,
      voiceSessionId,
      responseId,
    });
  }

  return { inserted, usage: normalizedUsage, cost, summary };
}
