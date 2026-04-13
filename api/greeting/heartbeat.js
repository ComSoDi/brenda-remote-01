// api/greeting/heartbeat.js  — Vercel serverless route for POST /api/greeting/heartbeat
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * POST /api/greeting/heartbeat
 *
 * Called periodically while the session is open and via sendBeacon on tab hide.
 * Keeps lastSeen current so the next checkin can compute the gap correctly.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const db = await getDb();
    await db.collection("users").updateOne(
      { userId: session.userId },
      { $set: { lastSeen: new Date() } }
    );
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("[greeting/heartbeat]", e.message);
    return json(res, 500, { error: e.message });
  }
}
