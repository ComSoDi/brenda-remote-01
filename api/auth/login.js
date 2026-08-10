// api/auth/login.js
import bcrypt from "bcryptjs";
import { getDb } from "../../lib/mongo.js";
import { setSessionCookie } from "../../lib/auth.js";

const MAX_PIN_ATTEMPTS = 3;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// Normalize to Proper case, ASCII only (strips accents/UTF-8)
function normalizeUsername(raw) {
  const ascii = String(raw || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .trim();
  if (!ascii) return "";
  return ascii.charAt(0).toUpperCase() + ascii.slice(1).toLowerCase();
}

function isValidUsername(u) {
  return /^[A-Za-z0-9_]{4,20}$/.test(u);
}
function isValidPin(p) {
  return /^\d{4}$/.test(p);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    // Express req.body
    const { username: rawUsername, pin, gender: rawGender } = req.body || {};
    const username = normalizeUsername(rawUsername);
    const gender = ["Woman", "Man", "Other"].includes(rawGender) ? rawGender : null;

    if (!isValidUsername(username)) return json(res, 400, { error: "Invalid username" });
    if (!isValidPin(pin)) return json(res, 400, { error: "Invalid PIN" });

    const db = await getDb();
    const users = db.collection("users");

    // CRITICAL: Restore original logic with user_ prefix
    const baseUserId = `user_${username}`;
    let user = await users.findOne({ userId: baseUserId });

    if (user) {
      // Nick is taken. Hard-locked accounts reject every attempt — right or
      // wrong PIN — until manually cleared, so a forgetful/mistaken PIN can
      // never silently spawn a duplicate account (see login decision tree).
      const failedAttempts = user.preferences?.failedPinAttempts || 0;
      if (failedAttempts >= MAX_PIN_ATTEMPTS) {
        return json(res, 423, { error: "To recover your account, please email support@comerciosocialdigital.com" });
      }

      const ok = await bcrypt.compare(pin, user.pinHash || "");
      if (!ok) {
        const newCount = failedAttempts + 1;
        const updateFields = { "preferences.failedPinAttempts": newCount };
        if (newCount >= MAX_PIN_ATTEMPTS) updateFields["preferences.lockedAt"] = new Date();
        await users.updateOne({ _id: user._id }, { $set: updateFields });

        if (newCount >= MAX_PIN_ATTEMPTS) {
          return json(res, 423, { error: "To recover your account, please email support@comerciosocialdigital.com" });
        }
        return json(res, 401, { error: "Wrong PIN or Nick is taken. Please try again." });
      }

      const updateFields = {
        lastLogin: new Date(),
        "preferences.failedPinAttempts": 0,
        "preferences.lockedAt": null,
      };
      if (gender) updateFields["preferences.gender"] = gender;
      await users.updateOne({ _id: user._id }, { $set: updateFields });
      // Resolve effective fields (including the reset counters) from a fresh read
      user = await users.findOne({ userId: user.userId });
    } else {
      const pinHash = await bcrypt.hash(pin, 10);
      const now = new Date();
      user = {
        username,
        userId: baseUserId,
        pinHash,
        preferences: {
          gender,
          consentAcceptedAt: null,
          talkDisclaimerAcceptedAt: null,
          policyAcceptedAt: null,
          failedPinAttempts: 0,
          lockedAt: null,
        },
        createdAt: now,
        lastLogin: now,
        userAccountStatus: "Active",
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
      consentAcceptedAt: user.preferences?.consentAcceptedAt || null,
      talkDisclaimerAcceptedAt: user.preferences?.talkDisclaimerAcceptedAt || null,
      policyAcceptedAt: user.preferences?.policyAcceptedAt || null,
    });
  } catch (e) {
    console.error("Login error:", e);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
