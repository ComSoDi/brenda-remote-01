// public/app.js (module) 2026-03-04
import { detectLocale } from "./locale.js";
import { t } from "./i18n.js";
import { renderTranscript, wireAutoScroll } from "./transcriptRenderer.js";
import { getConversationContent } from "./conversationContent.js";
import { MedicationManager } from "./medicationManager.js";

class BrendaApp {
  constructor() {
    this.locale = detectLocale(); // { lang, variant }
    this.mode = "text"; // talk | text | video (future)

    // Voice agent
    this.agent = new window.VoiceAgent();

    // Unified timeline
    this.messages = []; // [{id, role, channel, text, status, ts}]

    // Conversation subjects
    this.subjects = this.defaultSubjects();

    // Persist guard (avoid double-writing)
    this._persisted = new Set();

    // Voice ordering control
    this._awaitingUserTranscript = true;
    this._pendingAssistantText = "";
    this._pendingAssistantTimer = null;
    this._currentAssistantId = null;
    this._pendingUserTranscript = "";
    this._lastVoiceStatus = "disconnected";
    this._voiceGreetingSent = false;
    this._voiceGreetingTimer = null;
    this._voiceGreetingDelayMs = 3000;

    // Greeting state — populated by checkAndShowGreeting() after auth.
    this._greetingType  = null;   // "full" | "short" | "none" | null (null = unchecked)
    this._greetingText  = null;   // pre-built greeting string
    this._greetingShown = false;  // true once shown in any channel (prevents double-show)

    // Heartbeat handles — cleared by stopGreetingHeartbeat()
    this._heartbeatInterval  = null;
    this._visibilityHandler  = null;
    this._voiceWeatherActive = false;
    this._voiceWeatherInFlight = false;
    this._voiceChatInFlight = false;
    this._voiceChatQueue = [];

    // Transcript autoscroll control
    this._stickToBottom = { value: true };

    // Call UI state: "closed" | "open" | "min"
    this.callUI = "closed";
    this.voiceCountdownTimer = null;
    this.voiceCountdownMs = ((window.Config && window.Config.VOICE_COUNTDOWN_SECONDS) ? window.Config.VOICE_COUNTDOWN_SECONDS : 60) * 1000;
    this.voiceCountdownRaf = null;
    this.voiceCountdownDeadline = null;
    this.voiceCountdownSilenceTimer = null;
    const silenceSeconds = window.Config?.VOICE_COUNTDOWN_SILENCE_SECONDS;
    this.voiceCountdownSilenceMs = (Number.isFinite(silenceSeconds) ? Math.max(0, silenceSeconds) : 3) * 1000;
    this.lastVoiceActivityMs = null;

    this._startingConversation = false;

    // Auth state
    this.user = null; // { userId, username, displayName, isAnonymous }

    this.elements = {
      // Panels / visuals
      panelTalk: document.getElementById("panelTalk"),
      panelText: document.getElementById("panelText"),
      panelVideo: document.getElementById("panelVideo"),

      // Shared transcript
      transcriptOuter: document.getElementById("transcript"),
      transcriptInner: document.getElementById("transcriptInner"),

      // Mode input
      textInputWrap: document.getElementById("textInputWrap"),

      // Bottom buttons
      toggleBtnTalk: document.getElementById("toggleBtnTalk"),
      toggleBtnText: document.getElementById("toggleBtnText"),

      // Talk UI
      hintTalk: document.getElementById("hintTalk"),
      canvas: document.getElementById("waveform"),
      avatar: document.getElementById("brendaAvatar"),

      // Text input
      chatInput: document.getElementById("chatInput"),
      chatSendBtn: document.getElementById("chatSendBtn"),
      hintText: document.getElementById("hintText"),

      // Call overlay + tile
      callOverlay: document.getElementById("callOverlay"),
      callTitle: document.getElementById("callTitle"),
      callMinBtn: document.getElementById("callMinBtn"),
      callHangBtn: document.getElementById("callHangBtn"),
      callTile: document.getElementById("callTile"),
      callExpandBtn: document.getElementById("callExpandBtn"),
      callConnecting: document.getElementById("callConnecting"),
      callConnectingLabel: document.getElementById("callConnectingLabel"),
      callThinking: document.getElementById("callThinking"),
      callThinkingLabel: document.getElementById("callThinkingLabel"),

      // Account UI
      accountBtn: document.getElementById("accountBtn"),

      // Auth overlay
      authOverlay: document.getElementById("authOverlay"),
      authCloseBtn: document.getElementById("authCloseBtn"),
      authGreeting: document.getElementById("authGreeting"),
      authExplain: document.getElementById("authExplain"),
      authNickLabel: document.getElementById("authNickLabel"),
      authNickHelp: document.getElementById("authNickHelp"),
      authPinLabel: document.getElementById("authPinLabel"),
      authPinHelp01: document.getElementById("authPinHelp01"),
      authPinHelp02: document.getElementById("authPinHelp02"),
      authNick: document.getElementById("authNick"),
      authPin: document.getElementById("authPin"),
      authContinueBtn: document.getElementById("authContinueBtn"),
      authAnonBtn: document.getElementById("authAnonBtn"),
      authPrivacyLink: document.getElementById("authPrivacyLink"),
      authError: document.getElementById("authError"),

      // Subjects UI
      startBtn: document.getElementById("startBtn"),
      medBtn: document.getElementById("medBtn"),
      subjectsBtn: document.getElementById("subjectsBtn"),

      // I am Brenda Overlay
      brendaOverlay: document.getElementById("brendaOverlay"),
      brendaCloseBtn: document.getElementById("brendaCloseBtn"),
      brendaBottomCloseBtn: document.getElementById("brendaBottomCloseBtn"),
      brendaTitle: document.getElementById("brendaTitle"),
      brendaSubtitle: document.getElementById("brendaSubtitle"),
      brendaContent: document.getElementById("brendaContent"),

      // Avatar/Title triggers
      brendaAvatar: document.getElementById("brendaAvatar"),
      headerTitle: document.querySelector(".header-title-block h1"),
      subjectsOverlay: document.getElementById("subjectsOverlay"),
      subjectsCloseBtn: document.getElementById("subjectsCloseBtn"),
      subjectsTitle: document.getElementById("subjectsTitle"),
      subjectsSubtitle: document.getElementById("subjectsSubtitle"),
      subjectsForm: document.getElementById("subjectsForm"),
      subjectsInputs: [
        document.getElementById("subjectInput1"),
        document.getElementById("subjectInput2"),
        document.getElementById("subjectInput3"),
        document.getElementById("subjectInput4"),
        document.getElementById("subjectInput5"),
      ],
      subjectsLabels: [
        document.getElementById("subjectLabel1"),
        document.getElementById("subjectLabel2"),
        document.getElementById("subjectLabel3"),
        document.getElementById("subjectLabel4"),
        document.getElementById("subjectLabel5"),
      ],
      subjectsCancelBtn: document.getElementById("subjectsCancelBtn"),
      subjectsSaveBtn: document.getElementById("subjectsSaveBtn"),
      subjectsStatus: document.getElementById("subjectsStatus"),

      // Location UI
      locationBtn: document.getElementById("locationBtn"),
      locationOverlay: document.getElementById("locationOverlay"),
      locationCloseBtn: document.getElementById("locationCloseBtn"),
      locationTitle: document.getElementById("locationTitle"),
      locationSubtitle: document.getElementById("locationSubtitle"),
      locationTownLabel: document.getElementById("locationTownLabel"),
      locationStateLabel: document.getElementById("locationStateLabel"),
      locationCountryLabel: document.getElementById("locationCountryLabel"),
      locationTownInput: document.getElementById("locationTownInput"),
      locationStateInput: document.getElementById("locationStateInput"),
      locationCountryInput: document.getElementById("locationCountryInput"),
      locationCancelBtn: document.getElementById("locationCancelBtn"),
      locationSaveBtn: document.getElementById("locationSaveBtn"),
      locationStatus: document.getElementById("locationStatus"),
      locationGender: document.getElementById("locationGender"),
      locationGenderLabel: document.getElementById("locationGenderLabel"),
      locationGenderDefault: document.getElementById("locationGenderDefault"),
      locationGenderWoman: document.getElementById("locationGenderWoman"),
      locationGenderMan: document.getElementById("locationGenderMan"),
      locationGenderOther: document.getElementById("locationGenderOther"),

      // Help UI
      helpBtn: document.getElementById("helpBtn"),
      helpOverlay: document.getElementById("helpOverlay"),
      helpCloseBtn: document.getElementById("helpCloseBtn"),
      helpBottomCloseBtn: document.getElementById("helpBottomCloseBtn"),
      helpContent: document.getElementById("helpContent"),
      helpTitle: document.getElementById("helpTitle"),

      // News & Gossip — Latest (category picker)
      latestBtn: document.getElementById("latestBtn"),
      latestOverlay: document.getElementById("latestOverlay"),
      latestCloseBtn: document.getElementById("latestCloseBtn"),
      latestTitle: document.getElementById("latestTitle"),
      latestSubtitle: document.getElementById("latestSubtitle"),
      latestCancelBtn: document.getElementById("latestCancelBtn"),
      latestSaveBtn: document.getElementById("latestSaveBtn"),
      latestStatus: document.getElementById("latestStatus"),
      latestCatCheckboxes: [
        document.getElementById("latestCatActualidad"),
        document.getElementById("latestCatGossip"),
        document.getElementById("latestCatSport"),
        document.getElementById("latestCatPolitica"),
        document.getElementById("latestCatTv"),
      ],
      latestCatLabels: [
        document.getElementById("latestCatActualidadLabel"),
        document.getElementById("latestCatGossipLabel"),
        document.getElementById("latestCatSportLabel"),
        document.getElementById("latestCatPoliticaLabel"),
        document.getElementById("latestCatTvLabel"),
      ],

      // News & Gossip — Headlines feed
      headlinesBtn: document.getElementById("headlinesBtn"),
      headlinesOverlay: document.getElementById("headlinesOverlay"),
      headlinesCloseBtn: document.getElementById("headlinesCloseBtn"),
      headlinesTitle: document.getElementById("headlinesTitle"),
      headlinesLoading: document.getElementById("headlinesLoading"),
      headlinesLoadingText: document.getElementById("headlinesLoadingText"),
      headlinesList: document.getElementById("headlinesList"),
      headlinesRefreshBtn: document.getElementById("headlinesRefreshBtn"),
      legendHot: document.getElementById("legendHot"),
      legendWarm: document.getElementById("legendWarm"),
      legendCool: document.getElementById("legendCool"),
    };

    // Canvas
    this.canvasCtx = this.elements.canvas.getContext("2d");
    this.audioData = new Float32Array(128);

    // Medication manager
    this.medicationManager = new MedicationManager(this);

    this.init();
  }

  /* --------------------
     INIT
  -------------------- */
  async init() {
    // Localise hints + placeholders
    if (this.elements.hintTalk) this.elements.hintTalk.textContent = t(this.locale.variant, "hintTalk");
    if (this.elements.hintText) this.elements.hintText.textContent = t(this.locale.variant, "hintText");

    // Transcript autoscroll + placeholder
    if (this.elements.transcriptOuter) {
      wireAutoScroll(this.elements.transcriptOuter, this._stickToBottom);
    }
    if (this.elements.transcriptInner) {
      this.elements.transcriptInner.setAttribute("data-placeholder", t(this.locale.variant, "placeholder"));
    }

    // Text input placeholder + send label
    if (this.elements.chatInput) {
      this.elements.chatInput.placeholder = t(this.locale.variant, "textInputPlaceholder") || "Type a message...";
    }
    if (this.elements.chatSendBtn) {
      this.elements.chatSendBtn.textContent = t(this.locale.variant, "send") || "Send";
    }

    if (this.elements.callConnectingLabel) {
      this.elements.callConnectingLabel.textContent = t(this.locale.variant, "connecting");
    }
    this.setConnectingIndicator(false);
    if (this.elements.callThinkingLabel) {
      this.elements.callThinkingLabel.textContent = t(this.locale.variant, "thinking");
    }
    this.setThinkingIndicator(false);

    // Subjects UI labels
    this.localizeSubjectsUI();
    this.localizeLocationUI();

    // Mode button labels (i18n)
    if (this.elements.toggleBtnText) {
      this.elements.toggleBtnText.textContent = t(this.locale.variant, "textMode");
    }
    if (this.elements.startBtn) {
      this.elements.startBtn.textContent = t(this.locale.variant, "startButton");
    }
    if (this.elements.medBtn) {
      this.elements.medBtn.textContent = t(this.locale.variant, "medBtn");
    }
    if (this.elements.helpTitle) {
      this.elements.helpTitle.textContent = t(this.locale.variant, "helpTitle");
    }

    // News & Gossip button labels + legends
    this.localizeNewsUI();

    // Buttons
    this.elements.toggleBtnTalk.addEventListener("click", () => this.onTalkButton());
    this.elements.toggleBtnText.addEventListener("click", () => this.onTextButton());
    this.elements.startBtn?.addEventListener("click", () => this.startConversation());
    this.elements.medBtn?.addEventListener("click", () => this.medicationManager.open());

    // Text send
    this.elements.chatSendBtn.addEventListener("click", () => this.sendTextMessage());
    this.elements.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });

    // I Am Brenda Overlay
    this.elements.brendaAvatar?.addEventListener("click", () => this.openBrendaOverlay());
    this.elements.headerTitle?.addEventListener("click", () => this.openBrendaOverlay());
    this.elements.brendaCloseBtn?.addEventListener("click", () => this.closeBrendaOverlay());
    this.elements.brendaBottomCloseBtn?.addEventListener("click", () => this.closeBrendaOverlay());

    // Call UI buttons
    this.elements.callMinBtn?.addEventListener("click", () => this.setCallUI("min"));
    this.elements.callExpandBtn?.addEventListener("click", () => this.setCallUI("open"));
    this.elements.callHangBtn?.addEventListener("click", () => this.hangUp());

    // Subjects button + popup
    this.elements.subjectsBtn?.addEventListener("click", () => this.onSubjectsButton());
    this.elements.subjectsCloseBtn?.addEventListener("click", () => this.closeSubjectsOverlay());
    this.elements.subjectsCancelBtn?.addEventListener("click", () => this.closeSubjectsOverlay());
    this.elements.subjectsSaveBtn?.addEventListener("click", () => this.onSubjectsSave());

    // Location overlay
    this.elements.locationBtn?.addEventListener("click", () => this.onLocationButton());
    this.elements.locationCloseBtn?.addEventListener("click", () => this.closeLocationOverlay());
    this.elements.locationCancelBtn?.addEventListener("click", () => this.closeLocationOverlay());
    this.elements.locationSaveBtn?.addEventListener("click", () => this.onLocationSave());

    // Help button → opens new SideNav system
    this.elements.helpBtn?.addEventListener("click", () => this.openSideNavHome());
    this.elements.helpCloseBtn?.addEventListener("click", () => this.closeHelpOverlay());
    this.elements.helpBottomCloseBtn?.addEventListener("click", () => this.closeHelpOverlay());

    // News & Gossip — Latest overlay
    this.elements.latestBtn?.addEventListener("click", () => this.onLatestButton());
    this.elements.latestCloseBtn?.addEventListener("click", () => this.closeLatestOverlay());
    this.elements.latestCancelBtn?.addEventListener("click", () => this.closeLatestOverlay());
    this.elements.latestSaveBtn?.addEventListener("click", () => this.onLatestSave());

    // News & Gossip — Headlines overlay
    this.elements.headlinesBtn?.addEventListener("click", () => this.onHeadlinesButton());
    this.elements.headlinesCloseBtn?.addEventListener("click", () => this.closeHeadlinesOverlay());
    this.elements.headlinesRefreshBtn?.addEventListener("click", () => this.fetchAndRenderHeadlines(true));

    // Voice callbacks
    this.agent.onStatusChange = (s) => this.updateVoiceStatus(s);
    this.agent.onTranscript = (role, text, meta) => this.onVoiceTranscript(role, text, meta);
    this.agent.onAudioData = (data) => this.updateWaveform(data);
    this.agent.onError = (err) => this.showError(err);

    // Account button
    // âœ… IMPORTANT: open overlay with resetFields so Nick+PIN are empty when opened from account button
    this.elements.accountBtn?.addEventListener("click", () =>
      this.openAuthOverlay({ closable: true, resetFields: true })
    );

    // Auth overlay wiring
    this.wireAuthOverlay();

    // Start in text mode
    this.setMode("text");
    this.setTalkButtonState({ connected: false, disabled: true }); // disabled until auth

    // Canvas setup
    this.resizeCanvas();
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this._positionSideNavPanels();
    });

    // Position sidenav panels relative to the centered app container
    this._positionSideNavPanels();
    this.animateWaveform();

    // Initial render
    this.render();

    // Preload help content
    this.loadHelpContent();

    // Force auth choice on load
    await this.bootstrapAuth();
  }

  /* --------------------
     AUTH HELPERS
  -------------------- */
  wireAuthOverlay() {
    const v = this.locale.variant;

    // Copy strings
    if (this.elements.authGreeting) this.elements.authGreeting.textContent = t(v, "authGreeting");
    if (this.elements.authExplain) this.elements.authExplain.textContent = t(v, "authExplain");
    if (this.elements.authNickLabel) this.elements.authNickLabel.textContent = t(v, "authNickLabel");
    if (this.elements.authNickHelp) this.elements.authNickHelp.textContent = t(v, "authNickHelp");
    if (this.elements.authPinLabel) this.elements.authPinLabel.textContent = t(v, "authPinLabel");
    if (this.elements.authPinHelp01) this.elements.authPinHelp01.textContent = t(v, "authPinHelp01");
    if (this.elements.authPinHelp02) this.elements.authPinHelp02.textContent = t(v, "authPinHelp02");
    if (this.elements.authContinueBtn) this.elements.authContinueBtn.textContent = t(v, "authContinue");

    // âœ… Ensure Anonymous link exists + is visible + has label
    if (this.elements.authAnonBtn) {
      this.elements.authAnonBtn.textContent = t(v, "authAnonLink");
      this.elements.authAnonBtn.classList.remove("hidden");
      this.elements.authAnonBtn.style.display = ""; // in case inline styles hid it
    }

    // âœ… Ensure Privacy link exists + is visible + has label + points to privacy.html
    if (this.elements.authPrivacyLink) {
      this.elements.authPrivacyLink.textContent = t(v, "authPrivacy");
      this.elements.authPrivacyLink.classList.remove("hidden");
      this.elements.authPrivacyLink.style.display = "";

      // If it's an <a>, set href/target safely
      if (this.elements.authPrivacyLink.tagName === "A") {
        this.elements.authPrivacyLink.setAttribute("href", "privacy.html");
        this.elements.authPrivacyLink.setAttribute("target", "_blank");
        this.elements.authPrivacyLink.setAttribute("rel", "noopener");
      } else {
        // If it's not an <a>, fall back to click handler
        this.elements.authPrivacyLink.addEventListener("click", () => window.open("privacy.html", "_blank", "noopener"));
      }
    }

    // Events
    this.elements.authContinueBtn?.addEventListener("click", () => this.authContinue());
    this.elements.authAnonBtn?.addEventListener("click", () => this.continueAnonymous());

    // Enter key
    this.elements.authPin?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.authContinue();
    });

    this.elements.authCloseBtn?.addEventListener("click", () => this.closeAuthOverlay());
  }

  async bootstrapAuth() {
    try {
      const me = await this.apiJSON("/api/auth/me", { method: "GET" });
      if (me?.voiceProxyUrl && window.Config) window.Config.VOICE_PROXY_WS_URL = me.voiceProxyUrl;
      if (me?.voiceToken  && window.Config) window.Config.VOICE_TOKEN = me.voiceToken;
      if (me?.userId) {
        await this.setUser(me);
        this.closeAuthOverlay();
        await this.loadHistoryAndRender();
        await this.loadSubjectsForCurrentUser();
        await this.checkAndShowGreeting();
        this.startGreetingHeartbeat();
        this.setTalkButtonState({ connected: false, disabled: false });
        return;
      }
    } catch {
      // ignore; force auth
    }

    // Not logged in: force overlay
    this.setUser(null);
    this.openAuthOverlay({ closable: false, resetFields: true });
    this.setTalkButtonState({ connected: false, disabled: true });
    this.elements.toggleBtnText.disabled = true;
  }

  // âœ… Added resetFields option
  openAuthOverlay({ closable, resetFields = false } = {}) {
    const o = this.elements.authOverlay;
    if (!o) return;

    // If already authenticated and closable, show X
    if (this.elements.authCloseBtn) {
      this.elements.authCloseBtn.classList.toggle("hidden", !closable);
    }

    // âœ… Always clear errors
    if (this.elements.authError) this.elements.authError.textContent = "";

    // Pre-fill with current user data if logged in, otherwise clear
    if (resetFields) {
      if (this.user && !this.user.isAnonymous) {
        if (this.elements.authNick) this.elements.authNick.value = this.user.username || "";
        if (this.elements.authPin) this.elements.authPin.value = "";
      } else {
        if (this.elements.authNick) this.elements.authNick.value = "";
        if (this.elements.authPin) this.elements.authPin.value = "";
      }
    }

    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");

    // Focus nick
    setTimeout(() => this.elements.authNick?.focus(), 50);
  }

  closeAuthOverlay() {
    const o = this.elements.authOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
    if (this.elements.authError) this.elements.authError.textContent = "";
  }

  setUser(meOrNull) {
    const prevUserId = this.user?.userId;

    // Ensure we have a name to show even if displayName is missing
    const nameToShow = meOrNull?.displayName || meOrNull?.userId || meOrNull?.username || "";

    this.user = meOrNull
      ? {
        userId: meOrNull.userId,
        username: meOrNull.username || meOrNull.userId || "",
        displayName: nameToShow,
        isAnonymous: !!meOrNull.isAnonymous,
        gender: meOrNull.gender || null,
      }
      : null;

    if (!meOrNull || meOrNull.userId !== prevUserId) {
      this.subjects = this.defaultSubjects();
    }

    // Update account button text
    if (this.elements.accountBtn) {
      const v = this.locale.variant;
      if (!this.user) {
        this.elements.accountBtn.textContent = t(v, "accountBtnAnonymous") || "Anonymous";
      } else {
        // Force the display name into the button
        this.elements.accountBtn.textContent = this.user.displayName;
      }
    }
  }

  validateNick(nick) {
    return /^[A-Za-z0-9_]{4,20}$/.test(nick);
  }

  validatePin(pin) {
    return /^\d{4}$/.test(pin);
  }

  setAuthBusy(isBusy) {
    if (this.elements.authContinueBtn) this.elements.authContinueBtn.disabled = isBusy;
    if (this.elements.authAnonBtn) this.elements.authAnonBtn.disabled = isBusy;
    if (this.elements.authNick) this.elements.authNick.disabled = isBusy;
    if (this.elements.authPin) this.elements.authPin.disabled = isBusy;
    if (this.elements.authContinueBtn && isBusy) {
      this.elements.authContinueBtn.textContent = t(this.locale.variant, "authLoading");
    } else if (this.elements.authContinueBtn) {
      this.elements.authContinueBtn.textContent = t(this.locale.variant, "authContinue");
    }
  }

  async authContinue() {
    const v = this.locale.variant;
    const nick = (this.elements.authNick?.value || "").trim();
    const pin = (this.elements.authPin?.value || "").trim();

    if (!this.validateNick(nick)) {
      if (this.elements.authError) this.elements.authError.textContent = t(v, "authErrorBadNick");
      return;
    }
    if (!this.validatePin(pin)) {
      if (this.elements.authError) this.elements.authError.textContent = t(v, "authErrorBadPin");
      return;
    }

    this.setAuthBusy(true);
    try {
      const me = await this.apiJSON("/api/auth/login", {
        method: "POST",
        body: { username: nick, pin },
      });

      await this.setUser(me);
      this.closeAuthOverlay();

      // Switch user: replace transcript with their last N
      await this.loadHistoryAndRender();
      await this.loadSubjectsForCurrentUser();
      await this.checkAndShowGreeting();
      this.startGreetingHeartbeat();

      // Enable controls
      this.setTalkButtonState({ connected: false, disabled: false });
      this.elements.toggleBtnText.disabled = false;
    } catch (e) {
      console.error(e);
      if (this.elements.authError) this.elements.authError.textContent = e?.message || String(e);
    } finally {
      this.setAuthBusy(false);
    }
  }

  async continueAnonymous() {
    this.setAuthBusy(true);
    try {
      const me = await this.apiJSON("/api/auth/anonymous", { method: "POST", body: {} });
      await this.setUser(me);
      this.closeAuthOverlay();

      // New anon user has no history; still load (empty)
      await this.loadHistoryAndRender();
      await this.loadSubjectsForCurrentUser();
      await this.checkAndShowGreeting();
      this.startGreetingHeartbeat();

      this.setTalkButtonState({ connected: false, disabled: false });
      this.elements.toggleBtnText.disabled = false;
    } catch (e) {
      console.error(e);
      if (this.elements.authError) this.elements.authError.textContent = e?.message || String(e);
    } finally {
      this.setAuthBusy(false);
    }
  }

  /* --------------------
     API helper
  -------------------- */
  async apiJSON(url, { method = "GET", body } = {}) {
    const opts = {
      method,
      headers: {},
      credentials: "include", // âœ… IMPORTANT: send/receive HttpOnly session cookie
    };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      // Try JSON error
      try {
        const j = JSON.parse(text);
        throw new Error(j.error || j.message || `HTTP ${res.status}`);
      } catch {
        throw new Error(text || `HTTP ${res.status}`);
      }
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async loadHistoryAndRender() {
    const limit = (window.Config && window.Config.HISTORY_LIMIT) ? window.Config.HISTORY_LIMIT : 50;
    const data = await this.apiJSON(`/api/history?limit=${encodeURIComponent(limit)}`, { method: "GET" });
    const msgs = Array.isArray(data?.messages) ? data.messages : [];
    this.messages = msgs.map((m) => ({
      id: m.id || this._id("m"),
      role: m.role,
      fromChannel: m.fromChannel || m.channel || "text",
      text: m.content || m.text || "",
      status: "final",
      ts: m.timestamp ? Date.parse(m.timestamp) : Date.now(),
    }));
    this._persisted = new Set(this.messages.map((m) => m.id));
    this.render();
  }

  /* --------------------
     SUBJECTS MODAL
  -------------------- */
  defaultSubjects() {
    return ["", "", "", "", ""];
  }

  normalizeSubjects(list) {
    const out = this.defaultSubjects();
    if (Array.isArray(list)) {
      for (let i = 0; i < Math.min(out.length, list.length); i++) {
        out[i] = typeof list[i] === "string" ? list[i].trim() : "";
      }
    }
    return out;
  }

  localizeSubjectsUI() {
    const v = this.locale.variant;
    if (this.elements.subjectsBtn) this.elements.subjectsBtn.textContent = t(v, "subjectsButton");
    if (this.elements.subjectsTitle) this.elements.subjectsTitle.textContent = t(v, "subjectsTitle");
    if (this.elements.subjectsSubtitle) this.elements.subjectsSubtitle.textContent = t(v, "subjectsSubtitle");
    if (this.elements.subjectsLabels) {
      this.elements.subjectsLabels.forEach((el, idx) => {
        if (el) el.textContent = t(v, `subjectLabel${idx + 1}`);
      });
    }
    if (this.elements.subjectsSaveBtn) this.elements.subjectsSaveBtn.textContent = t(v, "subjectsSave");
    if (this.elements.subjectsCancelBtn) this.elements.subjectsCancelBtn.textContent = t(v, "subjectsCancel");
  }

  /* --------------------
     NEWS & GOSSIP — LOCALIZE
  -------------------- */
  localizeNewsUI() {
    const v = this.locale.variant;
    const e = this.elements;
    const catKeys = ["Actualidad", "Gossip", "Sport", "Politica", "Tv"];
    if (e.latestBtn)     e.latestBtn.textContent     = t(v, "latestBtn");
    if (e.latestTitle)   e.latestTitle.textContent   = t(v, "latestTitle");
    if (e.latestSubtitle) e.latestSubtitle.textContent = t(v, "latestSubtitle");
    if (e.latestSaveBtn)   e.latestSaveBtn.textContent   = t(v, "latestSave");
    if (e.latestCancelBtn) e.latestCancelBtn.textContent = t(v, "latestCancel");
    if (e.latestCatLabels) {
      e.latestCatLabels.forEach((el, i) => {
        if (el) el.textContent = t(v, `latestCat${catKeys[i]}`);
      });
    }
    if (e.headlinesBtn)   e.headlinesBtn.textContent   = t(v, "headlinesBtn");
    if (e.headlinesTitle) e.headlinesTitle.textContent = t(v, "headlinesTitle");
    if (e.legendHot)  e.legendHot.textContent  = t(v, "headlinesLegendHot");
    if (e.legendWarm) e.legendWarm.textContent = t(v, "headlinesLegendWarm");
    if (e.legendCool) e.legendCool.textContent = t(v, "headlinesLegendCool");
    if (e.headlinesRefreshBtn) e.headlinesRefreshBtn.textContent = t(v, "headlinesRefresh");
    if (e.headlinesLoadingText) e.headlinesLoadingText.textContent = t(v, "headlinesLoading");
  }

  /* --------------------
     LATEST OVERLAY
  -------------------- */
  onLatestButton() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    this.openLatestOverlay();
  }

  async openLatestOverlay() {
    const o = this.elements.latestOverlay;
    if (!o) return;

    this.setLatestStatus("");
    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");

    // Load saved categories (default: all checked)
    let saved = ["actualidad", "gossip", "sport", "politica", "tv"];
    try {
      const data = await this.apiJSON("/api/brenda/categories", { method: "GET" });
      if (data?.categories?.length) saved = data.categories;
    } catch { /* non-fatal */ }

    const checkboxes = this.elements.latestCatCheckboxes || [];
    checkboxes.forEach((cb) => {
      if (cb) cb.checked = saved.includes(cb.value);
    });
  }

  closeLatestOverlay() {
    const o = this.elements.latestOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
    this.setLatestStatus("");
  }

  setLatestStatus(msg, isError = false) {
    if (this.elements.latestStatus) {
      this.elements.latestStatus.textContent = msg || "";
      this.elements.latestStatus.style.color = isError ? "#b00020" : "#2563eb";
    }
  }

  async onLatestSave() {
    const v = this.locale.variant;
    const checkboxes = this.elements.latestCatCheckboxes || [];
    const selected = checkboxes.filter((cb) => cb?.checked).map((cb) => cb.value);
    if (!selected.length) {
      this.setLatestStatus(t(v, "latestSaveError"), true);
      return;
    }
    try {
      await this.apiJSON("/api/brenda/categories", {
        method: "POST",
        body: { categories: selected },
      });
      this.setLatestStatus(t(v, "latestSaved"));
      setTimeout(() => this.closeLatestOverlay(), 500);
    } catch (e) {
      console.error("[latest/save]", e);
      this.setLatestStatus(t(v, "latestSaveError"), true);
    }
  }

  /* --------------------
     HEADLINES OVERLAY
  -------------------- */
  onHeadlinesButton() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    this.openHeadlinesOverlay();
  }

  openHeadlinesOverlay() {
    const o = this.elements.headlinesOverlay;
    if (!o) return;
    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");
    // Reset to loading state before fetching
    if (this.elements.headlinesLoading) this.elements.headlinesLoading.classList.add("hidden");
    if (this.elements.headlinesList)    this.elements.headlinesList.classList.remove("hidden");
    this.fetchAndRenderHeadlines();
  }

  closeHeadlinesOverlay() {
    const o = this.elements.headlinesOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
  }

  setHeadlinesLoading(show) {
    const loading = this.elements.headlinesLoading;
    const list    = this.elements.headlinesList;
    if (loading) loading.classList.toggle("hidden", !show);
    if (list)    list.classList.toggle("hidden", show);
  }

  async fetchAndRenderHeadlines(force = false) {
    const v = this.locale.variant;
    const list = this.elements.headlinesList;
    if (!list) return;

    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    const cache = this._headlinesCache;
    if (!force && cache?.items?.length && (Date.now() - cache.ts) < CACHE_TTL) {
      this.setHeadlinesLoading(false);
      this.renderHeadlines(cache.items);
      return;
    }

    this.setHeadlinesLoading(true);
    list.innerHTML = "";

    try {
      const data = await this.apiJSON("/api/brenda/headlines", { method: "GET" });
      const headlines = data?.headlines || [];
      this.setHeadlinesLoading(false);

      if (!headlines.length) {
        list.innerHTML = `<p style="text-align:center;color:#888;padding:24px 0">${t(v, "headlinesEmpty")}</p>`;
        return;
      }
      this._headlinesCache = { items: headlines, ts: Date.now() };
      this.renderHeadlines(headlines);
    } catch (e) {
      console.error("[headlines/fetch]", e);
      this.setHeadlinesLoading(false);
      list.innerHTML = `<p style="text-align:center;color:#b00020;padding:24px 0">${t(v, "headlinesEmpty")}</p>`;
    }
  }

  renderHeadlines(headlines) {
    const list = this.elements.headlinesList;
    if (!list) return;

    const v = this.locale.variant;
    const frag = document.createDocumentFragment();
    headlines.forEach((h) => {
      const tier = h.heat >= 80 ? "hot" : h.heat >= 50 ? "warm" : "cool";
      const card = document.createElement("div");
      card.className = `headline-card headline-card--${tier}`;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      const pillText = t(v, `catPill_${h.cat}`) || h.cat;
      const heatPct  = Math.round(h.heat || 0);

      card.innerHTML = `
        <span class="headline-pill headline-pill--${h.cat}">${pillText}</span>
        <div class="headline-title">${this._esc(h.headline)}</div>
        ${h.snippet ? `<div class="headline-snippet">${this._esc(h.snippet)}</div>` : ""}
        <div class="headline-heat-row">
          <span class="headline-heat-label">${heatPct}</span>
          <div class="headline-heat-bar-wrap">
            <div class="headline-heat-bar-fill headline-heat-bar-fill--${tier}" style="width:${heatPct}%"></div>
          </div>
        </div>
      `;

      const tap = () => this.onHeadlineCardTap(h);
      card.addEventListener("click", tap);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") tap(); });
      frag.appendChild(card);
    });

    list.innerHTML = "";
    list.appendChild(frag);
  }

  async onHeadlineCardTap(headline) {
    this.closeHeadlinesOverlay();

    const needsConnect = this._lastVoiceStatus === "disconnected";
    if (this.mode !== "talk") this.setMode("talk");
    if (needsConnect) this.connectVoice();

    try {
      const [data] = await Promise.all([
        this.apiJSON("/api/brenda/gossip", {
          method: "POST",
          body: {
            headline: headline.headline,
            snippet:  headline.snippet || "",
            locale:   this.locale.variant,
            history:  [],
          },
        }),
        needsConnect ? this._waitForVoice(15000) : Promise.resolve(),
      ]);
      if (data?.reply) {
        // Speak Part 1 exactly — Gemini says the gossip text, transcript adds it to chat
        const spoken = await this.speakExactLine(data.reply);

        if (spoken) {
          // Wait for Part 1 to finish, then let Gemini react naturally (Part 2)
          await this._waitForSpeechEnd(45000);
          await new Promise(r => setTimeout(r, 1500));
          await this.agent.speakText(data.reply);
        } else {
          // Voice not available — show in chat + browser TTS, skip Part 2
          await this.emitAssistantLine({ text: data.reply, channel: "text" });
          await this.speakText(data.reply, { forceLocal: true });
        }
      }
    } catch (e) {
      console.warn("[gossip/tap]", e?.message || e);
    }
  }

  _waitForSpeechEnd(timeoutMs = 45000) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      let speechStarted = false;
      const id = setInterval(() => {
        const s = this._lastVoiceStatus;
        if (s === "speaking") speechStarted = true;
        if ((speechStarted && s !== "speaking") || Date.now() > deadline) {
          clearInterval(id);
          resolve();
        }
      }, 100);
    });
  }

  _waitForVoice(timeoutMs = 15000) {
    return new Promise((resolve) => {
      if (this._lastVoiceStatus === "connected" || this._lastVoiceStatus === "speaking") {
        resolve();
        return;
      }
      const deadline = Date.now() + timeoutMs;
      const id = setInterval(() => {
        if (this._lastVoiceStatus === "connected" || this._lastVoiceStatus === "speaking" || Date.now() > deadline) {
          clearInterval(id);
          resolve();
        }
      }, 100);
    });
  }

  /** HTML-escape helper for injecting user-sourced strings into innerHTML */
  _esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  populateSubjectsForm() {
    const arr = this.normalizeSubjects(this.subjects);
    const inputs = this.elements.subjectsInputs || [];
    inputs.forEach((input, idx) => {
      if (input) input.value = arr[idx] || "";
    });
  }

  collectSubjectsFromForm() {
    const inputs = this.elements.subjectsInputs || [];
    const values = inputs.map((input) => (input?.value || "").trim());
    return this.normalizeSubjects(values);
  }

  setSubjectsStatus(msg, isError = false) {
    if (this.elements.subjectsStatus) {
      this.elements.subjectsStatus.textContent = msg || "";
      this.elements.subjectsStatus.style.color = isError ? "#b00020" : "#2563eb";
    }
  }

  setSubjectsBusy(isBusy) {
    const inputs = this.elements.subjectsInputs || [];
    inputs.forEach((input) => {
      if (input) input.disabled = isBusy;
    });
    if (this.elements.subjectsSaveBtn) this.elements.subjectsSaveBtn.disabled = isBusy;
    if (this.elements.subjectsCancelBtn) this.elements.subjectsCancelBtn.disabled = isBusy;
  }

  openSubjectsOverlay() {
    const o = this.elements.subjectsOverlay;
    if (!o) return;
    this.populateSubjectsForm();
    this.setSubjectsStatus("");
    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");
    setTimeout(() => this.elements.subjectsInputs?.[0]?.focus(), 30);
  }

  closeSubjectsOverlay() {
    const o = this.elements.subjectsOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
    this.setSubjectsStatus("");
    this.setSubjectsBusy(false);
  }

  /* --------------------
     LOCATION OVERLAY
  -------------------- */
  localizeLocationUI() {
    const v = this.locale.variant;
    if (this.elements.locationBtn) this.elements.locationBtn.textContent = t(v, "locationButton");
    if (this.elements.locationTitle) this.elements.locationTitle.textContent = t(v, "locationTitle");
    if (this.elements.locationSubtitle) this.elements.locationSubtitle.textContent = t(v, "locationSubtitle");
    if (this.elements.locationTownLabel) this.elements.locationTownLabel.textContent = t(v, "locationTown");
    if (this.elements.locationStateLabel) this.elements.locationStateLabel.textContent = t(v, "locationState");
    if (this.elements.locationCountryLabel) this.elements.locationCountryLabel.textContent = t(v, "locationCountry");
    if (this.elements.locationGenderLabel) this.elements.locationGenderLabel.textContent = t(v, "authGenderLabel");
    if (this.elements.locationGenderDefault) this.elements.locationGenderDefault.textContent = t(v, "authGenderDefault");
    if (this.elements.locationGenderWoman) this.elements.locationGenderWoman.textContent = t(v, "authGenderWoman");
    if (this.elements.locationGenderMan) this.elements.locationGenderMan.textContent = t(v, "authGenderMan");
    if (this.elements.locationGenderOther) this.elements.locationGenderOther.textContent = t(v, "authGenderOther");
    if (this.elements.locationSaveBtn) this.elements.locationSaveBtn.textContent = t(v, "locationSave");
    if (this.elements.locationCancelBtn) this.elements.locationCancelBtn.textContent = t(v, "locationCancel");
  }

  setLocationStatus(msg, isError = false) {
    if (this.elements.locationStatus) {
      this.elements.locationStatus.textContent = msg || "";
      this.elements.locationStatus.style.color = isError ? "#b00020" : "#2563eb";
    }
  }

  setLocationBusy(isBusy) {
    [this.elements.locationTownInput, this.elements.locationStateInput, this.elements.locationCountryInput, this.elements.locationGender].forEach((el) => {
      if (el) el.disabled = isBusy;
    });
    if (this.elements.locationSaveBtn) this.elements.locationSaveBtn.disabled = isBusy;
    if (this.elements.locationCancelBtn) this.elements.locationCancelBtn.disabled = isBusy;
  }

  async populateLocationForm() {
    // Pre-fill with saved location if the user has one
    if (!this.user || this.user.isAnonymous) return;
    try {
      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get_location" }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data?.location) {
        if (this.elements.locationTownInput) this.elements.locationTownInput.value = data.location.city || "";
        if (this.elements.locationStateInput) this.elements.locationStateInput.value = data.location.state || "";
        if (this.elements.locationCountryInput) this.elements.locationCountryInput.value = data.location.country || "";
      }
    } catch {
      // ignore — form stays empty
    }
    // Pre-fill gender from in-memory user state (no extra API call needed)
    if (this.elements.locationGender) {
      const g = this.user.gender;
      const genderKey = { Woman: "authGenderWoman", Man: "authGenderMan", Other: "authGenderOther" }[g];
      if (genderKey && this.elements.locationGenderDefault) {
        this.elements.locationGenderDefault.value = g;
        this.elements.locationGenderDefault.textContent = t(this.locale.variant, genderKey);
        this.elements.locationGender.value = g;
      }
    }
  }

  async openLocationOverlay() {
    const o = this.elements.locationOverlay;
    if (!o) return;
    this.setLocationStatus("");
    // Clear fields first, then populate with saved data
    if (this.elements.locationTownInput) this.elements.locationTownInput.value = "";
    if (this.elements.locationStateInput) this.elements.locationStateInput.value = "";
    if (this.elements.locationCountryInput) this.elements.locationCountryInput.value = "";
    if (this.elements.locationGender) this.elements.locationGender.value = "";
    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");
    await this.populateLocationForm();
    setTimeout(() => this.elements.locationTownInput?.focus(), 30);
  }

  closeLocationOverlay() {
    const o = this.elements.locationOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
    this.setLocationStatus("");
    this.setLocationBusy(false);
  }

  onLocationButton() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    this.openLocationOverlay();
  }

  async onLocationSave() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    const city = (this.elements.locationTownInput?.value || "").trim();
    const state = (this.elements.locationStateInput?.value || "").trim();
    const country = (this.elements.locationCountryInput?.value || "").trim();
    const gender = (this.elements.locationGender?.value || "").trim();
    const v = this.locale.variant;

    if (!city) {
      this.setLocationStatus(t(v, "locationTown") + " is required", true);
      this.elements.locationTownInput?.focus();
      return;
    }

    this.setLocationBusy(true);
    this.setLocationStatus("");

    try {
      // Save gender if provided and user is not anonymous
      if (gender && !this.user.isAnonymous) {
        const gRes = await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ gender }),
        });
        if (!gRes.ok) {
          const gData = await gRes.json().catch(() => ({}));
          this.setLocationStatus(gData.error || t(v, "locationSaveError"), true);
          return;
        }
        this.user.gender = gender;
      }

      // Save location
      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get_forecast", city, state, country, saveLocation: true }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (data.code === "multiple_locations") {
          const options = (data.candidates || [])
            .map((c) => [c.city, c.state, c.country].filter(Boolean).join(", "))
            .join(" / ");
          this.setLocationStatus(`Multiple matches: ${options}. Please be more specific.`, true);
        } else if (data.code === "city_not_found") {
          this.setLocationStatus(v.startsWith("es") ? "Ciudad no encontrada. Intenta de nuevo." : "City not found. Please try again.", true);
        } else {
          this.setLocationStatus(data.error || t(v, "locationSaveError"), true);
        }
        return;
      }

      this.setLocationStatus(t(v, "locationSaved"));
      setTimeout(() => this.closeLocationOverlay(), 600);
    } catch (e) {
      console.error(e);
      this.setLocationStatus(e?.message || t(v, "locationSaveError"), true);
    } finally {
      this.setLocationBusy(false);
    }
  }

  /* --------------------
     HELP OVERLAY
  -------------------- */
  async loadHelpContent() {
    try {
      const res = await fetch("/help-texts.html", { cache: "no-cache" });
      const html = await res.text();
      this.helpTextRaw = html || "";
    } catch (e) {
      console.warn("Failed to load help text", e?.message || e);
      this.helpTextRaw = "<p>Help unavailable right now.</p>";
    }
  }

  openHelpOverlay() {
    const o = this.elements.helpOverlay;
    const c = this.elements.helpContent;
    if (!o || !c) return;

    // Choose language block based on locale
    const variant = this.locale?.variant || "en-US";
    const isSpanish = variant.startsWith("es");
    let content = this.helpTextRaw || "";

    // Parse HTML to safely pick language blocks and keep styles
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const styleBlocks = Array.from(doc.querySelectorAll("style")).map((el) => el.outerHTML).join("\n");
      const langSelector = isSpanish ? '[data-lang="es"]' : '[data-lang="en"]';
      const section = doc.querySelector(langSelector) || doc.body;
      const bodyHtml = section ? section.outerHTML : content;
      content = `${styleBlocks}\n${bodyHtml}`;
    } catch (e) {
      console.warn("Help content parse error", e?.message || e);
    }

    c.innerHTML = content.trim();

    if (this.elements.helpBottomCloseBtn) this.elements.helpBottomCloseBtn.textContent = t(variant, "brendaClose");

    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");
  }

  closeHelpOverlay() {
    const o = this.elements.helpOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
  }

  // ── SideNav Help System ─────────────────────────────────────────────────

  _positionSideNavPanels() {
    const container = document.querySelector(".container");
    const wrapper   = document.getElementById("sideNavWrapper");
    if (!container || !wrapper) return;
    const r = container.getBoundingClientRect();
    wrapper.style.left   = r.left + "px";
    wrapper.style.top    = r.top  + "px";
    wrapper.style.width  = r.width  + "px";
    wrapper.style.height = r.height + "px";
  }

  openSideNavHome() {
    this._positionSideNavPanels();
    const panel = document.getElementById("sideNavHome");
    if (!panel) return;
    const v = this.locale.variant;
    this._renderSideNavHome(panel, v);
    panel.classList.add("sidenav-open");
    panel.setAttribute("aria-hidden", "false");
  }

  closeSideNavHome() {
    document.querySelectorAll(".sidenav-detail").forEach((p) => {
      p.classList.remove("sidenav-open");
      p.setAttribute("aria-hidden", "true");
    });
    const panel = document.getElementById("sideNavHome");
    if (!panel) return;
    panel.classList.remove("sidenav-open");
    panel.setAttribute("aria-hidden", "true");
  }

  openSideNavDetail(name) {
    this._positionSideNavPanels();
    const id = "sideNav" + name.charAt(0).toUpperCase() + name.slice(1);
    const panel = document.getElementById(id);
    if (!panel) return;
    const v = this.locale.variant;
    this._renderSideNavDetail(panel, name, v);
    panel.classList.add("sidenav-open");
    panel.setAttribute("aria-hidden", "false");
  }

  closeSideNavDetail(name) {
    const id = "sideNav" + name.charAt(0).toUpperCase() + name.slice(1);
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.remove("sidenav-open");
    panel.setAttribute("aria-hidden", "true");
  }

  _renderSideNavHome(panel, v) {
    const inner = panel.querySelector(".sidenav-inner");
    if (!inner) return;

    const isAnon = !this.user || this.user.isAnonymous;
    const accountPillText = isAnon
      ? t(v, "accountBtnAnonymous")
      : (this.user.displayName || this.user.username || t(v, "accountBtnAnonymous"));
    const accountLabelKey = isAnon ? "sideNavLabelAnon" : "sideNavLabelAccount";

    const accountRowHtml = `
      <div class="sidenav-pill-row">
        <div class="sidenav-pill-col">
          <span class="snp snp-light">${this._snEsc(accountPillText)}</span>
        </div>
        <span class="sidenav-row-label">${this._snEsc(t(v, accountLabelKey))}</span>
      </div>`;

    const beforeAccount = SIDENAV_HOME_PILLS.slice(0, 2);
    const afterAccount  = SIDENAV_HOME_PILLS.slice(2);

    const pillsHtml = (pills) => pills.map((pill) => {
      const isNav = !!pill.nav;
      return `<div class="sidenav-pill-row${isNav ? " sidenav-pill-row--nav" : ""}" data-nav="${pill.nav || ""}">
        <div class="sidenav-pill-col">
          <span class="snp ${pill.pillClass}">${this._snEsc(t(v, pill.pillKey))}</span>
        </div>
        <span class="sidenav-row-label">${this._snEsc(t(v, pill.labelKey))}</span>
      </div>`;
    }).join("");

    inner.innerHTML = `
      <div class="sidenav-close-row">
        <button class="sidenav-close-btn js-snav-home-close">
          <span class="sidenav-close-label">${this._snEsc(t(v, "sideNavCloseLabel"))}</span>
          <span class="sidenav-close-x">X</span>
        </button>
      </div>
      <p class="sidenav-intro">${this._snEsc(t(v, "sideNavIntro"))}</p>
      <div class="sidenav-pill-list">
        ${pillsHtml(beforeAccount)}
        ${accountRowHtml}
        ${pillsHtml(afterAccount)}
      </div>`;

    inner.querySelector(".js-snav-home-close")
      ?.addEventListener("click", () => this.closeSideNavHome());

    inner.querySelectorAll(".sidenav-pill-row--nav").forEach((row) => {
      const nav = row.dataset.nav;
      if (nav) row.addEventListener("click", () => this.openSideNavDetail(nav));
    });
  }

  _renderSideNavDetail(panel, name, v) {
    const cfg = SIDENAV_DETAIL_CONFIGS[name];
    if (!cfg) return;
    const inner = panel.querySelector(".sidenav-inner");
    if (!inner) return;

    const blocksHtml = cfg.blocks.map((block) => {
      if (block.type === "text") {
        return `<p class="sidenav-text-block">${this._snEsc(t(v, block.key))}</p>`;
      }
      if (block.type === "pill-btn") {
        return `<div class="sidenav-pill-btn-wrap">
          <span class="snp ${block.pillClass}">${this._snEsc(t(v, block.key))}</span>
        </div>`;
      }
      if (block.type === "image") {
        return `<div class="sidenav-img-wrap">
          <img src="${block.src}" alt="Brenda" />
        </div>`;
      }
      return "";
    }).join("");

    inner.innerHTML = `
      <div class="sidenav-close-row">
        <button class="sidenav-close-btn js-snav-detail-close">
          <span class="sidenav-close-label">${this._snEsc(t(v, "sideNavCloseLabel"))}</span>
          <span class="sidenav-close-x">X</span>
        </button>
      </div>
      <div class="sidenav-title-row">
        <div class="sidenav-title-col">
          <span class="snp ${cfg.pillClass}">${this._snEsc(t(v, cfg.pillKey))}</span>
        </div>
        <span class="sidenav-title-text">${this._snEsc(t(v, cfg.titleKey))}</span>
      </div>
      <div class="sidenav-body">${blocksHtml}</div>`;

    inner.querySelector(".js-snav-detail-close")
      ?.addEventListener("click", () => this.closeSideNavDetail(name));
  }

  _snEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  getAnonSubjectsKey() {
    return `subjects_${this.user?.userId || "anon"}`;
  }

  saveSubjectsAnon(values) {
    try {
      sessionStorage.setItem(this.getAnonSubjectsKey(), JSON.stringify(values));
    } catch {
      // ignore storage errors
    }
  }

  async loadSubjectsForCurrentUser() {
    const defaults = this.defaultSubjects();
    if (!this.user) {
      this.subjects = defaults;
      return;
    }

    if (this.user.isAnonymous) {
      try {
        const raw = sessionStorage.getItem(this.getAnonSubjectsKey());
        if (raw) {
          this.subjects = this.normalizeSubjects(JSON.parse(raw));
          return;
        }
      } catch {
        // ignore parse errors
      }
      this.subjects = defaults;
      return;
    }

    try {
      const res = await this.apiJSON("/api/subjects", { method: "GET" });
      const arr = Array.isArray(res?.subjects) ? res.subjects : defaults;
      this.subjects = this.normalizeSubjects(arr);
    } catch (e) {
      console.warn("Failed to load subjects", e?.message || e);
      this.subjects = defaults;
    }
  }

  onSubjectsButton() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    this.populateSubjectsForm();
    this.openSubjectsOverlay();
  }

  async onSubjectsSave() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    const values = this.collectSubjectsFromForm();
    const v = this.locale.variant;

    this.setSubjectsBusy(true);
    if (this.user.isAnonymous) {
      this.subjects = values;
      this.saveSubjectsAnon(values);
      this.setSubjectsStatus(t(v, "subjectsSaved"));
      setTimeout(() => this.closeSubjectsOverlay(), 400);
      this.setSubjectsBusy(false);
      return;
    }

    try {
      await this.apiJSON("/api/subjects", { method: "POST", body: { subjects: values } });
      this.subjects = values;
      this.setSubjectsStatus(t(v, "subjectsSaved"));
      setTimeout(() => this.closeSubjectsOverlay(), 400);
    } catch (e) {
      console.error(e);
      this.setSubjectsStatus(e?.message || t(v, "subjectsSaveError"), true);
    } finally {
      this.setSubjectsBusy(false);
    }
  }

  /* --------------------
     CALL UI
  -------------------- */
  setConnectingIndicator(show) {
    const indicator = this.elements.callConnecting;
    if (!indicator) return;
    indicator.classList.toggle("hidden", !show);
    indicator.setAttribute("aria-hidden", String(!show));
  }

  setThinkingIndicator(show) {
    const indicator = this.elements.callThinking;
    if (!indicator) return;

    if (!show) {
      if (this._thinkingPillRaf) {
        cancelAnimationFrame(this._thinkingPillRaf);
        this._thinkingPillRaf = null;
      }
      indicator.classList.add("hidden");
      indicator.setAttribute("aria-hidden", "true");
      this._thinkingBridgeFired = false;
      this._pendingBridgePhrase = null;
      return;
    }

    // First activation: emit phrase now (paints this frame), show pill next frame.
    if (!this._thinkingBridgeFired) {
      this._thinkingBridgeFired = true;
      this._emitThinkingBridgePhrase();
      this._thinkingPillRaf = requestAnimationFrame(() => {
        this._thinkingPillRaf = null;
        indicator.classList.remove("hidden");
        indicator.setAttribute("aria-hidden", "false");
      });
    } else {
      indicator.classList.remove("hidden");
      indicator.setAttribute("aria-hidden", "false");
    }
  }

  _emitThinkingBridgePhrase() {
    const isEs = (this.locale?.variant || "").toLowerCase().startsWith("es");
    const phrases = isEs
      ? ["Dame un momento", "¡Seguro! Lo busco", "¡Déjame revisar!"]
      : ["Give me a moment", "Sure! I'll look it up", "Let me check!"];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    this._pendingBridgePhrase = phrase; // voice paths speak it after clearing the audio queue

    if (this.mode === "text") {
      const msg = this.addMessage({ role: "assistant", channel: "text", text: phrase, status: "final" });
      msg._bridge = true; // exclude from buildChatHistory
      this.render();
    }
    // talk mode: phrase will be spoken explicitly by each voice path after stopAudioQueue
  }

  setCallUI(state) {
    this.callUI = state;

    const overlay = this.elements.callOverlay;
    const tile = this.elements.callTile;

    if (this.elements.callTitle) {
      this.elements.callTitle.textContent = t(this.locale.variant, "callTitle");
    }

    if (!overlay || !tile) return;

    const isOpen = state === "open";
    const isMin = state === "min";

    overlay.classList.toggle("hidden", !isOpen);
    overlay.setAttribute("aria-hidden", String(!isOpen));

    tile.classList.toggle("hidden", !isMin);
    tile.setAttribute("aria-hidden", String(!isMin));

    if (state === "closed") {
      overlay.classList.add("hidden");
      tile.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      tile.setAttribute("aria-hidden", "true");
    }
  }

  hangUp() {
    this.clearVoiceCountdown();
    try { this.agent.disconnect(); } catch { }
    this._voiceChatQueue = [];
    this._voiceChatInFlight = false;
    this.setCallUI("closed");
    this.setConnectingIndicator(false);
    this.setTalkButtonState({ connected: false, disabled: false });

    // Auto-switch back to text mode when hanging up
    this.setMode("text");
  }

  /* --------------------
     MODE SWITCHING
  -------------------- */
  setMode(mode) {
    this.mode = mode;

    // Visual panels
    this.elements.panelTalk.classList.toggle("hidden", mode !== "talk");
    this.elements.panelText.classList.toggle("hidden", mode !== "text");
    if (this.elements.panelVideo) this.elements.panelVideo.classList.toggle("hidden", mode !== "video");

    // Inputs
    this.elements.textInputWrap.classList.toggle("hidden", mode !== "text");

    if (mode === "text") {
      setTimeout(() => this.elements.chatInput?.focus(), 50);
    }

    // Resize the waveform canvas now that #panelTalk is visible;
    // without this, the canvas buffer stays 1×1 (sized while hidden).
    if (mode === "talk") {
      this.resizeCanvas();
    }
  }

  onTalkButton() {
    if (!this.user) { this.openAuthOverlay({ closable: false, resetFields: true }); return; }

    // Switch UI to talk
    this.setMode("talk");

    // Toggle voice connection
    const isDisconnect = this.elements.toggleBtnTalk.classList.contains("btn-disconnect-talk");
    if (isDisconnect) {
      this.hangUp();
      return;
    }
    this.connectVoice();
  }

  onTextButton() {
    if (!this.user) { this.openAuthOverlay({ closable: false, resetFields: true }); return; }

    // If user switches to text during a call: hang up + close call UI
    if (this._lastVoiceStatus !== "disconnected") {
      this.hangUp();
    }
    this.setMode("text");
  }

  /* --------------------
     UNIFIED TIMELINE HELPERS
  -------------------- */
  _id(prefix = "m") {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
  }

  addMessage({ role, channel, text, status = "final", id = null, ts = null, skipRender = false, forceNewDateSeparator = false }) {
    // Map channel to fromChannel for storage
    const fromChannel = channel === "voice" ? "voice" : (channel === "video" ? "video" : "text");

    const msg = {
      id: id || this._id("m"),
      role,
      fromChannel,  // Use fromChannel instead of channel
      text: String(text ?? ""),
      status,
      skipRender: !!skipRender,
      forceNewDateSeparator: !!forceNewDateSeparator,
      ts: ts ?? Date.now(),
    };
    this.messages.push(msg);
    return msg;
  }

  findMessageIndexById(id) {
    return this.messages.findIndex((m) => m.id === id);
  }

  render() {
    const inner = this.elements.transcriptInner;
    if (!inner) return;

    renderTranscript({
      containerEl: inner,
      messages: this.messages,
      localeVariant: this.locale.variant,
      t,
      shouldStickToBottomRef: this._stickToBottom,
    });

    if (this.messages.length === 0) inner.innerHTML = "";
  }

  async persistMessage(msg) {
    if (!this.user) return;
    if (!msg?.id || this._persisted.has(msg.id)) return;

    this._persisted.add(msg.id);

    try {
      await this.apiJSON("/api/conversation/append", {
        method: "POST",
        body: {
          messages: [{
            id: msg.id,
            role: msg.role,
            content: msg.text,
            fromChannel: msg.fromChannel,
            timestamp: new Date(msg.ts).toISOString(),
          }]
        },
      });
    } catch (e) {
      this._persisted.delete(msg.id);
      console.warn("Failed to persist message:", e?.message || e);
    }
  }

  /* --------------------
     VOICE (TALK)
  -------------------- */
  async connectVoice() {
    try {
      this._voiceGreetingSent = false;
      this.clearVoiceGreetingTimer();
      this.setTalkButtonState({ connected: false, disabled: true });
      this.setConnectingIndicator(true);

      // reset voice ordering buffers (do NOT clear messages â€” timeline persists)
      this._awaitingUserTranscript = true;
      this._pendingAssistantText = "";
      this._currentAssistantId = null;
      this._voiceWeatherActive = false;
      this._voiceWeatherInFlight = false;
      this._voiceChatInFlight = false;
      this._voiceChatQueue = [];

      if (this._pendingAssistantTimer) {
        clearTimeout(this._pendingAssistantTimer);
        this._pendingAssistantTimer = null;
      }

      const userId = this.user?.userId || "anon";
      await this.agent.connect(userId, this.locale.variant, this.user?.gender || null);
    } catch (e) {
      console.error(e);
      alert("Voice connect failed: " + e.message);
      this.setConnectingIndicator(false);
      this.setTalkButtonState({ connected: false, disabled: false });
      this.setCallUI("closed");
    }
  }

  setTalkButtonState({ connected, disabled }) {
    const btn = this.elements.toggleBtnTalk;
    btn.disabled = !!disabled;

    if (connected) {
      btn.textContent = t(this.locale.variant, "disconnect");
      btn.classList.remove("btn-connect-talk");
      btn.classList.add("btn-disconnect-talk");
    } else {
      btn.textContent = t(this.locale.variant, "voiceMode");
      btn.classList.add("btn-connect-talk");
      btn.classList.remove("btn-disconnect-talk");
    }
  }

  updateVoiceStatus(status) {
    const prevStatus = this._lastVoiceStatus;
    if (this.elements.avatar) {
      this.elements.avatar.classList.toggle("speaking", status === "speaking");
    }

    if (this._lastVoiceStatus === "speaking" && status === "connected") {
      if (this._currentAssistantId) {
        const idx = this.findMessageIndexById(this._currentAssistantId);
        if (idx >= 0) {
          this.messages[idx].status = "final";
          this.persistMessage(this.messages[idx]);
          const rawText = this.messages[idx].text;
          const msgId = this.messages[idx].id;
          this.correctTranscript(rawText).then(corrected => {
            if (corrected === rawText) return;
            const i = this.findMessageIndexById(msgId);
            if (i >= 0) { this.messages[i].text = corrected; this.render(); }
          });
        }
      } else {
        for (let i = this.messages.length - 1; i >= 0; i--) {
          const m = this.messages[i];
          const msgChannel = m.fromChannel || m.channel;
          if (m.role === "assistant" && msgChannel === "voice") {
            m.status = "final";
            this.persistMessage(m);
            const rawText = m.text;
            const msgId = m.id;
            this.correctTranscript(rawText).then(corrected => {
              if (corrected === rawText) return;
              const j = this.findMessageIndexById(msgId);
              if (j >= 0) { this.messages[j].text = corrected; this.render(); }
            });
            break;
          }
        }
      }

      this._currentAssistantId = null;
      this._awaitingUserTranscript = true;
      this.render();
    }

    this._lastVoiceStatus = status;

    if (status === "connected" || status === "speaking") {
      this.setTalkButtonState({ connected: true, disabled: false });
      this.setConnectingIndicator(false);
      if (this.callUI === "closed") this.setCallUI("open");
      this.recordVoiceActivity();
      if (status === "speaking" && prevStatus !== "speaking") {
        this.setThinkingIndicator(false);
        this.flushPendingUserTranscript();
      }
      if (status === "connected" && (prevStatus === "disconnected" || prevStatus === "connecting") && !this._voiceGreetingSent) {
        this.scheduleVoiceGreeting();
      }
    } else if (status === "connecting" || status === "warming") {
      this.setTalkButtonState({ connected: false, disabled: true });
      if (this.elements.callConnectingLabel)
        this.elements.callConnectingLabel.textContent = t(this.locale.variant, status === "warming" ? "warming" : "connecting");
      this.setConnectingIndicator(true);
      this.clearVoiceCountdown();
      this.clearVoiceGreetingTimer();
    } else {
      this.setTalkButtonState({ connected: false, disabled: false });
      this.setCallUI("closed");
      this.setConnectingIndicator(false);
      this.setThinkingIndicator(false);
      this.clearVoiceCountdown();
      this.clearVoiceGreetingTimer();

      // If we were in talk mode and got disconnected, revert to text
      if (this.mode === "talk") {
        this.setMode("text");
      }
    }
  }

  onVoiceTranscript(role, text, meta = {}) {
    this.recordVoiceActivity();

    if (role === "user") {
      if (this._voiceGreetingTimer) {
        this.clearVoiceGreetingTimer();
        this._voiceGreetingSent = true;
      }
      const cleaned = String(text || "").trim();
      if (!cleaned) return;

      // Show thinking on the first transcript fragment of each user turn.
      if (this._awaitingUserTranscript) this.setThinkingIndicator(true);

      // Buffer user transcript fragments; render once the turn is complete.
      this._pendingUserTranscript = this.appendTranscriptText(this._pendingUserTranscript, cleaned, "user");
      this._awaitingUserTranscript = false;

      if (this._pendingAssistantTimer) {
        clearTimeout(this._pendingAssistantTimer);
        this._pendingAssistantTimer = null;
      }

      // If assistant already started, flush user now to preserve order.
      if (this._pendingAssistantText) {
        this.flushPendingUserTranscript();
        const m = this.addMessage({
          role: "assistant",
          channel: "voice",
          text: this._pendingAssistantText,
          status: "streaming",
        });
        this._currentAssistantId = m.id;
        this._pendingAssistantText = "";
        this.render();
      }
      if (meta?.final && this.agent?.needsChatFallback) {
        this.flushPendingUserTranscript();
      }
      return;
    }

    // Before rendering assistant text, flush any pending user transcript.
    this.flushPendingUserTranscript();

    const delta = String(text || "");
    if (!delta) return;

    if (this._awaitingUserTranscript) {
      if (meta?.final) {
        this._pendingAssistantText = delta;
      } else {
        this._pendingAssistantText = this.appendTranscriptText(this._pendingAssistantText, delta, "assistant");
      }

      if (!this._pendingAssistantTimer) {
        this._pendingAssistantTimer = setTimeout(() => {
          this._pendingAssistantTimer = null;
          if (!this._pendingAssistantText) return;

          const flushed = this.flushPendingUserTranscript();
          if (!flushed) {
            this.addMessage({ role: "user", channel: "voice", text: "", status: "final", skipRender: true });
          }

          const m = this.addMessage({
            role: "assistant",
            channel: "voice",
            text: this._pendingAssistantText,
            status: "streaming",
          });
          this._currentAssistantId = m.id;

          this._pendingAssistantText = "";
          this._awaitingUserTranscript = false;
          this.render();
        }, 1200);
      }
      return;
    }

    if (!this._currentAssistantId) {
      const m = this.addMessage({ role: "assistant", channel: "voice", text: "", status: "streaming" });
      this._currentAssistantId = m.id;
    }

    const idx = this.findMessageIndexById(this._currentAssistantId);
    if (idx >= 0) {
      this.messages[idx].text = meta?.final
        ? delta
        : this.appendTranscriptText(this.messages[idx].text, delta, "assistant");
      this.messages[idx].status = "streaming";
      this.render();
    }
  }

  appendTranscriptText(existing, delta) {
    const a = String(existing || "");
    const b = String(delta || "");
    if (!a) return b;
    if (!b) return a;
    if (/\s$/.test(a) || /^\s/.test(b)) return a + b;

    const last = a.slice(-1);
    const first = b[0];
    const isWord = (ch) => /[A-Za-z\u00C0-\u00FF0-9]/.test(ch);
    const isOpenPunct = (ch) => /[\u00BF\u00A1]/.test(ch);

    if (isWord(last) && isOpenPunct(first)) return a + " " + b;
    if (/[.!?,;:]/.test(last) && (isWord(first) || isOpenPunct(first))) return a + " " + b;
    if (isWord(last) && isWord(first)) return a + " " + b;

    return a + b;
  }

  flushPendingUserTranscript() {
    const cleaned = this.normalizeUserTranscript(String(this._pendingUserTranscript || "").trim());
    if (!cleaned) return null;
    this._pendingUserTranscript = "";

    const lastMsg = this.messages[this.messages.length - 1];
    const lastChannel = lastMsg?.fromChannel || lastMsg?.channel;
    if (lastMsg && lastMsg.role === "user" && lastChannel === "voice" && (lastMsg.skipRender || !lastMsg.text || lastMsg.status !== "final")) {
      lastMsg.text = cleaned;
      lastMsg.status = "final";
      lastMsg.skipRender = false;
      this.persistMessage(lastMsg);
      this.render();
      const msgId1 = lastMsg.id;
      this.correctTranscript(cleaned).then(corrected => {
        if (corrected === cleaned) return;
        const i = this.findMessageIndexById(msgId1);
        if (i >= 0) { this.messages[i].text = corrected; this.render(); }
      });
      return lastMsg;
    }

    const userMsg = this.addMessage({ role: "user", channel: "voice", text: cleaned, status: "final" });
    this.persistMessage(userMsg);
    this.render();
    const msgId2 = userMsg.id;
    this.correctTranscript(cleaned).then(corrected => {
      if (corrected === cleaned) return;
      const i = this.findMessageIndexById(msgId2);
      if (i >= 0) { this.messages[i].text = corrected; this.render(); }
    });
    if (this.mode === "talk") {
      if (this.agent?.needsChatFallback) {
        this.queueVoiceChatFallback(cleaned);
      } else {
        const isWeatherIntent       = this.isWeatherQuery(cleaned);
        const isTimeIntent          = this.isTimeQuery(cleaned);
        const isLocationChange      = this.isLocationChangeRequest(cleaned);
        // Route weather, time, and explicit location-change queries through
        // /api/chat so the server can read/write MongoDB location data.
        const shouldHandleViaChatAPI =
          isWeatherIntent || isTimeIntent || isLocationChange || this._voiceWeatherActive;
        if (shouldHandleViaChatAPI) {
          if (isWeatherIntent) this._voiceWeatherActive = true;
          const shouldShowThinking = isWeatherIntent || isTimeIntent || this._voiceWeatherActive;
          this.handleVoiceWeather(shouldShowThinking);
        }
      }
    }
    return userMsg;
  }

  normalizeUserTranscript(text) {
    if (!text) return "";
    return text.trim()
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([,.;:!?])([^\s])/g, "$1 $2");
  }

  _transcriptLanguageName() {
    const v = (this.locale?.variant || "").toLowerCase();
    if (v.startsWith("es")) return "Spanish";
    if (v.startsWith("fr")) return "French";
    if (v.startsWith("de")) return "German";
    if (v.startsWith("pt")) return "Portuguese";
    if (v.startsWith("it")) return "Italian";
    return "English";
  }

  async correctTranscript(text) {
    if (!text || text.trim().split(/\s+/).length < 3) return text;
    try {
      const res = await fetch("/api/transcript/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: this._transcriptLanguageName() }),
      });
      const data = await res.json();
      return data.corrected || text;
    } catch {
      return text;
    }
  }

  isWeatherQuery(text) {
    const raw = String(text || "").toLowerCase();
    if (!raw) return false;

    const esKeywords = [
      "tiempo", "clima", "pronóstico", "pronostico", "llover", "lluvia",
      "temperatura", "humedad", "viento", "nieve", "tormenta", "soleado", "nublado"
    ];
    const enKeywords = [
      "weather", "forecast", "rain", "raining", "rainy", "temperature",
      "humidity", "wind", "snow", "storm", "sunny", "cloudy"
    ];

    const isSpanish = (this.locale?.variant || "").toLowerCase().startsWith("es");
    const list = isSpanish ? esKeywords : enKeywords;
    return list.some((k) => raw.includes(k));
  }

  // Detects time-of-day queries in TALK mode so they can be routed through
  // /api/chat (which has saved-location context) instead of going raw to Gemini.
  isTimeQuery(text) {
    const raw = String(text || "").toLowerCase();
    if (!raw) return false;
    const esKeywords = [
      "qué hora", "que hora", "qué horas", "que horas",
      "hora es", "hora son", "hora local", "hora en",
      "dime la hora", "me dices la hora", "la hora",
    ];
    const enKeywords = [
      "what time", "time is it", "current time", "what's the time",
      "tell me the time", "time in", "local time",
    ];
    const isSpanish = (this.locale?.variant || "").toLowerCase().startsWith("es");
    const list = isSpanish ? esKeywords : enKeywords;
    return list.some((k) => raw.includes(k));
  }

  _isNewsQuery(text) {
    const raw = String(text || "").toLowerCase();
    if (!raw) return false;
    const esPatterns = [
      /\blo último\b/, /\blas últimas?\b/, /\búltimas? noticias\b/,
      /\bqué pasó\b/, /\bque paso\b/, /\bqué está pasando\b/,
      /\bqué hay de\b/, /\bqué se sabe\b/, /\bnoticias (de|sobre|del?)\b/,
      /\bcuéntame (sobre|del?|de los?)\b/, /\bnoticia\b/, /\bnoticias\b/,
      /\bse sabe algo\b/, /\bcómo va\b/, /\bqué ha dicho\b/, /\bqué dijo\b/,
    ];
    const enPatterns = [
      /\blatest (news|on|about)\b/, /\brecent news\b/, /\bwhat('s| is) (new|happening|going on)\b/,
      /\bwhat happened\b/, /\bany news\b/, /\btell me about the news\b/,
      /\bwhat did .+ (say|do)\b/, /\bhave you heard\b/, /\bin the news\b/,
    ];
    const isSpanish = (this.locale?.variant || "").toLowerCase().startsWith("es");
    const list = isSpanish ? esPatterns : enPatterns;
    return list.some((p) => p.test(raw));
  }

  // Detects explicit requests to change/update the user's default location.
  // Routed through /api/chat so the set_home_location tool can update MongoDB.
  isLocationChangeRequest(text) {
    const raw = String(text || "").toLowerCase();
    if (!raw) return false;
    const esKeywords = [
      "cambia mi ubicación", "fija mi ubicación", "actualiza mi ubicación",
      "establece mi ubicación", "de ahora en adelante", "a partir de ahora",
      "me he mudado a", "ahora vivo en", "mi ciudad es", "mi ubicación es",
      "quiero que fijes", "quiero que cambies",
    ];
    const enKeywords = [
      "change my location", "set my location", "update my location",
      "my location is now", "i moved to", "i've moved to", "i now live in",
      "i live in", "from now on", "fix my location",
    ];
    const isSpanish = (this.locale?.variant || "").toLowerCase().startsWith("es");
    const list = isSpanish ? esKeywords : enKeywords;
    return list.some((k) => raw.includes(k));
  }

  queueVoiceChatFallback(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return;
    const showThinking = this.isWeatherQuery(cleaned) || this.isTimeQuery(cleaned);
    this._voiceChatQueue.push({ text: cleaned, showThinking });
    if (!this._voiceChatInFlight) this.processVoiceChatQueue();
  }

  async processVoiceChatQueue() {
    if (this._voiceChatInFlight) return;
    const next = this._voiceChatQueue.shift();
    if (!next) return;
    const entry = (typeof next === "string") ? { text: next, showThinking: this.isWeatherQuery(next) || this.isTimeQuery(next) } : next;
    const shouldShowThinking = !!entry?.showThinking;
    this._voiceChatInFlight = true;
    if (shouldShowThinking) this.setThinkingIndicator(true);
    if (this._pendingBridgePhrase) {
      void this.speakText(this._pendingBridgePhrase);
      this._pendingBridgePhrase = null;
    }

    try {
      let reply;
      if (this._isNewsQuery(entry.text)) {
        const r = await fetch("/api/brenda/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: entry.text, locale: this.locale.variant }),
        });
        const data = await r.json();
        reply = data.reply;
        this.setThinkingIndicator(false);
        const msg = this.addMessage({ role: "assistant", channel: "voice", text: reply, status: "final" });
        this.render();
        await this.persistMessage(msg);
        await this.speakExactLine(reply);
      } else {
        const payload = { localeVariant: this.locale.variant, messages: this.buildChatHistory(16) };
        const data = await this.chatRequest(payload);
        reply = data.reply;
        this.setThinkingIndicator(false);

        if (Array.isArray(data.replyParts) && data.replyParts.length > 1) {
          for (const part of data.replyParts) {
            const msg = this.addMessage({ role: "assistant", channel: "voice", text: part, status: "final" });
            this.render();
            await this.persistMessage(msg);
          }
        } else {
          const msg = this.addMessage({ role: "assistant", channel: "voice", text: reply, status: "final" });
          this.render();
          await this.persistMessage(msg);
        }

        await this.speakText(reply);
      }
    } catch (e) {
      console.error(e);
      this.setThinkingIndicator(false);
      const errMsg = this.addMessage({ role: "assistant", channel: "voice", text: `(${e.message})`, status: "final" });
      this.render();
      await this.persistMessage(errMsg);
    } finally {
      this._voiceChatInFlight = false;
      if (this._voiceChatQueue.length) {
        this.processVoiceChatQueue();
      }
    }
  }

  async handleVoiceWeather(showThinking = false) {
    if (this._voiceWeatherInFlight) return;
    this._voiceWeatherInFlight = true;
    const shouldShowThinking = !!showThinking;
    if (shouldShowThinking) this.setThinkingIndicator(true);

    try {
      if (typeof this.agent?.suppressAssistantOutputForNextTurn === "function") {
        this.agent.suppressAssistantOutputForNextTurn();
      }
      if (typeof this.agent?.stopAudioQueue === "function") {
        this.agent.stopAudioQueue();
      }
      if (this._pendingBridgePhrase) {
        void this.speakText(this._pendingBridgePhrase);
        this._pendingBridgePhrase = null;
      }

      const payload = { localeVariant: this.locale.variant, messages: this.buildChatHistory(16) };
      if (this._voiceWeatherActive) payload.weatherPending = true;
      const data = await this.chatRequest(payload);
      const reply = data.reply;
      if (shouldShowThinking) this.setThinkingIndicator(false);

      const status = data?.meta?.weather?.status;
      if (status === "needs_location" || status === "needs_disambiguation") {
        this._voiceWeatherActive = true;
      } else {
        // Reset for: complete, error, time queries, location-change replies
        // (any reply without a "needs_*" status clears the weather-active flag)
        this._voiceWeatherActive = false;
      }

      const queued = typeof this.agent?.queueExactSpeech === "function"
        ? this.agent.queueExactSpeech(reply)
        : false;
      if (!queued) {
        await this.speakText(reply);
      }
    } catch (e) {
      console.error(e);
      if (shouldShowThinking) this.setThinkingIndicator(false);
      this._voiceWeatherActive = false;
      this.showError(e);
    } finally {
      this._voiceWeatherInFlight = false;
    }
  }

  /* --------------------
     TEXT MODE
  -------------------- */
  async sendTextMessage() {
    if (!this.user) { this.openAuthOverlay({ closable: false, resetFields: true }); return; }

    const input = this.elements.chatInput;
    const btn = this.elements.chatSendBtn;
    const text = (input.value || "").trim();
    if (!text) return;
    const userMsg = this.addMessage({ role: "user", channel: "text", text, status: "final" });

    input.value = "";
    this.autoGrowTextarea();
    this.render();
    this.setThinkingIndicator(true);

    btn.disabled = true;
    try {
      await this.persistMessage(userMsg);

      let reply;
      if (this._isNewsQuery(text)) {
        const r = await fetch("/api/brenda/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, locale: this.locale.variant }),
        });
        const data = await r.json();
        reply = data.reply;
        this._textWeatherPending = false;
        this.setThinkingIndicator(false);
        const aiMsg = this.addMessage({ role: "assistant", channel: "text", text: reply, status: "final" });
        this.render();
        await this.persistMessage(aiMsg);
      } else {
        const payload = { localeVariant: this.locale.variant, messages: this.buildChatHistory(16) };
        if (this._textWeatherPending) payload.weatherPending = true;
        const data = await this.chatRequest(payload);
        reply = data.reply;

        // Track whether the server is awaiting a location follow-up
        const weatherStatus = data?.meta?.weather?.status;
        this._textWeatherPending = (weatherStatus === "needs_location" || weatherStatus === "needs_disambiguation");

        this.setThinkingIndicator(false);
        if (Array.isArray(data.replyParts) && data.replyParts.length > 1) {
          for (const part of data.replyParts) {
            const msg = this.addMessage({ role: "assistant", channel: "text", text: part, status: "final" });
            this.render();
            await this.persistMessage(msg);
          }
        } else {
          const aiMsg = this.addMessage({ role: "assistant", channel: "text", text: reply, status: "final" });
          this.render();
          await this.persistMessage(aiMsg);
        }
      }
    } catch (e) {
      console.error(e);
      this._textWeatherPending = false;
      this.setThinkingIndicator(false);
      const errMsg = this.addMessage({ role: "assistant", channel: "text", text: `(${e.message})`, status: "final" });
      this.render();
      await this.persistMessage(errMsg);
    } finally {
      btn.disabled = false;
      this.setThinkingIndicator(false);
      input.focus();
    }
  }

  async chatRequest(payload, timeoutMs = 25000) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(to));

    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`Chat error ${res.status}: ${text || "Request failed"}`);

    const data = JSON.parse(text || "{}");
    if (!data.reply) throw new Error("No reply returned");
    return data;
  }

  buildChatHistory(limit = 16) {
    return this.messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && !m._bridge)
      .slice(-limit)
      .map((m) => ({ role: m.role, content: m.text }));
  }

  async callChatAPI() {
    const payload = { localeVariant: this.locale.variant, messages: this.buildChatHistory(16) };
    const data = await this.chatRequest(payload);
    return data.reply;
  }


  randomItem(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }

  loadRecentChoices(key) {
    try {
      const raw = localStorage.getItem(key);
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  saveRecentChoices(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list || []));
    } catch {
      // ignore storage errors
    }
  }

  pickNonRepeating(list, key, windowSize = 4) {
    if (!Array.isArray(list) || list.length === 0) return null;
    const recent = this.loadRecentChoices(key);
    const pool = list.filter((item) => !recent.includes(item));
    const chosen = this.randomItem(pool.length ? pool : list);
    if (!chosen) return null;
    const nextRecent = [chosen, ...recent.filter((x) => x !== chosen)].slice(0, windowSize);
    this.saveRecentChoices(key, nextRecent);
    return chosen;
  }

  pickOpening() {
    const content = getConversationContent(this.locale.variant);
    const openings = Array.isArray(content?.openings) ? content.openings : [];
    const key = `brenda_recent_opening_${this.locale.variant || "default"}`;
    const pick = this.pickNonRepeating(openings, key, 5);
    if (pick) return pick;
    const isSpanish = String(this.locale.variant || "").toLowerCase().startsWith("es");
    return isSpanish ? "Estaba pensando" : "I was thinking";
  }

  ensureOpening(opening, statement) {
    const open = String(opening || "").trim();
    let body = String(statement || "").trim();
    if (!open) return body;
    if (!body) return open;

    const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const openNorm = normalize(open);
    const bodyNorm = normalize(body);

    if (bodyNorm.startsWith(openNorm)) return body;

    const openLower = open.toLowerCase();
    const needsLower = /\b(que|that)$/.test(openLower);
    if (needsLower && body.length > 0) {
      body = body[0].toLowerCase() + body.slice(1);
    }

    return `${open} ${body}`.trim();
  }

  pickGreeting() {
    const name = (this.user?.displayName || this.user?.username || "").trim();
    const content = getConversationContent(this.locale.variant);
    const greetings = Array.isArray(content?.greetings) ? content.greetings : [];

    const hasPlaceholder = (g) => String(g).includes("{user}") || String(g).includes("{}");

    // Variety: Even if we have a name, sometimes we want a non-name greeting (50/50 chance)
    const wantName = name && Math.random() > 0.5;

    const preferred = wantName
      ? greetings.filter((g) => hasPlaceholder(g))
      : greetings.filter((g) => !hasPlaceholder(g));

    // Fallback if no specific templates match
    const templates = preferred.length > 0 ? preferred : greetings;
    const key = `brenda_recent_greeting_${this.locale.variant || "default"}`;
    const template = this.pickNonRepeating(templates, key, 6);

    if (!template) {
      if (name) return `Hi ${name}! What would you like to talk about?`;
      return "Hi! What would you like to chat about?";
    }

    let greeting = String(template);
    if (name && wantName) {
      greeting = greeting.replace("{user}", name).replace("{}", name);
    } else {
      // Strip placeholders if we chose not to use the name or don't have it
      greeting = greeting.replace(/\s*\{user\}\s*/g, " ").replace(/\s*\{\}\s*/g, " ");
      greeting = greeting.replace(/\s{2,}/g, " ").replace(/\s+([!?,.])/g, "$1").trim();
    }
    return greeting;
  }

  clearVoiceGreetingTimer() {
    if (!this._voiceGreetingTimer) return;
    clearTimeout(this._voiceGreetingTimer);
    this._voiceGreetingTimer = null;
  }

  scheduleVoiceGreeting() {
    if (this._voiceGreetingSent || this._voiceGreetingTimer) return;
    this._voiceGreetingTimer = setTimeout(() => {
      this._voiceGreetingTimer = null;
      if (this._voiceGreetingSent) return;
      if (this._lastVoiceStatus !== "connected" && this._lastVoiceStatus !== "speaking") return;
      this.maybeSendVoiceGreeting();
    }, this._voiceGreetingDelayMs);
  }

  async maybeSendVoiceGreeting() {
    if (this._voiceGreetingSent) return;

    // Use the server-determined greeting type, populated by checkAndShowGreeting().
    // _greetingType is null if the checkin hasn't resolved yet; in that case skip.
    if (!this._greetingType || this._greetingType === "none") {
      console.log("[greeting] Skipping voice greeting (type=none or not yet resolved)");
      return;
    }

    // Already shown in text mode — don't repeat in voice.
    if (this._greetingShown) return;

    const greetingText = this._greetingText;
    if (!greetingText) return;

    this._voiceGreetingSent = true;
    this._greetingShown = true;

    try {
      if (this.mode === "talk" && this._lastVoiceStatus !== "disconnected" && typeof this.agent?.speakText === "function") {
        await this.agent.speakText(greetingText, true);
      } else {
        await this.emitAssistantLine({ text: greetingText, channel: "voice", forceNewDateSeparator: true });
      }
    } catch (e) {
      console.warn("[greeting] Voice greeting failed:", e);
    }
  }

  pickSubject() {
    const content = getConversationContent(this.locale.variant);
    const customSubjects = (this.subjects || []).map((s) => (s || "").trim()).filter(Boolean);
    if (customSubjects.length > 0) return this.randomItem(customSubjects);
    const fallback = this.randomItem(content.defaultSubjects);
    return fallback?.subject || "something interesting";
  }

  combineOpening(prefix, body) {
    const head = String(prefix || "").replace(/[\s,]+$/, "");
    const tail = String(body || "").trim();
    if (!tail) return head || "";
    return `${head || ""}${head ? ", " : ""}${tail}`;
  }

  buildPrompting(subject) {
    const content = getConversationContent(this.locale.variant);
    const key = `brenda_recent_prompting_${this.locale.variant || "default"}`;
    const base = (this.pickNonRepeating(content.promptings, key, 6) || "What do you think about")
      .replace(/[?]+$/, "").trim();
    const cleanSubject = (subject || "").trim() || "that";
    const sentence = `${base} ${cleanSubject}`.trim();
    return sentence.endsWith("?") ? sentence : `${sentence}?`;
  }

  async generateTopicStarter(subject) {
    const tempRaw = Number(window.Config?.AI_TEMPERATURE);
    const temp = Number.isFinite(tempRaw) ? tempRaw : 1;
    const opening = this.pickOpening();
    const isSpanish = String(this.locale.variant || "").toLowerCase().startsWith("es");

    // Prompt for JSON: statement + question
    const systemPrompt =
      `You are a helpful AI assistant. Generate a natural, casual conversation starter about "${subject}". ` +
      `The statement MUST start with the exact opening phrase: "${opening}". ` +
      `Do not repeat the opening phrase later in the statement. ` +
      `Return ONLY a valid JSON object with the following structure:\n` +
      `{\n` +
      `  "statement": "A casual fact, observation, or personal remark about the subject.",\n` +
      `  "question": "A follow-up question to the user to get their opinion."\n` +
      `}\n` +
      `The tone should be friendly and human-like. Use the user's name sparingly if at all in the question. ` +
      `If you use an introductory phrase like 'I wanted to ask you', put it in the 'question' field, NOT the 'statement' field. ` +
      `${isSpanish ? "Write in Spanish." : "Write in English."} ` +
      `Any other 'non-question' opening phrases DO GO in the 'statement' field.`;

    try {
      const data = await this.chatRequest({
        localeVariant: this.locale.variant,
        messages: [{ role: "user", content: systemPrompt }],
        temperature: temp,
      });

      // Parse JSON from reply
      let json = {};
      try {
        // Strip markdown code blocks if present
        const raw = (data.reply || "").replace(/```json/g, "").replace(/```/g, "").trim();
        json = JSON.parse(raw);
      } catch (e) {
        console.warn("Failed to parse starter JSON, falling back to raw text", e);
        // Fallback: treat whole reply as statement, asking generic question
        return {
          statement: this.ensureOpening(opening, data.reply || ""),
          question: isSpanish ? "¿Qué opinas tú?" : "What do you think about it?"
        };
      }

      const statement = this.ensureOpening(opening, json.statement || "");
      return {
        statement: statement || this.ensureOpening(opening, isSpanish ? `sobre ${subject}.` : `about ${subject}.`),
        question: json.question || (isSpanish ? "¿Qué opinas tú?" : "What's your take on it?")
      };

    } catch (e) {
      console.error("Error generating topic starter:", e);
      const fallbackStatement = isSpanish
        ? `sobre ${subject}.`
        : `about ${subject}.`;
      return {
        statement: this.ensureOpening(opening, fallbackStatement),
        question: isSpanish ? "¿Qué te parece?" : "Do you have any thoughts on that?"
      };
    }
  }

  async emitAssistantLine({ text, channel, forceNewDateSeparator = false }) {
    const cleaned = (text || "").trim();
    if (!cleaned) return;

    const msg = this.addMessage({ role: "assistant", channel, text: cleaned, status: "final", forceNewDateSeparator });
    this.render();
    await this.persistMessage(msg);

    if (channel === "voice") {
      await this.speakText(cleaned);
    }
  }

  async speakText(text, options = {}) {
    const line = (text || "").trim();
    if (!line) return;

    const forceLocal = !!options.forceLocal;
    const canRealtime = this.mode === "talk" && this._lastVoiceStatus !== "disconnected" && typeof this.agent?.speakText === "function";
    if (canRealtime && !forceLocal) {
      const ok = await this.agent.speakText(line);
      if (ok) return;
    }

    // Fallback to browser speech if realtime voice isn't available.
    if (typeof window !== "undefined" && window.speechSynthesis) {
      await new Promise((resolve) => {
        const utter = new SpeechSynthesisUtterance(line);
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      });
    }
  }

  async speakExactLine(text) {
    const line = (text || "").trim();
    if (!line) return false;

    const canRealtime = this.mode === "talk" && this._lastVoiceStatus !== "disconnected" && typeof this.agent?.speakExact === "function";
    if (canRealtime) {
      const ok = await this.agent.speakExact(line);
      if (ok) return true;
    }
    return false;
  }

  setStartButtonBusy(isBusy) {
    const btn = this.elements.startBtn;
    if (!btn) return;
    btn.disabled = !!isBusy;
    const key = isBusy ? "startButtonBusy" : "startButton";
    btn.textContent = t(this.locale.variant, key);
  }

  async startConversation() {
    const isVoiceMode = this.mode === "talk";
    // Allow anonymous in voice mode so we can greet even if not logged in.
    if (!this.user && !isVoiceMode) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    if (this._startingConversation) return;

    this._startingConversation = true;
    this.setStartButtonBusy(true);
    const channel = this.mode === "text" ? "text" : "voice";

    try {
      // 1. Pick a subject
      const subject = this.pickSubject();

      // 2. Generate 2-step starter (Statement + Question)
      // No greeting here (as requested)
      const { statement, question } = await this.generateTopicStarter(subject);

      // 3. Speak/Send Statement
      if (isVoiceMode) {
        const ok = await this.speakExactLine(statement);
        if (!ok) await this.agent.speakText(statement);
      } else {
        await this.emitAssistantLine({ text: statement, channel });
      }

      // Voice Fix: Add delay to separate statement and question in talk mode
      if (isVoiceMode) await new Promise(r => setTimeout(r, 600));

      // 4. Speak/Send Question (Prompt)
      if (isVoiceMode) {
        const ok = await this.speakExactLine(question);
        if (!ok) await this.agent.speakText(question);
      } else {
        await this.emitAssistantLine({ text: question, channel });
      }

    } catch (e) {
      console.error(e);
      this.showError(e);
    } finally {
      this._startingConversation = false;
      this.setStartButtonBusy(false);
    }
  }

  autoGrowTextarea() {
    const ta = this.elements.chatInput;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(120, ta.scrollHeight) + "px";
  }

  /* --------------------
     WAVEFORM
  -------------------- */
  resizeCanvas() {
    const c = this.elements.canvas;
    const ctx = this.canvasCtx;
    const dpr = window.devicePixelRatio || 1;

    const rect = c.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  updateWaveform(floatTimeDomain) {
    const step = Math.floor(floatTimeDomain.length / this.audioData.length);
    for (let i = 0; i < this.audioData.length; i++) {
      this.audioData[i] = Math.abs(floatTimeDomain[i * step]) || 0;
    }
  }

  animateWaveform() {
    const c = this.elements.canvas;
    const ctx = this.canvasCtx;

    const rect = c.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, W, H);

    const baselineY = H - 6;
    const maxHeight = (H - 12) * 0.6;

    ctx.strokeStyle = "#667eea";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const slice = W / this.audioData.length;
    let x = 0;

    for (let i = 0; i < this.audioData.length; i++) {
      const v = Math.max(0, Math.min(1, this.audioData[i]));
      const y = baselineY - v * maxHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }

    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(W, baselineY);
    ctx.stroke();

    requestAnimationFrame(() => this.animateWaveform());
  }

  showError(err) {
    const message = "Sorry! Please try again later.";
    // Inline surface in transcript as assistant error note
    this.addMessage({ role: "assistant", channel: "text", text: message, status: "final" });
    this.render();
  }

  recordVoiceActivity() {
    this.lastVoiceActivityMs = Date.now();
    this.scheduleVoiceCountdownAfterSilence();
  }

  scheduleVoiceCountdownAfterSilence() {
    if (this.voiceCountdownSilenceTimer) {
      clearTimeout(this.voiceCountdownSilenceTimer);
      this.voiceCountdownSilenceTimer = null;
    }

    if (!this.voiceCountdownMs || this.voiceCountdownMs <= 0) return;

    const silenceMs = this.voiceCountdownSilenceMs;
    if (!silenceMs || silenceMs <= 0) {
      this.resetVoiceCountdown();
      return;
    }

    // Stop any active countdown while voice is active and hide the visual.
    this.clearVoiceCountdown();

    const checkSilence = () => {
      const now = Date.now();

      // Treat ongoing assistant speech as activity too.
      if (this._lastVoiceStatus === "speaking" || this.agent?.isSpeaking) {
        this.lastVoiceActivityMs = now;
      }

      const lastActivity = this.lastVoiceActivityMs || now;
      const elapsed = now - lastActivity;
      const remaining = silenceMs - elapsed;

      if (elapsed >= silenceMs) {
        this.resetVoiceCountdown();
        return;
      }

      const wait = Math.max(50, remaining);
      this.voiceCountdownSilenceTimer = setTimeout(checkSilence, wait);
    };

    this.voiceCountdownSilenceTimer = setTimeout(checkSilence, silenceMs);
  }

  startVoiceCountdownRaf() {
    if (this.voiceCountdownRaf) {
      cancelAnimationFrame(this.voiceCountdownRaf);
      this.voiceCountdownRaf = null;
    }

    const tick = () => {
      if (!this.voiceCountdownDeadline || !this.voiceCountdownMs) return;

      const remaining = this.voiceCountdownDeadline - Date.now();
      const ratio = Math.max(0, Math.min(1, remaining / this.voiceCountdownMs));
      this.setVoiceCountdownVisual(ratio);

      if (remaining <= 0) {
        this.voiceCountdownRaf = null;
        return;
      }

      this.voiceCountdownRaf = requestAnimationFrame(tick);
    };

    this.voiceCountdownRaf = requestAnimationFrame(tick);
  }

  /* =========================================================
     I AM BRENDA OVERLAY
  ========================================================= */
  openBrendaOverlay() {
    const variant = this.locale.variant;
    if (this.elements.brendaTitle) this.elements.brendaTitle.textContent = t(variant, "brendaTitle");
    if (this.elements.brendaSubtitle) this.elements.brendaSubtitle.textContent = t(variant, "brendaSubtitle");
    if (this.elements.brendaContent) this.elements.brendaContent.innerHTML = t(variant, "brendaContent");
    if (this.elements.brendaBottomCloseBtn) this.elements.brendaBottomCloseBtn.textContent = t(variant, "brendaClose");

    this.elements.brendaOverlay?.classList.remove("hidden");
    this.elements.brendaOverlay?.setAttribute("aria-hidden", "false");
  }

  closeBrendaOverlay() {
    this.elements.brendaOverlay?.classList.add("hidden");
    this.elements.brendaOverlay?.setAttribute("aria-hidden", "true");
  }

  setVoiceCountdownVisual(ratio) {
    const btn = this.elements.callHangBtn;
    if (!btn) return;

    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    btn.style.setProperty("--countdown-ratio", clamped.toString());
    btn.classList.toggle("countdown-active", clamped > 0);
  }

  resetVoiceCountdown() {
    this.clearVoiceCountdown();
    const timeoutMs = this.voiceCountdownMs;
    if (!timeoutMs || timeoutMs <= 0) return;

    this.voiceCountdownDeadline = Date.now() + timeoutMs;
    this.setVoiceCountdownVisual(1);
    this.startVoiceCountdownRaf();

    this.voiceCountdownTimer = setTimeout(() => {
      this.voiceCountdownTimer = null;
      this.hangUp();
    }, timeoutMs);
  }

  clearVoiceCountdown() {
    if (this.voiceCountdownTimer) {
      clearTimeout(this.voiceCountdownTimer);
      this.voiceCountdownTimer = null;
    }

    if (this.voiceCountdownRaf) {
      cancelAnimationFrame(this.voiceCountdownRaf);
      this.voiceCountdownRaf = null;
    }

    if (this.voiceCountdownSilenceTimer) {
      clearTimeout(this.voiceCountdownSilenceTimer);
      this.voiceCountdownSilenceTimer = null;
    }

    this.voiceCountdownDeadline = null;
    this.setVoiceCountdownVisual(0);
  }

  /* =========================================================
     GREETING — checkin, heartbeat, text builder
  ========================================================= */

  /**
   * Called once after every successful authentication (login, anonymous, or
   * session restore).  Asks the server whether a greeting is due, builds the
   * appropriate text, and — for text mode — emits it immediately.
   * For voice mode the text is stored in this._greetingText and consumed by
   * maybeSendVoiceGreeting() when the voice connection fires.
   */
  async checkAndShowGreeting() {
    if (!this.user) return;

    try {
      const data = await this.apiJSON("/api/greeting", { method: "GET" });
      const greetingType = data?.greetingType || "none";

      this._greetingType  = greetingType;
      this._greetingShown = false;

      // Deliver pending medication reminders (non-fatal)
      if (data?.pendingReminders?.length) {
        const displayName = this.user.isAnonymous
          ? ""
          : (this.user.displayName || this.user.username || "").trim();
        await this.medicationManager.deliverReminders(data.pendingReminders, displayName, this.locale.variant);
      }

      if (greetingType === "none") {
        this._greetingText = null;
        return;
      }

      // Anonymous users get nameless greetings.
      const displayName = this.user.isAnonymous
        ? ""
        : (this.user.displayName || this.user.username || "").trim();

      if (greetingType === "full") {
        this._greetingText = this.buildFullGreeting(displayName);
      } else {
        this._greetingText = this.buildShortGreeting(displayName);
      }

      // Text mode: emit right now, after history is already rendered.
      // Voice mode: stored above; scheduleVoiceGreeting() will pick it up.
      if (this.mode === "text" && this._greetingText) {
        this._greetingShown = true;
        await this.emitAssistantLine({ text: this._greetingText, channel: "text", forceNewDateSeparator: true });
      }

      // Water-cooler news greeting — only on full greetings for logged-in users
      if (greetingType === "full" && !this.user?.isAnonymous) {
        this.fetchAndShowNewsGreeting().catch(() => {});
      }
    } catch (e) {
      // Non-fatal: app continues normally without a greeting.
      console.warn("[greeting/checkin] failed:", e?.message || e);
    }
  }

  async fetchAndShowNewsGreeting() {
    try {
      const data = await this.apiJSON("/api/brenda/greet", {
        method: "POST",
        body: { locale: this.locale.variant },
      });
      if (data?.headlinesUsed?.length) {
        this._headlinesCache = { items: data.headlinesUsed, ts: Date.now() };
      }
      if (data?.greeting) {
        await this.emitAssistantLine({ text: data.greeting, channel: "text" });
      }
    } catch (e) {
      console.warn("[greet/news] failed (non-fatal):", e?.message || e);
    }
  }

  /**
   * Builds a time-of-day-aware full greeting (new day / first use).
   * @param {string} displayName  Empty string for anonymous sessions.
   */
  buildFullGreeting(displayName) {
    const hour = new Date().getHours();
    let bucket;
    if      (hour >= 5  && hour < 12) bucket = "morning";
    else if (hour >= 12 && hour < 18) bucket = "afternoon";
    else if (hour >= 18 && hour < 21) bucket = "evening";
    else                               bucket = "night";

    const content = getConversationContent(this.locale.variant);
    const pool    = content?.fullGreetings?.[bucket];

    let template;
    if (pool && pool.length > 0) {
      const key = `brenda_recent_fullgreeting_${bucket}_${this.locale.variant || "default"}`;
      template  = this.pickNonRepeating(pool, key, 4) || pool[0];
    } else {
      // Hardcoded fallback if content is somehow missing.
      const isEs = String(this.locale.variant || "").toLowerCase().startsWith("es");
      template = isEs
        ? `¡Buenos días{user}! ¿Cómo estás?`
        : `Good ${bucket}{user}! How are you?`;
    }

    const name = (displayName || "").trim();
    if (name) {
      return String(template).replace(/\{user\}/g, name);
    }
    return String(template)
      .replace(/,?\s*\{user\}/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([!?,.])/g, "$1")
      .trim();
  }

  /**
   * Builds a short, casual "welcome back" greeting (same-day 8 h+ return).
   * @param {string} displayName  Empty string for anonymous sessions.
   */
  buildShortGreeting(displayName) {
    const content = getConversationContent(this.locale.variant);
    const pool    = content?.shortGreetings;

    let template;
    if (pool && pool.length > 0) {
      const key = `brenda_recent_shortgreeting_${this.locale.variant || "default"}`;
      template  = this.pickNonRepeating(pool, key, 4) || pool[0];
    } else {
      const isEs = String(this.locale.variant || "").toLowerCase().startsWith("es");
      template = isEs ? "¡Hola de nuevo, {user}!" : "Hey, {user}!";
    }

    const name = (displayName || "").trim();
    if (name) {
      return String(template).replace(/\{user\}/g, name);
    }
    return String(template)
      .replace(/,?\s*\{user\}/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([!?,.])/g, "$1")
      .trim();
  }

  /**
   * Starts the two-layer heartbeat that keeps users.lastSeen current:
   *   1. Page Visibility API — fires synchronously on tab hide, uses sendBeacon
   *      so the request survives the page being closed.
   *   2. 30-minute setInterval — safety net for crashes / forced kills.
   */
  startGreetingHeartbeat() {
    this.stopGreetingHeartbeat(); // clear any stale handles

    // Layer 1: visibilitychange
    this._visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        this._sendHeartbeat(true); // beacon on hide
      }
    };
    document.addEventListener("visibilitychange", this._visibilityHandler);

    // Layer 2: 30-minute fallback interval
    this._heartbeatInterval = setInterval(() => this._sendHeartbeat(false), 30 * 60 * 1000);
  }

  /** Tears down both heartbeat mechanisms. */
  stopGreetingHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  /**
   * Sends a lastSeen heartbeat to the server.
   * @param {boolean} useBeacon  true = navigator.sendBeacon (tab-close safe).
   */
  _sendHeartbeat(useBeacon = false) {
    if (!this.user) return;
    const url = "/api/greeting";

    if (useBeacon && typeof navigator?.sendBeacon === "function") {
      // sendBeacon survives page unload; cookie is sent automatically.
      const blob = new Blob(["{}"], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }

    // Normal fetch for interval heartbeats.
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: "{}",
    }).catch((e) => {
      console.warn("[greeting/heartbeat] failed:", e?.message || e);
    });
  }
}

// ── SideNav Help Config ─────────────────────────────────────────────────────

const SIDENAV_HOME_PILLS = [
  { pillKey: "sideNavPillHelp",     pillClass: "snp-light",      labelKey: "sideNavLabelHelp",     nav: null },
  { pillKey: "sideNavPillMyInfo",   pillClass: "snp-light",      labelKey: "sideNavLabelMyInfo",   nav: null },
  // account pill is inserted here dynamically
  { pillKey: "sideNavPillTomas",    pillClass: "snp-salmon",     labelKey: "sideNavLabelTomas",    nav: "tomas" },
  { pillKey: "sideNavPillMisTemas", pillClass: "snp-blue",       labelKey: "sideNavLabelMisTemas", nav: null },
  { pillKey: "sideNavPillInit",     pillClass: "snp-yellow",     labelKey: "sideNavLabelInit",     nav: null },
  { pillKey: "sideNavPillNews",     pillClass: "snp-periwinkle", labelKey: "sideNavLabelNews",     nav: null },
  { pillKey: "sideNavPillLatest",   pillClass: "snp-magenta",    labelKey: "sideNavLabelLatest",   nav: null },
  { pillKey: "sideNavPillTalk",     pillClass: "snp-green",      labelKey: "sideNavLabelTalk",     nav: null },
  { pillKey: "sideNavPillWrite",    pillClass: "snp-purple",     labelKey: "sideNavLabelWrite",    nav: null },
];

const SIDENAV_DETAIL_CONFIGS = {
  tomas: {
    pillKey:  "sideNavPillTomas",
    pillClass: "snp-salmon",
    titleKey: "sideNavTomasTitleText",
    blocks: [
      { type: "text",     key: "sideNavTomasText1" },
      { type: "text",     key: "sideNavTomasText2" },
      { type: "pill-btn", key: "sideNavTomasAddBtn", pillClass: "snp-green" },
      { type: "text",     key: "sideNavTomasText3" },
      { type: "text",     key: "sideNavTomasText4" },
      { type: "image",    src: "images/brenda-avatar.png" },
      { type: "text",     key: "sideNavTomasText5" },
      { type: "text",     key: "sideNavTomasText6" },
      { type: "text",     key: "sideNavTomasText7" },
      { type: "pill-btn", key: "sideNavSaveBtn", pillClass: "snp-green" },
    ],
  },
};

document.addEventListener("DOMContentLoaded", () => {
  window.__app = new BrendaApp();
});
