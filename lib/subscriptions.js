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
import {
  LEDGER_TYPE, writeLedgerEntry, ledgerDedupeKey, grantAmountCents, currencyForLocale,
} from "./ledger.js";

// Denormalized username for a ledger row — best-effort, never blocks billing.
async function _ledgerUsername(db, userId, ctxUsername) {
  if (ctxUsername) return ctxUsername;
  try {
    const u = await db.collection("users").findOne(
      { userId }, { projection: { username: 1, displayName: 1 } },
    );
    return u?.displayName || u?.username || userId;
  } catch {
    return userId;
  }
}

// Records a billing event in `ledger_entries`. Wrapped so a ledger failure can
// never break a plan switch / top-up / period rollover.
async function _recordLedger(db, entry) {
  try {
    await writeLedgerEntry(db, entry);
  } catch (e) {
    console.error("[ledger] write failed:", e?.message || e, "| entry:", entry?.dedupeKey);
  }
}

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

  // Top-up Brendys DON'T expire — carry the prior period's remaining top-up
  // balance forward, minus only what spilled past that period's PLAN quota
  // (consumption is plan-quota-first, then top-up). Plan quota itself resets.
  // "Lazy settle": done here at rollover, same philosophy as the period reset.
  let carriedTopUpVoice = 0;
  let carriedTopUpChat = 0;
  if (sub) {
    try {
      const prior = await getUsageSinceDate(db, userId, sub.periodStartDate);
      const vOverflow = Math.max((prior.voiceTokensUsed || 0) - (sub.voiceQuota || 0), 0);
      const cOverflow = Math.max((prior.chatTokensUsed || 0) - (sub.chatQuota || 0), 0);
      carriedTopUpVoice = Math.max((sub.topUpVoiceRemaining || 0) - vOverflow, 0);
      carriedTopUpChat = Math.max((sub.topUpChatRemaining || 0) - cOverflow, 0);
    } catch (e) {
      // Fail toward the user — never burn their paid top-up because a usage
      // aggregation hiccuped at rollover; carry the full balance forward.
      console.error(`[subscriptions] top-up settle failed for userId=${userId}:`, e?.message || e);
      carriedTopUpVoice = sub.topUpVoiceRemaining || 0;
      carriedTopUpChat = sub.topUpChatRemaining || 0;
    }
  }

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
    // Non-expiring purchased Brendys, independent of the monthly plan quota.
    topUpVoiceRemaining: carriedTopUpVoice,
    topUpChatRemaining: carriedTopUpChat,
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

  // Ledger: one `grant` row per calendar-month period (rollover or first ever).
  // No request context here, so currency is left null — the Ledger report
  // falls back to the user's last-seen currency. First period on a given plan
  // gets the intro price; a rollover onto the same plan is a renewal.
  const isFirstPeriod = !sub || sub.planId !== planId;
  await _recordLedger(db, {
    dedupeKey: ledgerDedupeKey(LEDGER_TYPE.GRANT, userId, newSub.periodStartDate),
    userId,
    username: await _ledgerUsername(db, userId),
    ts: newSub.periodStartDate,
    type: LEDGER_TYPE.GRANT,
    planId,
    planName: newSub.planDisplayName,
    amountPaidCents: grantAmountCents(plan, isFirstPeriod),
    currency: null,
    voiceCredited: newSub.voiceQuota,
    textCredited: newSub.chatQuota,
    periodStartDate: newSub.periodStartDate,
    isFirstPeriod,
    note: sub ? "monthly rollover" : "first period",
  });

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
 * One dimension (voice or chat) of the effective quota picture, applying the
 * plan-quota-first / then-top-up consumption order.
 *
 *   planQuota        — this calendar month's plan allowance (resets each period)
 *   topUpRemaining   — non-expiring purchased balance carried across periods
 *
 * `used` is this period's consumption. Top-up is only drawn down by the part
 * of `used` that exceeds `planQuota`.
 */
export function effectiveDimension(used, planQuota, topUpRemaining) {
  const u = used || 0;
  const pq = planQuota || 0;
  const tu = Math.max(topUpRemaining || 0, 0);
  const planUsed = Math.min(u, pq);
  const planRemaining = Math.max(pq - u, 0);
  const overflow = Math.max(u - pq, 0);
  const topUpRemainingNow = Math.max(tu - overflow, 0);
  const totalRemaining = planRemaining + topUpRemainingNow;
  return {
    used: u,
    planQuota: pq,
    planUsed,
    planRemaining,
    topUpRemaining: topUpRemainingNow,
    totalRemaining,
    // Ceiling for this period = plan quota + top-up balance as it stood at the
    // period's start (top-up only grows mid-period via addTopUp). Stable
    // denominator for a usage bar.
    ceiling: pq + tu,
    status: totalRemaining <= 0 ? "exhausted" : "active",
  };
}

/**
 * Full effective usage/quota picture for a registered user this period —
 * the single source of truth for every quota gate and the usage endpoint.
 */
export async function getEffectiveUsage(db, userId) {
  const sub = await getOrCreateSubscription(db, userId);
  const { voiceTokensUsed, chatTokensUsed } = await getUsageSinceDate(db, userId, sub.periodStartDate);
  return {
    sub,
    planId: sub.planId,
    planDisplayName: sub.planDisplayName,
    periodEndDate: sub.periodEndDate,
    pendingPlanId: sub.pendingPlanId || null,
    voice: effectiveDimension(voiceTokensUsed, sub.voiceQuota, sub.topUpVoiceRemaining),
    chat: effectiveDimension(chatTokensUsed, sub.chatQuota, sub.topUpChatRemaining),
  };
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
export async function switchPlan(db, userId, newPlanId, ctx = {}) {
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
  const currency = ctx.localeVariant ? currencyForLocale(ctx.localeVariant) : null;
  const username = await _ledgerUsername(db, userId, ctx.username);

  if (isDowngrade) {
    const updated = {
      pendingPlanId: newPlan.planId,
      pendingPlanChangedAt: now,
      updatedAt: now,
    };
    await db.collection("subscriptions").updateOne({ _id: sub._id }, { $set: updated });

    // Ledger: informational marker, no credit — the quota change lands later,
    // at the natural rollover, as a normal `grant` row.
    await _recordLedger(db, {
      dedupeKey: ledgerDedupeKey(LEDGER_TYPE.DOWNGRADE_SCHEDULED, userId, now),
      userId, username, ts: now,
      type: LEDGER_TYPE.DOWNGRADE_SCHEDULED,
      planId: newPlan.planId,
      planName: newPlan.displayName,
      amountPaidCents: 0,
      currency,
      note: `scheduled from ${currentPlan?.displayName || sub.planId} — effective ${sub.periodEndDate?.toISOString?.() || sub.periodEndDate}`,
    });

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

  // Ledger: an immediate upgrade credits the quota *delta* into the current
  // period (the subscription bucket already granted this month stays; this
  // tops it up to the new plan). A pure re-selection / lateral move with no
  // extra quota records nothing.
  const voiceDelta = (newPlan.voiceQuota || 0) - (currentPlan?.voiceQuota || 0);
  const textDelta = (newPlan.chatQuota || 0) - (currentPlan?.chatQuota || 0);
  if (voiceDelta > 0 || textDelta > 0) {
    await _recordLedger(db, {
      dedupeKey: ledgerDedupeKey(LEDGER_TYPE.GRANT, userId, now, "upgrade"),
      userId, username, ts: now,
      type: LEDGER_TYPE.GRANT,
      planId: newPlan.planId,
      planName: newPlan.displayName,
      amountPaidCents: grantAmountCents(newPlan, false),
      currency,
      voiceCredited: Math.max(voiceDelta, 0),
      textCredited: Math.max(textDelta, 0),
      periodStartDate: sub.periodStartDate,
      isFirstPeriod: false,
      note: `upgrade from ${currentPlan?.displayName || sub.planId} — quota delta`,
    });
  }

  return { ...sub, ...updated, deferred: false };
}

/**
 * Adds the top-up plan's Brendys to the user's current active subscription,
 * on top of whatever plan they're already on — a one-time boost, not a plan
 * change (planId/planDisplayName are left untouched).
 *
 * Interim behavior only: there's no real purchase behind this yet (no
 * one-time IAP / Google Play Billing integration — see PRD Section 13), so
 * nothing is charged.
 *
 * Top-up Brendys are added to `topUpVoiceRemaining` / `topUpChatRemaining` —
 * a balance SEPARATE from the monthly plan quota that does NOT reset at
 * rollover (getOrCreateSubscription carries it forward). Consumption is
 * plan-quota-first, then this balance.
 */
export async function addTopUp(db, userId, ctx = {}) {
  const now = new Date();
  const [topUpPlan, sub] = await Promise.all([
    getPlan(db, PLAN_TOPUP),
    getOrCreateSubscription(db, userId),
  ]);
  if (!topUpPlan || topUpPlan.isActive === false) {
    throw new Error(`Top-up plan unavailable: ${PLAN_TOPUP}`);
  }

  const updated = {
    topUpVoiceRemaining: (sub.topUpVoiceRemaining || 0) + (topUpPlan.voiceQuota || 0),
    topUpChatRemaining: (sub.topUpChatRemaining || 0) + (topUpPlan.chatQuota || 0),
    updatedAt: now,
  };
  await db.collection("subscriptions").updateOne({ _id: sub._id }, { $set: updated });

  // Ledger: a `topup` row. Top-up Brendys are cumulative / month-independent.
  await _recordLedger(db, {
    dedupeKey: ledgerDedupeKey(LEDGER_TYPE.TOPUP, userId, now),
    userId,
    username: await _ledgerUsername(db, userId, ctx.username),
    ts: now,
    type: LEDGER_TYPE.TOPUP,
    planId: PLAN_TOPUP,
    planName: topUpPlan.displayName || "Top-up",
    amountPaidCents: topUpPlan.fullPriceCents || 0,
    currency: ctx.localeVariant ? currencyForLocale(ctx.localeVariant) : null,
    voiceCredited: topUpPlan.voiceQuota || 0,
    textCredited: topUpPlan.chatQuota || 0,
    note: "top-up purchase",
  });

  return { ...sub, ...updated };
}
