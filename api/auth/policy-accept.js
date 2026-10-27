// api/auth/policy-accept.js
// "Understood" on a legal-document popup (privacy, terms, legal, cookies).
// Body: { doc?: "privacy" | "terms" | "legal" | "cookies", locale? } — doc defaults to
// "privacy" so older clients that POST {} keep working.
import { requireSession } from "../../lib/auth.js";
import { getDb } from "../../lib/mongo.js";

// First-acceptance field per document (privacy keeps its original field name)
const ACCEPTED_AT_FIELD = {
  privacy: "policyAcceptedAt",
  terms: "termsAcceptedAt",
  legal: "legalAcceptedAt",
  cookies: "cookiesAcceptedAt",
};
const LOCALES = ["en-US", "en-GB", "es-ES", "es-419"];
const LOG_MAX = 200; // keep the newest entries only, so the users doc can't grow unbounded

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // Available to anonymous sessions too — the legal documents are viewable by
  // anyone, not gated behind a named account like consent/talk-disclaimer.
  const s = requireSession(req, res);
  if (!s) return; // requireSession already sent 401

  const doc = req.body?.doc ?? "privacy";
  const field = ACCEPTED_AT_FIELD[doc];
  if (!field) return json(res, 400, { error: `Unknown doc: ${doc}` });
  const locale = LOCALES.includes(req.body?.locale) ? req.body.locale : null;

  try {
    const db = await getDb();
    const users = db.collection("users");
    const now = new Date();
    const path = `preferences.${field}`;

    // Every tap is logged (which document, when, in which language)…
    await users.updateOne(
      { userId: s.userId },
      { $push: { "preferences.legalAcceptLog": { $each: [{ doc, locale, at: now }], $slice: -LOG_MAX } } }
    );

    // …and the first acceptance is kept write-once — never overwritten on repeat visits.
    const updated = await users.findOneAndUpdate(
      { userId: s.userId, $or: [{ [path]: null }, { [path]: { $exists: false } }] },
      { $set: { [path]: now } },
      { returnDocument: "after" }
    );

    let acceptedAt = updated?.preferences?.[field];
    if (!acceptedAt) {
      const existing = await users.findOne({ userId: s.userId }, { projection: { [path]: 1 } });
      acceptedAt = existing?.preferences?.[field] || now;
    }
    const iso = acceptedAt.toISOString ? acceptedAt.toISOString() : acceptedAt;

    // policyAcceptedAt kept in the response for older clients
    return json(res, 200, { ok: true, doc, acceptedAt: iso, ...(doc === "privacy" ? { policyAcceptedAt: iso } : {}) });
  } catch (e) {
    console.error("[auth/policy-accept]", e.message);
    return json(res, 500, { error: e?.message || String(e) });
  }
}
