// api/user/usage.js
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import { getEffectiveUsage, getPlan } from "../../lib/subscriptions.js";

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
    const eu = await getEffectiveUsage(db, s.userId);
    const { sub, voice, chat } = eu;

    let pendingPlanDisplayName = null;
    if (sub.pendingPlanId) {
      const pendingPlan = await getPlan(db, sub.pendingPlanId);
      pendingPlanDisplayName = pendingPlan?.displayName || sub.pendingPlanId;
    }

    return json(res, 200, {
      planId: sub.planId,
      planDisplayName: sub.planDisplayName,

      // Back-compat: `*Quota` is the spendable ceiling for the period
      // (plan allowance + top-up balance), `*TokensUsed` is period usage,
      // `*Status` flips to "exhausted" only when BOTH are spent.
      voiceTokensUsed: voice.used,
      voiceQuota: voice.ceiling,
      voiceStatus: voice.status,
      chatTokensUsed: chat.used,
      chatQuota: chat.ceiling,
      chatStatus: chat.status,

      // Transparent split — subscription vs non-expiring top-up.
      voicePlanQuota: voice.planQuota,
      voicePlanRemaining: voice.planRemaining,
      voiceTopUpRemaining: voice.topUpRemaining,
      voiceTotalRemaining: voice.totalRemaining,
      chatPlanQuota: chat.planQuota,
      chatPlanRemaining: chat.planRemaining,
      chatTopUpRemaining: chat.topUpRemaining,
      chatTotalRemaining: chat.totalRemaining,

      pendingPlanId: sub.pendingPlanId || null,
      pendingPlanDisplayName,
      periodEndDate: sub.periodEndDate,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
