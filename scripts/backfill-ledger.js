// scripts/backfill-ledger.js
// One-time (idempotent) backfill of `ledger_entries` from existing data.
// Run with: npm run migrate:backfill-ledger
//
// WHAT it reconstructs:
//   - grant rows: one per `subscriptions` doc (every status), dated at the
//     period start, credited with the PLAN BASE quota.
//   - inferred topup rows: for PAST periods where the stored quota exceeds the
//     plan base, one lump `topup` row for the difference (the real count/dates
//     are unrecoverable — addTopUp() never logged them). The current month is
//     skipped so it can't collide with live top-up rows written after ship.
//
// WHAT it does NOT touch: consumption. "Spent" rows in the Ledger report are
// derived on read from gemini_voice_usage_events / gemini_chat_usage_events.
//
// Safe to re-run: every row carries a deterministic `dedupeKey` with a unique
// index, so repeats are no-ops.

import { getDb } from "../lib/mongo.js";
import {
  LEDGER_TYPE, ledgerDedupeKey, grantAmountCents, ensureLedgerIndexes, LEDGER_COLLECTION,
} from "../lib/ledger.js";

function startOfMonthUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function isCurrentUTCMonth(d) {
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

async function main() {
  const db = await getDb();
  console.log("=== BACKFILL ledger_entries ===");

  await ensureLedgerIndexes(db);

  // Inferred top-up rows are fully derived — their date/amount are recomputed
  // each run (we no longer trust `subscriptions.updatedAt`, which the rollover
  // bumps long after the top-up actually happened). Wipe and rebuild them.
  // `source: "backfill"` + `type: "topup"` is exactly the inferred set — live
  // top-ups are `source: "live"`, and grant backfill rows are left alone.
  const wiped = await db.collection(LEDGER_COLLECTION).deleteMany({
    source: "backfill", type: LEDGER_TYPE.TOPUP,
  });

  const [plansArr, usersArr, subs] = await Promise.all([
    db.collection("plans").find({}).toArray(),
    db.collection("users").find({}, { projection: { userId: 1, username: 1, displayName: 1 } }).toArray(),
    db.collection("subscriptions").find({}).toArray(),
  ]);

  const planById = new Map(plansArr.map((p) => [p.planId, p]));
  const nameById = new Map(usersArr.map((u) => [u.userId, u.displayName || u.username || u.userId]));

  // Chronological per user so "first period on a plan" (intro price) is correct.
  subs.sort((a, b) => {
    const ua = String(a.userId), ub = String(b.userId);
    if (ua !== ub) return ua.localeCompare(ub);
    return new Date(a.periodStartDate || a.createdAt) - new Date(b.periodStartDate || b.createdAt);
  });

  const seenPlanPerUser = new Map(); // userId -> Set(planId)
  const ops = [];
  let grantCount = 0, topupCount = 0, skippedCurrent = 0;

  for (const sub of subs) {
    const userId = sub.userId;
    const username = nameById.get(userId) || userId;
    const plan = planById.get(sub.planId);
    const periodStart = new Date(sub.periodStartDate || sub.createdAt);
    const periodStartMonth = startOfMonthUTC(periodStart);

    const seen = seenPlanPerUser.get(userId) || new Set();
    const isFirstPeriod = !seen.has(sub.planId);
    seen.add(sub.planId);
    seenPlanPerUser.set(userId, seen);

    const baseVoice = plan?.voiceQuota ?? sub.voiceQuota ?? 0;
    const baseText = plan?.chatQuota ?? sub.chatQuota ?? 0;

    ops.push({
      updateOne: {
        filter: { dedupeKey: ledgerDedupeKey(LEDGER_TYPE.GRANT, userId, periodStartMonth) },
        update: {
          $setOnInsert: {
            dedupeKey: ledgerDedupeKey(LEDGER_TYPE.GRANT, userId, periodStartMonth),
            userId, username,
            ts: periodStartMonth,
            type: LEDGER_TYPE.GRANT,
            planId: sub.planId,
            planName: sub.planDisplayName || plan?.displayName || sub.planId,
            amountPaidCents: grantAmountCents(plan, isFirstPeriod),
            currency: null,
            voiceCredited: baseVoice,
            textCredited: baseText,
            voiceDebited: 0,
            textDebited: 0,
            periodStartDate: periodStartMonth,
            isFirstPeriod,
            note: "backfilled from subscriptions",
            source: "backfill",
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    });
    grantCount++;

    // Inferred top-up for PAST periods only (the current period's top-ups are
    // written live by addTopUp()). The excess lives in `topUpVoiceRemaining` /
    // `topUpChatRemaining` after `migrate:topup-balance`, or still on
    // `voiceQuota` / `chatQuota` if that migration hasn't run yet — cover both.
    const extraVoice = Math.max((sub.voiceQuota ?? 0) - baseVoice, 0) + (sub.topUpVoiceRemaining || 0);
    const extraText = Math.max((sub.chatQuota ?? 0) - baseText, 0) + (sub.topUpChatRemaining || 0);
    if (extraVoice > 0 || extraText > 0) {
      if (isCurrentUTCMonth(periodStartMonth)) {
        skippedCurrent++;
      } else {
        // Date it at PERIOD START, not `updatedAt`. In the live app the extra
        // quota sat on the subscription doc for the whole period, so the user
        // never actually went negative mid-period — crediting it up front is
        // the faithful reconstruction. TYPE_SORT keeps grant → topup → usage
        // order on the boundary day.
        const key = ledgerDedupeKey(LEDGER_TYPE.TOPUP, userId, periodStartMonth, "backfill-inferred");
        ops.push({
          updateOne: {
            filter: { dedupeKey: key },
            update: {
              $setOnInsert: {
                dedupeKey: key,
                userId, username,
                ts: periodStartMonth,
                type: LEDGER_TYPE.TOPUP,
                planId: "brenda_topup",
                planName: "Top-up",
                amountPaidCents: 0, // real price unknown for historical inferred top-ups
                currency: null,
                voiceCredited: extraVoice,
                textCredited: extraText,
                voiceDebited: 0,
                textDebited: 0,
                periodStartDate: periodStartMonth,
                isFirstPeriod: false,
                note: "inferred — extra quota on the period's subscription doc, credited at period start",
                source: "backfill",
                createdAt: new Date(),
              },
            },
            upsert: true,
          },
        });
        topupCount++;
      }
    }
  }

  if (!ops.length) {
    console.log("Nothing to backfill (no subscriptions found).");
    process.exit(0);
  }

  const res = await db.collection(LEDGER_COLLECTION).bulkWrite(ops, { ordered: false });
  console.log(`\nSubscriptions scanned : ${subs.length}`);
  console.log(`inferred topup rows wiped for rebuild: ${wiped.deletedCount}`);
  console.log(`grant rows prepared   : ${grantCount}`);
  console.log(`inferred topup rows   : ${topupCount} (dated at period start)`);
  console.log(`current-month topups skipped (live path owns them): ${skippedCurrent}`);
  console.log(`upserted (new)        : ${res.upsertedCount}`);
  console.log(`matched (already there): ${res.matchedCount}`);
  console.log("\nDone. Consumption rows are derived on read — nothing to backfill there.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
