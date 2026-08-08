// api/auth/anonymous.js
import { getDb } from "../../lib/mongo.js";
import { setSessionCookie } from "../../lib/auth.js";

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

  try {
    const db = await getDb();
    const seq = await nextAnonSeq(db);
    const num = String(seq).padStart(6, "0");
    const userId = `user_anonymous_${num}`;
    const username = "anonymous";
    const now = new Date();

    await db.collection("users").insertOne({
      username,
      userId,
      pinHash: null,
      createdAt: now,
      lastLogin: now,
      isAnonymous: true,
      userAccountStatus: "Active",
    });

    await db.collection("conversations").insertOne({
      userId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    });

    setSessionCookie(res, { userId, username, isAnonymous: true, iat: Date.now() });

    return json(res, 200, {
      userId,
      username,
      displayName: "anonymous",
      isAnonymous: true,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
