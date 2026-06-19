// api/rds/state.js
// GET  /api/rds/state  → { ok, narrative }          (memory summary for "what do you remember?")
// POST /api/rds/state  → { action, [description] }  actions: "intro-shown" | "forget"

import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import {
  getRdsProfile,
  markRdsIntroShown,
  removeRdsItem,
  buildMemoryNarrative,
} from "../../lib/rdsService.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  if (session.isAnonymous) return json(res, 403, { error: "RDS is not available for anonymous sessions" });

  const db = await getDb();
  const localeVariant = req.headers["x-locale"] || "en-US";
  const username = session.displayName || session.username || "";

  if (req.method === "GET") {
    const profile = await getRdsProfile(db, session.userId);
    const narrative = buildMemoryNarrative(profile, localeVariant, username);
    return json(res, 200, { ok: true, narrative });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const action = String(body.action || "").trim();
    console.log("[rds/state] POST userId:", session.userId, "action:", action);

    if (action === "intro-shown") {
      try {
        await markRdsIntroShown(db, session.userId);
        console.log("[rds/state] introShown set to true for", session.userId);
      } catch (e) {
        console.error("[rds/state] markRdsIntroShown failed:", e.message);
        return json(res, 500, { error: e.message });
      }
      return json(res, 200, { ok: true });
    }

    if (action === "forget") {
      const description = String(body.description || "").trim();
      if (!description) return json(res, 400, { error: "description is required" });
      const removed = await removeRdsItem(db, session.userId, description);
      return json(res, 200, { ok: true, removedCount: removed.length });
    }

    return json(res, 400, { error: `Unknown action: ${action}` });
  }

  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { error: "Method not allowed" });
}
