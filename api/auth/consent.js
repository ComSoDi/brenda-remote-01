// api/auth/consent.js
import { requireSession } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const s = requireSession(req, res);
  if (!s) return; // requireSession already sent 401
  if (s.isAnonymous) return json(res, 400, { error: "Anonymous sessions have no consent to record" });

  try {
    const db = await getDb();
    const now = new Date();
    await db.collection("users").updateOne(
      { userId: s.userId },
      { $set: { "preferences.consentAcceptedAt": now } }
    );
    return json(res, 200, { ok: true, consentAcceptedAt: now.toISOString() });
  } catch (e) {
    console.error("[auth/consent]", e.message);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
