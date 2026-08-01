import { requireDashboardSession } from "../../lib/dashboard-auth.js";
import { getDb } from "../../lib/mongo.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  if (!requireDashboardSession(req, res)) return;

  try {
    const db    = await getDb();
    const users = await db.collection("users")
      .find({}, { projection: { userId: 1, username: 1, displayName: 1, isAnonymous: 1 } })
      .toArray();

    const result = users
      .map((u) => ({
        userId:      u.userId,
        // Every anonymous account shares the literal username "anonymous", so it
        // can never be used as a display label — fall back straight to the
        // unique userId suffix (e.g. "anonymous_000042") for those instead.
        displayName: u.isAnonymous
          ? u.userId.replace(/^user_/, "")
          : (u.displayName || u.username || u.userId.replace(/^user_/, "")),
        isAnonymous: !!u.isAnonymous,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (e) {
    console.error("[dashboard/users]", e?.message || e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}
