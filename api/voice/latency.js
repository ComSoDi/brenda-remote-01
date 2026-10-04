// api/voice/latency.js
// POST /api/voice/latency — one TALK turn's wait AS THE USER FEELS IT, measured
// on the device by public/vad-stopwatch.js ("stopped talking" → Brenda's first
// sound). Recorded as the New Relic event VoiceClientLatency.
// Why: the server can't see this with gemini-3.1-flash-live — Gemini delivers
// the user's transcript in one piece just as Brenda starts answering, so
// VoiceTurnLatency.msToFirstAudio always reads ~0 ms (found 2026-10-04).

import newrelic from "newrelic";
import { getSession } from "../../lib/auth.js";

const GIT_SHA = process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null;

// Rejects junk; null when absent.
function ms(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 120000 ? Math.round(n) : null;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  const session = getSession(req);
  if (!session?.userId) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "Not signed in" }));
  }

  const b = req.body || {};
  const msWait = ms(b.msWait);
  if (msWait === null) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "msWait required" }));
  }

  newrelic.recordCustomEvent("VoiceClientLatency", {
    userId: session.userId,
    msWait,                         // stopped talking → Brenda's first sound (the felt wait)
    msWaiting: ms(b.msWaiting),     // part spent before Gemini closed the user's turn (VAD)
    msReplying: ms(b.msReplying),   // part after that (model + network)
    signal: b.signal === "mic" ? "mic" : "txt",
    locale: String(b.locale || "").slice(0, 10) || null,
    platform: String(b.platform || "").slice(0, 20) || null,
    gitSha: GIT_SHA,
  });
  res.statusCode = 204;
  return res.end();
}
