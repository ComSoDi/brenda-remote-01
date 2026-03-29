// api/conversation/append.js - WITH DEBUGGING
import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function normalizeMessage(m) {
  const id = String(m.id || "");
  const role = m.role === "assistant" ? "assistant" : "user";
  const content = String(m.content ?? m.text ?? "");
  const timestamp = m.timestamp ? String(m.timestamp) : new Date().toISOString();
  
  // Accept fromChannel directly, or derive from channel for backward compatibility
  const fromChannel = m.fromChannel || (m.channel === "voice" ? "voice" : (m.channel === "video" ? "video" : "text"));
  
  return { id, role, content, timestamp, fromChannel };
}

async function processBody(parsed, s, res) {
  try {
    const arr = Array.isArray(parsed.messages) ? parsed.messages : (parsed.message ? [parsed.message] : []);
    if (!arr.length) return json(res, 400, { error: "No messages provided" });

    const messages = arr.map(normalizeMessage).filter((m) => m.id && m.content);

    if (!messages.length) return json(res, 400, { error: "No valid messages" });

    const db = await getDb();
    const now = new Date();

    await db.collection("conversations").updateOne(
      { userId: s.userId },
      {
        $setOnInsert: { userId: s.userId, createdAt: now, messages: [] },
        $set: { updatedAt: now },
        $push: { messages: { $each: messages } },
      },
      { upsert: true }
    );

    return json(res, 200, { ok: true, appended: messages.length });
  } catch (e) {
    console.error('❌ ERROR:', e);
    return json(res, 500, { error: e?.message || String(e) });
  }
}

export default async function handler(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // If Express (local dev) has already parsed the body, use it directly.
  // Otherwise read the raw stream (Vercel serverless).
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
