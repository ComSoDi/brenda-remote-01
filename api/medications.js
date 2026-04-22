// api/medications.js
// GET    /api/medications          — list active medications
// POST   /api/medications          — create medication + acknowledge disclaimer
// PATCH  /api/medications?id=xxx   — update (mode: "correct" | "change")
// DELETE /api/medications?id=xxx   — soft-delete (active=false)

import { requireSession } from "../lib/auth.js";
import { getDb } from "../lib/mongo.js";
import crypto from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

function getParam(req, key) {
  try { return new URL(req.url, "http://localhost").searchParams.get(key); } catch { return null; }
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const db = await getDb();

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const meds = await db.collection("medications")
      .find({ userId: session.userId, active: true })
      .sort({ name: 1 })
      .toArray();
    // Strip MongoDB _id from results
    return json(res, 200, { medications: meds.map(({ _id, ...m }) => m) });
  }

  // ── POST — create ─────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = await parseBody(req);
    const { name, dose, directions, recurrence, startDate, endDate, timezone, notes, enteredBy, disclaimerAcknowledged } = body;

    if (!name?.trim())     return json(res, 400, { error: "name required" });
    if (!recurrence?.type) return json(res, 400, { error: "recurrence required" });
    if (!directions?.trim() && !recurrence.times?.length) return json(res, 400, { error: "at least one time required (or set directions)" });
    if (!timezone)         return json(res, 400, { error: "timezone required" });

    const now = new Date();
    const med = {
      id:                    crypto.randomUUID(),
      userId:                session.userId,
      name:                  name.trim(),
      dose:                  dose?.trim() || null,
      directions:            directions?.trim().slice(0, 30) || null,
      recurrence,
      startDate:             startDate || now.toISOString().slice(0, 10),
      endDate:               endDate   || null,
      active:                true,
      timezone,
      notes:                 notes?.trim()     || null,
      enteredBy:             enteredBy?.trim() || null,
      disclaimerAcknowledged: !!disclaimerAcknowledged,
      history:               [],
      createdAt:             now,
      updatedAt:             now,
    };

    await db.collection("medications").insertOne(med);

    // Signal Render scheduler to pick up the new medication
    await db.collection("medication_schedule_sync").insertOne({
      action: "create", medicationId: med.id, processedAt: null, createdAt: now,
    });

    const { _id, ...medOut } = med;
    return json(res, 201, { medication: medOut });
  }

  // ── PATCH — update ────────────────────────────────────────────────────────
  if (req.method === "PATCH") {
    const id = getParam(req, "id");
    if (!id) return json(res, 400, { error: "id required" });

    const body = await parseBody(req);
    const { mode, name, dose, directions, recurrence, startDate, endDate, timezone, notes, enteredBy, changeReason, active } = body;

    const existing = await db.collection("medications").findOne({ id, userId: session.userId });
    if (!existing) return json(res, 404, { error: "Not found" });

    const now = new Date();
    const $set = { updatedAt: now };
    if (name       !== undefined) $set.name       = name.trim();
    if (dose       !== undefined) $set.dose       = dose?.trim()                        || null;
    if (directions !== undefined) $set.directions = directions?.trim().slice(0, 30)     || null;
    if (recurrence !== undefined) $set.recurrence = recurrence;
    if (startDate  !== undefined) $set.startDate  = startDate;
    if (endDate    !== undefined) $set.endDate    = endDate || null;
    if (timezone   !== undefined) $set.timezone   = timezone;
    if (notes      !== undefined) $set.notes      = notes?.trim()                       || null;
    if (enteredBy  !== undefined) $set.enteredBy  = enteredBy?.trim()                   || null;
    if (active     !== undefined) $set.active     = active;

    const updateOp = { $set };

    if (mode === "change") {
      updateOp.$push = {
        history: {
          snapshotAt:  now.toISOString(),
          reason:      changeReason?.trim() || null,
          name:        existing.name,
          dose:        existing.dose,
          directions:  existing.directions,
          recurrence:  existing.recurrence,
          startDate:   existing.startDate,
          endDate:     existing.endDate,
          notes:       existing.notes,
        },
      };
    }

    await db.collection("medications").updateOne({ id, userId: session.userId }, updateOp);

    await db.collection("medication_schedule_sync").insertOne({
      action: "reschedule", medicationId: id, processedAt: null, createdAt: now,
    });

    return json(res, 200, { ok: true });
  }

  // ── DELETE — soft-delete ──────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const id = getParam(req, "id");
    if (!id) return json(res, 400, { error: "id required" });

    await db.collection("medications").updateOne(
      { id, userId: session.userId },
      { $set: { active: false, updatedAt: new Date() } }
    );

    await db.collection("medication_schedule_sync").insertOne({
      action: "cancel", medicationId: id, processedAt: null, createdAt: new Date(),
    });

    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
