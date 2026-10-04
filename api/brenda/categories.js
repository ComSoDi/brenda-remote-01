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

// The news greeting is charged (headlines search), so the user opts in.
// Every change is logged with its time: preferences.newsGreetingLog keeps
// { enabled, at } entries; newsGreetingChangedAt is the latest change.
async function saveNewsGreeting(db, userId, enabled) {
  const now = new Date();
  await db.collection('users').updateOne(
    { userId, 'preferences.newsGreeting': { $ne: enabled } }, // only on a real change
    {
      $set: { 'preferences.newsGreeting': enabled, 'preferences.newsGreetingChangedAt': now },
      $push: { 'preferences.newsGreetingLog': { enabled, at: now } },
    }
  );
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

  // GET — return saved categories (defaults to all if none saved) + the
  // "Tell me the news when you greet me" choice (default off — it costs Brendys).
  if (req.method === 'GET') {
    try {
      const [doc, user] = await Promise.all([
        db.collection('ai_categories').findOne({ userId: session.userId }),
        db.collection('users').findOne({ userId: session.userId }, { projection: { 'preferences.newsGreeting': 1 } }),
      ]);
      const categories = doc?.categories?.length ? doc.categories : [...ALL_CATEGORIES];
      return json(res, 200, { categories, newsGreeting: user?.preferences?.newsGreeting === true });
    } catch (e) {
      console.error('[categories/get]', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  // POST — upsert categories
  if (req.method === 'POST') {
    const { categories, newsGreeting } = req.body || {};
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
      if (typeof newsGreeting === 'boolean') {
        await saveNewsGreeting(db, session.userId, newsGreeting);
      }
      return json(res, 200, { success: true, categories: valid, newsGreeting });
    } catch (e) {
      console.error('[categories/post]', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: 'Method not allowed' });
}
