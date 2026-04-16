// api/auth/login.js
import bcrypt from "bcryptjs";
import { getDb } from "../../lib/mongo.js";
import { setSessionCookie } from "../../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function isValidUsername(u) {
  return /^[A-Za-z0-9_]{4,20}$/.test(u);
}
function isValidPin(p) {
  return /^\d{4}$/.test(p);
}

async function nextUserSuffix(db, username) {
  const key = `userSuffix:${username}`;
  const r = await db.collection("counters").findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return r.value?.seq || 1;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    // Express req.body
    const { username, pin, gender: rawGender } = req.body || {};
    const gender = ["Woman", "Man", "Other"].includes(rawGender) ? rawGender : null;

    if (!isValidUsername(username)) return json(res, 400, { error: "Invalid username" });
    if (!isValidPin(pin)) return json(res, 400, { error: "Invalid PIN" });

    const db = await getDb();
    const users = db.collection("users");

    // CRITICAL: Restore original logic with user_ prefix
    const baseUserId = `user_${username}`;
    let user = await users.findOne({ userId: baseUserId });

    if (user) {
      const ok = await bcrypt.compare(pin, user.pinHash || "");
      if (!ok) {
        // Pilot rule: new user for new Nick+PIN combo, even if username already exists.
        // Keep display username, create a unique userId suffix.
        const suffix = await nextUserSuffix(db, username);
        const userId = `user_${username}_${suffix}`;
        const pinHash = await bcrypt.hash(pin, 10);
        const now = new Date();
        user = {
          username,
          userId,
          pinHash,
          preferences: { gender: gender || null },
          createdAt: now,
          lastLogin: now,
        };
        await users.insertOne(user);
        await db.collection("conversations").insertOne({ userId, createdAt: now, updatedAt: now, messages: [] });
      } else {
        const updateFields = { lastLogin: new Date() };
        if (gender) updateFields["preferences.gender"] = gender;
        await users.updateOne({ _id: user._id }, { $set: updateFields });
        // Resolve effective gender: sent value or existing in DB
        if (!gender) user = await users.findOne({ userId: user.userId });
      }
    } else {
      const pinHash = await bcrypt.hash(pin, 10);
      const now = new Date();
      user = {
        username,
        userId: baseUserId,
        pinHash,
        preferences: { gender },
        createdAt: now,
        lastLogin: now,
      };
      await users.insertOne(user);
      await db.collection("conversations").insertOne({ userId: baseUserId, createdAt: now, updatedAt: now, messages: [] });
    }

    const effectiveGender = gender || user.preferences?.gender || null;

    setSessionCookie(res, {
      userId: user.userId,
      username: user.username,
      isAnonymous: false,
      gender: effectiveGender,
      iat: Date.now(),
    });

    return json(res, 200, {
      userId: user.userId,
      username: user.username,
      displayName: user.username,
      isAnonymous: false,
      gender: effectiveGender,
    });
  } catch (e) {
    console.error("Login error:", e);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
