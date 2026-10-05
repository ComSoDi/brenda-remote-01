// api/conversation/recap.js
// POST /api/conversation/recap { cutOff, localeVariant } — called by the app
// when a TALK call ends (cutOff = ended by the silence clock). Writes the
// recap of that conversation for the next greeting — see lib/conversationRecap.js.

import { requireSession } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";
import { writeRecap } from "../../lib/conversationRecap.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  const session = requireSession(req, res);
  if (!session) return;
  if (session.isAnonymous) {
    res.statusCode = 204;
    return res.end();
  }

  const { cutOff = false, localeVariant = "en-US" } = req.body || {};
  try {
    const db = await getDb();
    const recap = await writeRecap(db, session, { cutOff: !!cutOff, localeVariant: String(localeVariant) });
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, written: !!recap }));
  } catch (e) {
    console.error("[conversation/recap]", e?.message || e);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "recap failed" }));
  }
}
