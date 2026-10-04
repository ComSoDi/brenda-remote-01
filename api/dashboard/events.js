// api/dashboard/events.js
// Shared read-only handler behind the admin dashboard's four blocks:
//   VOICE    gemini_voice_usage_events
//   CHAT     gemini_chat_usage_events   (feature ≠ "news")
//   NEWS     gemini_chat_usage_events   (feature = "news": headlines, tap reaction, news greeting)
//   CLEAN-UP gemini_cleanup_usage_events (housekeeping — costed, not charged)
// Every block converts usage to money the same way (tokens + Google Search
// fees), so they compare like for like.

import { requireDashboardSession } from "../../lib/dashboard-auth.js";
import { getDb } from "../../lib/mongo.js";

const PAGE_SIZE = 50;

export const BLOCKS = {
  voice:   { collection: "gemini_voice_usage_events",   match: {} },
  chat:    { collection: "gemini_chat_usage_events",    match: { feature: { $ne: "news" } } },
  news:    { collection: "gemini_chat_usage_events",    match: { feature: "news" } },
  cleanup: { collection: "gemini_cleanup_usage_events", match: {}, noPlan: true },
};

function parseQuery(req) {
  const url      = new URL(req.url, `http://${req.headers.host}`);
  const userId   = url.searchParams.get("userId") || null;
  const planId   = url.searchParams.get("planId") || null;
  const from     = url.searchParams.get("from")   || null;
  const to       = url.searchParams.get("to")     || null;
  const page     = Math.max(1, parseInt(url.searchParams.get("page")     || "1",  10));
  const pageSize = Math.max(1, parseInt(url.searchParams.get("pageSize") || String(PAGE_SIZE), 10));
  return { userId, planId, from, to, page, pageSize };
}

function buildMatch(block, { userId, planId, from, to }) {
  const match = { ...block.match };
  if (userId) match.userId = userId;
  // Clean-up rows aren't billed to a plan, so the plan filter doesn't apply.
  if (planId && !block.noPlan) match.planId = planId;
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
      // Google Search
      searches:          { $sum: { $ifNull: ["$usage.searches", 0] } },
      searchBrendys:     { $sum: { $ifNull: ["$usage.searchBrendys", 0] } },
      // Cost sums
      costTextInput:     { $sum: "$cost.textInput"   },
      costAudioInput:    { $sum: "$cost.audioInput"  },
      costTextOutput:    { $sum: "$cost.textOutput"  },
      costAudioOutput:   { $sum: "$cost.audioOutput" },
      costThoughts:      { $sum: "$cost.thoughts"    },
      costSearch:        { $sum: { $ifNull: ["$cost.search", 0] } },
      costTotalInput:    { $sum: { $add: ["$cost.textInput",  "$cost.audioInput"  ] } },
      costTotalOutput:   { $sum: { $add: ["$cost.textOutput", "$cost.audioOutput" ] } },
      costTotal:         { $sum: "$cost.total" },
      // Price averages (per 1K tokens; search = per search)
      // Thoughts price derived client-side from costThoughts / thoughtsTokens
      avgPriceTextInput:   { $avg: "$cost.pricingPer1K.textInput"   },
      avgPriceAudioInput:  { $avg: "$cost.pricingPer1K.audioInput"  },
      avgPriceTextOutput:  { $avg: "$cost.pricingPer1K.textOutput"  },
      avgPriceAudioOutput: { $avg: "$cost.pricingPer1K.audioOutput" },
      avgPriceSearch:      { $avg: "$search.unitPrice" },
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
      searches:          agg.searches,
      searchBrendys:     agg.searchBrendys,
    },
    cost: {
      textInput:   agg.costTextInput,
      audioInput:  agg.costAudioInput,
      textOutput:  agg.costTextOutput,
      audioOutput: agg.costAudioOutput,
      thoughts:    agg.costThoughts,
      search:      agg.costSearch,
      totalInput:  agg.costTotalInput,
      totalOutput: agg.costTotalOutput,
      total:       agg.costTotal,
    },
    avgPricing: {
      textInput:   agg.avgPriceTextInput,
      audioInput:  agg.avgPriceAudioInput,
      textOutput:  agg.avgPriceTextOutput,
      audioOutput: agg.avgPriceAudioOutput,
      search:      agg.avgPriceSearch,
    },
    models: agg.models || [],
  };
}

export function makeEventsHandler(type) {
  const block = BLOCKS[type];
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    if (!requireDashboardSession(req, res)) return;

    const q = parseQuery(req);
    const match = buildMatch(block, q);
    const { userId, page, pageSize } = q;

    try {
      const db = await getDb();

      // ALL-users view: restrict to userIds that exist in the users collection
      if (!userId) {
        const validUsers = await db.collection("users")
          .find({}, { projection: { userId: 1 } })
          .toArray();
        match.userId = { $in: validUsers.map(u => u.userId) };
      }

      const collection = db.collection(block.collection);

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
      console.error(`[dashboard/${type}-events]`, e?.message || e);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal error" }));
    }
  };
}
