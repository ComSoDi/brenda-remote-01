// api/rds/interests.js
// GET  /api/rds/interests  — return current declaredInterests for the session user
// POST /api/rds/interests  — replace declaredInterests array (up to 5 items)

import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import { getRdsProfile, setDeclaredInterests } from "../../lib/rdsService.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (session.isAnonymous) return json(res, 403, { error: "Declared interests require a logged-in account." });

  const db = await getDb();

  if (req.method === "GET") {
    try {
      const profile = await getRdsProfile(db, session.userId);
      return json(res, 200, { ok: true, interests: profile.declaredInterests || [] });
    } catch (e) {
      console.error("[rds/interests] GET error:", e.message);
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (!body || typeof body !== "object") {
        let raw = "";
        await new Promise((resolve, reject) => {
          req.on("data", c => (raw += c));
          req.on("end", resolve);
          req.on("error", reject);
        });
        body = JSON.parse(raw || "{}");
      }

      const raw = body.interests;
      if (!Array.isArray(raw)) return json(res, 400, { error: "interests must be an array" });
      if (raw.length > 5) return json(res, 400, { error: "maximum 5 interests" });

      const saved = await setDeclaredInterests(db, session.userId, raw);
      console.log("[rds/interests] saved for", session.userId, ":", saved);
      return json(res, 200, { ok: true, interests: saved });
    } catch (e) {
      console.error("[rds/interests] POST error:", e.message);
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: "Method not allowed" });
}
