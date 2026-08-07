// lib/subscriptions.js
// Subscription period + usage lookup helpers, shared by the usage-monitor
// endpoint (Phase 2), plan-selection endpoint (Phase 3), and quota
// enforcement gates (Phase 4).
//
// Deliberately does NOT maintain a duplicate running-total counter on
// `users.usage` — "tokens used this period" is computed on demand by
// aggregating the existing gemini_voice_usage_events / gemini_chat_usage_events
// collections (already written by lib/usage.js on every exchange). This
// avoids two usage logs that can drift out of sync with each other.

import { PLAN_FREE, PLAN_ANONYMOUS, PLAN_TOPUP } from "./plans.js";

// "Monthly" means calendar month (UTC) while Google Play billing isn't wired
// up yet — a period always runs from the 1st through the end of the same
// UTC month it was created in, regardless of the user's signup/purchase day.
function startOfMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfNextMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function isSameUTCMonth(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

export async function getPlan(db, planId) {
  return db.collection("plans").findOne({ planId });
}

/**
 * Returns the user's current active subscription period, lazily creating
 * one (or rolling over a period from a prior calendar month) if none exists
 * yet — mirrors the "lazy reset" philosophy already used for billing-period
 * resets (PRD Section 6.3) rather than a bulk migration or cron job.
 *
 * Rollover is keyed on calendar month (UTC), not a fixed elapsed duration —
 * "monthly" means the same thing a real Google Play monthly subscription
 * period will mean once that integration lands. A subscription whose
 * periodStartDate falls in an earlier UTC month than "now" is stale even if
 * its old periodEndDate hasn't been reached yet.
 *
 * A brand-new period always starts "now" — pre-existing usage from before
 * this feature shipped never counts against the new quota (confirmed with
 * Mike: existing users start fresh, not backdated to their signup date).
 */
export async function getOrCreateSubscription(db, userId) {
  const now = new Date();
  const subs = db.collection("subscriptions");

  const sub = await subs.findOne({ userId, status: "active" });
  if (sub && isSameUTCMonth(sub.periodStartDate, now)) {
    return sub;
  }

  // A pending (deferred) downgrade takes over here, at rollover — never mid-period.
  const planId = sub?.pendingPlanId || sub?.planId || PLAN_FREE;
  const plan = await getPlan(db, planId);

  const newSub = {
    userId,
    planId,
    planDisplayName: plan?.displayName || "Free",
    status: "active",
    periodStartDate: startOfMonthUTC(now),
    periodEndDate: startOfNextMonthUTC(now),
    createdAt: now,
    updatedAt: now,
    voiceQuota: plan?.voiceQuota ?? 0,
    chatQuota: plan?.chatQuota ?? 0,
    previousPlanId: sub?.planId ?? null,
    previousPurchaseToken: null,
    planChangedAt: null,
    // A scheduled downgrade (see switchPlan) is consumed right here, at the
    // natural period rollover — it never applies mid-period.
    pendingPlanId: null,
    pendingPlanChangedAt: null,
    voiceExhaustedAt: null,
    chatExhaustedAt: null,
    // Google Play Billing fields — null until GP integration (PRD Section 13).
    gp: {
      purchaseToken: null,
      latestOrderId: null,
      linkedPurchaseToken: null,
      subscriptionState: null,
      acknowledgementState: null,
      regionCode: null,
      startTime: null,
      environment: null,
      lineItems: null,
      externalAccountIdentifiers: null,
      lastVerifiedAt: null,
      rawResponse: null,
    },
  };

  if (sub) {
    await subs.updateOne({ _id: sub._id }, { $set: { status: "expired", updatedAt: now } });
  }

  const insertRes = await subs.insertOne(newSub);
  newSub._id = insertRes.insertedId;
  return newSub;
}

/**
 * Sums tokens used since `sinceDate` from the existing usage-event
 * collections that lib/usage.js already writes on every voice/chat exchange.
 */
export async function getUsageSinceDate(db, userId, sinceDate) {
  const [voiceAgg, chatAgg] = await Promise.all([
    db.collection("gemini_voice_usage_events")
      .aggregate([
        { $match: { userId, createdAt: { $gte: sinceDate } } },
        { $group: { _id: null, total: { $sum: "$usage.totalTokens" } } },
      ])
      .toArray(),
    db.collection("gemini_chat_usage_events")
      .aggregate([
        { $match: { userId, createdAt: { $gte: sinceDate } } },
        { $group: { _id: null, total: { $sum: "$usage.totalTokens" } } },
      ])
      .toArray(),
  ]);

  return {
    voiceTokensUsed: voiceAgg[0]?.total || 0,
    chatTokensUsed: chatAgg[0]?.total || 0,
  };
}

export function computeStatus(used, quota) {
  return used >= quota ? "exhausted" : "active";
}

/**
 * Resolves the plan to stamp on a usage event at write time. Anonymous
 * sessions never get a `subscriptions` doc (mirrors the 403 gate in
 * api/user/usage.js) — they run on the flat anonymous quota, not a
 * purchased plan, so they're reported as such rather than defaulted to Free.
 */
export async function resolvePlanForUsage(db, userId, isAnonymous) {
  if (isAnonymous || !userId) {
    return { planId: PLAN_ANONYMOUS, planDisplayName: "Anonymous" };
  }
  const sub = await getOrCreateSubscription(db, userId);
  return { planId: sub.planId, planDisplayName: sub.planDisplayName };
}

/**
 * Switches the user's active subscription to a different plan.
 *
 * Upgrades (and lateral/same-plan re-selections) apply immediately (PRD
 * Section 5.4). Deliberately keeps the same periodStartDate/periodEndDate —
 * since usage is computed on demand from the event logs rather than a
 * resettable counter, keeping the period unchanged is exactly what makes
 * "unconsumed Brendys carry over" true: already-used tokens still count,
 * just against the new (higher) quota.
 *
 * Downgrades are deferred to the start of the next billing period instead
 * of applying immediately. Reasoning: the user already paid for the
 * current period at the higher tier, so cutting them over to a lower quota
 * mid-period — potentially exhausting them instantly if usage already
 * exceeds the lower plan — would feel like losing paid-for access early.
 * The current plan/quota keep running untouched; `pendingPlanId` is picked
 * up automatically by getOrCreateSubscription() at the natural rollover.
 * Re-selecting the currently active plan while a downgrade is pending
 * cancels it (falls through to the "immediate" branch below, which clears
 * pendingPlanId even though planId/quota don't actually change).
 */
export async function switchPlan(db, userId, newPlanId) {
  const now = new Date();
  const [newPlan, sub] = await Promise.all([
    getPlan(db, newPlanId),
    getOrCreateSubscription(db, userId),
  ]);
  if (!newPlan || newPlan.isActive === false) {
    throw new Error(`Unknown or inactive plan: ${newPlanId}`);
  }

  const currentPlan = await getPlan(db, sub.planId);
  const isDowngrade = (currentPlan?.sortOrder ?? 0) > (newPlan.sortOrder ?? 0);

  if (isDowngrade) {
    const updated = {
      pendingPlanId: newPlan.planId,
      pendingPlanChangedAt: now,
      updatedAt: now,
    };
    await db.collection("subscriptions").updateOne({ _id: sub._id }, { $set: updated });
    return { ...sub, ...updated, deferred: true, effectiveAt: sub.periodEndDate };
  }

  const updated = {
    planId: newPlan.planId,
    planDisplayName: newPlan.displayName,
    voiceQuota: newPlan.voiceQuota,
    chatQuota: newPlan.chatQuota,
    previousPlanId: sub.planId,
    planChangedAt: now,
    // An upgrade (or re-selecting the current plan) cancels any downgrade
    // that was previously scheduled.
    pendingPlanId: null,
    pendingPlanChangedAt: null,
    updatedAt: now,
  };

  await db.collection("subscriptions").updateOne({ _id: sub._id }, { $set: updated });
  return { ...sub, ...updated, deferred: false };
}

/**
 * Adds the top-up plan's Brendys to the user's current active subscription,
 * on top of whatever plan they're already on — a one-time boost, not a plan
 * change (planId/planDisplayName are left untouched).
 *
 * Interim behavior only: there's no real purchase behind this yet (no
 * one-time IAP / Google Play Billing integration — see PRD Section 13), so
 * nothing is charged. The added quota lives on the current calendar-month
 * subscription doc, so it resets at the next monthly rollover like the rest
 * of the period's quota, same as everything else pre-GP-integration.
 */
export async function addTopUp(db, userId) {
  const now = new Date();
  const [topUpPlan, sub] = await Promise.all([
    getPlan(db, PLAN_TOPUP),
    getOrCreateSubscription(db, userId),
  ]);
  if (!topUpPlan || topUpPlan.isActive === false) {
    throw new Error(`Top-up plan unavailable: ${PLAN_TOPUP}`);
  }

  const updated = {
    voiceQuota: sub.voiceQuota + (topUpPlan.voiceQuota || 0),
    chatQuota: sub.chatQuota + (topUpPlan.chatQuota || 0),
    updatedAt: now,
  };
  await db.collection("subscriptions").updateOne({ _id: sub._id }, { $set: updated });
  return { ...sub, ...updated };
}
