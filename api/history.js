// api/history.js
import { getDb } from "../lib/mongo.js";
import { requireSession } from "../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const s = requireSession(req, res);
  if (!s) return;

  try {
    const url = new URL(req.url, "http://local");
    const limit = Math.max(0, Math.min(200, Number(url.searchParams.get("limit") || 50)));

    const db = await getDb();
    const conv = await db.collection("conversations").findOne(
      { userId: s.userId },
      { projection: { messages: { $slice: -limit } } }
    );

    const messages = conv?.messages || [];
    return json(res, 200, { userId: s.userId, messages });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
