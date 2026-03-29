export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const { text, language } = req.body || {};
  if (!text) return res.end(JSON.stringify({ corrected: text || "" }));

  const correctPrompt = `You are a professional ${language || "Spanish"} editor.
Correct grammar, spelling, accents and spacing.
Do not change meaning.
Return only the corrected text.

Text:
${text}`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: correctPrompt }],
      }),
    });
    const data = await r.json();
    const corrected = data.choices?.[0]?.message?.content?.trim() || text;
    res.statusCode = 200;
    return res.end(JSON.stringify({ corrected }));
  } catch (e) {
    console.error("transcript/correct error:", e.message);
    res.statusCode = 200;
    return res.end(JSON.stringify({ corrected: text }));
  }
}
