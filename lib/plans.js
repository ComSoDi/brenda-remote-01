// lib/plans.js
// Subscription tier constants and seed data for Usage Monitoring & Tier
// Selection (Brenda_PRD_UsageMonitoring_TierSelection_v5.md).
//
// Schema conventions (corrected from the PRD draft to match the existing
// codebase — see Section 7 conflict notes from the Phase 1 planning session):
//   - Every foreign key to a user is the app's String `userId`
//     (e.g. "user_Mike", "user_anonymous_000006"), never a Mongo ObjectId.
//     `users._id` is never referenced directly anywhere in this app.
//   - Quota is tracked in "Brendys" internally as raw token counts — 1 Brendy
//     = 1 Gemini token, no conversion. The word "tokens" never reaches a
//     user-facing string (see public/i18n/*.js `sub.*` / `tier.*` keys).

export const PLAN_FREE = "brenda_free";
export const PLAN_BASIC = "brenda_basic";
export const PLAN_SUPERIOR = "brenda_superior";
export const PLAN_ADVANCED = "brenda_advanced";
// One-time "add more Brendys" product, not a recurring subscription tier —
// exists in the `plans` collection (seeded manually, not via PLAN_SEED_DATA)
// but is excluded from PAID_PLAN_IDS/ALL_PLAN_IDS since it isn't selectable
// via api/user/plan.js; it has its own dedicated endpoint (api/user/topup.js).
export const PLAN_TOPUP = "brenda_topup";
// Not a real subscription — anonymous sessions are gated in-memory/server-side
// only (see anonymousUsers collection, Phase 5); never written to `plans`.
export const PLAN_ANONYMOUS = "brenda_anonymous";

export const PAID_PLAN_IDS = [PLAN_BASIC, PLAN_SUPERIOR, PLAN_ADVANCED];
export const ALL_PLAN_IDS = [PLAN_FREE, ...PAID_PLAN_IDS];

// Authoritative quota/pricing seed data — confirmed by Mike, source:
// Horizontal_Subscription_plans_v02.png + Vertical_Subscription_plans_ALL_v07.png.
// Stored in the `plans` collection so quotas/pricing can be tuned without a
// deploy; this array is the seed script's source of truth, not read at runtime.
export const PLAN_SEED_DATA = [
  {
    planId: PLAN_FREE,
    displayName: "Free",
    voiceQuota: 370000,
    chatQuota: 170000,
    voiceMinApprox: 40,
    chatMinApprox: 100,
    sortOrder: 0,
    isActive: true,
    isMostPopular: false,
    fullPriceCents: null,
    firstMonthPriceCents: null,
    firstMonthDiscountPct: null,
  },
  {
    planId: PLAN_BASIC,
    displayName: "Basic",
    voiceQuota: 730000,
    chatQuota: 330000,
    voiceMinApprox: 80,
    chatMinApprox: 200,
    sortOrder: 1,
    isActive: true,
    isMostPopular: false,
    fullPriceCents: 999,
    firstMonthPriceCents: 499,
    firstMonthDiscountPct: 50,
  },
  {
    planId: PLAN_SUPERIOR,
    displayName: "Superior",
    voiceQuota: 2000000,
    chatQuota: 1170000,
    voiceMinApprox: 220,
    chatMinApprox: 700,
    sortOrder: 2,
    isActive: true,
    isMostPopular: true,
    fullPriceCents: 2499,
    firstMonthPriceCents: 1249,
    firstMonthDiscountPct: 50,
  },
  {
    planId: PLAN_ADVANCED,
    displayName: "Advanced",
    voiceQuota: 4380000,
    chatQuota: 2810000,
    voiceMinApprox: 480,
    chatMinApprox: 1680,
    sortOrder: 3,
    isActive: true,
    isMostPopular: false,
    fullPriceCents: 3999,
    firstMonthPriceCents: 1999,
    firstMonthDiscountPct: 50,
  },
];

// Anonymous chat quota — enforced server-side with a session-scoped counter,
// never written to the `plans` collection (see PRD Section 4.4 / 10.1).
export const ANONYMOUS_CHAT_QUOTA = 30000;

/**
 * Default shape for `users.usage` on a freshly-provisioned (or lazily
 * defaulted) account. Phase 2+ will read/write these fields; Phase 1 only
 * defines the shape so later phases have one source of truth.
 */
export function defaultUsageFields(now = new Date()) {
  return {
    voiceTokensUsed: 0,
    chatTokensUsed: 0,
    voiceStatus: "active",
    chatStatus: "active",
    alert90VoiceSent: false,
    alert95VoiceSent: false,
    alert90ChatSent: false,
    alert95ChatSent: false,
    lastUpdated: now,
  };
}
