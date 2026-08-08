// api/rds/topic-starter.js
// POST /api/rds/topic-starter — generate a progressive RDS conversation starter

import { getDb } from "../../lib/mongo.js";
import { requireSession } from "../../lib/auth.js";
import { getTopicStarterContext, recordTopicAngle } from "../../lib/rdsService.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const session = requireSession(req, res);
  if (!session) return;
  if (session.isAnonymous) return json(res, 403, { error: "RDS requires a logged-in account." });

  const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
  const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
  if (!GEMINI_API_KEY) return json(res, 500, { error: "GEMINI_API_KEY not set" });

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

  const subject       = String(body.subject       || "something interesting").trim();
  const localeVariant = String(body.localeVariant || "en-US").trim();
  const isSpanish     = localeVariant.toLowerCase().startsWith("es");

  try {
    const db = await getDb();
    const { allObservations, pastAngles } = await getTopicStarterContext(db, session.userId, subject);

    const hasContext    = allObservations.length > 0;
    const hasPastAngles = pastAngles.length > 0;

    const observationsBlock = hasContext
      ? `\nWhat this person has shared in past conversations:\n${allObservations.map(o => `- ${o}`).join("\n")}`
      : "";

    const pastAnglesBlock = hasPastAngles
      ? `\nAngles already introduced in previous sessions — DO NOT repeat or reference these:\n${pastAngles.map(a => `- ${a}`).join("\n")}`
      : "";

    const jobInstruction = hasContext
      ? "Using the context above, generate a specific conversation opener that goes DEEPER into the topic or introduces an ADJACENT element (a related person, work, historical influence, technique, or cultural angle). Do NOT simply restate the topic label. Build on what is already known about this person."
      : "Generate a specific, interesting angle on this topic — a concrete fact, reference, or cultural observation. Do NOT just restate the topic name.";

    const prompt = [
      "You are generating a conversation opener for a friendly AI companion. The opener must be specific and grounded, not generic.",
      "",
      `Topic: "${subject}"`,
      observationsBlock,
      pastAnglesBlock,
      "",
      jobInstruction,
      "",
      "Return ONLY valid JSON (no prose, no code fences):",
      `{"statement":"Content only — a specific fact or observation, under 40 words, no opening phrase.","question":"A natural follow-up question, under 20 words.","angle":"3-7 word summary of the specific angle introduced (for internal tracking)."}`,
      "",
      isSpanish ? "Write in Spanish." : "Write in English.",
      'Avoid generic openers like "Did you know", "Have you heard about", or "It\'s interesting that".',
    ].filter(Boolean).join("\n");

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("[rds/topic-starter] Gemini error:", geminiRes.status, errText.slice(0, 200));
      return json(res, 502, { error: "AI generation failed" });
    }

    const geminiData = await geminiRes.json();
    const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const stripped  = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonStart = stripped.indexOf("{");
    const jsonEnd   = stripped.lastIndexOf("}");
    const jsonStr   = jsonStart >= 0 && jsonEnd > jsonStart
      ? stripped.slice(jsonStart, jsonEnd + 1)
      : stripped;

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[rds/topic-starter] JSON parse failed:", jsonStr.slice(0, 200));
      return json(res, 200, {
        statement: isSpanish ? `sobre ${subject}.` : `about ${subject}.`,
        question:  isSpanish ? "¿Qué opinas tú?" : "What do you think?",
      });
    }

    const statement = String(parsed.statement || "").trim();
    const question  = String(parsed.question  || "").trim();
    const angle     = String(parsed.angle     || statement.split(" ").slice(0, 6).join(" ")).trim();

    if (angle) {
      recordTopicAngle(db, session.userId, subject, angle).catch(e =>
        console.error("[rds/topic-starter] recordTopicAngle failed:", e.message)
      );
    }

    return json(res, 200, {
      statement: statement || (isSpanish ? `sobre ${subject}.` : `about ${subject}.`),
      question:  question  || (isSpanish ? "¿Qué opinas tú?" : "What's your take on it?"),
    });

  } catch (e) {
    console.error("[rds/topic-starter]", e?.message || e);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
