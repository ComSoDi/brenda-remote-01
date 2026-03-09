export default async function handler(req, res) {
  try {
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY not set" }));
    }

    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-mini-realtime-preview";
    const voice = process.env.OPENAI_VOICE || "alloy";
    const instructions = process.env.OPENAI_REALTIME_INSTRUCTIONS || "";
    const transcribeModel = process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

    const session = {
      type: "realtime",
      model,
      output_modalities: ["audio"],
      audio: {
        output: { voice },
        input: { transcription: { model: transcribeModel } },
      },
    };
    if (instructions) session.instructions = instructions;

    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session }),
    });

    const text = await r.text().catch(() => "");
    if (!r.ok) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "OpenAI realtime key request failed", detail: text }));
    }

    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }

    const clientSecret = data?.client_secret?.value || data?.client_secret || data?.value;
    if (!clientSecret) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "Missing client_secret in OpenAI response", detail: data }));
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({
      client_secret: { value: clientSecret },
      model,
      voice,
      transcription_model: transcribeModel,
    }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Server error", detail: String(e?.message || e) }));
  }
}
