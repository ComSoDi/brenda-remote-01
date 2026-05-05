// api/brenda/gossip.js
// POST /api/brenda/gossip — Brenda reacts to a tapped headline card.
// Thin handler around lib/brendaGossip.js.

import { requireSession } from '../../lib/auth.js';
import { brendaGossip } from '../../lib/brendaGossip.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const session = requireSession(req, res);
  if (!session) return;

  const { headline, snippet, locale = 'es-ES', history = [] } = req.body || {};
  if (!headline) return json(res, 400, { error: 'headline is required' });

  const userMessage = snippet ? `${headline} — ${snippet}` : headline;

  try {
    const result = await brendaGossip(userMessage, { history, locale });
    return json(res, 200, result);
  } catch (e) {
    console.error('[gossip]', e.message);
    return json(res, 500, { error: e.message });
  }
}
