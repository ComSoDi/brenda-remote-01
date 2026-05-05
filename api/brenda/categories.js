// api/brenda/categories.js
// GET  /api/brenda/categories     — read saved news categories for the session user
// POST /api/brenda/categories     — upsert saved news categories

import { requireSession } from '../../lib/auth.js';
import { getDb } from '../../lib/mongo.js';

const ALL_CATEGORIES = ['actualidad', 'gossip', 'sport', 'politica', 'tv'];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
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

  // GET — return saved categories (defaults to all if none saved)
  if (req.method === 'GET') {
    try {
      const doc = await db.collection('ai_categories').findOne({ userId: session.userId });
      const categories = doc?.categories?.length ? doc.categories : [...ALL_CATEGORIES];
      return json(res, 200, { categories });
    } catch (e) {
      console.error('[categories/get]', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  // POST — upsert categories
  if (req.method === 'POST') {
    const { categories } = req.body || {};
    if (!Array.isArray(categories) || categories.length === 0) {
      return json(res, 400, { error: 'categories must be a non-empty array' });
    }
    const valid = categories.filter((c) => ALL_CATEGORIES.includes(c));
    if (!valid.length) {
      return json(res, 400, { error: 'No valid categories provided' });
    }
    try {
      await db.collection('ai_categories').updateOne(
        { userId: session.userId },
        { $set: { userId: session.userId, categories: valid, updatedAt: new Date() } },
        { upsert: true }
      );
      return json(res, 200, { success: true, categories: valid });
    } catch (e) {
      console.error('[categories/post]', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: 'Method not allowed' });
}
