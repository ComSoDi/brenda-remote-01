// api/plans.js
import { getDb } from "../lib/mongo.js";
import { requireSession } from "../lib/auth.js";

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

  try {
    const db = await getDb();
    const plans = await db
      .collection("plans")
      .find({ isActive: true })
      .sort({ sortOrder: 1 })
      .toArray();

    return json(res, 200, { plans });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
