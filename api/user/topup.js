// api/user/topup.js
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import { addTopUp } from "../../lib/subscriptions.js";

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
    const sub = await addTopUp(db, s.userId);
    return json(res, 200, {
      planId: sub.planId,
      planDisplayName: sub.planDisplayName,
      voiceQuota: sub.voiceQuota,
      chatQuota: sub.chatQuota,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
