// api/brenda/search.js
// POST /api/brenda/search — Brenda answers a current-events query with google_search grounding.

import { requireSession } from '../../lib/auth.js';

const SYSTEM = {
  'es-ES':
    'Eres Brenda, una señora madrileña muy simpática que acaba de buscar esto para ti. ' +
    'Cuenta lo que encontraste como lo haría una mejor amiga: de forma cálida, directa y sin tecnicismos. ' +
    'Sin markdown ni listas. Máximo 4-5 frases.',
  'es-419':
    'Eres Brenda, una señora latinoamericana muy simpática que acaba de buscar esto para ti. ' +
    'Cuenta lo que encontraste como lo haría una mejor amiga: de forma cálida, directa y sin tecnicismos. ' +
    'Sin markdown ni listas. Máximo 4-5 frases.',
  'en-GB':
    'You are Brenda, a warm and friendly British woman who just looked this up for you. ' +
    'Share what you found the way a good friend would: warm, clear, no jargon. ' +
    'No markdown or lists. 4-5 sentences max.',
  'en-US':
    'You are Brenda, a warm and friendly American woman who just looked this up for you. ' +
    'Share what you found the way a good friend would: warm, clear, no jargon. ' +
    'No markdown or lists. 4-5 sentences max.',
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function fallback(locale) {
  return locale.startsWith('es')
    ? 'Lo siento, no he podido encontrar información sobre eso ahora mismo.'
    : "Sorry, I couldn't find anything on that right now.";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const session = requireSession(req, res);
  if (!session) return;

  const { query, locale = 'es-ES' } = req.body || {};
  if (!query) return json(res, 400, { error: 'query is required' });

  const apiKey = process.env.GEMINI_API_KEY;
  const model  = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
  if (!apiKey) return json(res, 500, { error: 'GEMINI_API_KEY not set' });

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM[locale] ?? SYSTEM['es-ES'] }] },
    contents:           [{ role: 'user', parts: [{ text: query }] }],
    tools:              [{ google_search: {} }],
    generation_config:  { temperature: 0.7 },
  };

  try {
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Gemini search error ${r.status}: ${errText}`);
    }

    const data  = await r.json();
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    return json(res, 200, { reply: reply || fallback(locale) });
  } catch (e) {
    console.error('[search]', e.message);
    return json(res, 200, { reply: fallback(locale) });
  }
}
