// api/greeting.js
// Greeting check-in and heartbeat handlers.
//
// GET  /api/greeting/checkin  — reads lastSeen, decides greeting type, writes lastSeen = now.
// POST /api/greeting/heartbeat — writes lastSeen = now only (called periodically + on tab hide).

import { getDb } from "../lib/mongo.js";
import { requireSession } from "../lib/auth.js";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Returns true when two Date objects fall on the same calendar day (local time).
 * @param {Date} a
 * @param {Date} b
 */
function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

/**
 * GET /api/greeting/checkin
 *
 * Decision table:
 *   lastSeen is null            → "full"   (first-ever use)
 *   different calendar day      → "full"   (new day, e.g. 10:14 pm → 5:21 am next day)
 *   same day  && gap >= 8 h     → "short"  (came back later same day)
 *   same day  && gap <  8 h     → "none"   (already greeted recently)
 *
 * Immediately writes lastSeen = now so that rapid re-opens within the session
 * don't re-trigger the greeting.
 *
 * Returns: { greetingType: "full"|"short"|"none", displayName: string }
 */
export async function greetingCheckin(req, res) {
  const session = requireSession(req, res);
  if (!session) return; // requireSession already sent 401

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
      // First-ever session for this user — full greeting.
      greetingType = "full";
    } else {
      const gapMs = now - lastSeen;

      if (!isSameCalendarDay(now, lastSeen)) {
        // Crossed midnight → welcome back with a full greeting regardless of gap.
        greetingType = "full";
      } else if (gapMs >= TWELVE_HOURS_MS) {
        // Same calendar day but been away 8+ hours → brief "welcome back".
        greetingType = "short";
      }
      // else: same day, gap < 8 h → greetingType stays "none"
    }

    // Write lastSeen immediately so rapid re-opens won't re-trigger a greeting.
    await db.collection("users").updateOne(
      { userId: session.userId },
      { $set: { lastSeen: now } }
    );

    const displayName = session.displayName || session.username || "";
    res.json({ greetingType, displayName });
  } catch (e) {
    console.error("[greeting/checkin]", e.message);
    res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/greeting/heartbeat
 *
 * Called every 30 minutes while the session is open, and also via
 * navigator.sendBeacon() when the page-visibility changes to "hidden".
 * Keeps lastSeen current so the next session open can compute the gap correctly.
 *
 * Returns: { ok: true }
 */
export async function greetingHeartbeat(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const db = await getDb();
    await db.collection("users").updateOne(
      { userId: session.userId },
      { $set: { lastSeen: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[greeting/heartbeat]", e.message);
    res.status(500).json({ error: e.message });
  }
}
