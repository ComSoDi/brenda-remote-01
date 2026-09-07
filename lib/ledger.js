// lib/ledger.js
// Formal billing-transaction log + read-side row/balance computation for the
// admin "Ledger" report (public/ledger/, api/ledger/entries.js).
//
// WHY a new collection: plan grants, upgrades and top-ups had NO persisted
// history — switchPlan() / addTopUp() mutate the `subscriptions` doc in place.
// `ledger_entries` is that history: one immutable doc per billing event,
// written synchronously when it happens and readable directly in MongoDB.
//
// Consumption ("spent") is NOT copied here — gemini_voice_usage_events /
// gemini_chat_usage_events already are its formal log. The report derives one
// daily debit row per user from a GROUP BY over those (aggregateDailyUsage),
// matching the codebase's "no second usage log that can drift" rule
// (see lib/subscriptions.js header).

export const LEDGER_COLLECTION = "ledger_entries";

// What kind of billing event a row records.
export const LEDGER_TYPE = {
  GRANT: "grant",                              // monthly period quota granted (rollover) OR an immediate upgrade delta
  TOPUP: "topup",                              // one-time top-up purchase
  DOWNGRADE_SCHEDULED: "downgrade_scheduled",  // deferred downgrade recorded (no credit; informational)
};

// Row ordering when several events share a timestamp (grants before top-ups
// before that day's usage, so balances build up before they're drawn down).
const TYPE_SORT = { grant: 0, downgrade_scheduled: 1, topup: 2, usage: 3 };

const CURRENCY_BY_LOCALE = {
  "en-GB": "GBP",
  "es-ES": "EUR",
  "en-US": "USD",
  "es-419": "USD",
};

export const CURRENCY_SYMBOL = { USD: "$", GBP: "£", EUR: "€" };

// Pricing currency by locale — mirrors CLAUDE.md: en-GB → £, es-ES → €,
// en-US / es-419 / rest-of-world → $.
export function currencyForLocale(localeVariant) {
  return CURRENCY_BY_LOCALE[String(localeVariant || "").trim()] || "USD";
}

/**
 * "Amount paid" for a subscription grant, in cents.
 *   - first period on a paid plan  → firstMonthPriceCents (the 50%-off intro)
 *   - renewals                     → fullPriceCents
 *   - Free plan / missing price    → 0
 */
export function grantAmountCents(plan, isFirstPeriod) {
  if (!plan) return 0;
  if (isFirstPeriod && plan.firstMonthPriceCents != null) return plan.firstMonthPriceCents;
  return plan.fullPriceCents || 0;
}

/**
 * Deterministic dedupe key so a live write and a later backfill of the same
 * event collapse to one row (unique index on `dedupeKey`).
 */
export function ledgerDedupeKey(type, userId, when, extra = "") {
  const iso = when instanceof Date ? when.toISOString() : new Date(when).toISOString();
  return [type, userId, iso, extra].filter(Boolean).join(":");
}

// Ensure the unique `dedupeKey` index exists before the first write of the
// process — otherwise the idempotency guarantee (and the 11000 catch below)
// is silently a no-op. Cheap once MongoDB has the index.
let _indexPromise = null;
function _ensureIndexOnce(db) {
  if (!_indexPromise) _indexPromise = ensureLedgerIndexes(db).catch((e) => {
    _indexPromise = null; // let a later write retry
    console.error("[ledger] index create failed:", e?.message || e);
  });
  return _indexPromise;
}

/**
 * Insert one ledger entry, ignoring a duplicate-key clash (idempotent).
 * `entry` must already carry a `dedupeKey`. Never throws on a dup — callers
 * are billing paths and must not fail because the row already exists.
 */
export async function writeLedgerEntry(db, entry) {
  await _ensureIndexOnce(db);
  const doc = {
    source: "live",
    createdAt: new Date(),
    voiceCredited: 0,
    textCredited: 0,
    amountPaidCents: 0,
    currency: null,
    note: null,
    periodStartDate: null,
    isFirstPeriod: false,
    ...entry,
  };
  try {
    await db.collection(LEDGER_COLLECTION).insertOne(doc);
    return true;
  } catch (e) {
    if (e && e.code === 11000) return false; // already recorded — fine
    throw e;
  }
}

/** Ensures the unique index the dedupe logic relies on. Safe to call often. */
export async function ensureLedgerIndexes(db) {
  await db.collection(LEDGER_COLLECTION).createIndex({ dedupeKey: 1 }, { unique: true });
  await db.collection(LEDGER_COLLECTION).createIndex({ userId: 1, ts: 1 });
}

/**
 * One debit row per user per UTC calendar day, summed from the raw
 * voice/chat usage-event collections. Returned rows are shaped to merge
 * straight into buildLedgerRows() alongside billing entries.
 */
export async function aggregateDailyUsage(db, { userId = null, from = null, to = null } = {}) {
  const match = {};
  if (userId) match.userId = userId;
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  // Group by (user, day, plan) — usage events are stamped with the plan that
  // was active when they were written (lib/usage.js), so the report's Plan
  // filter can narrow debits too, not just credits.
  const dayGroup = () => ([
    { $match: match },
    {
      $group: {
        _id: {
          userId: "$userId",
          day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
          planId: "$planId",
        },
        tokens: { $sum: "$usage.totalTokens" },
        planName: { $first: "$planDisplayName" },
      },
    },
  ]);

  const [voice, text] = await Promise.all([
    db.collection("gemini_voice_usage_events").aggregate(dayGroup()).toArray(),
    db.collection("gemini_chat_usage_events").aggregate(dayGroup()).toArray(),
  ]);

  const byKey = new Map();
  const bucket = (g) => {
    const { userId, day, planId } = g._id;
    const k = `${userId}|${day}|${planId || "-"}`;
    if (!byKey.has(k)) {
      byKey.set(k, {
        userId, day,
        ts: new Date(`${day}T00:00:00.000Z`),
        type: "usage",
        planId: planId || null,
        planName: g.planName || null,
        voiceDebited: 0,
        textDebited: 0,
      });
    }
    return byKey.get(k);
  };
  for (const v of voice) bucket(v).voiceDebited += v.tokens || 0;
  for (const t of text) bucket(t).textDebited += t.tokens || 0;

  return [...byKey.values()];
}

function blankTotals() {
  return {
    amountByCurrency: {},   // { USD: cents, GBP: cents, ... }
    voiceCredited: 0, textCredited: 0,
    voiceDebited: 0, textDebited: 0,
    voiceSubBalance: 0, voiceTopupBalance: 0,
    textSubBalance: 0, textTopupBalance: 0,
    // Split of credited by source — only maintained on the grand total,
    // used for the report's summary tiles.
    grantVoice: 0, grantText: 0, topupVoice: 0, topupText: 0,
  };
}

function addCurrency(map, currency, cents) {
  if (!cents) return;
  const c = currency || "USD";
  map[c] = (map[c] || 0) + cents;
}

/**
 * Merge billing entries + daily usage rows into the report's row list, with
 * the four running balance buckets per user:
 *
 *   voiceSub / textSub    — current calendar-month subscription quota.
 *                           RESET to the new grant at each monthly rollover
 *                           (unused Brendys are lost, matching lib/subscriptions.js).
 *   voiceTopup / textTopup — cumulative top-up Brendys. NEVER reset.
 *
 * Consumption drains the subscription bucket first; the overflow reduces the
 * top-up bucket (goes negative — flagged in the UI — if a user runs past both).
 *
 * @param {object[]} entries    ledger_entries docs (billing events)
 * @param {object[]} usageDaily rows from aggregateDailyUsage()
 * @param {object}   opts.usernameById  { userId: displayName }
 * @param {string}   opts.planFilter    planId to keep (or falsy = all)
 * @param {Date}     opts.visibleFrom   rows before this still advance the
 *                                      running balances but are not returned
 *                                      or counted in subtotals (so the "From"
 *                                      date narrows the view without breaking
 *                                      the running balance columns)
 * @returns {{ rows, userSubtotals, planSubtotals, grand }}
 */
export function buildLedgerRows(entries, usageDaily, { usernameById = {}, planFilter = null, visibleFrom = null } = {}) {
  const all = [...entries, ...usageDaily].map((r) => ({
    ...r,
    ts: r.ts instanceof Date ? r.ts : new Date(r.ts),
    username: r.username || usernameById[r.userId] || r.userId,
    voiceCredited: r.voiceCredited || 0,
    textCredited: r.textCredited || 0,
    voiceDebited: r.voiceDebited || 0,
    textDebited: r.textDebited || 0,
  }));

  all.sort((a, b) =>
    a.userId === b.userId
      ? (a.ts - b.ts) || (TYPE_SORT[a.type] - TYPE_SORT[b.type])
      : String(a.username).localeCompare(String(b.username), undefined, { sensitivity: "base" }));

  const rows = [];
  const userSubtotals = new Map();      // userId -> totals
  const planSubtotals = new Map();      // `${userId}|${planId}` -> { userId, username, planId, planName, totals }
  const grand = blankTotals();

  // Per-user running state.
  const state = new Map();
  const stateFor = (userId) => {
    if (!state.has(userId)) {
      state.set(userId, { vSub: 0, vTop: 0, tSub: 0, tTop: 0, lastCurrency: null, lastPeriod: null });
    }
    return state.get(userId);
  };

  for (const r of all) {
    const st = stateFor(r.userId);

    if (r.type === LEDGER_TYPE.GRANT) {
      const periodKey = r.periodStartDate ? new Date(r.periodStartDate).toISOString() : null;
      const isRollover = periodKey && periodKey !== st.lastPeriod;
      if (isRollover) {
        // New calendar-month period: subscription buckets reset to this grant.
        st.vSub = r.voiceCredited;
        st.tSub = r.textCredited;
        st.lastPeriod = periodKey;
      } else {
        // Immediate upgrade within the current period: additive delta.
        st.vSub += r.voiceCredited;
        st.tSub += r.textCredited;
      }
    } else if (r.type === LEDGER_TYPE.TOPUP) {
      st.vTop += r.voiceCredited;
      st.tTop += r.textCredited;
    } else if (r.type === "usage") {
      if (st.lastPeriod === null) {
        // Consumption from before this user ever had a subscription period
        // (pre-quota era). It's real spend and still shows in the Debited
        // columns + Spent tile, but there was no quota to draw against, so it
        // must NOT move the balance buckets — otherwise every pre-ledger token
        // becomes a phantom negative "top-up" balance. Balance cells render as
        // dashes for these rows.
        r._preQuota = true;
      } else {
        // Drain the current month's subscription bucket first, then any
        // cumulative top-up balance. The top-up bucket never goes below zero —
        // an overrun past BOTH shows as a negative *subscription* balance,
        // which is cleared at the next monthly grant (subscription Brendys
        // reset each period; top-up Brendys carry over).
        const drain = (sub, top, amount) => {
          const fromSub = Math.min(Math.max(sub, 0), amount);
          let rem = amount - fromSub;
          const fromTop = Math.min(Math.max(top, 0), rem);
          rem -= fromTop;
          return [sub - fromSub - rem, top - fromTop];
        };
        [st.vSub, st.vTop] = drain(st.vSub, st.vTop, r.voiceDebited);
        [st.tSub, st.tTop] = drain(st.tSub, st.tTop, r.textDebited);
      }
    }

    if (r.currency) st.lastCurrency = r.currency;
    const rowCurrency = r.currency || st.lastCurrency || "USD";

    // Below the "From" date: keep the running balances moving, but don't
    // surface the row or fold it into any subtotal.
    if (visibleFrom && r.ts < visibleFrom) continue;

    const row = {
      userId: r.userId,
      username: r.username,
      ts: r.ts.toISOString(),
      type: r.type,
      planId: r.planId || null,
      planName: r.planName || null,
      note: r.note || null,
      source: r.source || (r.type === "usage" ? "derived" : "live"),
      amountPaidCents: r.amountPaidCents || 0,
      currency: rowCurrency,
      voiceCredited: r.voiceCredited,
      textCredited: r.textCredited,
      voiceDebited: r.voiceDebited,
      textDebited: r.textDebited,
      // Pre-quota usage rows leave the buckets untouched — show dashes.
      voiceSubBalance: r._preQuota ? null : st.vSub,
      voiceTopupBalance: r._preQuota ? null : st.vTop,
      textSubBalance: r._preQuota ? null : st.tSub,
      textTopupBalance: r._preQuota ? null : st.tTop,
    };

    // Plan filter is applied AFTER balances are computed, so a filtered view
    // still shows balances consistent with the user's full history. Usage rows
    // carry the plan that was active when they were written, so they filter too.
    if (planFilter && row.planId !== planFilter) continue;

    rows.push(row);

    // Running per-user ending balances (last row processed for the user wins).
    for (const acc of [
      _get(userSubtotals, r.userId, () => ({ userId: r.userId, ...blankTotals() })),
      _get(planSubtotals, `${r.userId}|${row.planId || "-"}`, () => ({
        userId: r.userId, username: r.username, planId: row.planId, planName: row.planName, ...blankTotals(),
      })),
    ]) {
      addCurrency(acc.amountByCurrency, rowCurrency, row.amountPaidCents);
      acc.voiceCredited += row.voiceCredited;
      acc.textCredited += row.textCredited;
      acc.voiceDebited += row.voiceDebited;
      acc.textDebited += row.textDebited;
      acc.voiceSubBalance = st.vSub;
      acc.voiceTopupBalance = st.vTop;
      acc.textSubBalance = st.tSub;
      acc.textTopupBalance = st.tTop;
    }

    addCurrency(grand.amountByCurrency, rowCurrency, row.amountPaidCents);
    grand.voiceCredited += row.voiceCredited;
    grand.textCredited += row.textCredited;
    grand.voiceDebited += row.voiceDebited;
    grand.textDebited += row.textDebited;
    if (r.type === LEDGER_TYPE.GRANT) { grand.grantVoice += row.voiceCredited; grand.grantText += row.textCredited; }
    else if (r.type === LEDGER_TYPE.TOPUP) { grand.topupVoice += row.voiceCredited; grand.topupText += row.textCredited; }
  }

  // Grand-total balances = sum of every user's ending balances (a single
  // running bucket across users would be meaningless).
  const users = [...userSubtotals.values()];
  grand.voiceSubBalance   = users.reduce((s, u) => s + u.voiceSubBalance, 0);
  grand.voiceTopupBalance = users.reduce((s, u) => s + u.voiceTopupBalance, 0);
  grand.textSubBalance    = users.reduce((s, u) => s + u.textSubBalance, 0);
  grand.textTopupBalance  = users.reduce((s, u) => s + u.textTopupBalance, 0);

  return {
    rows,
    userSubtotals: users.map((totals) => ({
      ...totals,
      username: usernameById[totals.userId] || totals.userId,
    })),
    planSubtotals: [...planSubtotals.values()],
    grand,
  };
}

function _get(map, key, make) {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
}
