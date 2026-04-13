// api/greeting/checkin.js  — Vercel serverless route for GET /api/greeting/checkin
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";

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

/**
 * GET /api/greeting/checkin
 *
 * Decision table:
 *   lastSeen is null            → "full"   (first-ever use)
 *   different calendar day      → "full"   (new day)
 *   same day  && gap >= 12 h    → "short"  (came back later same day)
 *   same day  && gap <  12 h    → "none"
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

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

    return json(res, 200, { greetingType, displayName: session.displayName || session.username || "" });
  } catch (e) {
    console.error("[greeting/checkin]", e.message);
    return json(res, 500, { error: e.message });
  }
}
