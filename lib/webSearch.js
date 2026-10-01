// lib/webSearch.js
// On-demand Google Search for TEXT chat. On gemini-2.5-flash the built-in
// google_search tool can't be combined with function calling in one request
// (HTTP 400 "Built-in tools ({google_search}) and Function Calling cannot be
// combined" — confirmed 2026-09-30), so text chat exposes a small
// `web_search` FUNCTION instead; only when Brenda calls it do we make one
// separate grounded Gemini call and hand the answer back to her.
// TALK doesn't need this: Gemini Live accepts google_search alongside
// function declarations directly (see server.js).

export const WEB_SEARCH_TOOL = {
  name: "web_search",
  description: "Look up current or factual info on the web (news, recent events, facts you're unsure of).",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "what to search for" } },
    required: ["query"],
  },
};

/**
 * One grounded Gemini call. Returns { answer, data } — `data` is the raw
 * response so the caller can record token usage (Brendys) like any other
 * chat call.
 */
export async function groundedSearch(apiKey, model, query, locale) {
  const lang = String(locale || "").startsWith("es") ? "Spanish" : "English";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        // The date matters: without it (and with thinking off) the model
        // happily reports last year's result as "the latest".
        parts: [{ text: `Today is ${new Date().toISOString().slice(0, 10)}. Answer the query with the most recent, accurate facts from the search results, in 2-4 short sentences, in ${lang}. No markdown.` }],
      },
      contents: [{ role: "user", parts: [{ text: String(query || "") }] }],
      tools: [{ google_search: {} }],
      // A fact lookup doesn't need reasoning; thinking made it ~15 s+.
      generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`grounded search failed: HTTP ${r.status} ${data?.error?.message || ""}`.trim());
  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
  return { answer: answer || null, data };
}
