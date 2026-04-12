// api/auth/me.js
import { getSession } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const s = getSession(req);
  if (!s?.userId) return json(res, 200, { userId: null });

  // Fetch gender from DB (session cookies pre-dating this field won't have it)
  let gender = s.gender || null;
  if (!gender && !s.isAnonymous) {
    try {
      const db = await getDb();
      const user = await db.collection("users").findOne(
        { userId: s.userId },
        { projection: { "preferences.gender": 1 } }
      );
      gender = user?.preferences?.gender || null;
    } catch {
      // non-fatal — gender stays null
    }
  }

  return json(res, 200, {
    userId: s.userId,
    username: s.username || "",
    displayName: s.isAnonymous ? "anonymous" : (s.username || ""),
    isAnonymous: !!s.isAnonymous,
    gender,
  });
}
