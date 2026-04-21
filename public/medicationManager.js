// public/medicationManager.js
// Medication Reminder Module — UI manager
// Instantiated by app.js: new MedicationManager(app)

import { t } from "./i18n.js";

const DAYS_KEYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAYS_VALUES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

export class MedicationManager {
  constructor(app) {
    this.app = app;
    this.medications = [];
    this._editingId   = null;  // null = adding new
    this._editMode    = "correct"; // "correct" | "change"
    this._timeCount   = 1;

    this._els = {
      overlay:           document.getElementById("medOverlay"),
      // disclaimer
      disclaimer:        document.getElementById("medDisclaimer"),
      disclaimerTitle:   document.getElementById("medDisclaimerTitle"),
      disclaimerText:    document.getElementById("medDisclaimerText"),
      disclaimerBtn:     document.getElementById("medDisclaimerBtn"),
      // main list
      main:              document.getElementById("medMain"),
      mainTitle:         document.getElementById("medMainTitle"),
      persistentNote:    document.getElementById("medPersistentNote"),
      list:              document.getElementById("medList"),
      addBtn:            document.getElementById("medAddBtn"),
      viewScheduleBtn:   document.getElementById("medViewScheduleBtn"),
      closeBtn:          document.getElementById("medCloseBtn"),
      // form
      form:              document.getElementById("medForm"),
      formTitle:         document.getElementById("medFormTitle"),
      toggleRow:         document.getElementById("medToggleRow"),
      toggleInput:       document.getElementById("medToggle"),
      toggleCorrectLbl:  document.getElementById("medToggleCorrectLbl"),
      toggleChangeLbl:   document.getElementById("medToggleChangeLbl"),
      formEl:            document.getElementById("medFormEl"),
      nameInput:         document.getElementById("medNameInput"),
      doseInput:         document.getElementById("medDoseInput"),
      freqSelect:        document.getElementById("medFreqSelect"),
      daysRow:           document.getElementById("medDaysRow"),
      intervalRow:       document.getElementById("medIntervalRow"),
      intervalInput:     document.getElementById("medIntervalInput"),
      timesContainer:    document.getElementById("medTimesContainer"),
      addTimeBtn:        document.getElementById("medAddTimeBtn"),
      startInput:        document.getElementById("medStartInput"),
      limitedCheck:      document.getElementById("medLimitedCheck"),
      endRow:            document.getElementById("medEndRow"),
      endInput:          document.getElementById("medEndInput"),
      notesInput:        document.getElementById("medNotesInput"),
      enteredByInput:    document.getElementById("medEnteredByInput"),
      changeReasonRow:   document.getElementById("medChangeReasonRow"),
      changeReasonInput: document.getElementById("medChangeReasonInput"),
      timezoneInput:     document.getElementById("medTimezoneInput"),
      formCancelBtn:     document.getElementById("medFormCancelBtn"),
      formScheduleBtn:   document.getElementById("medFormScheduleBtn"),
      formSaveBtn:       document.getElementById("medFormSaveBtn"),
      formStatus:        document.getElementById("medFormStatus"),
      // schedule
      schedule:          document.getElementById("medSchedule"),
      scheduleTitle:     document.getElementById("medScheduleTitle"),
      scheduleContent:   document.getElementById("medScheduleContent"),
      scheduleBackBtn:   document.getElementById("medScheduleBackBtn"),
      schedulePrintBtn:  document.getElementById("medSchedulePrintBtn"),
    };

    this._bindEvents();
  }

  // ── public ──────────────────────────────────────────────────────────────

  open() {
    this._applyLocale();
    this._els.overlay.classList.remove("hidden");
    this._els.overlay.removeAttribute("aria-hidden");
    this._load();
  }

  close() {
    this._els.overlay.classList.add("hidden");
    this._els.overlay.setAttribute("aria-hidden", "true");
    this._showPanel("none");
  }

  // Called by app.js after checkin with pending reminders
  async deliverReminders(reminders, displayName, locale) {
    if (!reminders?.length) return;
    for (const r of reminders) {
      const msg = this._buildReminderText(r, displayName, locale);
      if (msg) {
        try {
          await this.app.emitAssistantLine({ text: msg, channel: "text" });
        } catch { /* non-fatal */ }
      }
    }
  }

  // ── locale ───────────────────────────────────────────────────────────────

  _v() { return this.app?.locale?.variant || "en-US"; }

  _t(key) { return t(this._v(), key); }

  _applyLocale() {
    const v = this._v();
    const s = k => t(v, k);

    this._els.disclaimerTitle.textContent  = s("medDisclaimerTitle");
    this._els.disclaimerText.textContent   = s("medDisclaimerText");
    this._els.disclaimerBtn.textContent    = s("medDisclaimerConfirm");
    this._els.mainTitle.textContent        = s("medTitle");
    this._els.persistentNote.textContent   = s("medPersistentNote");
    this._els.addBtn.textContent           = s("medAddBtn");
    this._els.viewScheduleBtn.textContent  = s("medViewSchedule");
    this._els.scheduleTitle.textContent    = s("medScheduleTitle");
    this._els.scheduleBackBtn.textContent  = s("medScheduleBack");
    this._els.schedulePrintBtn.textContent = s("medSchedulePrint");

    // Form labels
    document.getElementById("medNameLabel").textContent        = s("medNameLabel");
    document.getElementById("medDoseLabel").textContent        = s("medDoseLabel");
    document.getElementById("medFreqLabel").textContent        = s("medFreqLabel");
    document.getElementById("medDaysLabel").textContent        = s("medDaysLabel");
    document.getElementById("medIntervalLabel").textContent    = s("medIntervalLabel");
    document.getElementById("medTimesLabel").textContent       = s("medTimesLabel");
    document.getElementById("medStartLabel").textContent       = s("medStartLabel");
    document.getElementById("medLimitedLabel").textContent     = s("medLimitedLabel");
    document.getElementById("medEndLabel").textContent         = s("medEndLabel");
    document.getElementById("medNotesLabel").textContent       = s("medNotesLabel");
    document.getElementById("medEnteredByLabel").textContent   = s("medEnteredByLabel");
    document.getElementById("medChangeReasonLabel").textContent = s("medChangeReasonLabel");
    document.getElementById("medTimezoneLabel").textContent    = s("medTimezone");

    // Frequency options
    this._els.freqSelect.options[0].text = s("medFreqDaily");
    this._els.freqSelect.options[1].text = s("medFreqWeekly");
    this._els.freqSelect.options[2].text = s("medFreqInterval");

    // Day checkboxes
    DAYS_KEYS.forEach((k) => {
      const lbl = document.getElementById(`medDay${k}Lbl`);
      if (lbl) lbl.textContent = s(`medDay${k}`);
    });

    this._els.toggleCorrectLbl.textContent = s("medToggleCorrect");
    this._els.toggleChangeLbl.textContent  = s("medToggleChange");
    this._els.addTimeBtn.textContent       = s("medAddTime");
    this._els.formCancelBtn.textContent    = s("medCancelBtn");
    this._els.formScheduleBtn.textContent  = s("medShowScheduleBtn");
    this._els.formSaveBtn.textContent      = s("medSaveBtn");
  }

  // ── data load ────────────────────────────────────────────────────────────

  async _load() {
    try {
      const data = await this.app.apiJSON("/api/medications", { method: "GET" });
      this.medications = data.medications || [];
    } catch {
      this.medications = [];
    }

    if (this.medications.length === 0) {
      // First time: show disclaimer
      this._showPanel("disclaimer");
    } else {
      this._showPanel("main");
      this._renderList();
    }
  }

  // ── panel switcher ────────────────────────────────────────────────────────

  _showPanel(name) {
    const panels = ["disclaimer", "main", "form", "schedule"];
    panels.forEach(p => {
      const el = this._els[p];
      if (el) el.style.display = p === name ? "flex" : "none";
    });
  }

  // ── list rendering ────────────────────────────────────────────────────────

  _renderList() {
    const container = this._els.list;
    container.innerHTML = "";

    if (!this.medications.length) {
      const empty = document.createElement("p");
      empty.className = "med-empty";
      empty.textContent = this._t("medEmpty");
      container.appendChild(empty);
      return;
    }

    for (const med of this.medications) {
      const item = document.createElement("div");
      item.className = "med-list-item";

      const info = document.createElement("div");
      info.className = "med-list-info";

      const name = document.createElement("div");
      name.className = "med-list-name";
      name.textContent = med.name + (med.dose ? ` — ${med.dose}` : "");
      info.appendChild(name);

      const sched = document.createElement("div");
      sched.className = "med-list-sched";
      sched.textContent = this._humanSchedule(med);
      info.appendChild(sched);

      const actions = document.createElement("div");
      actions.className = "med-list-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "med-item-btn med-item-edit";
      editBtn.textContent = this._t("medEditBtn");
      editBtn.addEventListener("click", () => this._openForm(med));
      actions.appendChild(editBtn);

      const stopBtn = document.createElement("button");
      stopBtn.className = "med-item-btn med-item-stop";
      stopBtn.textContent = this._t("medStopBtn");
      stopBtn.addEventListener("click", () => this._stopMed(med));
      actions.appendChild(stopBtn);

      item.appendChild(info);
      item.appendChild(actions);
      container.appendChild(item);
    }
  }

  _humanSchedule(med) {
    const { type, times, daysOfWeek, intervalDays, nextDue } = med.recurrence || {};
    const timesStr = (times || []).join(" & ");
    if (type === "daily")    return `${this._t("medFreqDaily")} — ${timesStr}`;
    if (type === "weekly") {
      const dayLabels = (daysOfWeek || []).map(d => {
        const i = DAYS_VALUES.indexOf(d.toLowerCase());
        return i >= 0 ? this._t(`medDay${DAYS_KEYS[i]}`) : d;
      }).join(", ");
      return `${dayLabels} — ${timesStr}`;
    }
    if (type === "interval") {
      const next = nextDue ? ` | Next: ${nextDue}` : "";
      return `${this._t("medFreqInterval").replace("N", intervalDays || "?")} — ${timesStr}${next}`;
    }
    return timesStr;
  }

  // ── form ─────────────────────────────────────────────────────────────────

  _openForm(med = null) {
    this._editingId = med?.id || null;
    this._editMode  = "correct";
    this._applyLocale();

    // Toggle row: only visible when editing
    this._els.toggleRow.classList.toggle("hidden", !med);
    this._els.toggleInput.checked = false;
    this._els.changeReasonRow.classList.add("hidden");

    // Reset form
    this._els.formTitle.textContent   = med ? this._t("medFormTitleEdit") : this._t("medFormTitleAdd");
    this._els.nameInput.value         = med?.name         || "";
    this._els.doseInput.value         = med?.dose         || "";
    this._els.notesInput.value        = med?.notes        || "";
    this._els.enteredByInput.value    = med?.enteredBy    || "";
    this._els.changeReasonInput.value = "";
    this._els.formStatus.textContent  = "";

    // Dates
    this._els.startInput.value = med?.startDate || new Date().toISOString().slice(0, 10);
    const hasEnd = !!med?.endDate;
    this._els.limitedCheck.checked = hasEnd;
    this._els.endRow.classList.toggle("hidden", !hasEnd);
    this._els.endInput.value = med?.endDate || "";

    // Timezone
    this._els.timezoneInput.value = med?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Frequency
    const type = med?.recurrence?.type || "daily";
    this._els.freqSelect.value = type;
    this._onFreqChange(type);

    if (type === "weekly") {
      const days = (med?.recurrence?.daysOfWeek || []).map(d => d.toLowerCase());
      DAYS_VALUES.forEach((d, i) => {
        const cb = document.getElementById(`medDayCb${i}`);
        if (cb) cb.checked = days.includes(d);
      });
    }

    if (type === "interval") {
      this._els.intervalInput.value = med?.recurrence?.intervalDays || 1;
    }

    // Times
    this._els.timesContainer.innerHTML = "";
    this._timeCount = 0;
    const existingTimes = med?.recurrence?.times?.length ? med.recurrence.times : ["08:00"];
    existingTimes.forEach(time => this._addTimeField(time));

    this._showPanel("form");
  }

  _addTimeField(value = "") {
    this._timeCount++;
    const wrap = document.createElement("div");
    wrap.className = "med-time-row";

    const input = document.createElement("input");
    input.type  = "time";
    input.className = "med-time-input";
    input.value = value;
    wrap.appendChild(input);

    if (this._timeCount > 1) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "med-time-remove";
      rm.textContent = "×";
      rm.addEventListener("click", () => wrap.remove());
      wrap.appendChild(rm);
    }

    this._els.timesContainer.appendChild(wrap);
  }

  _onFreqChange(type) {
    this._els.daysRow.classList.toggle("hidden", type !== "weekly");
    this._els.intervalRow.classList.toggle("hidden", type !== "interval");
  }

  async _saveForm() {
    const name = this._els.nameInput.value.trim();
    if (!name) { this._els.formStatus.textContent = this._t("medNameRequired"); return; }

    const times = Array.from(this._els.timesContainer.querySelectorAll(".med-time-input"))
      .map(i => i.value).filter(Boolean);
    if (!times.length) { this._els.formStatus.textContent = this._t("medTimesRequired"); return; }

    const freqType = this._els.freqSelect.value;

    if (freqType === "weekly") {
      const anyDay = DAYS_VALUES.some((_, i) => document.getElementById(`medDayCb${i}`)?.checked);
      if (!anyDay) { this._els.formStatus.textContent = this._t("medDaysRequired"); return; }
    }

    const recurrence = { type: freqType, times };
    if (freqType === "weekly") {
      recurrence.daysOfWeek = DAYS_VALUES.filter((_, i) => document.getElementById(`medDayCb${i}`)?.checked);
    }
    if (freqType === "interval") {
      recurrence.intervalDays = parseInt(this._els.intervalInput.value, 10) || 1;
      recurrence.nextDue      = this._els.startInput.value;
    }

    const payload = {
      name,
      dose:       this._els.doseInput.value.trim() || null,
      recurrence,
      startDate:  this._els.startInput.value,
      endDate:    this._els.limitedCheck.checked ? this._els.endInput.value : null,
      timezone:   this._els.timezoneInput.value || Intl.DateTimeFormat().resolvedOptions().timeZone,
      notes:      this._els.notesInput.value.trim()      || null,
      enteredBy:  this._els.enteredByInput.value.trim()  || null,
      disclaimerAcknowledged: true,
    };

    this._els.formSaveBtn.disabled    = true;
    this._els.formStatus.textContent  = this._t("medSaving");

    try {
      if (this._editingId) {
        payload.mode = this._editMode;
        if (this._editMode === "change") {
          payload.changeReason = this._els.changeReasonInput.value.trim();
        }
        await this.app.apiJSON(`/api/medications?id=${encodeURIComponent(this._editingId)}`,
          { method: "PATCH", body: payload });
      } else {
        await this.app.apiJSON("/api/medications", { method: "POST", body: payload });
      }

      this._els.formStatus.textContent = this._t("medSaved");
      await this._load();
      this._showPanel("main");
      this._renderList();
    } catch (e) {
      this._els.formStatus.textContent = e.message || "Error saving";
    } finally {
      this._els.formSaveBtn.disabled = false;
    }
  }

  async _stopMed(med) {
    if (!confirm(`${this._t("medStopConfirm")} ${med.name}?`)) return;
    try {
      await this.app.apiJSON(`/api/medications?id=${encodeURIComponent(med.id)}`, { method: "DELETE" });
      await this._load();
      this._renderList();
    } catch { /* ignore */ }
  }

  // ── schedule view ─────────────────────────────────────────────────────────

  _openSchedule() {
    const v    = this._v();
    const name = this.app.user?.displayName || this.app.user?.username || "User";
    const now  = new Date().toLocaleDateString(v, { dateStyle: "long" });

    const header = t(v, "medScheduleHeader").replace("{name}", name);

    let html = `
      <div class="med-schedule-header">
        <div class="med-schedule-user">${header}</div>
        <div class="med-schedule-meta">${t(v,"medScheduleGenerated")} ${now} &nbsp;|&nbsp; ${t(v,"medScheduleCount")} ${this.medications.length}</div>
      </div>
      <table class="med-schedule-table">
        <thead><tr>
          <th>${t(v,"medColMedication")}</th>
          <th>${t(v,"medColDose")}</th>
          <th>${t(v,"medColSchedule")}</th>
          <th>${t(v,"medColStart")}</th>
          <th>${t(v,"medColUntil")}</th>
          <th>${t(v,"medColNotes")}</th>
        </tr></thead>
        <tbody>`;

    for (const med of this.medications) {
      const until = med.endDate
        ? `<span class="med-pill med-pill-amber">${med.endDate}</span>`
        : `<span class="med-pill med-pill-green">${t(v,"medOngoing")}</span>`;
      html += `<tr>
        <td><strong>${med.name}</strong></td>
        <td>${med.dose || "—"}</td>
        <td>${this._humanSchedule(med)}</td>
        <td>${med.startDate || "—"}</td>
        <td>${until}</td>
        <td>${med.notes || "—"}</td>
      </tr>`;
    }

    html += `</tbody></table>
      <div class="med-schedule-footer">${t(v,"medFooterDisclaimer")}</div>`;

    this._els.scheduleContent.innerHTML = html;
    this._showPanel("schedule");
  }

  // ── reminder text builder ─────────────────────────────────────────────────

  _buildReminderText(reminder, displayName, locale) {
    const v    = locale || this._v();
    const name = (displayName || "").trim();
    const type = reminder.reminderType;

    let key;
    if (type === "course-ending") key = name ? "medReminderCourseEnding" : "medReminderCourseEndingAnon";
    else if (type === "limited-course") key = name ? "medReminderLimited" : "medReminderLimitedAnon";
    else key = name ? "medReminderStandard" : "medReminderStandardAnon";

    return t(v, key).replace("{name}", name);
  }

  // ── event binding ─────────────────────────────────────────────────────────

  _bindEvents() {
    // Disclaimer
    this._els.disclaimerBtn?.addEventListener("click", () => {
      this._showPanel("main");
      this._renderList();
    });

    // Main list
    this._els.closeBtn?.addEventListener("click", () => this.close());
    this._els.addBtn?.addEventListener("click", () => this._openForm(null));
    this._els.viewScheduleBtn?.addEventListener("click", () => this._openSchedule());

    // Form
    this._els.toggleInput?.addEventListener("change", () => {
      this._editMode = this._els.toggleInput.checked ? "change" : "correct";
      this._els.changeReasonRow.classList.toggle("hidden", this._editMode !== "change");
    });

    this._els.freqSelect?.addEventListener("change", () => this._onFreqChange(this._els.freqSelect.value));

    this._els.limitedCheck?.addEventListener("change", () => {
      this._els.endRow.classList.toggle("hidden", !this._els.limitedCheck.checked);
    });

    this._els.addTimeBtn?.addEventListener("click", () => this._addTimeField());

    this._els.formCancelBtn?.addEventListener("click", () => {
      this._showPanel(this.medications.length ? "main" : "disclaimer");
    });

    this._els.formScheduleBtn?.addEventListener("click", () => this._openSchedule());

    this._els.formSaveBtn?.addEventListener("click", () => this._saveForm());

    // Schedule
    this._els.scheduleBackBtn?.addEventListener("click", () => {
      this._showPanel(this.medications.length ? "main" : "form");
    });

    this._els.schedulePrintBtn?.addEventListener("click", () => window.print());

    // Close on backdrop click
    this._els.overlay?.addEventListener("click", e => {
      if (e.target === this._els.overlay) this.close();
    });
  }
}
