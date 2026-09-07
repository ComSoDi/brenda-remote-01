// api/user/topup.js
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import { addTopUp, getEffectiveUsage } from "../../lib/subscriptions.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const s = requireSession(req, res);
  if (!s) return;

  if (s.isAnonymous) {
    return json(res, 403, { error: "Top-up is not available for anonymous sessions" });
  }

  try {
    const db = await getDb();
    await addTopUp(db, s.userId, {
      localeVariant: req.body?.localeVariant,
      username: s.displayName || s.username,
    });
    // Report the fresh effective picture so the client can update the bars
    // without a second round-trip.
    const eu = await getEffectiveUsage(db, s.userId);
    return json(res, 200, {
      planId: eu.planId,
      planDisplayName: eu.planDisplayName,
      voiceQuota: eu.voice.ceiling,
      chatQuota: eu.chat.ceiling,
      voicePlanQuota: eu.voice.planQuota,
      chatPlanQuota: eu.chat.planQuota,
      voiceTopUpRemaining: eu.voice.topUpRemaining,
      chatTopUpRemaining: eu.chat.topUpRemaining,
      voiceTotalRemaining: eu.voice.totalRemaining,
      chatTotalRemaining: eu.chat.totalRemaining,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
