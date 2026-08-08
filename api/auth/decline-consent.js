// api/auth/decline-consent.js
import { requireSession, setSessionCookie } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function nextAnonSeq(db) {
  const r = await db.collection("counters").findOneAndUpdate(
    { _id: "anonymousUserSeq" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return r.seq || 1;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const s = requireSession(req, res);
  if (!s) return; // requireSession already sent 401
  if (s.isAnonymous) return json(res, 400, { error: "Anonymous sessions have nothing to decline" });

  try {
    const db = await getDb();
    const users = db.collection("users");
    const conversations = db.collection("conversations");

    // Only erase the declined account if it has never actually been used —
    // a returning account with real message history is never deleted, just
    // logged out of (it stays unconsented in Mongo for next time).
    const convo = await conversations.findOne(
      { userId: s.userId },
      { projection: { messages: 1 } }
    );
    const isUnused = !convo || !Array.isArray(convo.messages) || convo.messages.length === 0;

    if (isUnused) {
      await users.deleteOne({ userId: s.userId });
      await conversations.deleteOne({ userId: s.userId });
    }

    // Start a fresh anonymous session (mirrors /api/auth/anonymous).
    const seq = await nextAnonSeq(db);
    const num = String(seq).padStart(6, "0");
    const anonUserId = `user_anonymous_${num}`;
    const now = new Date();

    await users.insertOne({
      username: "anonymous",
      userId: anonUserId,
      pinHash: null,
      createdAt: now,
      lastLogin: now,
      isAnonymous: true,
      userAccountStatus: "Active",
    });

    await conversations.insertOne({
      userId: anonUserId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    });

    setSessionCookie(res, { userId: anonUserId, username: "anonymous", isAnonymous: true, iat: Date.now() });

    return json(res, 200, {
      userId: anonUserId,
      username: "anonymous",
      displayName: "anonymous",
      isAnonymous: true,
    });
  } catch (e) {
    console.error("[auth/decline-consent]", e.message);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
