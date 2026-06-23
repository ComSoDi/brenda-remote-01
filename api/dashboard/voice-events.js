import { requireDashboardSession } from "../../lib/dashboard-auth.js";
import { getDb } from "../../lib/mongo.js";

const PAGE_SIZE = 50;

function parseQuery(req) {
  const url        = new URL(req.url, `http://${req.headers.host}`);
  const userId     = url.searchParams.get("userId") || null;
  const from       = url.searchParams.get("from")   || null;
  const to         = url.searchParams.get("to")     || null;
  const page       = Math.max(1, parseInt(url.searchParams.get("page")     || "1",  10));
  const pageSize   = Math.max(1, parseInt(url.searchParams.get("pageSize") || String(PAGE_SIZE), 10));
  return { userId, from, to, page, pageSize };
}

function buildMatch(userId, from, to) {
  const match = {};
  if (userId) match.userId = userId;
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to)   match.createdAt.$lte = new Date(to);
  }
  return match;
}

async function getSubtotals(collection, match) {
  const [agg] = await collection.aggregate([
    { $match: match },
    { $group: {
      _id: null,
      // Token sums
      textInputTokens:   { $sum: "$usage.textInputTokens"   },
      audioInputTokens:  { $sum: "$usage.audioInputTokens"  },
      textOutputTokens:  { $sum: "$usage.textOutputTokens"  },
      audioOutputTokens: { $sum: "$usage.audioOutputTokens" },
      thoughtsTokens:    { $sum: "$usage.thoughtsTokens"    },
      totalInputTokens:  { $sum: "$usage.totalInputTokens"  },
      totalOutputTokens: { $sum: "$usage.totalOutputTokens" },
      totalTokens:       { $sum: "$usage.totalTokens"       },
      // Cost sums
      costTextInput:     { $sum: "$cost.textInput"   },
      costAudioInput:    { $sum: "$cost.audioInput"  },
      costTextOutput:    { $sum: "$cost.textOutput"  },
      costAudioOutput:   { $sum: "$cost.audioOutput" },
      costThoughts:      { $sum: "$cost.thoughts"    },
      costTotalInput:    { $sum: { $add: ["$cost.textInput",  "$cost.audioInput"  ] } },
      costTotalOutput:   { $sum: { $add: ["$cost.textOutput", "$cost.audioOutput" ] } },
      costTotal:         { $sum: "$cost.total" },
      // Price averages (per 1K tokens)
      avgPriceTextInput:   { $avg: "$cost.pricingPer1K.textInput"   },
      avgPriceAudioInput:  { $avg: "$cost.pricingPer1K.audioInput"  },
      avgPriceTextOutput:  { $avg: "$cost.pricingPer1K.textOutput"  },
      avgPriceAudioOutput: { $avg: "$cost.pricingPer1K.audioOutput" },
      // Thoughts price derived client-side from costThoughts / thoughtsTokens
      models: { $addToSet: "$model" },
    }},
  ]).toArray();

  if (!agg) return null;

  return {
    usage: {
      textInputTokens:   agg.textInputTokens,
      audioInputTokens:  agg.audioInputTokens,
      textOutputTokens:  agg.textOutputTokens,
      audioOutputTokens: agg.audioOutputTokens,
      thoughtsTokens:    agg.thoughtsTokens,
      totalInputTokens:  agg.totalInputTokens,
      totalOutputTokens: agg.totalOutputTokens,
      totalTokens:       agg.totalTokens,
    },
    cost: {
      textInput:   agg.costTextInput,
      audioInput:  agg.costAudioInput,
      textOutput:  agg.costTextOutput,
      audioOutput: agg.costAudioOutput,
      thoughts:    agg.costThoughts,
      totalInput:  agg.costTotalInput,
      totalOutput: agg.costTotalOutput,
      total:       agg.costTotal,
    },
    avgPricing: {
      textInput:   agg.avgPriceTextInput,
      audioInput:  agg.avgPriceAudioInput,
      textOutput:  agg.avgPriceTextOutput,
      audioOutput: agg.avgPriceAudioOutput,
    },
    models: agg.models || [],
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  if (!requireDashboardSession(req, res)) return;

  const { userId, from, to, page, pageSize } = parseQuery(req);
  const match = buildMatch(userId, from, to);

  try {
    const db = await getDb();

    // ALL-users view: restrict to userIds that exist in the users collection
    if (!userId) {
      const validUsers = await db.collection("users")
        .find({}, { projection: { userId: 1 } })
        .toArray();
      match.userId = { $in: validUsers.map(u => u.userId) };
    }

    const collection = db.collection("gemini_voice_usage_events");

    const [subtotals, total] = await Promise.all([
      getSubtotals(collection, match),
      collection.countDocuments(match),
    ]);

    const allUsers  = !userId;
    const sortField = allUsers ? { userId: 1, createdAt: 1 } : { createdAt: 1 };
    const skip      = allUsers ? 0 : (page - 1) * pageSize;
    const limit     = allUsers ? 0 : pageSize;

    const cursor = collection.find(match).sort(sortField);
    if (!allUsers) cursor.skip(skip).limit(limit);
    const events = await cursor.toArray();

    const totalPages = allUsers ? 1 : Math.ceil(total / pageSize);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ events, total, subtotals, page, pageSize, totalPages }));
  } catch (e) {
    console.error("[dashboard/voice-events]", e?.message || e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}
