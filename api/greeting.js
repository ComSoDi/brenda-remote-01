// api/greeting.js
// GET  /api/greeting  — checkin (reads lastSeen, decides greeting type, writes lastSeen=now, returns pending med reminders)
// POST /api/greeting  — heartbeat (writes lastSeen=now only)

import { getDb } from "../lib/mongo.js";
import { requireSession } from "../lib/auth.js";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

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

      const user = await db.collection("users").findOne(
        { userId: session.userId },
        { projection: { lastSeen: 1 } }
      );

      const lastSeen = user?.lastSeen ? new Date(user.lastSeen) : null;
      let greetingType = "none";

      if (!lastSeen) {
        greetingType = "full";
      } else {
        const gapMs = now - lastSeen;
        if (!isSameCalendarDay(now, lastSeen)) {
          greetingType = "full";
        } else if (gapMs >= TWELVE_HOURS_MS) {
          greetingType = "short";
        }
      }

      await db.collection("users").updateOne(
        { userId: session.userId },
        { $set: { lastSeen: now } }
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

      const displayName = session.displayName || session.username || "";
      return json(res, 200, {
        greetingType,
        displayName,
        pendingReminders: pendingReminders.map(r => ({
          medicationName: r.medicationName,
          reminderType:   r.reminderType,
        })),
      });
    } catch (e) {
      console.error("[greeting/checkin]", e.message);
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: "Method not allowed" });
}
