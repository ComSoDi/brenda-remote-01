// api/greeting.js
// GET  /api/greeting  — checkin (reads lastSeen, decides greeting type, writes lastSeen=now, returns pending med reminders)
// POST /api/greeting  — heartbeat (writes lastSeen=now only)

import { getDb } from "../lib/mongo.js";
import { requireSession } from "../lib/auth.js";
import { getRdsProfile, incrementRdsSession, setDeclaredInterests } from "../lib/rdsService.js";

// Same-day "Hey!" once a few hours have passed (after lunch, late afternoon, that night).
const SAME_DAY_SHORT_GREETING_GAP_MS = 3 * 60 * 60 * 1000;
// Fallback new-day threshold, only used if an older client doesn't send localDay.
const FALLBACK_NEW_DAY_GAP_MS = 8 * 60 * 60 * 1000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  // POST — heartbeat
  if (req.method === "POST") {
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

  // GET — checkin
  if (req.method === "GET") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const db  = await getDb();
      const now = new Date();

      // Client sends its own local "day bucket" (YYYY-MM-DD, already rolled back
      // for hours before 2am so a late-night tail counts as the day before) since
      // only the client reliably knows the user's local calendar day.
      const url     = new URL(req.url, `http://${req.headers.host}`);
      const localDay = url.searchParams.get("localDay") || null;

      const user = await db.collection("users").findOne(
        { userId: session.userId },
        { projection: { lastSeen: 1, lastSeenLocalDay: 1 } }
      );

      const lastSeen = user?.lastSeen ? new Date(user.lastSeen) : null;
      let greetingType = "none";

      if (!lastSeen) {
        greetingType = "full";
      } else {
        const gapMs = now - lastSeen;
        const isNewDay = localDay
          ? localDay !== user.lastSeenLocalDay
          : gapMs >= FALLBACK_NEW_DAY_GAP_MS;

        if (isNewDay) {
          greetingType = "full";
        } else if (gapMs >= SAME_DAY_SHORT_GREETING_GAP_MS) {
          greetingType = "short";
        }
      }

      await db.collection("users").updateOne(
        { userId: session.userId },
        { $set: { lastSeen: now, ...(localDay ? { lastSeenLocalDay: localDay } : {}) } }
      );

      // Fetch and mark-delivered any pending medication reminders
      let pendingReminders = [];
      try {
        pendingReminders = await db.collection("medication_reminders")
          .find({ userId: session.userId, delivered: false })
          .sort({ dueAt: 1 })
          .toArray();

        if (pendingReminders.length > 0) {
          const ids = pendingReminders.map(r => r._id);
          await db.collection("medication_reminders").updateMany(
            { _id: { $in: ids } },
            { $set: { delivered: true, deliveredAt: now } }
          );
        }
      } catch {
        // non-fatal — proceed without reminders
      }

      // RDS: load profile, set intro flag, increment session counter
      let rdsIntroNeeded = false;
      let declaredInterests = [];
      if (!session.isAnonymous) {
        try {
          const rdsProfile = await getRdsProfile(db, session.userId);
          rdsIntroNeeded = !rdsProfile.introShown;
          declaredInterests = rdsProfile.declaredInterests || [];
          await incrementRdsSession(db, session.userId);
        } catch (e) { console.error("[greeting/rds]", e.message); }
      }

      const displayName = session.displayName || session.username || "";
      return json(res, 200, {
        greetingType,
        displayName,
        pendingReminders: pendingReminders.map(r => ({
          medicationName: r.medicationName,
          reminderType:   r.reminderType,
        })),
        rdsIntroNeeded,
        declaredInterests,
      });
    } catch (e) {
      console.error("[greeting/checkin]", e.message);
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: "Method not allowed" });
}
