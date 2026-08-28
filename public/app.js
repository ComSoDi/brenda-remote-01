// public/app.js (module) 2026-03-04
import { detectLocale } from "./locale.js";
import { t, preloadLocale } from "./i18n/index.js";
import { SideNavManager } from "./sideNavManager.js";
import { renderTranscript, wireAutoScroll } from "./transcriptRenderer.js";
import { getConversationContent } from "./conversationContent.js";
import { TaskManager } from "./taskManager.js";
import { initAnalytics } from "./analytics.js";

// TALK ringback tone, by locale variant — see startRingback()
const RINGBACK_FILES = {
  "es-ES": "ONE Ringback EU-Asia-South-CentralAmerica.wav",
  "es-419": "ONE Ringback EU-Asia-South-CentralAmerica.wav",
  "en-US": "ONE Ringback NorthAmerica - South Korea.wav",
  "en-GB": "ONE Ringback UK-Ireland-New Zealand-Singapore.wav",
};

class BrendaApp {
  constructor() {
    this.locale = detectLocale(); // { lang, variant }
    this.mode = "text"; // talk | text | video (future)

    // Voice agent
    this.agent = new window.VoiceAgent();

    // Unified timeline
    this.messages = []; // [{id, role, channel, text, status, ts}]

    // Declared interests (seed topics — loaded from rds_profiles via greeting)
    this.declaredInterests = [];

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
    this._voiceGreetingEverSent = false; // true once spoken; not reset on reconnect
    this._voiceGreetingTimer = null;
    this._voiceGreetingDelayMs = 1000;
    this._talkDisconnectedByUser = false; // true when user explicitly switches to WRITE mid-session
    this._userSpokenThisSession = false;  // true once user sends any message this session

    // Greeting state — populated by checkAndShowGreeting() after auth.
    this._greetingType  = null;   // "full" | "short" | "none" | null (null = unchecked)
    this._greetingText  = null;   // pre-built greeting string
    this._greetingShown = false;  // true once shown in text channel

    // Chat session ID — groups all chat requests in one continuous visit.
    // Reset whenever a greeting fires (new day, or same-day gap — see checkAndShowGreeting).
    this._chatSessionId = null;

    // Heartbeat handles — cleared by stopGreetingHeartbeat()
    this._heartbeatInterval  = null;
    this._visibilityHandler  = null;
    this._voiceWeatherActive = false;
    this._voiceWeatherInFlight = false;
    this._voiceChatInFlight = false;
    this._voiceChatQueue = [];

    // TALK ringback tone (plays from tap until Brenda starts speaking, or connect gives up)
    this._ringbackAudio = null;
    this._ringbackGeneration = 0;

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
      aiDisclaimer: document.getElementById("aiDisclaimer"),

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
      callDisclaimer: document.getElementById("callDisclaimer"),
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

      // Consent overlay (AI disclosure, first login)
      consentOverlay: document.getElementById("consentOverlay"),
      consentTitle: document.getElementById("consentTitle"),
      consentSubtitle: document.getElementById("consentSubtitle"),
      consentContent: document.getElementById("consentContent"),
      consentError: document.getElementById("consentError"),
      consentAgreeBtn: document.getElementById("consentAgreeBtn"),
      consentDeclineBtn: document.getElementById("consentDeclineBtn"),

      // Talk disclaimer overlay (first TALK tap)
      talkOverlay: document.getElementById("talkOverlay"),
      talkTitle: document.getElementById("talkTitle"),
      talkSubtitle: document.getElementById("talkSubtitle"),
      talkContent: document.getElementById("talkContent"),
      talkError: document.getElementById("talkError"),
      talkGotItBtn: document.getElementById("talkGotItBtn"),

      // Privacy policy overlay (on-demand, viewable anytime)
      privacyOverlay: document.getElementById("privacyOverlay"),
      privacyTitle: document.getElementById("privacyTitle"),
      privacyContent: document.getElementById("privacyContent"),
      privacyCloseBtn: document.getElementById("privacyCloseBtn"),
      privacyUnderstoodBtn: document.getElementById("privacyUnderstoodBtn"),

      // Account deletion (from My Info, named accounts only)
      deleteAccountLinkBtn: document.getElementById("deleteAccountLinkBtn"),
      deleteAccountOverlay: document.getElementById("deleteAccountOverlay"),
      deleteAccountTitle: document.getElementById("deleteAccountTitle"),
      deleteAccountSubtitle: document.getElementById("deleteAccountSubtitle"),
      deleteAccountContent: document.getElementById("deleteAccountContent"),
      deleteAccountError: document.getElementById("deleteAccountError"),
      deleteAccountCloseBtn: document.getElementById("deleteAccountCloseBtn"),
      deleteAccountConfirmBtn: document.getElementById("deleteAccountConfirmBtn"),

      // Account deletion — final confirmation (re-enter Nick + PIN)
      deleteAccountFinalOverlay: document.getElementById("deleteAccountFinalOverlay"),
      deleteAccountFinalTitle: document.getElementById("deleteAccountFinalTitle"),
      deleteAccountFinalSubtitle: document.getElementById("deleteAccountFinalSubtitle"),
      deleteAccountFinalNickLabel: document.getElementById("deleteAccountFinalNickLabel"),
      deleteAccountFinalNick: document.getElementById("deleteAccountFinalNick"),
      deleteAccountFinalPinLabel: document.getElementById("deleteAccountFinalPinLabel"),
      deleteAccountFinalPin: document.getElementById("deleteAccountFinalPin"),
      deleteAccountFinalError: document.getElementById("deleteAccountFinalError"),
      deleteAccountFinalCloseBtn: document.getElementById("deleteAccountFinalCloseBtn"),
      deleteAccountFinalBtn: document.getElementById("deleteAccountFinalBtn"),

      // Subjects UI
      startBtn: document.getElementById("startBtn"),
      taskBtn: document.getElementById("taskBtn"),
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
      myInfoBtn: document.getElementById("myInfoBtn"),
      myInfoOverlay: document.getElementById("myInfoOverlay"),
      myInfoCloseBtn: document.getElementById("myInfoCloseBtn"),
      myInfoTitle: document.getElementById("myInfoTitle"),
      myInfoSubtitle: document.getElementById("myInfoSubtitle"),
      myInfoTownLabel: document.getElementById("myInfoTownLabel"),
      myInfoStateLabel: document.getElementById("myInfoStateLabel"),
      myInfoCountryLabel: document.getElementById("myInfoCountryLabel"),
      myInfoTownInput: document.getElementById("myInfoTownInput"),
      myInfoStateInput: document.getElementById("myInfoStateInput"),
      myInfoCountryInput: document.getElementById("myInfoCountryInput"),
      myInfoCancelBtn: document.getElementById("myInfoCancelBtn"),
      myInfoSaveBtn: document.getElementById("myInfoSaveBtn"),
      myInfoStatus: document.getElementById("myInfoStatus"),
      myInfoGender: document.getElementById("myInfoGender"),
      myInfoGenderLabel: document.getElementById("myInfoGenderLabel"),
      myInfoGenderDefault: document.getElementById("myInfoGenderDefault"),
      myInfoGenderWoman: document.getElementById("myInfoGenderWoman"),
      myInfoGenderMan: document.getElementById("myInfoGenderMan"),
      myInfoGenderOther: document.getElementById("myInfoGenderOther"),

      // Usage Monitor (nested in My Info popup-card)
      usageMonitor: document.getElementById("usageMonitor"),
      usageMonitorTitle: document.getElementById("usageMonitorTitle"),
      usageVoiceLabel: document.getElementById("usageVoiceLabel"),
      usageVoicePct: document.getElementById("usageVoicePct"),
      usageVoiceBar: document.getElementById("usageVoiceBar"),
      usageChatLabel: document.getElementById("usageChatLabel"),
      usageChatPct: document.getElementById("usageChatPct"),
      usageChatBar: document.getElementById("usageChatBar"),
      usageCurrentPlanLabel: document.getElementById("usageCurrentPlanLabel"),
      usageCurrentPlanName: document.getElementById("usageCurrentPlanName"),
      usageCloseBtn: document.getElementById("usageCloseBtn"),
      usageGetMoreTimeBtn: document.getElementById("usageGetMoreTimeBtn"),

      // Plan Selection overlay
      planSelectionOverlay: document.getElementById("planSelectionOverlay"),
      planPromoTitle: document.getElementById("planPromoTitle"),
      planPromoBody: document.getElementById("planPromoBody"),
      planSelectionHeader: document.getElementById("planSelectionHeader"),
      planCardsContainer: document.getElementById("planCardsContainer"),
      topUpCardContainer: document.getElementById("topUpCardContainer"),
      planNoteTerms: document.getElementById("planNoteTerms"),
      planNoteGP: document.getElementById("planNoteGP"),
      planNoteChange: document.getElementById("planNoteChange"),
      planNoteBrendy: document.getElementById("planNoteBrendy"),
      planNoteRestrictions: document.getElementById("planNoteRestrictions"),
      planNoteAccept: document.getElementById("planNoteAccept"),
      planNotePrivacy: document.getElementById("planNotePrivacy"),

      // Help UI
      helpBtn: document.getElementById("helpBtn"),
      helpOverlay: document.getElementById("helpOverlay"),
      helpCloseBtn: document.getElementById("helpCloseBtn"),
      helpBottomCloseBtn: document.getElementById("helpBottomCloseBtn"),
      helpContent: document.getElementById("helpContent"),
      helpTitle: document.getElementById("helpTitle"),

      // News & Gossip — Latest (category picker)
      latestBtn: document.getElementById("newsSectionsBtn"),
      latestOverlay: document.getElementById("newsSectionsOverlay"),
      latestCloseBtn: document.getElementById("newsSectionsCloseBtn"),
      latestTitle: document.getElementById("latestTitle"),
      latestSubtitle: document.getElementById("latestSubtitle"),
      latestCancelBtn: document.getElementById("newsSectionsCancelBtn"),
      latestSaveBtn: document.getElementById("newsSectionsSaveBtn"),
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
      chatBtn: document.getElementById("changeSubjectBtn"),
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

    // Task manager
    this.taskManager = new TaskManager(this);

    this.init();
  }

  /* --------------------
     INIT
  -------------------- */
  async init() {
    await preloadLocale(this.locale.variant);
    this._sideNav = new SideNavManager(this.locale, () => this.user);

    // Localise hints + placeholders
    if (this.elements.hintTalk) this.elements.hintTalk.textContent = t(this.locale.variant, "hintTalk");
    if (this.elements.hintText) this.elements.hintText.textContent = t(this.locale.variant, "hintText");
    if (this.elements.aiDisclaimer) this.elements.aiDisclaimer.textContent = t(this.locale.variant, "aiDisclaimer");
    if (this.elements.callDisclaimer) this.elements.callDisclaimer.textContent = t(this.locale.variant, "aiDisclaimer");

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
    this.localizeMyInfoUI();
    this.localizeUsageMonitorUI();
    this.localizePlanSelectionUI();

    // Mode button labels (i18n)
    if (this.elements.toggleBtnText) {
      this.elements.toggleBtnText.textContent = t(this.locale.variant, "textMode");
    }
    if (this.elements.taskBtn) {
      this.elements.taskBtn.textContent = t(this.locale.variant, "taskBtn");
    }
    if (this.elements.helpTitle) {
      this.elements.helpTitle.textContent = t(this.locale.variant, "helpTitle");
    }

    // News & Gossip button labels + legends
    this.localizeNewsUI();

    // Buttons
    this.elements.toggleBtnTalk.addEventListener("click", () => this.onTalkButton());
    this.elements.toggleBtnText.addEventListener("click", () => this.onTextButton());
    this.elements.taskBtn?.addEventListener("click", () => this.taskManager.open());

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
    this.elements.myInfoBtn?.addEventListener("click", () => this.onMyInfoButton());
    this.elements.myInfoCloseBtn?.addEventListener("click", () => this.closeMyInfoOverlay());
    this.elements.myInfoCancelBtn?.addEventListener("click", () => this.closeMyInfoOverlay());
    this.elements.myInfoSaveBtn?.addEventListener("click", () => this.onMyInfoSave());
    this.elements.usageCloseBtn?.addEventListener("click", () => this.closeMyInfoOverlay());
    this.elements.usageGetMoreTimeBtn?.addEventListener("click", () => this.onGetMoreTime());
    this.elements.planCardsContainer?.addEventListener("click", (e) => this.onPlanCardsClick(e));
    this.elements.topUpCardContainer?.addEventListener("click", (e) => this.onPlanCardsClick(e));

    // Help button → opens new SideNav system
    this.elements.helpBtn?.addEventListener("click", () => this._sideNav.openSideNavHome());
    this.elements.helpCloseBtn?.addEventListener("click", () => this.closeHelpOverlay());
    this.elements.helpBottomCloseBtn?.addEventListener("click", () => this.closeHelpOverlay());

    // News & Gossip — Latest overlay
    this.elements.latestBtn?.addEventListener("click", () => this.onLatestButton());
    this.elements.latestCloseBtn?.addEventListener("click", () => this.closeLatestOverlay());
    this.elements.latestCancelBtn?.addEventListener("click", () => this.closeLatestOverlay());
    this.elements.latestSaveBtn?.addEventListener("click", () => this.onLatestSave());

    // News & Gossip — Headlines overlay
    this.elements.headlinesBtn?.addEventListener("click", () => this.onHeadlinesButton());

    // RDS — Chat / Let's chat button
    this.elements.chatBtn?.addEventListener("click", () => this.onChatButton());
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
      this._sideNav.positionPanels();
    });

    // Position sidenav panels relative to the centered app container
    this._sideNav.positionPanels();
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

    // Force the first letter to uppercase as the user types — mirrors the
    // server-side normalizeUsername() in api/auth/login.js, which stores the
    // nick Proper-cased regardless.
    this.elements.authNick?.addEventListener("input", () => {
      const el = this.elements.authNick;
      const v = el.value;
      if (v && v[0] !== v[0].toUpperCase()) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = v[0].toUpperCase() + v.slice(1);
        el.setSelectionRange(start, end);
      }
    });

    this.elements.authCloseBtn?.addEventListener("click", () => this.closeAuthOverlay());

    this.elements.consentAgreeBtn?.addEventListener("click", () => this.acceptConsent());
    this.elements.consentDeclineBtn?.addEventListener("click", () => this.declineConsent());

    this.elements.talkGotItBtn?.addEventListener("click", () => this.acceptTalkDisclaimer());

    // Privacy policy — on demand, from anywhere it's linked. Left-click opens
    // the in-app popup; middle-click / right-click "open in new tab" still
    // falls through to the real href (the standalone page stays available).
    this.elements.authPrivacyLink?.addEventListener("click", (e) => {
      e.preventDefault();
      this.openPrivacyOverlay();
    });
    this.elements.planNotePrivacy?.addEventListener("click", (e) => {
      e.preventDefault();
      this.openPrivacyOverlay();
    });
    this.elements.privacyCloseBtn?.addEventListener("click", () => this.closePrivacyOverlay());
    this.elements.privacyUnderstoodBtn?.addEventListener("click", () => this.acceptPrivacyPolicy());

    this.elements.deleteAccountLinkBtn?.addEventListener("click", () => {
      this.closeAuthOverlay();
      this.openDeleteAccountOverlay();
    });
    this.elements.deleteAccountCloseBtn?.addEventListener("click", () => this.closeDeleteAccountOverlay());
    this.elements.deleteAccountConfirmBtn?.addEventListener("click", () => {
      this.closeDeleteAccountOverlay();
      this.openDeleteAccountFinalOverlay();
    });
    this.elements.deleteAccountFinalCloseBtn?.addEventListener("click", () => this.closeDeleteAccountFinalOverlay());
    this.elements.deleteAccountFinalBtn?.addEventListener("click", () => this.confirmDeleteAccount());
  }

  async bootstrapAuth() {
    try {
      const me = await this.apiJSON("/api/auth/me", { method: "GET" });
      if (me?.voiceProxyUrl && window.Config) window.Config.VOICE_PROXY_WS_URL = me.voiceProxyUrl;
      if (me?.voiceToken  && window.Config) window.Config.VOICE_TOKEN = me.voiceToken;
      if (me?.userId) {
        if (!me.isAnonymous && !me.consentAcceptedAt) {
          this._pendingConsentUser = me;
          this.closeAuthOverlay();
          this.openConsentOverlay();
          this.setTalkButtonState({ connected: false, disabled: true });
          return;
        }
        await this.completeLogin(me);
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

    // Only a logged-in named account has anything to delete (reopened via
    // the Account button) — never shown during first-time signup.
    const showDeleteAccount = !!this.user && !this.user.isAnonymous;
    if (this.elements.deleteAccountLinkBtn) {
      this.elements.deleteAccountLinkBtn.textContent = t(this.locale.variant, "deleteAccountLink");
      this.elements.deleteAccountLinkBtn.classList.toggle("hidden", !showDeleteAccount);
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
        talkDisclaimerAcceptedAt: meOrNull.talkDisclaimerAcceptedAt || null,
        policyAcceptedAt: meOrNull.policyAcceptedAt || null,
      }
      : null;

    if (!meOrNull || meOrNull.userId !== prevUserId) {
      this.declaredInterests = [];
    }

    // Update account button text
    if (this.elements.accountBtn) {
      const v = this.locale.variant;
      if (!this.user || this.user.isAnonymous) {
        this.elements.accountBtn.textContent = t(v, "accountBtnAnonymous");
      } else {
        this.elements.accountBtn.textContent = this.user.displayName;
      }
    }

    // Grey out TALK for anonymous sessions — stays clickable (native
    // `disabled` would swallow the click and the "open an account" message
    // would never show), so this is a pure CSS lock, not btn.disabled.
    this.elements.toggleBtnTalk?.classList.toggle("talk-locked", !!this.user?.isAnonymous);
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

      if (!me.isAnonymous && !me.consentAcceptedAt) {
        this._pendingConsentUser = me;
        this.closeAuthOverlay();
        this.openConsentOverlay();
        return;
      }

      await this.completeLogin(me);
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
      await this.completeLogin(me);
    } catch (e) {
      console.error(e);
      if (this.elements.authError) this.elements.authError.textContent = e?.message || String(e);
    } finally {
      this.setAuthBusy(false);
    }
  }

  // Finishes the login/signup sequence once any required consent has been
  // resolved — shared by authContinue, continueAnonymous, bootstrapAuth, and
  // the consent overlay's accept/decline handlers.
  async completeLogin(me) {
    await this.setUser(me);
    this.closeAuthOverlay();
    this.closeConsentOverlay();
    this.closeDeleteAccountOverlay();
    this.closeDeleteAccountFinalOverlay();

    await this.loadHistoryAndRender();
    await this.checkAndShowGreeting();
    this.startGreetingHeartbeat();

    this.setTalkButtonState({ connected: false, disabled: false });
    this.elements.toggleBtnText.disabled = false;
  }

  openConsentOverlay() {
    const v = this.locale.variant;
    if (this.elements.consentTitle) this.elements.consentTitle.textContent = t(v, "consentTitle");
    if (this.elements.consentSubtitle) this.elements.consentSubtitle.textContent = t(v, "consentSubtitle");
    if (this.elements.consentContent) {
      this.elements.consentContent.innerHTML = t(v, "consentContent");
      this.elements.consentContent.scrollTop = 0;
    }
    if (this.elements.consentAgreeBtn) this.elements.consentAgreeBtn.textContent = t(v, "consentAgree");
    if (this.elements.consentDeclineBtn) this.elements.consentDeclineBtn.textContent = t(v, "consentDecline");
    if (this.elements.consentError) this.elements.consentError.textContent = "";

    this.elements.consentOverlay?.classList.remove("hidden");
    this.elements.consentOverlay?.setAttribute("aria-hidden", "false");
  }

  closeConsentOverlay() {
    this.elements.consentOverlay?.classList.add("hidden");
    this.elements.consentOverlay?.setAttribute("aria-hidden", "true");
  }

  setConsentBusy(isBusy) {
    if (this.elements.consentAgreeBtn) this.elements.consentAgreeBtn.disabled = isBusy;
    if (this.elements.consentDeclineBtn) this.elements.consentDeclineBtn.disabled = isBusy;
  }

  async acceptConsent() {
    if (!this._pendingConsentUser) return;
    this.setConsentBusy(true);
    try {
      const { consentAcceptedAt } = await this.apiJSON("/api/auth/consent", { method: "POST", body: {} });
      const me = { ...this._pendingConsentUser, consentAcceptedAt };
      this._pendingConsentUser = null;
      await this.completeLogin(me);
    } catch (e) {
      console.error(e);
      if (this.elements.consentError) this.elements.consentError.textContent = e?.message || String(e);
    } finally {
      this.setConsentBusy(false);
    }
  }

  async declineConsent() {
    this.setConsentBusy(true);
    try {
      const me = await this.apiJSON("/api/auth/decline-consent", { method: "POST", body: {} });
      this._pendingConsentUser = null;
      await this.completeLogin(me);
    } catch (e) {
      console.error(e);
      if (this.elements.consentError) this.elements.consentError.textContent = e?.message || String(e);
    } finally {
      this.setConsentBusy(false);
    }
  }

  openTalkOverlay() {
    const v = this.locale.variant;
    if (this.elements.talkTitle) this.elements.talkTitle.textContent = t(v, "talkTitle");
    if (this.elements.talkSubtitle) this.elements.talkSubtitle.textContent = t(v, "talkSubtitle");
    if (this.elements.talkContent) {
      this.elements.talkContent.innerHTML = t(v, "talkContent");
      this.elements.talkContent.scrollTop = 0;
    }
    if (this.elements.talkGotItBtn) this.elements.talkGotItBtn.textContent = t(v, "talkGotIt");
    if (this.elements.talkError) this.elements.talkError.textContent = "";

    this.elements.talkOverlay?.classList.remove("hidden");
    this.elements.talkOverlay?.setAttribute("aria-hidden", "false");
  }

  closeTalkOverlay() {
    this.elements.talkOverlay?.classList.add("hidden");
    this.elements.talkOverlay?.setAttribute("aria-hidden", "true");
  }

  setTalkOverlayBusy(isBusy) {
    if (this.elements.talkGotItBtn) this.elements.talkGotItBtn.disabled = isBusy;
  }

  async acceptTalkDisclaimer() {
    this.setTalkOverlayBusy(true);
    try {
      const { talkDisclaimerAcceptedAt } = await this.apiJSON("/api/auth/talk-disclaimer", { method: "POST", body: {} });
      if (this.user) this.user.talkDisclaimerAcceptedAt = talkDisclaimerAcceptedAt;
      this.closeTalkOverlay();
      // Re-enter the same gated flow — now accepted, it falls through to the
      // quota check and connects.
      await this.onTalkButton();
    } catch (e) {
      console.error(e);
      if (this.elements.talkError) this.elements.talkError.textContent = e?.message || String(e);
    } finally {
      this.setTalkOverlayBusy(false);
    }
  }

  openPrivacyOverlay() {
    const v = this.locale.variant;
    if (this.elements.privacyTitle) this.elements.privacyTitle.textContent = t(v, "privacyTitle");
    if (this.elements.privacyContent) {
      this.elements.privacyContent.innerHTML = t(v, "privacyContent");
      this.elements.privacyContent.scrollTop = 0;
    }
    if (this.elements.privacyUnderstoodBtn) this.elements.privacyUnderstoodBtn.textContent = t(v, "privacyUnderstood");

    this.elements.privacyOverlay?.classList.remove("hidden");
    this.elements.privacyOverlay?.setAttribute("aria-hidden", "false");
  }

  closePrivacyOverlay() {
    this.elements.privacyOverlay?.classList.add("hidden");
    this.elements.privacyOverlay?.setAttribute("aria-hidden", "true");
  }

  // On-demand, not gated — "Understood" just records the first time this
  // account confirmed reading it (never overwritten after that). Best-effort:
  // closes either way, including when there's no session yet (e.g. viewed
  // from the pre-login signup screen).
  async acceptPrivacyPolicy() {
    try {
      const { policyAcceptedAt } = await this.apiJSON("/api/auth/policy-accept", { method: "POST", body: {} });
      if (this.user) this.user.policyAcceptedAt = policyAcceptedAt;
    } catch (e) {
      console.error(e);
    } finally {
      this.closePrivacyOverlay();
    }
  }

  openDeleteAccountOverlay() {
    const v = this.locale.variant;
    if (this.elements.deleteAccountTitle) this.elements.deleteAccountTitle.textContent = t(v, "deleteAccountTitle");
    if (this.elements.deleteAccountSubtitle) this.elements.deleteAccountSubtitle.textContent = t(v, "deleteAccountSubtitle");
    if (this.elements.deleteAccountContent) {
      this.elements.deleteAccountContent.innerHTML = t(v, "deleteAccountContent");
      this.elements.deleteAccountContent.scrollTop = 0;
    }
    if (this.elements.deleteAccountConfirmBtn) this.elements.deleteAccountConfirmBtn.textContent = t(v, "deleteAccountConfirm");
    if (this.elements.deleteAccountError) this.elements.deleteAccountError.textContent = "";

    this.elements.deleteAccountOverlay?.classList.remove("hidden");
    this.elements.deleteAccountOverlay?.setAttribute("aria-hidden", "false");
  }

  closeDeleteAccountOverlay() {
    this.elements.deleteAccountOverlay?.classList.add("hidden");
    this.elements.deleteAccountOverlay?.setAttribute("aria-hidden", "true");
  }

  setDeleteAccountBusy(isBusy) {
    if (this.elements.deleteAccountConfirmBtn) this.elements.deleteAccountConfirmBtn.disabled = isBusy;
  }

  openDeleteAccountFinalOverlay() {
    const v = this.locale.variant;
    if (this.elements.deleteAccountFinalTitle) this.elements.deleteAccountFinalTitle.textContent = t(v, "deleteAccountConfirmTitle");
    if (this.elements.deleteAccountFinalSubtitle) this.elements.deleteAccountFinalSubtitle.textContent = t(v, "deleteAccountConfirmSubtitle");
    if (this.elements.deleteAccountFinalNickLabel) this.elements.deleteAccountFinalNickLabel.textContent = t(v, "authNickLabel");
    if (this.elements.deleteAccountFinalPinLabel) this.elements.deleteAccountFinalPinLabel.textContent = t(v, "authPinLabel");
    if (this.elements.deleteAccountFinalBtn) this.elements.deleteAccountFinalBtn.textContent = t(v, "deleteAccountFinalBtn");
    if (this.elements.deleteAccountFinalNick) this.elements.deleteAccountFinalNick.value = "";
    if (this.elements.deleteAccountFinalPin) this.elements.deleteAccountFinalPin.value = "";
    if (this.elements.deleteAccountFinalError) this.elements.deleteAccountFinalError.textContent = "";

    this.elements.deleteAccountFinalOverlay?.classList.remove("hidden");
    this.elements.deleteAccountFinalOverlay?.setAttribute("aria-hidden", "false");
    setTimeout(() => this.elements.deleteAccountFinalNick?.focus(), 50);
  }

  closeDeleteAccountFinalOverlay() {
    this.elements.deleteAccountFinalOverlay?.classList.add("hidden");
    this.elements.deleteAccountFinalOverlay?.setAttribute("aria-hidden", "true");
  }

  setDeleteAccountFinalBusy(isBusy) {
    if (this.elements.deleteAccountFinalBtn) this.elements.deleteAccountFinalBtn.disabled = isBusy;
    if (this.elements.deleteAccountFinalNick) this.elements.deleteAccountFinalNick.disabled = isBusy;
    if (this.elements.deleteAccountFinalPin) this.elements.deleteAccountFinalPin.disabled = isBusy;
  }

  async confirmDeleteAccount() {
    const v = this.locale.variant;
    const nick = (this.elements.deleteAccountFinalNick?.value || "").trim();
    const pin = (this.elements.deleteAccountFinalPin?.value || "").trim();

    if (!this.validateNick(nick)) {
      if (this.elements.deleteAccountFinalError) this.elements.deleteAccountFinalError.textContent = t(v, "authErrorBadNick");
      return;
    }
    if (!this.validatePin(pin)) {
      if (this.elements.deleteAccountFinalError) this.elements.deleteAccountFinalError.textContent = t(v, "authErrorBadPin");
      return;
    }

    this.setDeleteAccountFinalBusy(true);
    try {
      const me = await this.apiJSON("/api/auth/delete-account", {
        method: "POST",
        body: { username: nick, pin },
      });
      await this.completeLogin(me);
      window.alert(t(v, "deleteAccountDone"));
    } catch (e) {
      console.error(e);
      if (this.elements.deleteAccountFinalError) this.elements.deleteAccountFinalError.textContent = e?.message || String(e);
    } finally {
      this.setDeleteAccountFinalBusy(false);
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
      // Try JSON error — parsing happens in its own try so a thrown Error
      // here isn't immediately caught by the same block's catch.
      let message = text || `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        message = j.error || j.message || message;
      } catch {
        // Not JSON — keep the raw text/status fallback.
      }
      throw new Error(message);
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
    if (e.chatBtn) e.chatBtn.textContent = t(v, "chatBtn");
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
      card.dataset.gaName = "headlines_popup__card_btn";
      card.dataset.gaItemId = h.id ?? h.headline;

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
    const inTalk = this.mode === "talk" && this._lastVoiceStatus !== "disconnected";
    try {
      const data = await this.apiJSON("/api/brenda/gossip", {
        method: "POST",
        body: {
          headline: headline.headline,
          snippet:  headline.snippet || "",
          locale:   this.locale.variant,
          history:  [],
        },
      });
      if (!data?.reply) return;
      if (inTalk) {
        const spoken = await this.speakExactLine(data.reply);
        if (!spoken) await this.emitAssistantLine({ text: data.reply, channel: "text" });
      } else {
        await this.emitAssistantLine({ text: data.reply, channel: "text" });
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
    const arr = this.normalizeSubjects(this.declaredInterests);
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
  localizeMyInfoUI() {
    const v = this.locale.variant;
    if (this.elements.myInfoBtn) this.elements.myInfoBtn.textContent = t(v, "myInfoButton");
    if (this.elements.myInfoTitle) this.elements.myInfoTitle.textContent = t(v, "myInfoTitle");
    if (this.elements.myInfoSubtitle) this.elements.myInfoSubtitle.textContent = t(v, "myInfoSubtitle");
    if (this.elements.myInfoTownLabel) this.elements.myInfoTownLabel.textContent = t(v, "myInfoTown");
    if (this.elements.myInfoStateLabel) this.elements.myInfoStateLabel.textContent = t(v, "myInfoState");
    if (this.elements.myInfoCountryLabel) this.elements.myInfoCountryLabel.textContent = t(v, "myInfoCountry");
    if (this.elements.myInfoGenderLabel) this.elements.myInfoGenderLabel.textContent = t(v, "authGenderLabel");
    if (this.elements.myInfoGenderDefault) this.elements.myInfoGenderDefault.textContent = t(v, "authGenderDefault");
    if (this.elements.myInfoGenderWoman) this.elements.myInfoGenderWoman.textContent = t(v, "authGenderWoman");
    if (this.elements.myInfoGenderMan) this.elements.myInfoGenderMan.textContent = t(v, "authGenderMan");
    if (this.elements.myInfoGenderOther) this.elements.myInfoGenderOther.textContent = t(v, "authGenderOther");
    if (this.elements.myInfoSaveBtn) this.elements.myInfoSaveBtn.textContent = t(v, "myInfoSave");
    if (this.elements.myInfoCancelBtn) this.elements.myInfoCancelBtn.textContent = t(v, "myInfoCancel");
  }

  /* --------------------
     USAGE MONITOR
  -------------------- */
  localizeUsageMonitorUI() {
    const v = this.locale.variant;
    if (this.elements.usageMonitorTitle) this.elements.usageMonitorTitle.textContent = t(v, "sub.monthlyMonitor");
    if (this.elements.usageVoiceLabel) this.elements.usageVoiceLabel.textContent = t(v, "sub.voiceMode");
    if (this.elements.usageChatLabel) this.elements.usageChatLabel.textContent = t(v, "sub.chatMode");
    if (this.elements.usageCurrentPlanLabel) this.elements.usageCurrentPlanLabel.textContent = t(v, "sub.currentPlanLine");
    if (this.elements.usageCloseBtn) this.elements.usageCloseBtn.textContent = t(v, "sub.close");
    if (this.elements.usageGetMoreTimeBtn) this.elements.usageGetMoreTimeBtn.textContent = t(v, "sub.getMoreTime");
  }

  _tierKeyForPlanId(planId) {
    return { brenda_free: "tier.free", brenda_basic: "tier.basic", brenda_superior: "tier.superior", brenda_advanced: "tier.advanced" }[planId] || null;
  }

  async refreshUsageMonitor() {
    if (!this.elements.usageMonitor || !this.user || this.user.isAnonymous) return;
    try {
      const res = await fetch("/api/user/usage", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data) return;

      const v = this.locale.variant;
      const voicePct = Math.round((data.voiceTokensUsed / (data.voiceQuota || 1)) * 100);
      const chatPct = Math.round((data.chatTokensUsed / (data.chatQuota || 1)) * 100);

      if (this.elements.usageVoicePct) this.elements.usageVoicePct.textContent = t(v, "sub.pctUsed", { n: voicePct });
      if (this.elements.usageChatPct) this.elements.usageChatPct.textContent = t(v, "sub.pctUsed", { n: chatPct });
      if (this.elements.usageVoiceBar) {
        this.elements.usageVoiceBar.style.width = `${Math.min(voicePct, 100)}%`;
        this.elements.usageVoiceBar.classList.toggle("exhausted", data.voiceStatus === "exhausted");
      }
      if (this.elements.usageChatBar) {
        this.elements.usageChatBar.style.width = `${Math.min(chatPct, 100)}%`;
        this.elements.usageChatBar.classList.toggle("exhausted", data.chatStatus === "exhausted");
      }
      if (this.elements.usageCurrentPlanName) {
        const tierKey = this._tierKeyForPlanId(data.planId);
        let label = tierKey ? t(v, tierKey) : (data.planDisplayName || "");
        // A scheduled downgrade only takes effect at the next billing period
        // (see lib/subscriptions.js switchPlan) — show it here so the plan
        // name doesn't look "stuck" after the user picked something else.
        if (data.pendingPlanId) {
          const pendingTierKey = this._tierKeyForPlanId(data.pendingPlanId);
          const pendingLabel = pendingTierKey ? t(v, pendingTierKey) : (data.pendingPlanDisplayName || "");
          const effectiveDate = data.periodEndDate ? new Date(data.periodEndDate).toLocaleDateString(v) : "";
          label += ` ${t(v, "sub.pendingChange", { plan: pendingLabel, date: effectiveDate })}`;
        }
        this.elements.usageCurrentPlanName.textContent = label;
      }
    } catch {
      // Usage block just stays at its last-known state if the fetch fails.
    }
  }

  onGetMoreTime() {
    this.openPlanSelectionOverlay();
  }

  /* --------------------
     PLAN SELECTION
  -------------------- */
  localizePlanSelectionUI() {
    const v = this.locale.variant;
    if (this.elements.planPromoTitle) this.elements.planPromoTitle.textContent = t(v, "sub.tryFreeTitle");
    if (this.elements.planPromoBody) this.elements.planPromoBody.innerHTML = t(v, "sub.tryFreeBody");
    if (this.elements.planSelectionHeader) this.elements.planSelectionHeader.textContent = t(v, "sub.header");
    if (this.elements.planNoteTerms) this.elements.planNoteTerms.textContent = t(v, "notes.termsChange");
    if (this.elements.planNoteGP) this.elements.planNoteGP.textContent = t(v, "notes.manageGP");
    if (this.elements.planNoteChange) this.elements.planNoteChange.textContent = t(v, "notes.changeAnytime");
    if (this.elements.planNoteBrendy) this.elements.planNoteBrendy.textContent = t(v, "notes.brendyEquiv");
    if (this.elements.planNoteRestrictions) this.elements.planNoteRestrictions.textContent = t(v, "notes.restrictions");
    if (this.elements.planNoteAccept) this.elements.planNoteAccept.textContent = t(v, "notes.termsAccept");
    if (this.elements.planNotePrivacy) this.elements.planNotePrivacy.textContent = t(v, "notes.privacyLink");
  }

  _isSpanishLocale() {
    return this.locale.variant.startsWith("es");
  }

  // Hand-rolled rather than Intl/toLocaleString: CLDR suppresses the
  // thousands separator for exactly-4-digit numbers in es-ES (e.g. 1680
  // renders as "1680", not "1.680"), which would silently break the
  // "min" column. Grouping every 3 digits unconditionally avoids that.
  _formatInt(n) {
    const s = Math.round(n).toString();
    const sep = this._isSpanishLocale() ? "." : ",";
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }

  _formatPriceCents(cents) {
    const [intPart, decPart] = (cents / 100).toFixed(2).split(".");
    const decSep = this._isSpanishLocale() ? "," : ".";
    return `${this._formatInt(Number(intPart))}${decSep}${decPart}`;
  }

  async openPlanSelectionOverlay() {
    const o = this.elements.planSelectionOverlay;
    if (!o) return;
    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");

    if (this.elements.planCardsContainer) {
      this.elements.planCardsContainer.innerHTML = "";
    }
    if (this.elements.topUpCardContainer) {
      this.elements.topUpCardContainer.innerHTML = "";
    }

    try {
      const [plansRes, usageRes] = await Promise.all([
        fetch("/api/plans", { credentials: "include", cache: "no-store" }),
        fetch("/api/user/usage", { credentials: "include", cache: "no-store" }),
      ]);
      const plansData = plansRes.ok ? await plansRes.json().catch(() => null) : null;
      const usageData = usageRes.ok ? await usageRes.json().catch(() => null) : null;
      const plans = plansData?.plans || [];
      const currentPlanId = usageData?.planId || null;
      // Used by onSelectPlan() to tell an upgrade from a downgrade.
      this._currentPlanSortOrder = plans.find((p) => p.planId === currentPlanId)?.sortOrder ?? 0;
      this._renderPlanCards(plans, currentPlanId);
      this._renderTopUpCard(plans.find((p) => p.planId === "brenda_topup") || null);
    } catch {
      // Cards container just stays empty if the fetch fails.
    }
  }

  closePlanSelectionOverlay() {
    const o = this.elements.planSelectionOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
  }

  _renderPlanCards(plans, currentPlanId) {
    const container = this.elements.planCardsContainer;
    if (!container) return;
    const v = this.locale.variant;

    const paidPlans = plans
      .filter((p) => p.planId !== "brenda_free" && p.planId !== "brenda_topup")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    container.innerHTML = paidPlans
      .map((plan) => {
        const tierKey = this._tierKeyForPlanId(plan.planId);
        const planLabel = tierKey ? t(v, tierKey) : (plan.displayName || plan.planId);
        const totalMinutes = (plan.voiceMinApprox || 0) + (plan.chatMinApprox || 0);
        const isCurrent = plan.planId === currentPlanId;
        const isPopular = !!plan.isMostPopular;
        const fullPrice = this._formatPriceCents(plan.fullPriceCents || 0);
        const introPrice = this._formatPriceCents(plan.firstMonthPriceCents || 0);

        const btnClass = isCurrent ? "plan-select-btn plan-select-btn--current" : "plan-select-btn";
        const btnLabel = isCurrent ? t(v, "sub.currentPlan", { plan: planLabel }) : t(v, "sub.selectPlan", { plan: planLabel });

        return `
          <div class="plan-card${isPopular ? " plan-card--popular" : ""}" data-plan-id="${plan.planId}">
            ${isPopular ? `<span class="plan-card-badge">${t(v, "sub.mostPopular")}</span>` : ""}
            <div class="plan-card-header">
              <div class="plan-card-name-row">
                <h3 class="plan-card-name">${planLabel}</h3>
                <span class="plan-card-minutes">${t(v, "sub.totalMinutes", { n: this._formatInt(totalMinutes) })}</span>
              </div>
              <button type="button" class="plan-card-close" data-action="close" aria-label="Close" data-ga-name="plan_selection_popup__card_close_btn">×</button>
            </div>

            <div class="plan-card-pricing">
              <span class="plan-price-full">${t(v, "sub.fullPrice", { n: fullPrice })}</span>
              <span class="plan-price-intro">${t(v, "sub.introPrice", { n: introPrice })}</span>
              <p class="plan-price-offer-text">${t(v, "sub.introOffer", { n: fullPrice })}</p>
              <span class="plan-save-pill">${t(v, "sub.savePct", { n: plan.firstMonthDiscountPct || 0 })}</span>
            </div>

            <table class="plan-card-table">
              <thead>
                <tr><th></th><th>${t(v, "sub.timeCol")}</th><th>${t(v, "sub.brendysCol")}</th></tr>
              </thead>
              <tbody>
                <tr><td>${t(v, "sub.voiceRow")}</td><td>${this._formatInt(plan.voiceMinApprox)} min</td><td>${this._formatInt(plan.voiceQuota)}</td></tr>
                <tr><td>${t(v, "sub.chatRow")}</td><td>${this._formatInt(plan.chatMinApprox)} min</td><td>${this._formatInt(plan.chatQuota)}</td></tr>
              </tbody>
            </table>

            <button type="button" class="${btnClass}" data-action="select" data-plan-id="${plan.planId}" data-plan-label="${planLabel}" data-sort-order="${plan.sortOrder ?? 0}" ${isCurrent ? "data-current=\"true\"" : ""} data-ga-name="plan_selection_popup__select_btn">${btnLabel}</button>

            <p class="plan-card-footnote">${t(v, "sub.timeNote")}</p>
          </div>
        `;
      })
      .join("");
  }

  // Top-up: a one-time "add more Brendys" product, not a recurring
  // subscription — no first-month offer, so no intro price / save pill.
  // Rendered in its own container above the subscription plan cards, right
  // below the promo box (see index.html).
  _renderTopUpCard(plan) {
    const container = this.elements.topUpCardContainer;
    if (!container) return;
    const hasTopUp = !!plan;
    if (!hasTopUp) {
      container.innerHTML = "";
      return;
    }

    const v = this.locale.variant;
    const planLabel = t(v, "sub.topUpName");
    const totalMinutes = (plan.voiceMinApprox || 0) + (plan.chatMinApprox || 0);
    const price = this._formatPriceCents(plan.fullPriceCents || 0);

    container.innerHTML = `
      <div class="plan-card" data-plan-id="${plan.planId}">
        <div class="plan-card-header">
          <div class="plan-card-name-row">
            <h3 class="plan-card-name">${planLabel}</h3>
            <span class="plan-card-minutes">${t(v, "sub.totalMinutes", { n: this._formatInt(totalMinutes) })}</span>
          </div>
          <button type="button" class="plan-card-close" data-action="close" aria-label="Close" data-ga-name="plan_selection_popup__card_close_btn">×</button>
        </div>

        <div class="plan-card-pricing">
          <span class="plan-price-onetime">${t(v, "sub.topUpPrice", { n: price })}</span>
          <p class="plan-price-offer-text">${t(v, "sub.topUpSubtitle")}</p>
        </div>

        <table class="plan-card-table">
          <thead>
            <tr><th></th><th>${t(v, "sub.timeCol")}</th><th>${t(v, "sub.brendysCol")}</th></tr>
          </thead>
          <tbody>
            <tr><td>${t(v, "sub.voiceRow")}</td><td>${this._formatInt(plan.voiceMinApprox)} min</td><td>${this._formatInt(plan.voiceQuota)}</td></tr>
            <tr><td>${t(v, "sub.chatRow")}</td><td>${this._formatInt(plan.chatMinApprox)} min</td><td>${this._formatInt(plan.chatQuota)}</td></tr>
          </tbody>
        </table>

        <button type="button" class="plan-select-btn" data-action="topup" data-plan-id="${plan.planId}" data-plan-label="${planLabel}" data-ga-name="plan_selection_popup__topup_btn">${t(v, "sub.topUpSelect")}</button>

        <p class="plan-card-footnote">${t(v, "sub.timeNote")}</p>
      </div>
    `;
  }

  onPlanCardsClick(e) {
    const closeBtn = e.target.closest('[data-action="close"]');
    if (closeBtn) {
      this.closePlanSelectionOverlay();
      return;
    }
    const selectBtn = e.target.closest('[data-action="select"]');
    if (selectBtn) {
      const planId = selectBtn.getAttribute("data-plan-id");
      const planLabel = selectBtn.getAttribute("data-plan-label");
      const isCurrent = selectBtn.getAttribute("data-current") === "true";
      const sortOrder = Number(selectBtn.getAttribute("data-sort-order") || 0);
      this.onSelectPlan(planId, planLabel, isCurrent, sortOrder);
      return;
    }
    const topUpBtn = e.target.closest('[data-action="topup"]');
    if (topUpBtn) {
      const planLabel = topUpBtn.getAttribute("data-plan-label");
      this.onTopUp(planLabel);
    }
  }

  // Top-up purchases aren't wired to a real purchase flow yet (no one-time
  // IAP / Google Play Billing integration exists) — adds the top-up plan's
  // Brendys straight away, with no charge, as an interim stand-in (see
  // lib/subscriptions.js addTopUp()).
  async onTopUp(planLabel) {
    const v = this.locale.variant;
    const confirmed = window.confirm(t(v, "sub.topUpConfirm", { plan: planLabel }));
    if (!confirmed) return;

    try {
      const res = await fetch("/api/user/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) return;

      this.closePlanSelectionOverlay();
      await this.refreshUsageMonitor();
      window.alert(t(v, "sub.topUpSuccess"));
    } catch {
      // Leave the overlay open so the user can retry.
    }
  }

  async onSelectPlan(planId, planLabel, isCurrent, sortOrder = 0) {
    const v = this.locale.variant;
    if (isCurrent) {
      window.alert(t(v, "sub.alreadyOnPlan"));
      return;
    }

    // Downgrades are deferred to the next billing period (see
    // lib/subscriptions.js switchPlan) — say so up front, before the user
    // confirms, so they're not surprised their plan "didn't change".
    const isDowngrade = sortOrder < (this._currentPlanSortOrder ?? 0);
    const confirmKey = isDowngrade ? "sub.downgradeConfirm" : "sub.switchConfirm";
    const confirmed = window.confirm(t(v, confirmKey, { plan: planLabel }));
    if (!confirmed) return;

    try {
      const res = await fetch("/api/user/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);

      this.closePlanSelectionOverlay();
      await this.refreshUsageMonitor();
      if (data?.deferred) {
        window.alert(t(v, "sub.downgradeScheduled", { plan: planLabel }));
      }
    } catch {
      // Leave the overlay open so the user can retry.
    }
  }

  setMyInfoStatus(msg, isError = false) {
    if (this.elements.myInfoStatus) {
      this.elements.myInfoStatus.textContent = msg || "";
      this.elements.myInfoStatus.style.color = isError ? "#b00020" : "#2563eb";
    }
  }

  setMyInfoBusy(isBusy) {
    [this.elements.myInfoTownInput, this.elements.myInfoStateInput, this.elements.myInfoCountryInput, this.elements.myInfoGender].forEach((el) => {
      if (el) el.disabled = isBusy;
    });
    if (this.elements.myInfoSaveBtn) this.elements.myInfoSaveBtn.disabled = isBusy;
    if (this.elements.myInfoCancelBtn) this.elements.myInfoCancelBtn.disabled = isBusy;
  }

  async populateMyInfoForm() {
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
        if (this.elements.myInfoTownInput) this.elements.myInfoTownInput.value = data.location.city || "";
        if (this.elements.myInfoStateInput) this.elements.myInfoStateInput.value = data.location.state || "";
        if (this.elements.myInfoCountryInput) this.elements.myInfoCountryInput.value = data.location.country || "";
      }
    } catch {
      // ignore — form stays empty
    }
    // Pre-fill gender from in-memory user state (no extra API call needed)
    if (this.elements.myInfoGender) {
      const g = this.user.gender;
      const genderKey = { Woman: "authGenderWoman", Man: "authGenderMan", Other: "authGenderOther" }[g];
      if (genderKey && this.elements.myInfoGenderDefault) {
        this.elements.myInfoGenderDefault.value = g;
        this.elements.myInfoGenderDefault.textContent = t(this.locale.variant, genderKey);
        this.elements.myInfoGender.value = g;
      }
    }
  }

  async openMyInfoOverlay() {
    const o = this.elements.myInfoOverlay;
    if (!o) return;
    this.setMyInfoStatus("");
    // Clear fields first, then populate with saved data
    if (this.elements.myInfoTownInput) this.elements.myInfoTownInput.value = "";
    if (this.elements.myInfoStateInput) this.elements.myInfoStateInput.value = "";
    if (this.elements.myInfoCountryInput) this.elements.myInfoCountryInput.value = "";
    if (this.elements.myInfoGender) this.elements.myInfoGender.value = "";
    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");
    await this.populateMyInfoForm();
    setTimeout(() => this.elements.myInfoTownInput?.focus(), 30);

    const showUsage = !!this.user && !this.user.isAnonymous;
    if (this.elements.usageMonitor) {
      this.elements.usageMonitor.classList.toggle("hidden", !showUsage);
      this.elements.usageMonitor.setAttribute("aria-hidden", String(!showUsage));
    }
    if (showUsage) this.refreshUsageMonitor();
  }

  closeMyInfoOverlay() {
    const o = this.elements.myInfoOverlay;
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
    this.setMyInfoStatus("");
    this.setMyInfoBusy(false);
  }

  onMyInfoButton() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    this.openMyInfoOverlay();
  }

  async onMyInfoSave() {
    if (!this.user) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    const city = (this.elements.myInfoTownInput?.value || "").trim();
    const state = (this.elements.myInfoStateInput?.value || "").trim();
    const country = (this.elements.myInfoCountryInput?.value || "").trim();
    const gender = (this.elements.myInfoGender?.value || "").trim();
    const v = this.locale.variant;

    if (!city) {
      this.setMyInfoStatus(t(v, "myInfoTown") + " is required", true);
      this.elements.myInfoTownInput?.focus();
      return;
    }

    this.setMyInfoBusy(true);
    this.setMyInfoStatus("");

    try {
      // Save location + gender in a single request
      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get_forecast", city, state, country, saveLocation: true, gender }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (data.code === "multiple_locations") {
          const options = (data.candidates || [])
            .map((c) => [c.city, c.state, c.country].filter(Boolean).join(", "))
            .join(" / ");
          this.setMyInfoStatus(`Multiple matches: ${options}. Please be more specific.`, true);
        } else if (data.code === "city_not_found") {
          this.setMyInfoStatus(v.startsWith("es") ? "Ciudad no encontrada. Intenta de nuevo." : "City not found. Please try again.", true);
        } else {
          this.setMyInfoStatus(data.error || `HTTP ${res.status} – ${t(v, "myInfoSaveError")}`, true);
        }
        return;
      }

      if (data.savedGender && this.user) this.user.gender = data.savedGender;

      this.setMyInfoStatus(t(v, "myInfoSaved"));
      setTimeout(() => this.closeMyInfoOverlay(), 600);
    } catch (e) {
      console.error(e);
      this.setMyInfoStatus(e?.message || t(v, "myInfoSaveError"), true);
    } finally {
      this.setMyInfoBusy(false);
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

  onSubjectsButton() {
    if (!this.user || this.user.isAnonymous) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    this.populateSubjectsForm();
    this.openSubjectsOverlay();
  }

  async onSubjectsSave() {
    if (!this.user || this.user.isAnonymous) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    const values = this.collectSubjectsFromForm();
    const v = this.locale.variant;

    this.setSubjectsBusy(true);
    try {
      const res = await this.apiJSON("/api/rds/interests", { method: "POST", body: { interests: values } });
      this.declaredInterests = res.interests ?? values;
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
      ? ["Un momento...", "Déjame ver...", "Enseguida..."]
      : ["One moment...", "Let me think...", "Just a second..."];
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
    this.stopRingback();
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

  async onTalkButton() {
    if (!this.user) { this.openAuthOverlay({ closable: false, resetFields: true }); return; }
    if (this.user.isAnonymous) { window.alert(t(this.locale.variant, "talkRequiresAccount")); return; }

    // Toggle voice connection
    const isDisconnect = this.elements.toggleBtnTalk.classList.contains("btn-disconnect-talk");
    if (!isDisconnect) {
      // One-time disclaimer before the first-ever TALK connection on this
      // account — acceptTalkDisclaimer() re-invokes onTalkButton() once
      // recorded, which then falls through the checks below.
      if (!this.user.talkDisclaimerAcceptedAt) {
        this.openTalkOverlay();
        return;
      }

      // Block starting a new voice session once the voice quota is exhausted —
      // checked fresh here so it reflects usage right up to this click. The
      // server-side WS gate (server.js /api/voice/stream upgrade handler, and
      // voice-proxy/index.js for the standalone deployment) is the hard
      // backstop either way; this just avoids a silent/abrupt connect-then-disconnect.
      try {
        const res = await fetch("/api/user/usage", { credentials: "include", cache: "no-store" });
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (data?.voiceStatus === "exhausted") {
          window.alert(t(this.locale.variant, "voiceQuotaExhausted"));
          this.openPlanSelectionOverlay();
          return;
        }
      } catch {
        // Usage check failed — fail open; the server-side gate still applies.
      }
    }

    // Switch UI to talk
    this.setMode("talk");

    if (isDisconnect) {
      this.hangUp();
      return;
    }
    this.connectVoice();
  }

  onTextButton() {
    if (!this.user) { this.openAuthOverlay({ closable: false, resetFields: true }); return; }

    if (this._lastVoiceStatus !== "disconnected") {
      this._talkDisconnectedByUser = true;
      this.hangUp();
    }
    this.setMode("text");

    // Cold start in WRITE mode: Brenda initiates conversation (only if user hasn't spoken yet this session)
    if (!this._userSpokenThisSession && !this.user?.isAnonymous) {
      setTimeout(async () => {
        try {
          await this._showTextGreetingIfPending();
          // After the long "full" greeting, leave the floor open for the user
          // to greet back / ask something before Brenda starts a topic herself.
          if (this._greetingType === "full" && this._greetingShown) {
            await new Promise(r => setTimeout(r, window.Config?.GREETING_RESPONSE_WINDOW_MS ?? 7000));
          }
          if (this._userSpokenThisSession) return; // user jumped in during the pause
          await this.startConversation();
        } catch (e) {
          console.warn("[rds/text-start]", e);
        }
      }, 300);
    }
  }

  // Emits the pending greeting in the text channel if the checkin decided one
  // is due and it hasn't been shown yet in this mode (mirrors the voice path's
  // guard in maybeSendVoiceGreeting so a mode switch can't skip it).
  async _showTextGreetingIfPending() {
    if (this._greetingShown) return;
    if (!this._greetingType || this._greetingType === "none") return;
    if (!this._greetingText) return;
    this._greetingShown = true;
    await this.emitAssistantLine({ text: this._greetingText, channel: "text", forceNewDateSeparator: true });
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

  // Overwrites an already-persisted message's saved content — used once
  // correctTranscript() resolves, so the corrected (non-fragmented) version
  // is what's still there on reload/history, not the raw fragmented one
  // persistMessage() saved first for responsiveness.
  async updateMessageContent(id, content) {
    if (!this.user || !id || !this._persisted.has(id)) return;
    try {
      await this.apiJSON("/api/conversation/update-message", { method: "POST", body: { id, content } });
    } catch (e) {
      console.warn("Failed to persist corrected transcript:", e?.message || e);
    }
  }

  /* --------------------
     VOICE (TALK)
  -------------------- */
  startRingback() {
    this.stopRingback();
    const generation = ++this._ringbackGeneration;
    const fallback = this.locale?.variant || "en-US";

    // Play instantly on the browser-detected variant — this runs inside the
    // TALK click handler, so calling audio.play() synchronously here (rather
    // than after an awaited fetch) keeps it inside the user-gesture window
    // autoplay policies require.
    this._playRingbackFile(fallback);

    // Refine to the account's saved location, same DB-first precedence
    // resolveLocaleVariant() uses for Brenda's spoken language — swap the
    // loop in place if it resolves to a different variant before the call
    // connects or gives up.
    Promise.resolve(
      window?.Config?.resolveLocaleVariant ? window.Config.resolveLocaleVariant(fallback) : fallback
    )
      .then((resolved) => {
        if (generation !== this._ringbackGeneration) return; // stopped/superseded meanwhile
        if (resolved && resolved !== fallback) this._playRingbackFile(resolved);
      })
      .catch(() => { /* ignore — fallback tone keeps playing */ });
  }

  _playRingbackFile(variant) {
    const file = RINGBACK_FILES[variant] || RINGBACK_FILES["en-US"];
    const audio = new Audio(`audio/ringbacks/${encodeURIComponent(file)}`);
    audio.loop = true;
    audio.volume = 0.5;
    audio.play().catch((e) => console.warn("Ringback playback failed:", e?.message || e));
    if (this._ringbackAudio) { try { this._ringbackAudio.pause(); } catch { } }
    this._ringbackAudio = audio;
  }

  stopRingback() {
    this._ringbackGeneration++; // invalidate any in-flight startRingback() resolution
    if (!this._ringbackAudio) return;
    try {
      this._ringbackAudio.pause();
      this._ringbackAudio.currentTime = 0;
    } catch { }
    this._ringbackAudio = null;
  }

  async connectVoice() {
    try {
      this._voiceGreetingSent = false;
      this.clearVoiceGreetingTimer();
      this.setTalkButtonState({ connected: false, disabled: true });
      this.setConnectingIndicator(true);
      this.startRingback();

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
      this.stopRingback();
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
            this.updateMessageContent(msgId, corrected);
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
              this.updateMessageContent(msgId, corrected);
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
      if (this.callUI === "closed") this.setCallUI("open");
      this.recordVoiceActivity();
      if (status === "speaking" && prevStatus !== "speaking") {
        this.stopRingback(); // Brenda's voice has started — stop the ringback loop
        this.setConnectingIndicator(false); // hide pill only when Brenda actually starts speaking
        this.setThinkingIndicator(false);
        this.flushPendingUserTranscript();
      }
      if (status === "connected" && (prevStatus === "disconnected" || prevStatus === "connecting" || prevStatus === "warming") && !this._voiceGreetingSent) {
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
      this.stopRingback(); // connect gave up (error/disconnected) — stop the ringback loop
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
        this.updateMessageContent(msgId1, corrected);
      });
      return lastMsg;
    }

    this._userSpokenThisSession = true;
    const userMsg = this.addMessage({ role: "user", channel: "voice", text: cleaned, status: "final" });
    this.persistMessage(userMsg);
    this.render();
    const msgId2 = userMsg.id;
    this.correctTranscript(cleaned).then(corrected => {
      if (corrected === cleaned) return;
      const i = this.findMessageIndexById(msgId2);
      if (i >= 0) { this.messages[i].text = corrected; this.render(); }
      this.updateMessageContent(msgId2, corrected);
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

  // "tiempo" is ambiguous in Spanish (weather vs. time/duration, e.g. "¿cuánto
  // tiempo tardo en llegar?"). Keep this list in sync with the equivalent
  // TIEMPO_AS_TIME_PATTERNS / tiempoLooksLikeWeather() in api/chat.js.
  _tiempoLooksLikeWeather(raw) {
    if (!raw.includes("tiempo")) return true;
    const otherWeatherWords = [
      "clima", "pronóstico", "pronostico", "llover", "lluvia",
      "temperatura", "humedad", "viento", "nieve", "tormenta", "soleado", "nublado"
    ];
    if (otherWeatherWords.some((k) => raw.includes(k))) return true;
    const timeNotWeatherPatterns = [
      /\bcu[aá]nto(?:s)?\s+tiempo\b/,
      /\btiempo\b.{0,25}\b(tard[oa]s?|tardan|tardamos|toma(?:s|n|mos)?|llev[oa]s?|llevan|llevamos|dura(?:s|n)?|falta(?:s|n)?|qued[ao]n?)\b/,
      /\b(tard[oa]s?|tardan|tardamos|toma(?:s|n|mos)?|llev[oa]s?|llevan|llevamos|dura(?:s|n)?|falta(?:s|n)?|qued[ao]n?)\b.{0,25}\btiempo\b/,
      /\btiempo\s+libre\b/,
      /\bal\s+mismo\s+tiempo\b/,
      /\bhace\s+tiempo\b/,
      /\btiempo\s+real\b/,
      /\b(?:gan|perd|pierd)\w*\s+(?:el\s+|su\s+|mi\s+|tu\s+|tanto\s+|mucho\s+)?tiempo\b/,
      /\btiempo\s+de\s+espera\b/,
      /\btiempo\s+r[eé]cord\b/,
    ];
    return !timeNotWeatherPatterns.some((re) => re.test(raw));
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
    return list.some((k) => {
      if (!raw.includes(k)) return false;
      if (isSpanish && k === "tiempo" && !this._tiempoLooksLikeWeather(raw)) return false;
      return true;
    });
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
    this._userSpokenThisSession = true;
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
    if (this._chatSessionId) payload.chatSessionId = this._chatSessionId;
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

    // ── Reconnect (after timeout or hang-up) ──────────────────────────────
    if (this._voiceGreetingEverSent) {
      this._voiceGreetingSent = true;
      const wasByUser = this._talkDisconnectedByUser;
      this._talkDisconnectedByUser = false;
      // Only send micro-greeting on timeout reconnect, not on explicit mode switch
      if (!wasByUser && this.mode === "talk" && this._lastVoiceStatus !== "disconnected" && typeof this.agent?.speakText === "function") {
        await this.agent.speakText(this._pickMicroGreeting(), true);
      }
      return;
    }

    // ── First connect this session ─────────────────────────────────────────
    // _greetingType is null if checkin hasn't resolved yet — bail without marking sent
    if (!this._greetingType) return;

    this._voiceGreetingSent = true;
    this._voiceGreetingEverSent = true;
    this._greetingShown = true;

    const sendGreeting = this._greetingType !== "none" && !!this._greetingText;
    if (sendGreeting) {
      try {
        if (this.mode === "talk" && this._lastVoiceStatus !== "disconnected" && typeof this.agent?.speakText === "function") {
          await this.agent.speakText(this._greetingText, true);
        } else {
          await this.emitAssistantLine({ text: this._greetingText, channel: "voice", forceNewDateSeparator: true });
        }
      } catch (e) {
        console.warn("[greeting] Voice greeting failed:", e);
      }
    }

    // Cold start: start RDS conversation after greeting finishes (only if user hasn't spoken yet this session)
    if (!this._userSpokenThisSession && !this.user?.isAnonymous) {
      if (sendGreeting) {
        await new Promise(r => setTimeout(r, 500));   // let Gemini begin speaking
        await this._waitForSpeechEnd(15000);           // wait for greeting to finish
        // After the long "full" greeting, leave the floor open for the user to
        // greet back / ask something before Brenda starts a topic herself.
        const pauseMs = this._greetingType === "full"
          ? (window.Config?.GREETING_RESPONSE_WINDOW_MS ?? 7000)
          : 600;
        await new Promise(r => setTimeout(r, pauseMs));
      } else {
        await new Promise(r => setTimeout(r, 800));
      }
      if (this._userSpokenThisSession) return; // user jumped in during the pause — let the real conversation continue
      this.startConversation().catch(e => console.warn("[rds/auto-start]", e));
    }
  }

  _pickMicroGreeting() {
    const isEs = String(this.locale.variant || "").toLowerCase().startsWith("es");
    const pool = isEs
      ? ["¡Aquí estoy!", "¿Sí?", "¡Dime!", "Te escucho.", "¿Qué me cuentas?"]
      : ["I'm here!", "Yes?", "Go ahead!", "I'm listening.", "What's up?", "Here!"];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  pickSubject() {
    const content = getConversationContent(this.locale.variant);
    const declared = (this.declaredInterests || []).filter(Boolean);
    if (declared.length > 0) return this.randomItem(declared);
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
    const opening   = this.pickOpening();
    const isSpanish = String(this.locale.variant || "").toLowerCase().startsWith("es");

    try {
      const data = await this.apiJSON("/api/rds/topic-starter", {
        method: "POST",
        body: { subject, localeVariant: this.locale.variant },
      });

      const statement = this.ensureOpening(opening, data.statement || "");
      return {
        statement: statement || this.ensureOpening(opening, isSpanish ? `sobre ${subject}.` : `about ${subject}.`),
        question: data.question || (isSpanish ? "¿Qué opinas tú?" : "What's your take on it?"),
      };
    } catch (e) {
      console.error("Error generating topic starter:", e);
      return {
        statement: this.ensureOpening(opening, isSpanish ? `sobre ${subject}.` : `about ${subject}.`),
        question: isSpanish ? "¿Qué te parece?" : "Do you have any thoughts on that?",
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

  async startConversation() {
    const isVoiceMode = this.mode === "talk";
    if (!this.user && !isVoiceMode) {
      this.openAuthOverlay({ closable: false, resetFields: true });
      return;
    }
    if (this._startingConversation) return;

    this._startingConversation = true;
    const channel = this.mode === "text" ? "text" : "voice";

    try {
      const subject = this.pickSubject();
      const { statement, question } = await this.generateTopicStarter(subject);

      if (isVoiceMode) {
        const ok = await this.speakExactLine(statement);
        if (!ok) await this.agent.speakText(statement);
      } else {
        await this.emitAssistantLine({ text: statement, channel });
      }

      if (isVoiceMode) await new Promise(r => setTimeout(r, 600));

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
   * Local "day bucket" for this device (YYYY-MM-DD), rolled back to the
   * previous day for hours before 2am so a late-night chat doesn't get a
   * jarring "good morning" a few minutes later. Sent to /api/greeting so the
   * server can tell "new day" from "same day, hours later" using the user's
   * actual local calendar day rather than a server-side UTC comparison.
   */
  _localDayBucket(date = new Date()) {
    const d = new Date(date);
    if (d.getHours() < 2) d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

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
      const localDay = this._localDayBucket();
      const data = await this.apiJSON(`/api/greeting?localDay=${encodeURIComponent(localDay)}`, { method: "GET" });
      const greetingType = data?.greetingType || "none";

      // Reset session-level state (but NOT _greetingType/_greetingText yet —
      // those must be set atomically below to avoid the voice-greeting race).
      this._greetingShown          = false;
      this._voiceGreetingEverSent  = false;
      this._talkDisconnectedByUser = false;
      this._userSpokenThisSession  = false;

      if (Array.isArray(data?.declaredInterests)) {
        this.declaredInterests = data.declaredInterests;
      }
      if (greetingType !== "none" || !this._chatSessionId) {
        this._chatSessionId = crypto.randomUUID();
      }

      const displayName = this.user.isAnonymous
        ? ""
        : (this.user.displayName || this.user.username || "").trim();

      // Build greeting text synchronously (no awaits) BEFORE setting _greetingType,
      // so the voice greeting timer can never observe _greetingType set but _greetingText null.
      let greetingText = null;
      if (greetingType === "full") {
        greetingText = this.buildFullGreeting(displayName);
      } else if (greetingType === "short") {
        greetingText = this.buildShortGreeting(displayName);
      }

      // Atomic: both fields written with no await between them.
      this._greetingText = greetingText;
      this._greetingType = greetingType;

      // Secondary race guard: if voice already connected and the 1-second greeting
      // timer fired before this resolved (e.g. on cold-start Render), re-trigger it.
      if (greetingType !== "none"
          && this.mode === "talk"
          && !this._voiceGreetingSent
          && !this._voiceGreetingEverSent
          && !this._voiceGreetingTimer
          && (this._lastVoiceStatus === "connected" || this._lastVoiceStatus === "speaking")) {
        this.scheduleVoiceGreeting();
      }

      // Deliver pending task reminders (non-fatal)
      if (data?.pendingReminders?.length) {
        await this.taskManager.deliverReminders(data.pendingReminders, displayName, this.locale.variant);
      }

      // RDS first-time intro
      if (data?.rdsIntroNeeded && !this.user?.isAnonymous) {
        const introText = this._buildRdsIntro(displayName);
        await this.emitAssistantLine({ text: introText, channel: "text" });
        this.apiJSON("/api/rds/state", {
          method: "POST",
          body: { action: "intro-shown" },
        }).then(() => console.log("[rds] intro-shown confirmed"))
          .catch(e => console.error("[rds] intro-shown POST failed:", e.message));
      }

      // RDS idle-timeout proactive initiation (opt-in, default off)
      this._startRdsIdleTimer();

      if (greetingType === "none") return;

      // Text mode: emit right now, after history is already rendered.
      // Voice mode: _greetingText is already stored; scheduleVoiceGreeting() picks it up.
      if (this.mode === "text") {
        await this._showTextGreetingIfPending();
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

  // ── RDS helpers ───────────────────────────────────────────────────────────

  _buildRdsIntro(displayName) {
    const v    = this.locale.variant;
    const name = (displayName || "").trim();
    const isEs = v.startsWith("es");
    if (isEs) {
      return (name ? `Hola, ${name}.\n\n` : "Hola.\n\n") +
        "Soy Brenda, tu vecina virtual. Me alegra mucho conocerte.\n\n" +
        "Antes de que empecemos a charlar, me gustaría contarte un poco sobre mí: me encantan las buenas conversaciones, " +
        "escuchar las historias de la gente y compartir esos pequeños detalles que dicen quién es uno — la familia, la comida favorita, " +
        "la música y los recuerdos, los lugares donde se ha vivido, las cosas que se hacían de joven y cómo se piensa y se siente hoy. Ese tipo de cosas.\n\n" +
        "Algo importante: yo no soy una Red Social. Nuestras conversaciones son totalmente privadas. " +
        "No las compartiré conscientemente con nadie más. Dicho esto, es mejor ser precavida en Internet. " +
        "Por favor, no compartas datos delicados como información bancaria, cuentas, asuntos legales o médicos, etc. " +
        "Haré todo lo posible por guardar todo con discreción, pero en Internet nunca se sabe del todo. No tengas miedo, pero no te expongas.\n\n" +
        "Por eso mismo, ten en cuenta que recuerdo lo que hablamos de una conversación a otra, para que nuestra relación crezca cada vez que charlamos. " +
        "Si alguna vez recuerdo algo mal, o hay algo que prefieres que no guarde, dímelo. " +
        "Si, por ejemplo, menciono que te gusta la piña en la pizza, puedes decirme «olvida eso» y lo borraré de mi memoria sin preguntas.\n\n" +
        "También tengo costumbre de irme por las ramas con historias de mi propia vida de vez en cuando. " +
        "No dudes en interrumpirme o cambiar de tema cuando quieras. " +
        "Espero que disfrutes de nuestra conversación tanto como yo.\n\n" +
        "¡Vamos allá!";
    }
    return (name ? `Hello, ${name}.\n\n` : "Hello.\n\n") +
      "I'm Brenda, your friendly virtual neighbor. It's lovely to meet you.\n\n" +
      "I'd like to tell you a little about myself before we start chatting away — " +
      "I enjoy good conversations, hearing people's stories, and sharing the small details that tell you who someone is. " +
      "Family, favorite foods, music and memories, the places people have lived, the things they got up to when they were young " +
      "and how they think and feel today. That sort of thing.\n\n" +
      "Very important: I am not Social Media. Our conversations are totally private. " +
      "I won't knowingly share them with anybody else. Nonetheless, it's better to be extra careful on the Internet. " +
      "Please do not share any risky or private information such as banking details, accounts, legal or medical matters, etc. " +
      "I promise I'll do my best to keep everything in the vault but one never knows what can happen. " +
      "Don't be afraid, but don't be at risk.\n\n" +
      "For that reason, keep in mind that I remember what we talk about, conversation to conversation, " +
      "so our relationship grows every time we talk or write to each other. " +
      "Should I ever remember something wrong, or there's something you'd rather I do not remember, just tell me. " +
      "If, for example, I mention you like pineapple on your pizza, you can say \"forget that\" and I'll erase it from my memory, no explanation needed.\n\n" +
      "I also have a habit of wandering off into stories from my own life now and then. " +
      "Please jump in and interrupt or change the subject whenever you want. " +
      "In any case, I hope you can enjoy my conversation as much as I enjoy yours.\n\n" +
      "Let's get to it!";
  }

  // "New Topic" button — pick a fresh RDS subject in whatever mode is active
  async onChatButton() {
    if (!this.user || this.user.isAnonymous) return;
    await this.startConversation();
  }

  // Proactive idle-timer — opt-in via localStorage, default off
  _startRdsIdleTimer() {
    if (this._rdsIdleTimer) clearTimeout(this._rdsIdleTimer);
    this._rdsIdleDeclinedThisSession = false;

    const enabled = localStorage.getItem("brenda_rds_proactive") === "1";
    if (!enabled || this.user?.isAnonymous) return;

    const thresholdMs = parseInt(localStorage.getItem("brenda_rds_idle_ms") || "1800000", 10); // 30 min default
    const hour = new Date().getHours();
    if (hour < 8 || hour >= 22) return;   // respect quiet hours

    this._rdsIdleTimer = setTimeout(async () => {
      if (this._rdsIdleDeclinedThisSession) return;
      const v    = this.locale.variant;
      const isEs = v.startsWith("es");
      const name = this.user?.displayName || this.user?.username || "";
      const opener = isEs
        ? `¡Hola${name ? ", " + name : ""}! ¿Tienes un momento para charlar?`
        : `Hi${name ? ", " + name : ""}! Would you like to chat now, or are you busy?`;
      await this.emitAssistantLine({ text: opener, channel: "text" });
      this._rdsProactiveShown = true;
    }, thresholdMs);
  }

  /**
   * Builds a time-of-day-aware full greeting (new day / first use).
   * @param {string} displayName  Empty string for anonymous sessions.
   */
  buildFullGreeting(displayName) {
    const hour = new Date().getHours();
    let bucket;
    if (this.locale.variant === "es-ES") {
      // Spain schedule: lunch extends morning; siesta shifts afternoon later
      if      (hour >= 5  && hour < 14) bucket = "morning";
      else if (hour >= 14 && hour < 20) bucket = "afternoon";
      else if (hour >= 20 && hour < 22) bucket = "evening";
      else                               bucket = "night";
    } else {
      if      (hour >= 5  && hour < 12) bucket = "morning";
      else if (hour >= 12 && hour < 18) bucket = "afternoon";
      else if (hour >= 18 && hour < 21) bucket = "evening";
      else                               bucket = "night";
    }

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
   * Builds a short, casual "welcome back" greeting (same day, a few hours later).
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

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics();
  window.__app = new BrendaApp();
});

