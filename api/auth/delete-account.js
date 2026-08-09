// api/auth/delete-account.js
import bcrypt from "bcryptjs";
import { requireSession, setSessionCookie } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// Same normalization login.js uses, duplicated here so a typo'd re-entry
// can't be compared case/accent-sensitively against the stored username.
function normalizeUsername(raw) {
  const ascii = String(raw || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .trim();
  if (!ascii) return "";
  return ascii.charAt(0).toUpperCase() + ascii.slice(1).toLowerCase();
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
  if (s.isAnonymous) return json(res, 400, { error: "Anonymous sessions have no account to delete" });

  try {
    const db = await getDb();
    const userId = s.userId;
    const now = new Date();

    // Re-verify the account's own Nick + PIN before doing anything
    // irreversible — the session alone isn't enough for this action.
    const { username: rawUsername, pin } = req.body || {};
    const currentUser = await db.collection("users").findOne(
      { userId },
      { projection: { username: 1, pinHash: 1 } }
    );
    const usernameOk = currentUser && normalizeUsername(rawUsername) === currentUser.username;
    const pinOk = currentUser && (await bcrypt.compare(String(pin || ""), currentUser.pinHash || ""));
    if (!usernameOk || !pinOk) {
      return json(res, 400, { error: "Nick and PIN are not recognized" });
    }

    // Subscription/billing and usage-tracking history are deliberately left
    // untouched (kept for accounting), so only these collections get wiped.
    const tasks = await db.collection("tasks")
      .find({ userId }, { projection: { id: 1 } })
      .toArray();
    const taskIds = tasks.map((t) => t.id).filter(Boolean);

    await db.collection("conversations").deleteOne({ userId });
    await db.collection("tasks").deleteMany({ userId });
    await db.collection("task_reminders").deleteMany({ userId });
    if (taskIds.length) {
      await db.collection("task_schedule_sync").deleteMany({ taskId: { $in: taskIds } });
    }
    await db.collection("rds_profiles").deleteOne({ userId });
    await db.collection("ai_categories").deleteOne({ userId });

    // Scrub the user doc down to the retained fields — pinHash cleared means
    // this userId can never log back in; a future signup with the same
    // username just mints a new suffixed account (existing login.js logic).
    await db.collection("users").updateOne(
      { userId },
      {
        $set: {
          pinHash: null,
          userAccountStatus: "Inactive",
          "preferences.deleteAccountAcceptedAt": now,
        },
        $unset: {
          "preferences.location": "",
        },
      }
    );

    // Start a fresh anonymous session (mirrors /api/auth/anonymous).
    const seq = await nextAnonSeq(db);
    const num = String(seq).padStart(6, "0");
    const anonUserId = `user_anonymous_${num}`;

    await db.collection("users").insertOne({
      username: "anonymous",
      userId: anonUserId,
      pinHash: null,
      createdAt: now,
      lastLogin: now,
      isAnonymous: true,
      userAccountStatus: "Active",
    });

    await db.collection("conversations").insertOne({
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
    console.error("[auth/delete-account]", e.message);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
