// api/user/usage.js
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import { getOrCreateSubscription, getUsageSinceDate, computeStatus } from "../../lib/subscriptions.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const s = requireSession(req, res);
  if (!s) return;

  if (s.isAnonymous) {
    return json(res, 403, { error: "Usage monitoring is not available for anonymous sessions" });
  }

  try {
    const db = await getDb();
    const sub = await getOrCreateSubscription(db, s.userId);
    const { voiceTokensUsed, chatTokensUsed } = await getUsageSinceDate(db, s.userId, sub.periodStartDate);

    return json(res, 200, {
      planId: sub.planId,
      planDisplayName: sub.planDisplayName,
      voiceTokensUsed,
      voiceQuota: sub.voiceQuota,
      chatTokensUsed,
      chatQuota: sub.chatQuota,
      voiceStatus: computeStatus(voiceTokensUsed, sub.voiceQuota),
      chatStatus: computeStatus(chatTokensUsed, sub.chatQuota),
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
