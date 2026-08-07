// api/auth/policy-accept.js
import { requireSession } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // Available to anonymous sessions too — the privacy policy is viewable by
  // anyone, not gated behind a named account like consent/talk-disclaimer.
  const s = requireSession(req, res);
  if (!s) return; // requireSession already sent 401

  try {
    const db = await getDb();
    const users = db.collection("users");
    const now = new Date();

    // Write-once: only set it the first time — never overwritten on repeat visits.
    const updated = await users.findOneAndUpdate(
      {
        userId: s.userId,
        $or: [
          { "preferences.policyAcceptedAt": null },
          { "preferences.policyAcceptedAt": { $exists: false } },
        ],
      },
      { $set: { "preferences.policyAcceptedAt": now } },
      { returnDocument: "after" }
    );

    let policyAcceptedAt = updated?.preferences?.policyAcceptedAt;
    if (!policyAcceptedAt) {
      const existing = await users.findOne(
        { userId: s.userId },
        { projection: { "preferences.policyAcceptedAt": 1 } }
      );
      policyAcceptedAt = existing?.preferences?.policyAcceptedAt || now;
    }

    return json(res, 200, {
      ok: true,
      policyAcceptedAt: policyAcceptedAt.toISOString ? policyAcceptedAt.toISOString() : policyAcceptedAt,
    });
  } catch (e) {
    console.error("[auth/policy-accept]", e.message);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
