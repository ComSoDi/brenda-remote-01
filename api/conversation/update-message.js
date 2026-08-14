// api/conversation/update-message.js
// Updates the content of an already-appended conversation message in place —
// used to persist the corrected version of a voice transcript once
// /api/transcript/correct resolves, after the raw (fragmented) version has
// already been saved via /api/conversation/append.
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function processBody(parsed, s, res) {
  try {
    const id = String(parsed?.id || "");
    const content = String(parsed?.content ?? "");
    if (!id || !content) return json(res, 400, { error: "id and content required" });

    const db = await getDb();
    const result = await db.collection("conversations").updateOne(
      { userId: s.userId, "messages.id": id },
      { $set: { "messages.$.content": content, updatedAt: new Date() } }
    );

    return json(res, 200, { ok: true, matched: result.matchedCount });
  } catch (e) {
    console.error("❌ [conversation/update-message]", e);
    return json(res, 500, { error: e?.message || String(e) });
  }
}

export default async function handler(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  if (req.body && typeof req.body === "object") {
    await processBody(req.body, s, res);
  } else {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        await processBody(parsed, s, res);
      } catch (e) {
        return json(res, 400, { error: "Invalid JSON body" });
      }
    });
  }
}
