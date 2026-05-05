// api/brenda/headlines.js
// POST /api/brenda/headlines            — fetch ranked headlines for the session user
// GET  /api/brenda/headlines/:userId    — convenience alias (uses session, ignores param)
//
// getHeadlines() is also exported for use by api/brenda/greet.js.

import { requireSession } from '../../lib/auth.js';
import { getDb } from '../../lib/mongo.js';
import { getOutletsForUser } from '../../config/outlets.js';

const ALL_CATEGORIES = ['actualidad', 'gossip', 'sport', 'politica', 'tv'];

const BRENDA_MULTIPLIERS = {
  tv:         1.3,
  gossip:     1.3,
  sport:      1.0,
  actualidad: 0.8,
  politica:   0.7,
};

function calcHeat(outletCount, minsAgo, buzzRaw, cat) {
  const O = Math.min(100, (Math.max(1, outletCount) / 8) * 100);
  const R = Math.round(100 * Math.exp(-minsAgo / 90));
  const B = Math.max(0, Math.min(100, buzzRaw));
  const brendaRel = BRENDA_MULTIPLIERS[cat] ?? 0.8;
  const V = Math.min(100, 50 * brendaRel + 50 * (B / 100));
  const heat = (O * 0.30) + (R * 0.25) + (B * 0.25) + (V * 0.20);
  return {
    heat:      Math.round(Math.max(0, Math.min(100, heat))),
    brendaRel,
    scores: {
      o: Math.round(O),
      r: Math.round(R),
      b: Math.round(B),
      v: Math.round(V),
    },
  };
}

// Extracts a JSON array from Gemini's response, handling markdown code blocks.
function extractJsonArray(text) {
  const t = text.trim();
  try { const p = JSON.parse(t); if (Array.isArray(p)) return p; } catch {}
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { const p = JSON.parse(fenced[1].trim()); if (Array.isArray(p)) return p; } catch {} }
  const bare = t.match(/\[[\s\S]*\]/);
  if (bare)   { try { const p = JSON.parse(bare[0]);            if (Array.isArray(p)) return p; } catch {} }
  return [];
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Core logic — exported so greet.js can reuse without an extra HTTP round-trip.
export async function getHeadlines(userId, db, categories = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model  = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  // Resolve user location (defaults to ES / national if not set)
  let country = 'ES', city = null;
  try {
    const user = await db.collection('users').findOne(
      { userId },
      { projection: { 'preferences.location': 1 } }
    );
    country = user?.preferences?.location?.country || 'ES';
    city    = user?.preferences?.location?.city    || null;
  } catch { /* non-fatal — fall back to ES */ }

  // Resolve categories
  let cats = categories;
  if (!cats) {
    try {
      const doc = await db.collection('ai_categories').findOne({ userId });
      cats = doc?.categories?.length ? doc.categories : [...ALL_CATEGORIES];
    } catch {
      cats = [...ALL_CATEGORIES];
    }
  }

  // Filter outlets to those covering the selected categories
  const allOutlets = getOutletsForUser(country, city);
  const outlets    = allOutlets.filter((o) => o.categories.some((c) => cats.includes(c)));
  if (!outlets.length) return [];

  const validOutletIds = new Set(outlets.map((o) => o.id));
  const outletList     = outlets.map((o) => `${o.id} (${o.name})`).join(', ');
  const catList        = cats.join(', ');

  const prompt =
    `Busca las noticias más recientes (últimas 24 horas) de estos medios de comunicación españoles: ${outletList}.\n` +
    `Categorías de interés: ${catList} ` +
    `(tv = TV y entretenimiento, gossip = cotilleo/famosos, sport = deportes, actualidad = noticias generales, politica = política).\n\n` +
    `Devuelve ÚNICAMENTE un array JSON válido sin texto adicional. Cada elemento del array debe tener exactamente estos campos:\n` +
    `{\n` +
    `  "outlet": "<id del medio, uno de: ${outlets.map((o) => o.id).join(', ')}>",\n` +
    `  "cat": "<categoría, una de: ${cats.join(', ')}>",\n` +
    `  "headline": "<titular completo en español>",\n` +
    `  "snippet": "<resumen de 3-4 frases con contexto y detalles relevantes>",\n` +
    `  "minsAgo": <minutos desde la publicación, entero entre 0 y 1440>,\n` +
    `  "outletCount": <cuántos medios distintos cubren esta misma noticia, entero entre 1 y 8>,\n` +
    `  "buzzRaw": <puntuación de impacto en redes sociales entre 0 y 100>\n` +
    `}\n\n` +
    `Devuelve entre 8 y 12 noticias. Prioriza noticias recientes y de mayor impacto. ` +
    `Usa outletCount alto (4-8) para noticias que cubran muchos medios, bajo (1-2) para exclusivas.`;

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools:    [{ google_search: {} }],
    generation_config: { temperature: 0.2 },
  };

  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Gemini headlines error ${r.status}: ${errText}`);
  }

  const data  = await r.json();
  const raw   = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '[]';
  const items = extractJsonArray(raw);

  const validCats = new Set(['tv', 'gossip', 'sport', 'actualidad', 'politica']);

  const scored = items
    .filter((h) => h.headline && validOutletIds.has(h.outlet) && validCats.has(h.cat))
    .map((h, i) => {
      const minsAgo     = Math.max(0,  Math.min(1440, Math.round(h.minsAgo     || 0)));
      const outletCount = Math.max(1,  Math.min(8,    Math.round(h.outletCount || 1)));
      const buzzRaw     = Math.max(0,  Math.min(100,  Math.round(h.buzzRaw     || 0)));
      const { heat, brendaRel, scores } = calcHeat(outletCount, minsAgo, buzzRaw, h.cat);
      return {
        id:          `h_${Date.now()}_${i}`,
        outlet:      h.outlet,
        cat:         h.cat,
        headline:    h.headline,
        snippet:     h.snippet || '',
        minsAgo,
        outletCount,
        buzzRaw,
        brendaRel,
        heat,
        scores,
      };
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 5);

  return scored;
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  let db;
  try {
    db = await getDb();
  } catch (e) {
    return json(res, 500, { error: e.message });
  }

  if (req.method === 'GET') {
    try {
      const headlines = await getHeadlines(session.userId, db);
      return json(res, 200, { headlines });
    } catch (e) {
      console.error('[headlines/get]', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { categories } = req.body || {};
    try {
      const headlines = await getHeadlines(session.userId, db, categories || null);
      return json(res, 200, { headlines });
    } catch (e) {
      console.error('[headlines/post]', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: 'Method not allowed' });
}
