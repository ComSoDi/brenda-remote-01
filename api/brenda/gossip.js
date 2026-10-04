// api/brenda/gossip.js
// POST /api/brenda/gossip — Brenda reacts to a tapped headline card.
// Thin handler around lib/brendaGossip.js.

import { requireSession } from '../../lib/auth.js';
import { brendaGossip } from '../../lib/brendaGossip.js';
import { getDb } from '../../lib/mongo.js';
import { recordFeatureUsage } from '../../lib/featureUsage.js';

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
    // Tap reaction = News usage, charged to Text Brendys (the spoken version
    // in TALK goes through the Live session and is already Voice usage).
    const onResponse = (data, model) => {
      getDb()
        .then((db) => recordFeatureUsage({ db, session, feature: 'news', model, data }))
        .catch((e) => console.error('[gossip/usage]', e.message));
    };
    const result = await brendaGossip(userMessage, { history, locale, onResponse });
    return json(res, 200, result);
  } catch (e) {
    console.error('[gossip]', e.message);
    return json(res, 500, { error: e.message });
  }
}
