// Four blocks, same columns, all converted to money (tokens + Google Search
// fees) so they compare like for like. NEWS = headlines, tap reaction, news
// greeting (charged to Text Brendys). CLEAN-UP = housekeeping done for a user
// (fact learning, daily clean-up, TALK transcript fix) — costed, NOT charged.
const BLOCKS = [
  { type: "voice",   label: "VOICE",    modelLabel: "Voice model:",    cls: "row-voice-subtotal",   dayGroups: false },
  { type: "chat",    label: "CHAT",     modelLabel: "Chat model:",     cls: "row-chat-subtotal",    dayGroups: true  },
  { type: "news",    label: "NEWS",     modelLabel: "News model:",     cls: "row-news-subtotal",    dayGroups: true  },
  { type: "cleanup", label: "CLEAN-UP", modelLabel: "Clean-up model:", cls: "row-cleanup-subtotal", dayGroups: false, note: "not charged" },
];
const BLOCK_BY_TYPE = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));
const COLSPAN_ALL = 37;

// Event-row labels (Plan column) for tagged chat calls and clean-up jobs.
const FEATURE_LABELS = { topic: "Cambia tema", search: "news question", news: "news", recap: "carry-on recap" };
const CLEANUP_JOB_LABELS = {
  rds_extract:       "Fact learning",
  rds_consolidation: "Daily clean-up",
  transcript_fix:    "Transcript fix",
};

class DashboardApp {
  constructor() {
    this._page = {};
    this._exp  = {};
    this._data = {};
    BLOCKS.forEach(({ type }) => { this._page[type] = 1; this._exp[type] = true; this._data[type] = null; });
  }

  // ── Init ─────────────────────────────────────────────────

  async init() {
    this._tbody  = document.getElementById("dashboard-tbody");
    this._status = document.getElementById("status-msg");
    this._uSel   = document.getElementById("filter-user");
    this._pSel   = document.getElementById("filter-plan");
    this._fFrom  = document.getElementById("filter-from");
    this._fTo    = document.getElementById("filter-to");

    // Default date range: now−1 month to now
    const now  = new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - 1);
    this._fFrom.value = this._toLocalIso(from);
    this._fTo.value   = this._toLocalIso(now);

    // Load users
    try {
      const users = await this._apiFetch("/api/dashboard/users");
      this._uSel.innerHTML = '<option value="">ALL</option>';

      const realUsers  = users.filter((u) => !u.isAnonymous);
      const anonUsers  = users.filter((u) => u.isAnonymous);

      const addOption = (parent, u) => {
        const opt = document.createElement("option");
        opt.value       = u.userId;
        opt.textContent = u.displayName;
        parent.appendChild(opt);
      };

      if (realUsers.length) {
        const grp = document.createElement("optgroup");
        grp.label = "Users";
        realUsers.forEach((u) => addOption(grp, u));
        this._uSel.appendChild(grp);
      }
      if (anonUsers.length) {
        const grp = document.createElement("optgroup");
        grp.label = "Anonymous";
        anonUsers.forEach((u) => addOption(grp, u));
        this._uSel.appendChild(grp);
      }
    } catch (e) {
      if (e.status === 401) { window.location = "/api/auth/google"; return; }
      this._setStatus("Failed to load users: " + (e.message || e));
      return;
    }

    // Wire filter change listeners
    this._uSel.addEventListener("change",  () => this._onFilterChange());
    this._pSel.addEventListener("change",  () => this._onFilterChange());
    this._fFrom.addEventListener("change", () => this._onFilterChange());
    this._fTo.addEventListener("change",   () => this._onFilterChange());
    document.getElementById("btn-refresh").addEventListener("click", () => this._onFilterChange());

    // Prices column-group collapse/expand
    this._table = document.querySelector("table.dashboard-table");
    document.getElementById("price-toggle-close").addEventListener("click", () => this._setPricesCollapsed(true));
    document.getElementById("price-toggle-open").addEventListener("click", () => this._setPricesCollapsed(false));

    await this.fetchAndRender();
  }

  _setPricesCollapsed(collapsed) {
    this._table.classList.toggle("prices-collapsed", collapsed);
  }

  _onFilterChange() {
    BLOCKS.forEach(({ type }) => { this._page[type] = 1; });
    this.fetchAndRender();
  }

  // ── Data fetch ───────────────────────────────────────────

  async fetchAndRender() {
    this._setStatus("Loading…");
    const userId = this._uSel.value || "";
    const planId = this._pSel.value || "";
    const from   = this._fFrom.value ? new Date(this._fFrom.value).toISOString() : "";
    const to     = this._fTo.value   ? new Date(this._fTo.value).toISOString()   : "";

    try {
      const results = await Promise.all(
        BLOCKS.map(({ type }) => this._fetchEvents(type, userId, planId, from, to, this._page[type]))
      );
      BLOCKS.forEach(({ type }, i) => { this._data[type] = results[i]; });
      this._setStatus("");
      this._renderTable();
    } catch (e) {
      if (e.status === 401) { window.location = "/api/auth/google"; return; }
      this._setStatus("Error: " + (e.message || e));
    }
  }

  async _fetchEvents(type, userId, planId, from, to, page) {
    const params = new URLSearchParams({ page, pageSize: 50 });
    if (userId) params.set("userId", userId);
    if (planId) params.set("planId", planId);
    if (from)   params.set("from",   from);
    if (to)     params.set("to",     to);
    return this._apiFetch(`/api/dashboard/${type}-events?${params}`);
  }

  // ── Table render ─────────────────────────────────────────

  _renderTable() {
    const allUsers = !this._uSel.value;
    const from     = this._fFrom.value;

    let rows = "";
    BLOCKS.forEach(({ type }) => {
      const data = this._data[type];
      rows += allUsers
        ? this._renderAllUsersBlock(data?.events, type, data?.subtotals)
        : this._renderBlock(data, type);
    });

    rows += this._renderTotalsRow(BLOCKS.map(({ type }) => this._data[type]?.subtotals), from);

    this._tbody.innerHTML = rows;
    this._wireToggles();
    this._wirePagination();
  }

  // ── Single-user block ────────────────────────────────────

  _renderBlock(data, type) {
    if (!data) return "";
    const expanded = this._exp[type];
    let rows = "";
    rows += this._renderSubtotalRow(data.subtotals, type, expanded, data.total);
    if (expanded) {
      if (BLOCK_BY_TYPE[type].dayGroups) {
        rows += this._renderDayGroups(data.events, type, 14);
      } else {
        data.events.forEach((ev) => { rows += this._renderEventRow(ev, type); });
      }
      if (data.totalPages > 1) {
        rows += this._renderPaginationRow(data.page, data.totalPages, type, data.total);
      }
      rows += this._renderModelRow(data.subtotals?.models || [], type);
    }
    return rows;
  }

  // ── ALL users block ───────────────────────────────────────

  _renderAllUsersBlock(events, type, grandSubtotals) {
    if (!events?.length && !grandSubtotals) return this._renderSubtotalRow(null, type, false, 0);

    // Group events by userId
    const groups = new Map();
    (events || []).forEach((ev) => {
      if (!groups.has(ev.userId)) groups.set(ev.userId, []);
      groups.get(ev.userId).push(ev);
    });

    const expanded = this._exp[type];
    let rows = "";

    // Grand subtotal row (toggle controls all)
    rows += this._renderSubtotalRow(grandSubtotals, type, expanded, events?.length || 0);

    if (expanded) {
      groups.forEach((userEvents, userId) => {
        const userSub = this._computeSubtotals(userEvents);
        const label   = this._uLabel(userId);
        rows += this._renderPerUserSubtotal(userSub, label, type);
        if (BLOCK_BY_TYPE[type].dayGroups) {
          rows += this._renderDayGroups(userEvents, type, 28);
        } else {
          userEvents.forEach((ev) => { rows += this._renderEventRow(ev, type); });
        }
        rows += this._renderModelRow(userSub.models, type);
      });
    }

    return rows;
  }

  _uLabel(userId) {
    const sel = document.getElementById("filter-user");
    for (const opt of sel.options) {
      if (opt.value === userId) return opt.textContent;
    }
    return userId.replace(/^user_/, "");
  }

  _computeSubtotals(events) {
    const u = { textInputTokens:0, audioInputTokens:0, textOutputTokens:0, audioOutputTokens:0, thoughtsTokens:0, totalInputTokens:0, totalOutputTokens:0, totalTokens:0, searches:0, searchBrendys:0 };
    const c = { textInput:0, audioInput:0, textOutput:0, audioOutput:0, thoughts:0, search:0, totalInput:0, totalOutput:0, total:0 };
    const priceAccum = { textInput:[], audioInput:[], textOutput:[], audioOutput:[], search:[] };
    const models = new Set();

    events.forEach((ev) => {
      const us = ev.usage || {};
      const cs = ev.cost  || {};
      const pr = cs.pricingPer1K || {};

      Object.keys(u).forEach((k) => { u[k] += (us[k] || 0); });
      c.textInput   += cs.textInput   || 0;
      c.audioInput  += cs.audioInput  || 0;
      c.textOutput  += cs.textOutput  || 0;
      c.audioOutput += cs.audioOutput || 0;
      c.thoughts    += cs.thoughts    || 0;
      c.search      += cs.search      || 0;
      c.totalInput  += (cs.textInput  || 0) + (cs.audioInput  || 0);
      c.totalOutput += (cs.textOutput || 0) + (cs.audioOutput || 0);
      c.total       += cs.total       || 0;

      if (pr.textInput   != null) priceAccum.textInput.push(pr.textInput);
      if (pr.audioInput  != null) priceAccum.audioInput.push(pr.audioInput);
      if (pr.textOutput  != null) priceAccum.textOutput.push(pr.textOutput);
      if (pr.audioOutput != null) priceAccum.audioOutput.push(pr.audioOutput);
      if (ev.search?.unitPrice != null) priceAccum.search.push(ev.search.unitPrice);

      if (ev.model) models.add(ev.model);
    });

    const avg = (arr) => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : null;
    return {
      usage: u,
      cost:  c,
      avgPricing: {
        textInput:   avg(priceAccum.textInput),
        audioInput:  avg(priceAccum.audioInput),
        textOutput:  avg(priceAccum.textOutput),
        audioOutput: avg(priceAccum.audioOutput),
        search:      avg(priceAccum.search),
      },
      models: [...models],
    };
  }

  // ── Day-boundary grouping (chat, news) ───────────────────
  // Groups events into "business days" that roll over at 2am rather than
  // midnight, so a late-night chat isn't split from the evening before it.

  _dayBucketKey(dateVal) {
    const d = new Date(dateVal);
    if (d.getHours() < 2) d.setDate(d.getDate() - 1);
    return this._fmtDate(d);
  }

  _renderDayGroups(events, type, indent) {
    const groups = new Map();
    (events || []).forEach((ev) => {
      const key = ev.createdAt ? this._dayBucketKey(ev.createdAt) : "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ev);
    });

    let rows = "";
    groups.forEach((dayEvents, dayKey) => {
      const sub = this._computeSubtotals(dayEvents);
      const times = dayEvents
        .map((ev) => (ev.createdAt ? new Date(ev.createdAt).getTime() : null))
        .filter((t) => t != null);
      const spanMin = times.length ? (Math.max(...times) - Math.min(...times)) / 60000 : 0;
      rows += this._renderDaySubtotal(dayKey, sub, dayEvents.length, spanMin, type, indent);
      dayEvents.forEach((ev) => { rows += this._renderEventRow(ev, type); });
    });
    return rows;
  }

  _renderDaySubtotal(dayKey, sub, count, spanMin, type, indent) {
    const cls  = BLOCK_BY_TYPE[type].cls;
    const u    = sub.usage || {};
    const c    = sub.cost  || {};
    const p    = sub.avgPricing || {};
    const tprc = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);
    const unit = type === "news" ? "call" : "msg";

    return `<tr class="${cls}" style="opacity:0.75;">
      <td colspan="3" style="text-align:left;padding-left:${indent}px;font-style:italic">${this._esc(dayKey)}
        <span style="font-weight:normal;font-size:10px;margin-left:4px">(${count} ${unit}${count === 1 ? "" : "s"})</span>
      </td>
      ${this._tokenCells(u, true)}
      ${this._searchCells(u, true)}
      ${this._voiceMinCells(u, true)}
      ${this._tokensPerMinFromDuration(u.totalTokens, spanMin)}
      ${this._priceCells(p, tprc, true)}
      ${this._voicePriceCells(p, true)}
      ${this._costCells(c, true)}
      ${this._voiceCostCells(c, true)}
    </tr>`;
  }

  // ── Row renderers ────────────────────────────────────────

  _renderSubtotalRow(sub, type, expanded, total) {
    const block = BLOCK_BY_TYPE[type];
    const icon  = expanded ? "▲" : "▼";
    const u     = sub?.usage   || {};
    const c     = sub?.cost    || {};
    const p     = sub?.avgPricing || {};
    const tprc  = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);
    const note  = block.note ? ` · ${block.note}` : "";

    return `<tr class="${block.cls}" data-block="${type}">
      <td colspan="3" style="text-align:left"><strong>${block.label}</strong>
        <button class="toggle-btn js-toggle" data-block="${type}">${icon}</button>
        <span style="font-weight:normal;font-size:10px;margin-left:4px">(${this._fmtInt(total)} ${type === "cleanup" ? "rows" : "events"}${note})</span>
      </td>
      ${this._tokenCells(u, true)}
      ${this._searchCells(u, true)}
      ${this._voiceMinCells(u, true)}
      ${this._tokensPerMinCell(u)}
      ${this._priceCells(p, tprc, true)}
      ${this._voicePriceCells(p, true)}
      ${this._costCells(c, true)}
      ${this._voiceCostCells(c, true)}
    </tr>`;
  }

  _renderPerUserSubtotal(sub, label, type) {
    const cls  = BLOCK_BY_TYPE[type].cls;
    const u    = sub?.usage   || {};
    const c    = sub?.cost    || {};
    const p    = sub?.avgPricing || {};
    const tprc = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);

    return `<tr class="${cls}" style="opacity:0.75;">
      <td colspan="3" style="text-align:left;padding-left:14px;font-style:italic">${this._esc(label)}</td>
      ${this._tokenCells(u, true)}
      ${this._searchCells(u, true)}
      ${this._voiceMinCells(u, true)}
      ${this._tokensPerMinCell(u)}
      ${this._priceCells(p, tprc, true)}
      ${this._voicePriceCells(p, true)}
      ${this._costCells(c, true)}
      ${this._voiceCostCells(c, true)}
    </tr>`;
  }

  // Plan column: the plan, plus what the call was for when it isn't a plain
  // chat/voice turn; clean-up rows show the job and how many calls it folds.
  _eventLabel(ev, type) {
    if (type === "cleanup") {
      const job = CLEANUP_JOB_LABELS[ev.job] || ev.job || "—";
      const calls = ev.calls || 0;
      const run = ev.job === "rds_consolidation" && ev.bucket ? ` ${ev.bucket}` : "";
      return `${job}${run} (${calls} call${calls === 1 ? "" : "s"})`;
    }
    const plan = ev.planDisplayName || "—";
    if (ev.search?.count && type === "voice") return `${plan} · search`;
    return ev.feature && ev.feature !== "news" ? `${plan} · ${FEATURE_LABELS[ev.feature] || ev.feature}` : plan;
  }

  _renderEventRow(ev, type) {
    const d    = ev.createdAt ? new Date(ev.createdAt) : null;
    const u    = ev.usage  || {};
    const raw  = ev.cost   || {};
    const c    = {
      ...raw,
      totalInput:  (raw.textInput  || 0) + (raw.audioInput  || 0),
      totalOutput: (raw.textOutput || 0) + (raw.audioOutput || 0),
    };
    const p   = { ...(raw.pricingPer1K || {}), search: ev.search?.unitPrice ?? null };
    const tprc = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);
    // Daily clean-up rows are per UTC day: show that day, not the first call's time.
    const dayOnly = type === "cleanup" && ev.job !== "rds_consolidation";

    return `<tr class="row-event">
      <td class="col-dt">${dayOnly ? this._esc(ev.bucket || "") : (d ? this._fmtDate(d) : "")}</td>
      <td class="col-dt">${dayOnly ? "" : (d ? this._fmtTime(d) : "")}</td>
      <td>${this._esc(this._eventLabel(ev, type))}</td>
      ${this._tokenCells(u)}
      ${this._searchCells(u)}
      ${this._voiceMinCells(u)}
      <td></td>
      ${this._priceCells(p, tprc)}
      ${this._voicePriceCells(p)}
      ${this._costCells(c)}
      ${this._voiceCostCells(c)}
    </tr>`;
  }

  _renderModelRow(models, type) {
    const label = BLOCK_BY_TYPE[type].modelLabel;
    const value = (models || []).filter(Boolean).sort().join(", ") || "—";
    return `<tr class="row-model">
      <td colspan="${COLSPAN_ALL}">${label} ${this._esc(value)}</td>
    </tr>`;
  }

  _renderPaginationRow(page, totalPages, type, total) {
    const prevDis = page <= 1 ? "disabled" : "";
    const nextDis = page >= totalPages ? "disabled" : "";
    return `<tr class="row-pagination">
      <td colspan="${COLSPAN_ALL}">
        <button class="pagination-btn js-prev-page" data-block="${type}" ${prevDis}>&#8592; Previous</button>
        <span class="pagination-label">Page ${page} of ${totalPages} &nbsp;(${this._fmtInt(total)} total)</span>
        <button class="pagination-btn js-next-page" data-block="${type}" ${nextDis}>Next &#8594;</button>
      </td>
    </tr>`;
  }

  _renderTotalsRow(subs, fromValue) {
    // Sum every block's subtotals (VOICE + CHAT + NEWS + CLEAN-UP)
    const present = (subs || []).filter(Boolean);
    const sum = (pick, k) => present.reduce((a, s) => a + ((s[pick] || {})[k] || 0), 0);

    const u = {};
    ["textInputTokens","audioInputTokens","textOutputTokens","audioOutputTokens",
     "thoughtsTokens","totalInputTokens","totalOutputTokens","totalTokens",
     "searches","searchBrendys"].forEach((k) => { u[k] = sum("usage", k); });

    const c = {};
    ["textInput","audioInput","textOutput","audioOutput","thoughts","search",
     "totalInput","totalOutput","total"].forEach((k) => { c[k] = sum("cost", k); });

    // Simple average of each block's average pricing
    const wavg = (key) => {
      const vals = present.map((s) => s.avgPricing?.[key]).filter((v) => v != null);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    };
    const p = {
      textInput: wavg("textInput"), audioInput: wavg("audioInput"),
      textOutput: wavg("textOutput"), audioOutput: wavg("audioOutput"), search: wavg("search"),
    };
    const tprc = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);

    // Date/time label from From filter
    let dateCell = "", timeCell = "";
    if (fromValue) {
      const d = new Date(fromValue);
      dateCell = this._fmtDate(d);
      timeCell = this._fmtTime(d);
    }

    return `<tr class="row-totals">
      <td class="col-dt">${this._esc(dateCell)}</td>
      <td class="col-dt">${this._esc(timeCell)}</td>
      <td></td>
      ${this._tokenCells(u, true)}
      ${this._searchCells(u, true)}
      ${this._voiceMinCells(u, true)}
      ${this._tokensPerMinCell(u)}
      ${this._priceCells(p, tprc, true)}
      ${this._voicePriceCells(p, true)}
      ${this._costCells(c, true)}
      ${this._voiceCostCells(c, true)}
    </tr>`;
  }

  // ── Cell group helpers ───────────────────────────────────

  _tokenCells(u, isSubtotal = false) {
    const cls = isSubtotal
      ? ["col-blue","col-blue","col-green","col-green","col-yellow","col-blue","col-green","col-white"]
      : ["","","","","","","",""];
    return [
      u.textInputTokens, u.audioInputTokens, u.textOutputTokens, u.audioOutputTokens,
      u.thoughtsTokens, u.totalInputTokens, u.totalOutputTokens, u.totalTokens,
    ].map((v, i) => `<td class="${cls[i]}">${this._fmtInt(v)}</td>`).join("");
  }

  // Google Search: number of billed searches, and the Brendys charged for them
  // (on top of the tokens — Brendys charged = tokens total + these).
  _searchCells(u, isSubtotal = false) {
    const cls = isSubtotal ? "col-search" : "";
    return [u.searches, u.searchBrendys]
      .map((v) => `<td class="${cls}">${this._fmtInt(v)}</td>`).join("");
  }

  _priceCells(p, thoughtsPrice, isSubtotal = false) {
    const baseCls = isSubtotal ? "col-orange col-price" : "col-price";
    return [
      p?.textInput, p?.audioInput, p?.textOutput, p?.audioOutput,
    ].map((v) => `<td class="${baseCls}">${this._fmtPricePerM(v)}</td>`).join("")
      + `<td class="${isSubtotal ? "col-yellow col-price" : "col-price"}">${thoughtsPrice}</td>`
      + `<td class="${isSubtotal ? "col-search col-price" : "col-price"}">${this._fmtSmartDecimal(p?.search ?? null)}</td>`;
  }

  _costCells(c, isSubtotal = false) {
    const cls = isSubtotal
      ? ["col-blue","col-blue","col-green","col-green","col-yellow","col-search","col-blue","col-green","col-white"]
      : ["","","","","","","","",""];
    return [
      c.textInput, c.audioInput, c.textOutput, c.audioOutput,
      c.thoughts, c.search, c.totalInput, c.totalOutput, c.total,
    ].map((v, i) => `<td class="${cls[i]}">${this._fmtCost(v)}</td>`).join("");
  }

  _voiceMinCells(u, isSubtotal = false) {
    const cls    = isSubtotal ? ["col-blue","col-green","col-white"] : ["","",""];
    const inMin  = (u.audioInputTokens  || 0) / 1500;
    const outMin = (u.audioOutputTokens || 0) / 1500;
    const totMin = inMin + outMin;
    return [inMin, outMin, totMin]
      .map((v, i) => `<td class="${cls[i]}">${this._fmtMin(v)}</td>`).join("");
  }

  _tokensPerMinCell(u) {
    const totMin = ((u.audioInputTokens || 0) + (u.audioOutputTokens || 0)) / 1500;
    return `<td class="col-white">${this._fmtTokensPerMin(u.totalTokens, totMin)}</td>`;
  }

  _tokensPerMinFromDuration(totalTokens, minutes) {
    return `<td class="col-white">${this._fmtTokensPerMin(totalTokens, minutes)}</td>`;
  }

  _fmtTokensPerMin(totalTokens, minutes) {
    if (!(minutes > 0.005)) return "---";
    return (totalTokens / minutes).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  _voicePriceCells(p, isSubtotal = false) {
    const baseCls  = isSubtotal ? "col-orange col-price" : "col-price";
    const priceIn  = p?.audioInput  != null ? (p.audioInput  / 1000) * 25 * 60 : null;
    const priceOut = p?.audioOutput != null ? (p.audioOutput / 1000) * 25 * 60 : null;
    return [priceIn, priceOut]
      .map((v) => `<td class="${baseCls}">${this._fmtSmartDecimal(v)}</td>`).join("");
  }

  _voiceCostCells(c, isSubtotal = false) {
    const cls     = isSubtotal ? ["col-blue","col-green","col-white"] : ["","",""];
    const costIn  = c.audioInput  || 0;
    const costOut = c.audioOutput || 0;
    const costTot = costIn + costOut;
    return [costIn, costOut, costTot]
      .map((v, i) => `<td class="${cls[i]}">${this._fmtCost(v)}</td>`).join("");
  }

  // ── Event wiring ─────────────────────────────────────────

  _wireToggles() {
    this._tbody.querySelectorAll(".js-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const block = btn.dataset.block;
        this._exp[block] = !this._exp[block];
        this._renderTable();
      });
    });
  }

  _wirePagination() {
    this._tbody.querySelectorAll(".js-prev-page").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        this._page[btn.dataset.block]--;
        this.fetchAndRender();
      });
    });
    this._tbody.querySelectorAll(".js-next-page").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        this._page[btn.dataset.block]++;
        this.fetchAndRender();
      });
    });
  }

  // ── Format helpers ───────────────────────────────────────

  _fmtInt(v) {
    if (v == null || isNaN(v)) return "0";
    return Math.round(v).toLocaleString("en-US");
  }

  _fmtMin(v) {
    if (v == null || isNaN(v)) return "0.00";
    return Number(v).toFixed(2);
  }

  _fmtSmartDecimal(v) {
    if (v == null) return "—";
    const n = Number(v);
    return n >= 1 ? n.toFixed(2) : n.toFixed(3);
  }

  _fmtPricePerM(v) {
    if (v == null) return "—";
    return this._fmtSmartDecimal(Number(v) * 1000);
  }

  _fmtCost(v) {
    if (v == null) return "0.000000";
    return Number(v).toFixed(6);
  }

  _fmtDate(d) {
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${dy}`;
  }

  _fmtTime(d) {
    const h  = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${mi}`;
  }

  _calcThoughtsPrice(costThoughts, thoughtsTokens) {
    if (!thoughtsTokens || thoughtsTokens === 0) return "—";
    return this._fmtSmartDecimal((costThoughts / thoughtsTokens) * 1000000);
  }

  _toLocalIso(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  _esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  _setStatus(msg) {
    this._status.textContent = msg;
  }

  // ── API ──────────────────────────────────────────────────

  async _apiFetch(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
}
