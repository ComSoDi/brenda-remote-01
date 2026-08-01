// api/user/plan.js
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import { switchPlan } from "../../lib/subscriptions.js";
import { PAID_PLAN_IDS } from "../../lib/plans.js";

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
    return json(res, 403, { error: "Plan selection is not available for anonymous sessions" });
  }

  const { planId } = req.body || {};
  if (!PAID_PLAN_IDS.includes(planId)) {
    return json(res, 400, { error: "Invalid planId" });
  }

  try {
    const db = await getDb();
    const sub = await switchPlan(db, s.userId, planId);
    return json(res, 200, {
      planId: sub.planId,
      planDisplayName: sub.planDisplayName,
      voiceQuota: sub.voiceQuota,
      chatQuota: sub.chatQuota,
      deferred: !!sub.deferred,
      pendingPlanId: sub.pendingPlanId || null,
      effectiveAt: sub.deferred ? sub.effectiveAt : null,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
