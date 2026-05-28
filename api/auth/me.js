// api/auth/me.js
import { getSession, setSessionCookie, signSession } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  const s = getSession(req);

  // PATCH — update gender preference
  if (req.method === "PATCH") {
    if (!s?.userId || s.isAnonymous) return json(res, 401, { error: "Unauthorized" });
    const { gender } = await readBody(req);
    if (!["Woman", "Man", "Other"].includes(gender)) return json(res, 400, { error: "Invalid gender" });
    try {
      const db = await getDb();
      await db.collection("users").updateOne(
        { userId: s.userId },
        { $set: { "preferences.gender": gender } }
      );
      setSessionCookie(res, { ...s, gender, iat: Date.now() });
      return json(res, 200, { ok: true, gender });
    } catch (e) {
      console.error("[auth/me PATCH]", e.message);
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

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

  // Short-lived token (10 min) so the external voice proxy (different domain)
  // can identify the user when the HttpOnly session cookie is not sent cross-site.
  const voiceToken = !s.isAnonymous
    ? signSession({ userId: s.userId, isAnonymous: false }, 600)
    : null;

  return json(res, 200, {
    userId: s.userId,
    username: s.username || "",
    displayName: s.isAnonymous ? "anonymous" : (s.username || ""),
    isAnonymous: !!s.isAnonymous,
    gender,
    voiceProxyUrl: process.env.VOICE_PROXY_WS_URL || null,
    voiceToken,
  });
}
