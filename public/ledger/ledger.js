// public/ledger/ledger.js
// Admin "Ledger" report. Gated by the dashboard session — a 401 bounces to
// the same Google sign-in the dashboard uses.

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    user:   $("filter-user"),
    plan:   $("filter-plan"),
    from:   $("filter-from"),
    to:     $("filter-to"),
    refresh:$("btn-refresh"),
    csv:    $("btn-csv"),
    status: $("status-msg"),
    tiles:  $("ledger-tiles"),
    tbody:  $("ledger-tbody"),
    tfoot:  $("ledger-tfoot"),
  };

  let lastData = null;

  const COLS = [
    "User", "Date / time (UTC)", "Type", "Plan", "Paid",
    "Voice credited", "Text credited", "Voice debited", "Text debited",
    "Voice sub balance", "Voice top-up balance", "Text sub balance", "Text top-up balance",
  ];

  // ── formatting ───────────────────────────────────────────────
  const intFmt = new Intl.NumberFormat("en-US");
  const nf = (n) => {
    const v = Math.round(n || 0);
    return v < 0 ? `(${intFmt.format(Math.abs(v))})` : intFmt.format(v);
  };
  const money = (amountByCurrency, symbols) => {
    const parts = Object.entries(amountByCurrency || {}).filter(([, c]) => c);
    if (!parts.length) return "";
    return parts
      .map(([cur, cents]) => `${symbols[cur] || cur} ${(cents / 100).toFixed(2)}`)
      .join("  +  ");
  };
  const moneyOne = (cents, cur, symbols) =>
    `${symbols[cur] || cur} ${((cents || 0) / 100).toFixed(2)}`;
  const dtFmt = (iso) => (iso ? `${iso.slice(0, 10)}  ${iso.slice(11, 16)}` : "");

  const setStatus = (msg) => { els.status.textContent = msg || ""; };

  async function fetchJSON(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return res.json();
  }

  // ── data load ────────────────────────────────────────────────
  async function loadUsers() {
    try {
      const users = await fetchJSON("/api/dashboard/users");
      for (const u of users) {
        if (u.isAnonymous) continue; // no subscriptions / ledger rows for anon
        const o = document.createElement("option");
        o.value = u.userId;
        o.textContent = u.displayName || u.userId;
        els.user.appendChild(o);
      }
    } catch (e) {
      if (e.status === 401) { window.location = "/api/auth/google"; return; }
      setStatus("Could not load user list.");
    }
  }

  function currentQuery() {
    const p = new URLSearchParams();
    if (els.user.value) p.set("user", els.user.value);
    if (els.plan.value) p.set("plan", els.plan.value);
    if (els.from.value) p.set("from", els.from.value);
    if (els.to.value)   p.set("to", els.to.value);
    return p.toString();
  }

  async function load() {
    setStatus("Loading…");
    try {
      const data = await fetchJSON(`/api/ledger/entries?${currentQuery()}`);
      lastData = data;
      populatePlanFilter(data.plans);
      render(data);
      setStatus(data.rows.length ? "" : "No transactions match the current filters.");
    } catch (e) {
      if (e.status === 401) { window.location = "/api/auth/google"; return; }
      console.error(e);
      setStatus("Error loading ledger.");
    }
  }

  let planFilterReady = false;
  function populatePlanFilter(plans) {
    if (planFilterReady || !plans) return;
    for (const p of plans) {
      const o = document.createElement("option");
      o.value = p.planId;
      o.textContent = p.displayName;
      els.plan.appendChild(o);
    }
    planFilterReady = true;
  }

  // ── rendering ────────────────────────────────────────────────
  function tile(lbl, val, cls) {
    return `<div class="tile ${cls || ""}"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
  }

  function render(data) {
    const sym = data.currencySymbols || { USD: "$", GBP: "£", EUR: "€" };
    const g = data.grand;

    els.tiles.innerHTML =
      tile("Subscribed · voice + text", `${nf(g.grantVoice)} + ${nf(g.grantText)}`, "is-credit") +
      tile("Purchased · voice + text", `${nf(g.topupVoice)} + ${nf(g.topupText)}`, "is-topup") +
      tile("Spent · voice + text", `${nf(g.voiceDebited)} + ${nf(g.textDebited)}`, "is-debit") +
      tile("Amount “paid”", money(g.amountByCurrency, sym) || `${sym.USD} 0.00`);

    const tb = [];
    const rowsByUser = new Map();
    for (const r of data.rows) {
      if (!rowsByUser.has(r.userId)) rowsByUser.set(r.userId, []);
      rowsByUser.get(r.userId).push(r);
    }

    const planFiltered = !!data.filters.plan;

    for (const [userId, rows] of rowsByUser) {
      for (const r of rows) tb.push(txnRow(r, sym));

      const planSubs = (data.planSubtotals || []).filter((p) => p.userId === userId);
      if (!planFiltered && planSubs.length > 1) {
        for (const ps of planSubs) tb.push(subtotalRow(ps, sym, `${ps.username} — ${ps.planName || ps.planId || "—"}`, "lg-subtotal--plan"));
      }
      const us = (data.userSubtotals || []).find((u) => u.userId === userId);
      if (us) tb.push(subtotalRow(us, sym, `${us.username} — subtotal${planFiltered ? ` (${planLabel(data)})` : ""}`, ""));
    }

    els.tbody.innerHTML = tb.join("") || `<tr><td class="col-l" colspan="${COLS.length}">—</td></tr>`;
    els.tfoot.innerHTML = data.rows.length ? grandRow(data.grand, sym, data) : "";
  }

  function planLabel(data) {
    const p = (data.plans || []).find((x) => x.planId === data.filters.plan);
    return p ? p.displayName : data.filters.plan;
  }

  function balCell(v, extraCls) {
    if (v == null) return `<td class="lg-muted">–</td>`;   // pre-quota usage row
    const neg = v < 0;
    return `<td class="${neg ? "lg-neg" : (extraCls || "")}">${nf(v)}</td>`;
  }

  function txnRow(r, sym) {
    const isUsage = r.type === "usage";
    const paid = (r.type === "grant" || r.type === "topup")
      ? `<td>${moneyOne(r.amountPaidCents, r.currency, sym)}</td>`
      : `<td class="lg-muted">—</td>`;
    const cr = (v) => (v ? `<td class="lg-credit">${nf(v)}</td>` : `<td class="lg-muted">–</td>`);
    const db = (v) => (v ? `<td class="lg-debit">${nf(v)}</td>` : `<td class="lg-muted">–</td>`);
    return `<tr class="lg-row lg-row--${r.type}">
      <td class="col-l">${esc(r.username)}</td>
      <td class="col-l">${dtFmt(r.ts)}</td>
      <td class="col-l"><span class="lg-chip lg-chip--${r.type}">${r.type.replace("_", " ")}</span></td>
      <td class="col-l">${esc(r.planName || r.planId || "—")}${r.note ? ` <span class="lg-muted">· ${esc(r.note)}</span>` : ""}</td>
      ${paid}
      ${cr(r.voiceCredited)}${cr(r.textCredited)}
      ${db(r.voiceDebited)}${db(r.textDebited)}
      ${balCell(r.voiceSubBalance)}${balCell(r.voiceTopupBalance, "lg-topup")}
      ${balCell(r.textSubBalance)}${balCell(r.textTopupBalance, "lg-topup")}
    </tr>`;
  }

  function subtotalRow(s, sym, label, cls) {
    return `<tr class="lg-subtotal ${cls}">
      <td class="col-l" colspan="4">${esc(label)}</td>
      <td>${money(s.amountByCurrency, sym) || `${sym.USD} 0.00`}</td>
      <td class="lg-credit">${nf(s.voiceCredited)}</td>
      <td class="lg-credit">${nf(s.textCredited)}</td>
      <td class="lg-debit">${nf(s.voiceDebited)}</td>
      <td class="lg-debit">${nf(s.textDebited)}</td>
      ${balCell(s.voiceSubBalance)}${balCell(s.voiceTopupBalance, "lg-topup")}
      ${balCell(s.textSubBalance)}${balCell(s.textTopupBalance, "lg-topup")}
    </tr>`;
  }

  function grandRow(g, sym, data) {
    const scope = data.filters.user ? (data.userSubtotals[0]?.username || data.filters.user) : "all users";
    const withPlan = data.filters.plan ? ` · ${planLabel(data)}` : "";
    return `<tr>
      <td class="col-l" colspan="4">Grand total — ${esc(scope)}${withPlan}</td>
      <td>${money(g.amountByCurrency, sym) || `${sym.USD} 0.00`}</td>
      <td>${nf(g.voiceCredited)}</td>
      <td>${nf(g.textCredited)}</td>
      <td>${nf(g.voiceDebited)}</td>
      <td>${nf(g.textDebited)}</td>
      ${balCell(g.voiceSubBalance)}${balCell(g.voiceTopupBalance)}
      ${balCell(g.textSubBalance)}${balCell(g.textTopupBalance)}
    </tr>`;
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
  ));

  // ── CSV export ───────────────────────────────────────────────
  function toCSV(data) {
    const sym = data.currencySymbols || {};
    const q = (v) => {
      const s = String(v == null ? "" : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const moneyPlain = (map) => Object.entries(map || {})
      .filter(([, c]) => c).map(([cur, c]) => `${(c / 100).toFixed(2)} ${cur}`).join(" + ");

    const lines = [COLS.join(",")];
    const rowsByUser = new Map();
    for (const r of data.rows) {
      if (!rowsByUser.has(r.userId)) rowsByUser.set(r.userId, []);
      rowsByUser.get(r.userId).push(r);
    }
    const planFiltered = !!data.filters.plan;

    for (const [userId, rows] of rowsByUser) {
      for (const r of rows) {
        lines.push([
          r.username, dtFmt(r.ts), r.type, r.planName || r.planId || "",
          (r.type === "grant" || r.type === "topup") ? `${(r.amountPaidCents / 100).toFixed(2)} ${r.currency}` : "",
          r.voiceCredited || "", r.textCredited || "", r.voiceDebited || "", r.textDebited || "",
          r.voiceSubBalance, r.voiceTopupBalance, r.textSubBalance, r.textTopupBalance,
        ].map(q).join(","));
      }
      const planSubs = (data.planSubtotals || []).filter((p) => p.userId === userId);
      if (!planFiltered && planSubs.length > 1) {
        for (const ps of planSubs) {
          lines.push([
            `${ps.username} — ${ps.planName || ps.planId || ""} subtotal`, "", "", "",
            moneyPlain(ps.amountByCurrency),
            ps.voiceCredited, ps.textCredited, ps.voiceDebited, ps.textDebited,
            ps.voiceSubBalance, ps.voiceTopupBalance, ps.textSubBalance, ps.textTopupBalance,
          ].map(q).join(","));
        }
      }
      const us = (data.userSubtotals || []).find((u) => u.userId === userId);
      if (us) {
        lines.push([
          `${us.username} — subtotal`, "", "", "",
          moneyPlain(us.amountByCurrency),
          us.voiceCredited, us.textCredited, us.voiceDebited, us.textDebited,
          us.voiceSubBalance, us.voiceTopupBalance, us.textSubBalance, us.textTopupBalance,
        ].map(q).join(","));
      }
    }
    const g = data.grand;
    lines.push([
      "GRAND TOTAL", "", "", "", moneyPlain(g.amountByCurrency),
      g.voiceCredited, g.textCredited, g.voiceDebited, g.textDebited,
      g.voiceSubBalance, g.voiceTopupBalance, g.textSubBalance, g.textTopupBalance,
    ].map(q).join(","));

    return lines.join("\r\n");
  }

  // Label of the currently-selected <option> ("" value = the "ALL" entry).
  const selLabel = (el) => (el.value ? el.selectedOptions[0]?.textContent || el.value : "");
  const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "");

  function csvFilename() {
    const f = lastData.filters;
    const parts = ["brenda-ledger"];
    if (f.from) parts.push(f.from);
    if (f.to) parts.push(f.to);
    // Always name the plan and user filter — "All" when nothing is selected.
    parts.push(`plan-${slug(selLabel(els.plan) || "All")}`);
    parts.push(`user-${slug(selLabel(els.user) || "All")}`);
    return `${parts.join("_")}.csv`;
  }

  function downloadCSV() {
    if (!lastData) return;
    const blob = new Blob([toCSV(lastData)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── default date range: To = yesterday, From = one month before that ──
  function ymd(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function initDates() {
    if (!els.to.value) {
      const to = new Date();
      to.setDate(to.getDate() - 1);
      els.to.value = ymd(to);
    }
    if (!els.from.value) {
      const [y, m, d] = els.to.value.split("-").map(Number);
      const from = new Date(y, m - 1, d);
      from.setMonth(from.getMonth() - 1);
      els.from.value = ymd(from);
    }
  }

  // ── wire up ──────────────────────────────────────────────────
  [els.user, els.plan, els.from, els.to].forEach((el) => el.addEventListener("change", load));
  els.refresh.addEventListener("click", load);
  els.csv.addEventListener("click", downloadCSV);

  initDates();
  loadUsers().then(load);
})();
