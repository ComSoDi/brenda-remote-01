export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const { text, language } = req.body || {};
  if (!text) return res.end(JSON.stringify({ corrected: text || "" }));

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.end(JSON.stringify({ corrected: text }));

  const model = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";

  const prompt = `You are correcting a voice-to-text transcription in ${language || "Spanish"}.

Speech recognition often splits words into syllables or fragments. Your main job is to merge those fragments back into correct words. Other common issues: non-language characters (Arabic, numbers that don't belong), missing accents, wrong capitalisation, missing punctuation.

Rules:
- Merge incorrectly split words (e.g. "Bi en" → "Bien", "pa sa ba" → "pasaba", "gracia s" → "gracias", "Ni lo" → "Nilo")
- Remove any non-${language || "Spanish"} characters (Arabic script, stray symbols)
- Restore correct accents and spelling
- Add missing punctuation, including Spanish opening marks (¿ ¡) where appropriate
- Fix capitalisation
- Do NOT change the meaning, add words, or remove content
- Return ONLY the corrected text, nothing else

Transcription to correct:
${text}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        generationConfig: { temperature: 0 },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });

    const data = await r.json();
    const corrected = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
    res.statusCode = 200;
    return res.end(JSON.stringify({ corrected }));
  } catch (e) {
    console.error("[transcript/correct]", e.message);
    res.statusCode = 200;
    return res.end(JSON.stringify({ corrected: text }));
  }
}
