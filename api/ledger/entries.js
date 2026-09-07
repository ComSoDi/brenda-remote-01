// api/ledger/entries.js
// Data endpoint for the admin "Ledger" report (public/ledger/).
// Gated by the SAME session as the dashboard (requireDashboardSession —
// Google sign-in restricted to DASHBOARD_ALLOWED_EMAIL).
//
// Query params (all optional):
//   user  — app userId ("user_Mike"); omitted / "" = all users
//   plan  — planId ("brenda_superior"); omitted / "" = all plans
//   from  — ISO date (inclusive); narrows the displayed rows
//   to    — ISO date (inclusive)
//
// Returns billing rows (ledger_entries) merged with one derived debit row per
// user per UTC day (from gemini_*_usage_events), each carrying the four
// running balance buckets, plus per-user / per-(user,plan) subtotals and a
// grand total. Balances are computed over the user's FULL history up to `to`,
// then the `from` filter is applied to what's shown.

import { requireDashboardSession } from "../../lib/dashboard-auth.js";
import { getDb } from "../../lib/mongo.js";
import {
  LEDGER_COLLECTION, buildLedgerRows, aggregateDailyUsage, CURRENCY_SYMBOL,
} from "../../lib/ledger.js";

function parseQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const user = url.searchParams.get("user") || null;
  const plan = url.searchParams.get("plan") || null;
  const from = url.searchParams.get("from") || null;
  const to = url.searchParams.get("to") || null;
  return { user, plan, from, to };
}

// End-of-day so a bare "YYYY-MM-DD" in `to` includes that whole day (UTC).
function endOfDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) d.setUTCHours(23, 59, 59, 999);
  return d;
}
function startOfDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }
  if (!requireDashboardSession(req, res)) return;

  const { user, plan, from, to } = parseQuery(req);
  const fromDate = startOfDay(from);
  const toDate = endOfDay(to);

  try {
    const db = await getDb();

    const users = await db.collection("users")
      .find({}, { projection: { userId: 1, username: 1, displayName: 1, isAnonymous: 1 } })
      .toArray();
    const usernameById = {};
    for (const u of users) {
      usernameById[u.userId] = u.isAnonymous
        ? u.userId.replace(/^user_/, "")
        : (u.displayName || u.username || u.userId.replace(/^user_/, ""));
    }

    // Billing entries: whole history up to `to` (running balances need it).
    const entryMatch = {};
    if (user) entryMatch.userId = user;
    if (toDate) entryMatch.ts = { $lte: toDate };
    const entries = await db.collection(LEDGER_COLLECTION)
      .find(entryMatch).sort({ ts: 1 }).toArray();

    // Derived daily consumption, same whole-history-up-to-`to` window.
    const usageDaily = await aggregateDailyUsage(db, { userId: user, to: toDate });

    const { rows, userSubtotals, planSubtotals, grand } = buildLedgerRows(entries, usageDaily, {
      usernameById,
      planFilter: plan,
      visibleFrom: fromDate,
    });

    // Plans list for the filter dropdown (active tiers + top-up).
    const plans = await db.collection("plans")
      .find({}, { projection: { planId: 1, displayName: 1, sortOrder: 1, isActive: 1 } })
      .sort({ sortOrder: 1 }).toArray();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      rows,
      userSubtotals,
      planSubtotals,
      grand,
      currencySymbols: CURRENCY_SYMBOL,
      filters: { user, plan, from, to },
      plans: plans.map((p) => ({ planId: p.planId, displayName: p.displayName })),
    }));
  } catch (e) {
    console.error("[ledger/entries]", e?.message || e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}
