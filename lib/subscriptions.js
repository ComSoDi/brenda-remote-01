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

import { PLAN_FREE, PLAN_ANONYMOUS } from "./plans.js";

const PERIOD_DAYS = 30;

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export async function getPlan(db, planId) {
  return db.collection("plans").findOne({ planId });
}

/**
 * Returns the user's current active subscription period, lazily creating
 * one (or rolling over an expired one) if none exists yet — mirrors the
 * "lazy reset" philosophy already used for billing-period resets (PRD
 * Section 6.3) rather than a bulk migration or cron job.
 *
 * A brand-new period always starts "now" — pre-existing usage from before
 * this feature shipped never counts against the new quota (confirmed with
 * Mike: existing users start fresh, not backdated to their signup date).
 */
export async function getOrCreateSubscription(db, userId) {
  const now = new Date();
  const subs = db.collection("subscriptions");

  const sub = await subs.findOne({ userId, status: "active" });
  if (sub && sub.periodEndDate > now) {
    return sub;
  }

  const planId = sub?.planId || PLAN_FREE;
  const plan = await getPlan(db, planId);

  const newSub = {
    userId,
    planId,
    planDisplayName: plan?.displayName || "Free",
    status: "active",
    periodStartDate: now,
    periodEndDate: addDays(now, PERIOD_DAYS),
    createdAt: now,
    updatedAt: now,
    voiceQuota: plan?.voiceQuota ?? 0,
    chatQuota: plan?.chatQuota ?? 0,
    previousPlanId: sub?.planId ?? null,
    previousPurchaseToken: null,
    planChangedAt: null,
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
 * Switches the user's active subscription to a different plan, effective
 * immediately (PRD Section 5.4 "Plan Changes Mid-Period"). Deliberately
 * keeps the same periodStartDate/periodEndDate — since usage is computed
 * on demand from the event logs rather than a resettable counter, keeping
 * the period unchanged is exactly what makes "unconsumed Brendys carry
 * over" true: already-used tokens still count, just against the new quota.
 * A downgrade whose existing usage exceeds the new quota is immediately
 * "exhausted" for free, via computeStatus() at read time — no extra code.
 */
export async function switchPlan(db, userId, newPlanId) {
  const now = new Date();
  const plan = await getPlan(db, newPlanId);
  if (!plan || plan.isActive === false) {
    throw new Error(`Unknown or inactive plan: ${newPlanId}`);
  }

  const sub = await getOrCreateSubscription(db, userId);

  const updated = {
    planId: plan.planId,
    planDisplayName: plan.displayName,
    voiceQuota: plan.voiceQuota,
    chatQuota: plan.chatQuota,
    previousPlanId: sub.planId,
    planChangedAt: now,
    updatedAt: now,
  };

  await db.collection("subscriptions").updateOne({ _id: sub._id }, { $set: updated });
  return { ...sub, ...updated };
}
