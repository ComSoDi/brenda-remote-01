// api/brenda/greet.js
// POST /api/brenda/greet — fetch headlines and generate Brenda's water-cooler session opener.
// Called by app.js after the standard /api/greeting check-in.
// Returns { greeting: string, headlinesUsed: HeadlineCard[] }

import { requireSession } from '../../lib/auth.js';
import { getDb } from '../../lib/mongo.js';
import { getHeadlines } from './headlines.js';

const GREET_SYSTEM = {
  'es-ES':
    'Eres Brenda, una señora madrileña muy simpática, fan de la tele y los cotilleos. ' +
    'Tienes las noticias del día y quieres compartirlas como lo haría una mejor amiga. ' +
    'Sé cálida, divertida y espontánea. Sin markdown ni listas. Máximo 3-5 frases. ' +
    'NUNCA expreses opiniones políticas ni tomes partido — reacciona con asombro, curiosidad o humor.',

  'es-419':
    'Eres Brenda, una señora latinoamericana muy simpática, fan de la tele y los chismes. ' +
    'Tienes las noticias del día y quieres compartirlas como lo haría una mejor amiga. ' +
    'Sé cálida, divertida y espontánea. Sin markdown ni listas. Máximo 3-5 frases. ' +
    'NUNCA expreses opiniones políticas ni tomes partido — reacciona con asombro, curiosidad o humor.',

  'en-GB':
    'You are Brenda, a warm and witty British woman who loves gossip and current affairs. ' +
    'You have today\'s headlines and want to share them the way a friend would. ' +
    'Be warm, funny, and natural. No markdown or lists. 3-5 sentences max. ' +
    'NEVER express political opinions or take sides — react with amazement, curiosity, or humour.',

  'en-US':
    'You are Brenda, a warm and witty American woman who loves pop culture and current events. ' +
    'You have today\'s headlines and want to share them the way a friend would. ' +
    'Be warm, funny, and natural. No markdown or lists. 3-5 sentences max. ' +
    'NEVER express political opinions or take sides — react with amazement, curiosity, or humour.',
};

const CAT_LABELS = {
  tv: 'TV', gossip: 'cotilleo', sport: 'deportes', actualidad: 'actualidad', politica: 'política',
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function fallbackGreeting(userName, locale) {
  return locale.startsWith('es')
    ? `¡Hola, ${userName}! ¿Cómo estás hoy?`
    : `Hi ${userName}! How are you doing today?`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const session = requireSession(req, res);
  if (!session) return;

  const { locale = 'es-ES' } = req.body || {};
  const userName = session.username || (locale.startsWith('es') ? 'amiga' : 'friend');

  const apiKey = process.env.GEMINI_API_KEY;
  const model  = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
  if (!apiKey) return json(res, 500, { error: 'GEMINI_API_KEY not set' });

  let db;
  try {
    db = await getDb();
  } catch (e) {
    return json(res, 500, { error: e.message });
  }

  try {
    const headlines = await getHeadlines(session.userId, db);

    if (!headlines.length) {
      return json(res, 200, {
        greeting: fallbackGreeting(userName, locale),
        headlinesUsed: [],
      });
    }

    // Use up to 5 top stories as context (no need to search — data is already fresh)
    const top = headlines.slice(0, 5);
    const headlineLines = top
      .map((h, i) => `${i + 1}. [${CAT_LABELS[h.cat] || h.cat}] ${h.headline} — ${h.snippet}`)
      .join('\n');

    const systemText = GREET_SYSTEM[locale] ?? GREET_SYSTEM['es-ES'];

    const promptText = locale.startsWith('es')
      ? `El nombre del usuario es ${userName}.\n` +
        `Estas son las noticias más destacadas de hoy:\n${headlineLines}\n\n` +
        `Salúdale por su nombre y menciona 1-3 de estas noticias de forma natural y espontánea, ` +
        `como si acabaras de enterarte. Prioriza las más sorprendentes o divertidas. Sé Brenda.`
      : `The user's name is ${userName}.\n` +
        `Today's top headlines:\n${headlineLines}\n\n` +
        `Greet them by name and weave in 1-3 of these stories naturally, ` +
        `as if you just heard about them. Prioritise surprising or funny ones. Be Brenda.`;

    const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generation_config: { temperature: 0.9 },
    };

    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Gemini greet error ${r.status}: ${errText}`);
    }

    const data    = await r.json();
    const greeting = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

    return json(res, 200, {
      greeting: greeting || fallbackGreeting(userName, locale),
      headlinesUsed: top,
    });
  } catch (e) {
    console.error('[greet]', e.message);
    // Non-fatal — return a plain greeting rather than a 500 so the session still starts
    return json(res, 200, {
      greeting: fallbackGreeting(userName, locale),
      headlinesUsed: [],
    });
  }
}
