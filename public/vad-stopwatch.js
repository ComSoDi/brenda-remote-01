/* ────────────────────────────────────────────────────────────────────────────
 * vad-stopwatch.js  —  TEMPORARY on-screen latency stopwatch (voice testing)
 *
 * Measures the gap between "user stopped talking" and "Brenda starts to answer",
 * to eyeball the effect of VAD tuning (GEMINI_VAD_SILENCE_DURATION_MS, etc.).
 *
 *   • while you speak            → shows 0.00 s (black), not counting
 *   • the moment you stop        → starts counting, BLACK
 *   • your transcript settles    → turns RED  (Gemini has closed the turn —
 *                                  best client-side proxy for "its VAD fired")
 *   • Brenda's first audio chunk → freezes, holding the final time in red
 *   • you start talking again    → back to 0.00 s
 *
 * "Stopped talking" is detected from the mic (precise) when the room is quiet
 * enough, and automatically from the speech-transcript stream instead when the
 * ambient noise floor is too high to trust the mic (fan / wind / traffic).
 *
 * Shows only while Talk mode is selected. Pure overlay (pointer-events:none,
 * no layout impact). Wraps the voice-agent callbacks at runtime; edits nothing
 * in app.js / voiceAgent.js.
 *
 * TO DISABLE : comment out the <script src="vad-stopwatch.js"> line in index.html
 * TO REMOVE  : delete that line and this file.
 *
 * Console knobs (all live; call .save() to keep them across reloads):
 *   window.VAD_STOPWATCH.MIC = "auto" | true | false   // start-signal source
 *   window.VAD_STOPWATCH.NOISE_CUTOFF = 0.018          // auto: mic off above this floor
 *   window.VAD_STOPWATCH.SILENCE_HOLD_MS = 180
 *   window.VAD_STOPWATCH.TRANSCRIPT_STALL_MS = 450
 *   window.VAD_STOPWATCH.REARM_MS = 260
 *   window.VAD_STOPWATCH.SPEAKING_RMS = 0.03           // used when MIC === true (fixed gate)
 *   window.VAD_STOPWATCH.OFFSET_Y = 0.5 ; .NUDGE_PX = -7
 *   window.VAD_STOPWATCH.debug = true
 *   window.VAD_STOPWATCH.save()    // persist current knobs to localStorage
 *   window.VAD_STOPWATCH.reset()   // clear persisted knobs + reload
 * ──────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var CFG = (window.VAD_STOPWATCH = window.VAD_STOPWATCH || {});
  var LS_KEY = "vadsw";
  var PERSIST = ["MIC", "NOISE_CUTOFF", "SPEAKING_RMS", "SILENCE_RMS", "SILENCE_HOLD_MS",
    "TRANSCRIPT_STALL_MS", "REARM_MS", "OFFSET_Y", "NUDGE_PX", "debug"];

  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    for (var sk in saved) if (Object.prototype.hasOwnProperty.call(saved, sk)) CFG[sk] = saved[sk];
  } catch (e) { /* private mode etc. */ }

  CFG.MIC                 = CFG.MIC                 ?? "auto";  // "auto" | true | false
  CFG.NOISE_CUTOFF        = CFG.NOISE_CUTOFF        ?? 0.018;   // auto: mic considered unusable above this ambient floor
  CFG.SPEAKING_RMS        = CFG.SPEAKING_RMS        ?? 0.030;   // fixed gate, used only when MIC === true
  CFG.SILENCE_RMS         = CFG.SILENCE_RMS         ?? 0.008;   // (reserved)
  CFG.SILENCE_HOLD_MS     = CFG.SILENCE_HOLD_MS     ?? 180;     // silence this long → "stopped talking"
  CFG.TRANSCRIPT_STALL_MS = CFG.TRANSCRIPT_STALL_MS ?? 450;     // no new transcript this long → black→red
  CFG.REARM_MS            = CFG.REARM_MS            ?? 260;      // once counting, need this much CONTINUOUS speech to reset (ignores blips)
  CFG.OFFSET_Y            = CFG.OFFSET_Y            ?? 0.5;      // vertical drop = this × changeSubjectBtn height
  CFG.NUDGE_PX            = CFG.NUDGE_PX            ?? -7;

  CFG.save = function () {
    var keep = {};
    PERSIST.forEach(function (k) { if (CFG[k] !== undefined) keep[k] = CFG[k]; });
    try { localStorage.setItem(LS_KEY, JSON.stringify(keep)); } catch (e) {}
    return keep;
  };
  CFG.reset = function () { try { localStorage.removeItem(LS_KEY); } catch (e) {} location.reload(); };

  var RED = "#c0392b";
  var BLACK = "#000";
  var LOUD_WINDOW_MS = 120;   // "still hearing speech" if a loud chunk landed within this

  var el = null, anchorBtn = null, changeBtn = null;

  // state: idle | talking | black | red | frozen
  var state = "idle";
  var t0 = 0;                 // performance.now() ms — when the user stopped talking
  var lastLoudAt = 0;         // last chunk at/above the speaking gate
  var loudRunStart = 0;       // start of the current uninterrupted run of loud chunks
  var lastUserTxAt = 0;       // last user-transcript fragment
  var haveTx = false;         // got at least one user-transcript fragment this turn
  var noiseFloor = 0.015;     // adaptive (frozen while counting)
  var brendaSpeaking = false;
  var _dbgLast = 0;

  function micUsable() {
    if (CFG.MIC === true) return true;
    if (CFG.MIC === false) return false;
    return noiseFloor < CFG.NOISE_CUTOFF;              // "auto"
  }

  function make() {
    el = document.createElement("div");
    el.id = "vadStopwatch";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = [
      "position:fixed", "z-index:45", "pointer-events:none",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "font-weight:300", "font-size:13px", "line-height:1.1", "letter-spacing:.02em",
      "color:" + BLACK, "background:none", "white-space:nowrap",
      "transition:color .08s linear", "display:none",
    ].join(";");
    el.textContent = "0.00 s";
    document.body.appendChild(el);
  }

  function place() {
    if (!el) return;
    anchorBtn = anchorBtn || document.getElementById("taskBtn");
    changeBtn = changeBtn || document.getElementById("changeSubjectBtn");
    if (!anchorBtn) return;
    var r = anchorBtn.getBoundingClientRect();
    var ch = changeBtn ? changeBtn.getBoundingClientRect().height : r.height;
    el.style.left = Math.round(r.left) + "px";
    el.style.top = Math.round(r.bottom + ch * CFG.OFFSET_Y + CFG.NUDGE_PX) + "px";
  }

  function fmt(ms) { return (Math.max(0, ms) / 1000).toFixed(2) + " s"; }

  var baseText = "0.00 s", baseColor = BLACK;
  function dbgTag() {
    return " [" + state + (micUsable() ? "·mic" : "·txt") +
      (brendaSpeaking ? "·B" : "") + (patched ? "" : "·NOHOOK") + "]";
  }
  function paint(txt, color) {
    if (!el) return;
    if (txt != null) baseText = txt;
    if (color) baseColor = color;
    el.textContent = CFG.debug ? baseText + dbgTag() : baseText;
    el.style.color = baseColor;
  }

  // ── signals ───────────────────────────────────────────────────────────────
  function onMic(float32) {
    if (!float32 || !float32.length || brendaSpeaking) return;
    var s = 0;
    for (var i = 0; i < float32.length; i++) { var v = float32[i]; s += v * v; }
    var rms = Math.sqrt(s / float32.length);
    var now = performance.now();

    // Adaptive noise floor — asymmetric EMA, FROZEN while a measurement runs so
    // the gate can't collapse mid-count. Hard-clamped low so a breath/click
    // can't look like speech.
    if (state === "idle" || state === "talking") {
      var k = rms > noiseFloor ? 0.0008 : 0.03;
      noiseFloor += (rms - noiseFloor) * k;
      if (noiseFloor < 0.005) noiseFloor = 0.005;
      else if (noiseFloor > 0.06) noiseFloor = 0.06;
    }

    var gate = (CFG.MIC === true) ? CFG.SPEAKING_RMS : (noiseFloor * 4 + 0.006);
    if (rms >= gate) {
      if (now - lastLoudAt > 90) loudRunStart = now;   // fresh run after a gap
      lastLoudAt = now;
    }

    if (CFG.debug && now - _dbgLast > 150) {
      _dbgLast = now;
      console.log("[vad-stopwatch]", state,
        "| rms", rms.toFixed(4), "floor", noiseFloor.toFixed(4), "gate", gate.toFixed(4),
        "| runMs", (lastLoudAt - loudRunStart).toFixed(0),
        "| mic", micUsable() ? "on" : "off", "(" + CFG.MIC + ")");
    }
  }

  function onTranscript(role) {
    if (role === "user") { lastUserTxAt = performance.now(); haveTx = true; }
  }

  function onStatus(name) {
    if (name === "speaking") {
      brendaSpeaking = true;
      if (state === "black" || state === "red") {
        paint(fmt(performance.now() - t0), RED);
        state = "frozen";
      }
    } else if (name === "connected" || name === "disconnected") {
      brendaSpeaking = false;
    }
  }

  // ── state machine (~40ms) ────────────────────────────────────────────────
  function step() {
    if (!el) return;
    if (CFG.debug) paint();                 // refresh the on-screen debug tag every tick
    var now = performance.now();
    var m = micUsable();

    var recentlyLoud = m && (now - lastLoudAt < LOUD_WINDOW_MS);
    var sustainedLoud = recentlyLoud && (lastLoudAt - loudRunStart) >= CFG.REARM_MS;
    var recentTx = haveTx && (now - lastUserTxAt < 350);
    var txStalled = haveTx && (now - lastUserTxAt >= CFG.SILENCE_HOLD_MS);

    if (brendaSpeaking) return;

    if (state === "idle" || state === "frozen") {
      if (recentlyLoud || recentTx) {
        state = "talking";
        haveTx = recentTx;                      // keep only this turn's transcript timing
        lastUserTxAt = recentTx ? now : 0;
        if (!recentlyLoud) loudRunStart = 0;
        paint("0.00 s", BLACK);
      }
      return;
    }

    if (state === "talking") {
      paint("0.00 s", BLACK);
      var stopped = m
        ? (!recentlyLoud && (now - lastLoudAt) >= CFG.SILENCE_HOLD_MS && lastLoudAt > 0)
        : (haveTx && (now - lastUserTxAt) >= CFG.SILENCE_HOLD_MS);
      if (stopped) {
        t0 = m ? (lastLoudAt || now) : (lastUserTxAt || now);
        state = "black";
        paint(fmt(now - t0), BLACK);
      }
      return;
    }

    if (state === "black" || state === "red") {
      // Re-arm ("user started talking again") only from a SUSTAINED speech run,
      // and only when the mic is trusted — transcript re-arm is unreliable
      // (late fragments of the same utterance would false-trigger).
      if (m && sustainedLoud) { state = "talking"; haveTx = false; lastUserTxAt = 0; paint("0.00 s", BLACK); return; }
      if (state === "black" && haveTx && (now - lastUserTxAt) >= CFG.TRANSCRIPT_STALL_MS) state = "red";
      paint(fmt(now - t0), state === "red" ? RED : BLACK);
      return;
    }
  }

  // ── wiring ───────────────────────────────────────────────────────────────
  var patched = false;

  function ensurePatched() {
    // Instance-level callbacks (mic / transcript). Re-runs harmlessly; re-wraps
    // if app.js reassigns them on a later connect.
    var ag = window.__app && window.__app.agent;
    if (ag && !ag.__vadswPatched) {
      var oA = ag.onAudioData, oT = ag.onTranscript;
      ag.onAudioData  = function (d)    { try { onMic(d); } catch (e) {}           return oA && oA.apply(this, arguments); };
      ag.onTranscript = function (role) { try { onTranscript(role); } catch (e) {} return oT && oT.apply(this, arguments); };
      ag.__vadswPatched = true;
      patched = true;
    }
    return patched;
  }

  function patchPrototype() {
    // Status is the STOP signal + the brendaSpeaking gate — patch it on the
    // prototype so it's caught no matter how late the agent instance appears
    // or how often app.js rewires the instance callback.
    var VA = window.VoiceAgent;
    if (!VA || !VA.prototype || VA.prototype.__vadswStatus) return false;
    var orig = VA.prototype.updateStatus;
    if (typeof orig !== "function") return false;
    VA.prototype.updateStatus = function (s) {
      try { onStatus(s); } catch (e) {}
      return orig.apply(this, arguments);
    };
    VA.prototype.__vadswStatus = true;
    return true;
  }

  function sync() {
    var app = window.__app;
    var inTalk = !!(app && app.mode === "talk");
    if (el) el.style.display = inTalk ? "block" : "none";
    if (inTalk) place();
    if (!inTalk && state !== "idle") { state = "idle"; haveTx = false; lastUserTxAt = 0; paint("0.00 s", BLACK); }
  }

  // Console diagnostic — call window.VAD_STOPWATCH.status()
  CFG.status = function () {
    return {
      patched: patched, protoPatched: !!(window.VoiceAgent && window.VoiceAgent.prototype.__vadswStatus),
      state: state, mode: window.__app && window.__app.mode,
      micUsable: micUsable(), MIC: CFG.MIC, noiseFloor: +noiseFloor.toFixed(4),
      brendaSpeaking: brendaSpeaking, haveTx: haveTx,
      lastLoudAgoMs: lastLoudAt ? Math.round(performance.now() - lastLoudAt) : null,
      lastTxAgoMs: lastUserTxAt ? Math.round(performance.now() - lastUserTxAt) : null,
    };
  };

  function boot() {
    try { if (/[?&]vadsw=debug\b/.test(location.search)) CFG.debug = true; } catch (e) {}
    make();
    patchPrototype();
    // keep trying forever (cheap) — Render cold starts can push app init well
    // past 20 s on a slow connection
    setInterval(function () { ensurePatched(); patchPrototype(); }, 400);
    setInterval(step, 40);
    setInterval(sync, 500);
    window.addEventListener("resize", place, { passive: true });
    window.addEventListener("scroll", place, { passive: true, capture: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
