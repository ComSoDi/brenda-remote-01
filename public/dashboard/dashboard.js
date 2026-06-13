class DashboardApp {
  constructor() {
    this._voicePage    = 1;
    this._chatPage     = 1;
    this._voiceExp     = true;
    this._chatExp      = true;
    this._voiceData    = null;
    this._chatData     = null;
  }

  // ── Init ─────────────────────────────────────────────────

  async init() {
    this._tbody  = document.getElementById("dashboard-tbody");
    this._status = document.getElementById("status-msg");
    this._uSel   = document.getElementById("filter-user");
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
      users.forEach((u) => {
        const opt = document.createElement("option");
        opt.value       = u.userId;
        opt.textContent = u.displayName;
        this._uSel.appendChild(opt);
      });
    } catch (e) {
      if (e.status === 401) { window.location = "/api/auth/google"; return; }
      this._setStatus("Failed to load users: " + (e.message || e));
      return;
    }

    // Wire filter change listeners
    this._uSel.addEventListener("change",  () => this._onFilterChange());
    this._fFrom.addEventListener("change", () => this._onFilterChange());
    this._fTo.addEventListener("change",   () => this._onFilterChange());
    document.getElementById("btn-refresh").addEventListener("click", () => this._onFilterChange());

    await this.fetchAndRender();
  }

  _onFilterChange() {
    this._voicePage = 1;
    this._chatPage  = 1;
    this.fetchAndRender();
  }

  // ── Data fetch ───────────────────────────────────────────

  async fetchAndRender() {
    this._setStatus("Loading…");
    const userId = this._uSel.value || "";
    const from   = this._fFrom.value ? new Date(this._fFrom.value).toISOString() : "";
    const to     = this._fTo.value   ? new Date(this._fTo.value).toISOString()   : "";

    try {
      [this._voiceData, this._chatData] = await Promise.all([
        this._fetchEvents("voice", userId, from, to, this._voicePage),
        this._fetchEvents("chat",  userId, from, to, this._chatPage),
      ]);
      this._setStatus("");
      this._renderTable();
    } catch (e) {
      if (e.status === 401) { window.location = "/api/auth/google"; return; }
      this._setStatus("Error: " + (e.message || e));
    }
  }

  async _fetchEvents(type, userId, from, to, page) {
    const params = new URLSearchParams({ page, pageSize: 50 });
    if (userId) params.set("userId", userId);
    if (from)   params.set("from",   from);
    if (to)     params.set("to",     to);
    return this._apiFetch(`/api/dashboard/${type}-events?${params}`);
  }

  // ── Table render ─────────────────────────────────────────

  _renderTable() {
    const userId   = this._uSel.value;
    const allUsers = !userId;
    const from     = this._fFrom.value;

    let rows = "";
    rows += allUsers
      ? this._renderAllUsersBlock(this._voiceData.events, "voice", this._voiceData.subtotals)
      : this._renderBlock(this._voiceData, "voice");

    rows += allUsers
      ? this._renderAllUsersBlock(this._chatData.events, "chat", this._chatData.subtotals)
      : this._renderBlock(this._chatData, "chat");

    rows += this._renderTotalsRow(this._voiceData.subtotals, this._chatData.subtotals, from);

    this._tbody.innerHTML = rows;
    this._wireToggles();
    this._wirePagination();
  }

  // ── Single-user block ────────────────────────────────────

  _renderBlock(data, type) {
    if (!data) return "";
    const expanded = type === "voice" ? this._voiceExp : this._chatExp;
    let rows = "";
    rows += this._renderSubtotalRow(data.subtotals, type, expanded, data.total);
    if (expanded) {
      data.events.forEach((ev) => { rows += this._renderEventRow(ev); });
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

    const expanded = type === "voice" ? this._voiceExp : this._chatExp;
    let rows = "";

    // Grand subtotal row (toggle controls all)
    rows += this._renderSubtotalRow(grandSubtotals, type, expanded, events?.length || 0);

    if (expanded) {
      groups.forEach((userEvents, userId) => {
        const userSub = this._computeSubtotals(userEvents);
        const label   = this._uLabel(userId);
        rows += this._renderPerUserSubtotal(userSub, label, type);
        userEvents.forEach((ev) => { rows += this._renderEventRow(ev); });
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
    const u = { textInputTokens:0, audioInputTokens:0, textOutputTokens:0, audioOutputTokens:0, thoughtsTokens:0, totalInputTokens:0, totalOutputTokens:0, totalTokens:0 };
    const c = { textInput:0, audioInput:0, textOutput:0, audioOutput:0, thoughts:0, totalInput:0, totalOutput:0, total:0 };
    const priceAccum = { textInput:[], audioInput:[], textOutput:[], audioOutput:[] };
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
      c.totalInput  += (cs.textInput  || 0) + (cs.audioInput  || 0);
      c.totalOutput += (cs.textOutput || 0) + (cs.audioOutput || 0);
      c.total       += cs.total       || 0;

      if (pr.textInput   != null) priceAccum.textInput.push(pr.textInput);
      if (pr.audioInput  != null) priceAccum.audioInput.push(pr.audioInput);
      if (pr.textOutput  != null) priceAccum.textOutput.push(pr.textOutput);
      if (pr.audioOutput != null) priceAccum.audioOutput.push(pr.audioOutput);

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
      },
      models: [...models],
    };
  }

  // ── Row renderers ────────────────────────────────────────

  _renderSubtotalRow(sub, type, expanded, total) {
    const cls   = type === "voice" ? "row-voice-subtotal" : "row-chat-subtotal";
    const label = type === "voice" ? "VOICE" : "CHAT";
    const icon  = expanded ? "▲" : "▼";
    const u     = sub?.usage   || {};
    const c     = sub?.cost    || {};
    const p     = sub?.avgPricing || {};
    const tprc  = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);

    return `<tr class="${cls}" data-block="${type}">
      <td colspan="2" style="text-align:left"><strong>${label}</strong>
        <button class="toggle-btn js-toggle" data-block="${type}">${icon}</button>
        <span style="font-weight:normal;font-size:10px;margin-left:4px">(${this._fmtInt(total)} events)</span>
      </td>
      ${this._tokenCells(u, true)}
      ${this._priceCells(p, tprc, true)}
      ${this._costCells(c, true)}
    </tr>`;
  }

  _renderPerUserSubtotal(sub, label, type) {
    const cls  = type === "voice" ? "row-voice-subtotal" : "row-chat-subtotal";
    const u    = sub?.usage   || {};
    const c    = sub?.cost    || {};
    const p    = sub?.avgPricing || {};
    const tprc = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);

    return `<tr class="${cls}" style="opacity:0.75;">
      <td colspan="2" style="text-align:left;padding-left:14px;font-style:italic">${this._esc(label)}</td>
      ${this._tokenCells(u, true)}
      ${this._priceCells(p, tprc, true)}
      ${this._costCells(c, true)}
    </tr>`;
  }

  _renderEventRow(ev) {
    const d    = ev.createdAt ? new Date(ev.createdAt) : null;
    const u    = ev.usage  || {};
    const raw  = ev.cost   || {};
    const c    = {
      ...raw,
      totalInput:  (raw.textInput  || 0) + (raw.audioInput  || 0),
      totalOutput: (raw.textOutput || 0) + (raw.audioOutput || 0),
    };
    const p   = raw.pricingPer1K || {};
    const tprc = this._calcThoughtsPrice(c.thoughts, u.thoughtsTokens);

    return `<tr class="row-event">
      <td class="col-dt">${d ? this._fmtDate(d) : ""}</td>
      <td class="col-dt">${d ? this._fmtTime(d) : ""}</td>
      ${this._tokenCells(u)}
      ${this._priceCells(p, tprc)}
      ${this._costCells(c)}
    </tr>`;
  }

  _renderModelRow(models, type) {
    const label = type === "voice" ? "Voice model:" : "Chat model:";
    const value = (models || []).filter(Boolean).sort().join(", ") || "—";
    return `<tr class="row-model">
      <td colspan="23">${label} ${this._esc(value)}</td>
    </tr>`;
  }

  _renderPaginationRow(page, totalPages, type, total) {
    const prevDis = page <= 1 ? "disabled" : "";
    const nextDis = page >= totalPages ? "disabled" : "";
    return `<tr class="row-pagination">
      <td colspan="23">
        <button class="pagination-btn js-prev-page" data-block="${type}" ${prevDis}>&#8592; Previous</button>
        <span class="pagination-label">Page ${page} of ${totalPages} &nbsp;(${this._fmtInt(total)} total)</span>
        <button class="pagination-btn js-next-page" data-block="${type}" ${nextDis}>Next &#8594;</button>
      </td>
    </tr>`;
  }

  _renderTotalsRow(voiceSub, chatSub, fromValue) {
    // Sum VOICE + CHAT subtotals
    const vc = voiceSub?.cost    || {};
    const cc = chatSub?.cost     || {};
    const vu = voiceSub?.usage   || {};
    const cu = chatSub?.usage    || {};

    const u = {};
    ["textInputTokens","audioInputTokens","textOutputTokens","audioOutputTokens",
     "thoughtsTokens","totalInputTokens","totalOutputTokens","totalTokens"].forEach((k) => {
      u[k] = (vu[k]||0) + (cu[k]||0);
    });

    const c = {
      textInput:   (vc.textInput   ||0) + (cc.textInput   ||0),
      audioInput:  (vc.audioInput  ||0) + (cc.audioInput  ||0),
      textOutput:  (vc.textOutput  ||0) + (cc.textOutput  ||0),
      audioOutput: (vc.audioOutput ||0) + (cc.audioOutput ||0),
      thoughts:    (vc.thoughts    ||0) + (cc.thoughts    ||0),
      totalInput:  (vc.totalInput  ||0) + (cc.totalInput  ||0),
      totalOutput: (vc.totalOutput ||0) + (cc.totalOutput ||0),
      total:       (vc.total       ||0) + (cc.total       ||0),
    };

    // Weighted avg pricing across all events
    const allPricings = [voiceSub?.avgPricing, chatSub?.avgPricing].filter(Boolean);
    const wavg = (key) => {
      const vals = allPricings.map((p) => p[key]).filter((v) => v != null);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    };
    const p = { textInput: wavg("textInput"), audioInput: wavg("audioInput"), textOutput: wavg("textOutput"), audioOutput: wavg("audioOutput") };
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
      ${this._tokenCells(u, true)}
      ${this._priceCells(p, tprc, true)}
      ${this._costCells(c, true)}
    </tr>`;
  }

  // ── Cell group helpers ───────────────────────────────────

  _tokenCells(u, isSubtotal = false) {
    const cls = isSubtotal
      ? ["col-blue","col-blue","col-green","col-green","col-white","col-blue","col-green","col-white"]
      : ["","","","","","","",""];
    return [
      u.textInputTokens, u.audioInputTokens, u.textOutputTokens, u.audioOutputTokens,
      u.thoughtsTokens, u.totalInputTokens, u.totalOutputTokens, u.totalTokens,
    ].map((v, i) => `<td class="${cls[i]}">${this._fmtInt(v)}</td>`).join("");
  }

  _priceCells(p, thoughtsPrice, isSubtotal = false) {
    const baseCls = isSubtotal ? "col-orange" : "";
    return [
      p?.textInput, p?.audioInput, p?.textOutput, p?.audioOutput,
    ].map((v) => `<td class="${baseCls}">${this._fmtPrice(v)}</td>`).join("")
      + `<td class="col-yellow">${thoughtsPrice}</td>`;
  }

  _costCells(c, isSubtotal = false) {
    const cls = isSubtotal
      ? ["col-blue","col-blue","col-green","col-green","col-white","col-blue","col-green","col-white"]
      : ["","","","","","","",""];
    return [
      c.textInput, c.audioInput, c.textOutput, c.audioOutput,
      c.thoughts, c.totalInput, c.totalOutput, c.total,
    ].map((v, i) => `<td class="${cls[i]}">${this._fmtCost(v)}</td>`).join("");
  }

  // ── Event wiring ─────────────────────────────────────────

  _wireToggles() {
    this._tbody.querySelectorAll(".js-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const block = btn.dataset.block;
        if (block === "voice") this._voiceExp = !this._voiceExp;
        else                   this._chatExp  = !this._chatExp;
        this._renderTable();
      });
    });
  }

  _wirePagination() {
    this._tbody.querySelectorAll(".js-prev-page").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        if (btn.dataset.block === "voice") this._voicePage--;
        else                               this._chatPage--;
        this.fetchAndRender();
      });
    });
    this._tbody.querySelectorAll(".js-next-page").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        if (btn.dataset.block === "voice") this._voicePage++;
        else                               this._chatPage++;
        this.fetchAndRender();
      });
    });
  }

  // ── Format helpers ───────────────────────────────────────

  _fmtInt(v) {
    if (v == null || isNaN(v)) return "0";
    return Math.round(v).toLocaleString("en-US");
  }

  _fmtPrice(v) {
    if (v == null) return "—";
    return Number(v).toFixed(6);
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
    return ((costThoughts / thoughtsTokens) * 1000).toFixed(6);
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
