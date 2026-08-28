// public/taskManager.js
// Task Reminder Module — UI manager
// Instantiated by app.js: new TaskManager(app)

import { t } from "./i18n/index.js";

const DAYS_KEYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAYS_VALUES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

// localStorage flag: user turned off spontaneous task-reminder OS notifications
const NOTIF_SUPPRESSED_KEY = "brenda:taskNotifSuppressed";

export class TaskManager {
  constructor(app) {
    this.app = app;
    this.tasks = [];
    this._editingId   = null;  // null = adding new
    this._editMode    = "correct"; // "correct" | "change"
    this._timeCount   = 1;

    this._els = {
      overlay:           document.getElementById("taskOverlay"),
      card:              document.getElementById("taskCard"),
      // disclaimer
      disclaimer:        document.getElementById("taskDisclaimer"),
      disclaimerTitle:   document.getElementById("taskDisclaimerTitle"),
      disclaimerText:    document.getElementById("taskDisclaimerText"),
      disclaimerBtn:     document.getElementById("taskDisclaimerBtn"),
      // main list
      main:              document.getElementById("taskMain"),
      mainTitle:         document.getElementById("taskMainTitle"),
      persistentNote:    document.getElementById("taskPersistentNote"),
      list:              document.getElementById("taskList"),
      addBtn:            document.getElementById("taskAddBtn"),
      viewScheduleBtn:   document.getElementById("taskViewScheduleBtn"),
      closeBtn:          document.getElementById("taskCloseBtn"),
      notifPrompt:       document.getElementById("taskNotifPrompt"),
      notifPromptText:   document.getElementById("taskNotifPromptText"),
      notifBtn:          document.getElementById("taskNotifBtn"),
      // form
      form:              document.getElementById("taskForm"),
      formTitle:         document.getElementById("taskFormTitle"),
      toggleRow:         document.getElementById("taskToggleRow"),
      toggleInput:       document.getElementById("taskToggle"),
      toggleCorrectLbl:  document.getElementById("taskToggleCorrectLbl"),
      toggleChangeLbl:   document.getElementById("taskToggleChangeLbl"),
      formEl:            document.getElementById("taskFormEl"),
      nameInput:         document.getElementById("taskNameInput"),
      quantityInput:     document.getElementById("taskQuantityInput"),
      freqSelect:        document.getElementById("taskFreqSelect"),
      daysRow:           document.getElementById("taskDaysRow"),
      intervalRow:       document.getElementById("taskIntervalRow"),
      intervalInput:     document.getElementById("taskIntervalInput"),
      directionsInput:   document.getElementById("taskDirectionsInput"),
      timesContainer:    document.getElementById("taskTimesContainer"),
      addTimeBtn:        document.getElementById("taskAddTimeBtn"),
      startInput:        document.getElementById("taskStartInput"),
      limitedCheck:      document.getElementById("taskLimitedCheck"),
      endRow:            document.getElementById("taskEndRow"),
      endInput:          document.getElementById("taskEndInput"),
      notesInput:        document.getElementById("taskNotesInput"),
      enteredByInput:    document.getElementById("taskEnteredByInput"),
      changeReasonRow:   document.getElementById("taskChangeReasonRow"),
      changeReasonInput: document.getElementById("taskChangeReasonInput"),
      timezoneInput:     document.getElementById("taskTimezoneInput"),
      formCancelBtn:     document.getElementById("taskFormCancelBtn"),
      formCloseBtn:      document.getElementById("taskFormCloseBtn"),
      formScheduleBtn:   document.getElementById("taskFormScheduleBtn"),
      formSaveBtn:       document.getElementById("taskFormSaveBtn"),
      formStatus:        document.getElementById("taskFormStatus"),
      // schedule
      schedule:          document.getElementById("taskSchedule"),
      scheduleTitle:     document.getElementById("taskScheduleTitle"),
      scheduleCloseBtn:  document.getElementById("taskScheduleCloseBtn"),
      scheduleContent:   document.getElementById("taskScheduleContent"),
      scheduleBackBtn:   document.getElementById("taskScheduleBackBtn"),
      schedulePrintBtn:  document.getElementById("taskSchedulePrintBtn"),
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
        this._showOsNotification(r, msg);
      }
    }
  }

  // ── locale ───────────────────────────────────────────────────────────────

  _v() { return this.app?.locale?.variant || "en-US"; }

  _t(key) { return t(this._v(), key); }

  _applyLocale() {
    const v = this._v();
    const s = k => t(v, k);

    this._els.disclaimerTitle.textContent  = s("taskDisclaimerTitle");
    this._els.disclaimerText.textContent   = s("taskDisclaimerText");
    this._els.disclaimerBtn.textContent    = s("taskDisclaimerConfirm");
    this._els.mainTitle.textContent        = s("taskTitle");
    this._els.persistentNote.textContent   = s("taskPersistentNote");
    this._els.addBtn.textContent           = s("taskAddBtn");
    this._els.viewScheduleBtn.textContent  = s("taskViewSchedule");
    if (this._els.scheduleTitle) this._els.scheduleTitle.textContent = s("taskScheduleTitle");
    this._els.scheduleBackBtn.textContent  = s("taskScheduleBack");
    this._els.schedulePrintBtn.textContent = s("taskSchedulePrint");

    // Form labels
    document.getElementById("taskNameLabel").textContent        = s("taskNameLabel");
    document.getElementById("taskQuantityLabel").textContent    = s("taskQuantityLabel");
    document.getElementById("taskFreqLabel").textContent        = s("taskFreqLabel");
    document.getElementById("taskDaysLabel").textContent        = s("taskDaysLabel");
    document.getElementById("taskIntervalLabel").textContent    = s("taskIntervalLabel");
    document.getElementById("taskDirectionsLabel").textContent  = s("taskDirectionsLabel");
    document.getElementById("taskTimesLabel").innerHTML         = s("taskTimesLabel").replace(/\s*\*\s*$/, "") + ' <span style="color:red" aria-hidden="true">*</span>';
    document.getElementById("taskStartLabel").textContent       = s("taskStartLabel");
    document.getElementById("taskLimitedLabel").textContent     = s("taskLimitedLabel");
    document.getElementById("taskEndLabel").textContent         = s("taskEndLabel");
    document.getElementById("taskNotesLabel").textContent       = s("taskNotesLabel");
    document.getElementById("taskEnteredByLabel").textContent   = s("taskEnteredByLabel");
    document.getElementById("taskChangeReasonLabel").textContent = s("taskChangeReasonLabel");
    document.getElementById("taskTimezoneLabel").textContent    = s("taskTimezone");

    // Frequency options
    this._els.freqSelect.options[0].text = s("taskFreqDaily");
    this._els.freqSelect.options[1].text = s("taskFreqWeekly");
    this._els.freqSelect.options[2].text = s("taskFreqInterval");

    // Day checkboxes
    DAYS_KEYS.forEach((k) => {
      const lbl = document.getElementById(`taskDay${k}Lbl`);
      if (lbl) lbl.textContent = s(`taskDay${k}`);
    });

    this._els.toggleCorrectLbl.textContent = s("taskToggleCorrect");
    this._els.toggleChangeLbl.textContent  = s("taskToggleChange");
    this._renderNotifPrompt(); // sets notif row text + button label for current locale & state
    this._els.addTimeBtn.textContent       = s("taskAddTime");
    this._els.formCancelBtn.textContent    = s("taskCancelBtn");
    this._els.formScheduleBtn.textContent  = s("taskShowScheduleBtn");
    this._els.formSaveBtn.textContent      = s("taskSaveBtn");
  }

  // ── data load ────────────────────────────────────────────────────────────

  async _load() {
    try {
      const data = await this.app.apiJSON("/api/tasks", { method: "GET" });
      this.tasks = data.tasks || [];
    } catch {
      this.tasks = [];
    }

    if (this.tasks.length === 0) {
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
    this._els.card?.classList.toggle("task-card--schedule", name === "schedule");
    if (name === "main") this._renderNotifPrompt();
  }

  // ── OS notifications ──────────────────────────────────────────────────────

  _notifSupported() {
    return typeof window !== "undefined" && "Notification" in window;
  }

  // User-set "don't send spontaneous task reminder notifications" flag.
  // Persisted so it survives reloads; only affects _showOsNotification below.
  _notifSuppressed() {
    try { return localStorage.getItem(NOTIF_SUPPRESSED_KEY) === "1"; }
    catch { return false; }
  }
  _setNotifSuppressed(v) {
    try {
      if (v) localStorage.setItem(NOTIF_SUPPRESSED_KEY, "1");
      else   localStorage.removeItem(NOTIF_SUPPRESSED_KEY);
    } catch { /* non-fatal */ }
  }

  // The notif row is a 3-state toggle:
  //   permission "default"                 → "Enable"  (blue)  → asks the browser
  //   permission "granted" & not suppressed → "Disable" (red)  → suppresses
  //   permission "granted" & suppressed     → "Enable"  (blue)  → un-suppresses
  //   permission "denied"                  → "Enable"  disabled + "blocked" hint
  _renderNotifPrompt() {
    const el = this._els.notifPrompt;
    if (!el) return;

    if (!this._notifSupported()) { el.style.display = "none"; return; }
    el.style.display = "flex";

    const perm       = Notification.permission;
    const active     = perm === "granted" && !this._notifSuppressed();
    const btn        = this._els.notifBtn;
    const txt        = this._els.notifPromptText;

    if (btn) {
      btn.disabled = perm === "denied";
      btn.classList.toggle("task-notif-enable-btn--disable", active);
      btn.textContent = this._t(active ? "taskNotifBtnDisable" : "taskNotifBtn");
      // Distinct GA label per state — analytics.js reads dataset.gaName at click time.
      btn.dataset.gaName = active ? "task_popup__notif_disable_btn" : "task_popup__notif_enable_btn";
    }
    if (txt) {
      txt.textContent = this._t(
        perm === "denied" ? "taskNotifBlocked"
        : active          ? "taskNotifOn"
        :                   "taskNotifPrompt"
      );
    }
  }

  async _onNotifBtnClick() {
    if (!this._notifSupported()) return;
    const perm = Notification.permission;

    if (perm === "denied") return;            // button is disabled in this state

    if (perm === "granted") {                 // toggle suppression
      const suppressed = !this._notifSuppressed();
      this._setNotifSuppressed(suppressed);
      this._renderNotifPrompt();
      this._fireNotifToggleConfirmation(!suppressed);
      return;
    }

    await Notification.requestPermission();   // perm === "default" → ask the browser
    if (Notification.permission === "granted") {
      this._setNotifSuppressed(false);
      this._renderNotifPrompt();
      this._fireNotifToggleConfirmation(true);
    } else {
      this._renderNotifPrompt();
    }
  }

  // Confirmation notification fired on every user toggle (on AND off). Direct
  // new Notification() so it bypasses the _notifSuppressed() gate — this is an
  // explicit user action, not a spontaneous reminder. No `tag`: a repeated tag
  // makes the browser replace the tray entry silently, so later toggles would
  // never re-alert.
  _fireNotifToggleConfirmation(active) {
    if (!this._notifSupported() || Notification.permission !== "granted") return;
    try {
      new Notification(this._t(active ? "taskNotifOn" : "taskNotifOff"), {
        icon: "/images/brenda-avatar.png",
      });
    } catch { /* non-fatal */ }
  }

  _showOsNotification(reminder, msg) {
    if (!this._notifSupported() || Notification.permission !== "granted") return;
    if (this._notifSuppressed()) return;
    try {
      new Notification(reminder.taskName || this._t("taskNotifTitle"), {
        body: msg,
        icon: "/images/brenda-avatar.png",
        tag:  `task-${reminder.taskName || "reminder"}`,
      });
    } catch { /* non-fatal */ }
  }

  // ── list rendering ────────────────────────────────────────────────────────

  _renderList() {
    const container = this._els.list;
    container.innerHTML = "";

    if (!this.tasks.length) {
      const empty = document.createElement("p");
      empty.className = "task-empty";
      empty.textContent = this._t("taskEmpty");
      container.appendChild(empty);
      return;
    }

    for (const med of this.tasks) {
      const item = document.createElement("div");
      item.className = "task-list-item";

      const info = document.createElement("div");
      info.className = "task-list-info";

      const name = document.createElement("div");
      name.className = "task-list-name";
      name.textContent = med.name + (med.quantity ? ` — ${med.quantity}` : "");
      info.appendChild(name);

      const sched = document.createElement("div");
      sched.className = "task-list-sched";
      sched.textContent = this._humanSchedule(med);
      info.appendChild(sched);

      const actions = document.createElement("div");
      actions.className = "task-list-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "task-item-btn task-item-edit";
      editBtn.textContent = this._t("taskEditBtn");
      editBtn.dataset.gaName = "task_popup__item_edit_btn";
      editBtn.dataset.gaItemId = med.id;
      editBtn.addEventListener("click", () => this._openForm(med));
      actions.appendChild(editBtn);

      const stopBtn = document.createElement("button");
      stopBtn.className = "task-item-btn task-item-stop";
      stopBtn.textContent = this._t("taskStopBtn");
      stopBtn.dataset.gaName = "task_popup__item_stop_btn";
      stopBtn.dataset.gaItemId = med.id;
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
    if (type === "daily")    return `${this._t("taskFreqDaily")} : ${timesStr}`;
    if (type === "weekly") {
      const dayLabels = (daysOfWeek || []).map(d => {
        const i = DAYS_VALUES.indexOf(d.toLowerCase());
        return i >= 0 ? this._t(`taskDay${DAYS_KEYS[i]}`) : d;
      }).join(", ");
      return `${dayLabels} : ${timesStr}`;
    }
    if (type === "interval") {
      const next = nextDue ? ` | ${this._t("taskNextDue")}: ${nextDue}` : "";
      return `${this._t("taskFreqInterval").replace("N", intervalDays || "?")} : ${timesStr}${next}`;
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
    this._els.formTitle.textContent   = med ? this._t("taskFormTitleEdit") : this._t("taskFormTitleAdd");
    this._els.nameInput.value         = med?.name         || "";
    this._els.quantityInput.value     = med?.quantity     || "";
    this._els.directionsInput.value   = med?.directions   || "";
    this._els.notesInput.value        = med?.notes        || "";
    this._els.enteredByInput.value    = med?.enteredBy    || "";
    this._els.changeReasonInput.value = "";
    this._els.formStatus.textContent  = "";
    this._updateTimesLabel();

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
        const cb = document.getElementById(`taskDayCb${i}`);
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

  _updateTimesLabel() {
    const lbl = document.getElementById("taskTimesLabel");
    if (lbl) lbl.innerHTML = this._t("taskTimesLabel").replace(/\s*\*\s*$/, "") + ' <span style="color:red" aria-hidden="true">*</span>';
  }

  _addTimeField(value = "") {
    this._timeCount++;
    const wrap = document.createElement("div");
    wrap.className = "task-time-row";

    const input = document.createElement("input");
    input.type  = "time";
    input.className = "task-time-input";
    input.value = value;
    wrap.appendChild(input);

    if (this._timeCount > 1) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "task-time-remove";
      rm.textContent = "×";
      rm.dataset.gaName = "task_popup__form_remove_time_btn";
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
    if (!name) { this._els.formStatus.textContent = this._t("taskNameRequired"); return; }

    const directions = this._els.directionsInput.value.trim().slice(0, 30);
    const times = Array.from(this._els.timesContainer.querySelectorAll(".task-time-input"))
      .map(i => i.value).filter(Boolean);
    if (!times.length) { this._els.formStatus.textContent = this._t("taskTimesRequired"); return; }

    const freqType = this._els.freqSelect.value;

    if (freqType === "weekly") {
      const anyDay = DAYS_VALUES.some((_, i) => document.getElementById(`taskDayCb${i}`)?.checked);
      if (!anyDay) { this._els.formStatus.textContent = this._t("taskDaysRequired"); return; }
    }

    const recurrence = { type: freqType, times };
    if (freqType === "weekly") {
      recurrence.daysOfWeek = DAYS_VALUES.filter((_, i) => document.getElementById(`taskDayCb${i}`)?.checked);
    }
    if (freqType === "interval") {
      recurrence.intervalDays = parseInt(this._els.intervalInput.value, 10) || 1;
      recurrence.nextDue      = this._els.startInput.value;
    }

    const payload = {
      name,
      quantity:   this._els.quantityInput.value.trim() || null,
      directions: directions || null,
      recurrence,
      startDate:  this._els.startInput.value,
      endDate:    this._els.limitedCheck.checked ? this._els.endInput.value : null,
      timezone:   this._els.timezoneInput.value || Intl.DateTimeFormat().resolvedOptions().timeZone,
      notes:      this._els.notesInput.value.trim()      || null,
      enteredBy:  this._els.enteredByInput.value.trim()  || null,
      disclaimerAcknowledged: true,
    };

    this._els.formSaveBtn.disabled    = true;
    this._els.formStatus.textContent  = this._t("taskSaving");

    try {
      if (this._editingId) {
        payload.mode = this._editMode;
        if (this._editMode === "change") {
          payload.changeReason = this._els.changeReasonInput.value.trim();
        }
        await this.app.apiJSON(`/api/tasks?id=${encodeURIComponent(this._editingId)}`,
          { method: "PATCH", body: payload });
      } else {
        await this.app.apiJSON("/api/tasks", { method: "POST", body: payload });
      }

      this._els.formStatus.textContent = this._t("taskSaved");
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
    if (!confirm(`${this._t("taskStopConfirm")} ${med.name}?`)) return;
    try {
      await this.app.apiJSON(`/api/tasks?id=${encodeURIComponent(med.id)}`, { method: "DELETE" });
      await this._load();
      this._renderList();
    } catch { /* ignore */ }
  }

  // ── schedule view ─────────────────────────────────────────────────────────

  _openSchedule() {
    const v    = this._v();
    const name = this.app.user?.displayName || this.app.user?.username || "User";
    const now  = new Date().toLocaleDateString(v, { dateStyle: "long" });

    const header = t(v, "taskScheduleHeader").replace("{name}", name);

    let html = `
      <div class="task-schedule-header">
        <div class="task-schedule-user">${header}</div>
        <div class="task-schedule-meta">${t(v,"taskScheduleGenerated")} ${now} &nbsp;|&nbsp; ${t(v,"taskScheduleCount")} ${this.tasks.length}</div>
      </div>
      <div class="task-schedule-table-wrap"><table class="task-schedule-table">
        <thead><tr>
          <th>${t(v,"taskColTask")}</th>
          <th>${t(v,"taskColQuantity")}</th>
          <th>${t(v,"taskColSchedule")}</th>
          <th>${t(v,"taskColDirections")}</th>
          <th>${t(v,"taskColStart")}</th>
          <th>${t(v,"taskColUntil")}</th>
          <th>${t(v,"taskColNotes")}</th>
        </tr></thead>
        <tbody>`;

    for (const med of this.tasks) {
      const until = med.endDate
        ? `<span class="task-pill task-pill-amber">${med.endDate}</span>`
        : `<span class="task-pill task-pill-green">${t(v,"taskOngoing")}</span>`;
      html += `<tr>
        <td><strong>${med.name}</strong></td>
        <td>${med.quantity || "—"}</td>
        <td>${this._humanSchedule(med)}</td>
        <td>${med.directions || "—"}</td>
        <td>${med.startDate || "—"}</td>
        <td>${until}</td>
        <td>${med.notes || "—"}</td>
      </tr>`;
    }

    html += `</tbody></table></div>
      <div class="task-schedule-footer">${t(v,"taskFooterDisclaimer")}</div>`;

    this._els.scheduleContent.innerHTML = html;
    this._showPanel("schedule");
  }

  // ── reminder text builder ─────────────────────────────────────────────────

  _buildReminderText(reminder, displayName, locale) {
    const v    = locale || this._v();
    const name = (displayName || "").trim();
    const type = reminder.reminderType;

    let key;
    if (type === "course-ending") key = name ? "taskReminderCourseEnding" : "taskReminderCourseEndingAnon";
    else if (type === "limited-course") key = name ? "taskReminderLimited" : "taskReminderLimitedAnon";
    else key = name ? "taskReminderStandard" : "taskReminderStandardAnon";

    return t(v, key).replace("{name}", name);
  }

  // ── print ────────────────────────────────────────────────────────────────

  _buildPrintFilename() {
    const prefix = this._v().startsWith("es") ? "Plan de Tareas" : "Task Schedule";
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;
    return `${prefix} ${date} - ${time}`;
  }

  _printSchedule() {
    const content = this._els.scheduleContent?.innerHTML || "";
    const title   = this._buildPrintFilename();
    const html = `<!DOCTYPE html><html lang="${this._v()}">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #0f172a; }
  .task-schedule-header { margin-bottom: 16px; }
  .task-schedule-user { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .task-schedule-meta { font-size: 12px; color: #64748b; }
  .task-schedule-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
  .task-schedule-table th,
  .task-schedule-table td { padding: 7px 10px; border: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  .task-schedule-table th { background: #f1f5f9; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #374151; }
  .task-schedule-footer { margin-top: 16px; font-size: 11px; color: #92400e; background: #fef3c7; border-radius: 6px; padding: 8px 12px; }
  .task-pill { display: inline-block; border-radius: 9999px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
  .task-pill-green { background: #dcfce7; color: #16a34a; }
  .task-pill-amber { background: #fef3c7; color: #92400e; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${content}
<script>window.addEventListener('load',function(){ setTimeout(function(){ window.print(); },250); });</script>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if (!win) { URL.revokeObjectURL(url); return; } // popup blocked
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
    this._els.notifBtn?.addEventListener("click", () => this._onNotifBtnClick());

    // Form
    this._els.toggleInput?.addEventListener("change", () => {
      this._editMode = this._els.toggleInput.checked ? "change" : "correct";
      this._els.changeReasonRow.classList.toggle("hidden", this._editMode !== "change");
    });

    this._els.freqSelect?.addEventListener("change", () => this._onFreqChange(this._els.freqSelect.value));

    this._els.directionsInput?.addEventListener("input", () => this._updateTimesLabel());

    this._els.limitedCheck?.addEventListener("change", () => {
      this._els.endRow.classList.toggle("hidden", !this._els.limitedCheck.checked);
    });

    this._els.addTimeBtn?.addEventListener("click", () => this._addTimeField());

    this._els.formCancelBtn?.addEventListener("click", () => {
      this._showPanel(this.tasks.length ? "main" : "disclaimer");
    });

    this._els.formCloseBtn?.addEventListener("click", () => this.close());

    this._els.formScheduleBtn?.addEventListener("click", () => this._openSchedule());

    this._els.formSaveBtn?.addEventListener("click", () => this._saveForm());

    // Schedule
    this._els.scheduleCloseBtn?.addEventListener("click", () => this.close());

    this._els.scheduleBackBtn?.addEventListener("click", () => {
      this._showPanel(this.tasks.length ? "main" : "form");
    });

    this._els.schedulePrintBtn?.addEventListener("click", () => this._printSchedule());

    // Close on backdrop click
    this._els.overlay?.addEventListener("click", e => {
      if (e.target === this._els.overlay) this.close();
    });
  }
}
