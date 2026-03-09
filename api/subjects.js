// api/subjects.js
import { getDb } from "../lib/mongo.js";
import { requireSession } from "../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const SUBJECT_COUNT = 5;

function normalizeSubjects(list) {
  const out = new Array(SUBJECT_COUNT).fill("");
  if (Array.isArray(list)) {
    for (let i = 0; i < SUBJECT_COUNT; i++) {
      out[i] = typeof list[i] === "string" ? list[i].trim() : "";
    }
  }
  return out;
}

export default async function handler(req, res) {
  const s = requireSession(req, res);
  if (!s) return;

  const userId = s.userId;
  const isAnonymous = String(userId || "").startsWith("user_anonymous_");

  if (req.method === "GET") {
    if (isAnonymous) {
      return json(res, 200, { ok: true, subjects: null, isAnonymous: true });
    }

    try {
      const db = await getDb();
      const doc = await db.collection("ai_subjects").findOne(
        { userId },
        { projection: { subjects: 1, createdAt: 1, updatedAt: 1 } }
      );
      const subjects = normalizeSubjects(doc?.subjects);
      return json(res, 200, {
        ok: true,
        subjects,
        createdAt: doc?.createdAt || null,
        updatedAt: doc?.updatedAt || null,
      });
    } catch (e) {
      return json(res, 500, { error: e?.message || String(e) });
    }
  }

  if (req.method === "POST") {
    // EXPRESS COMPATIBILITY: req.body is already parsed by express.json()
    const body = req.body || {};

    try {
      const incoming = Array.isArray(body.subjects) ? body.subjects : [];
      const subjects = normalizeSubjects(incoming);

      if (isAnonymous) {
        return json(res, 200, { ok: true, subjects, isAnonymous: true, persisted: false });
      }

      const db = await getDb();
      const now = new Date();

      await db.collection("ai_subjects").updateOne(
        { userId },
        {
          $setOnInsert: { userId, createdAt: now },
          $set: { subjects, updatedAt: now },
        },
        { upsert: true }
      );

      return json(res, 200, { ok: true, subjects, persisted: true });
    } catch (e) {
      return json(res, 500, { error: e?.message || String(e) });
    }
  }

  return json(res, 405, { error: "Method not allowed" });
}
