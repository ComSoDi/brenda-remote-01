/* ────────────────────────────────────────────────────────────────────────────
 * vad-stopwatch.js  —  TEMPORARY on-screen latency stopwatch (voice testing)
 *
 * Measures the gap between "user stopped talking" and "Brenda starts to answer",
 * to eyeball the effect of VAD tuning (GEMINI_VAD_SILENCE_DURATION_MS, etc.).
 *
 * STAGES (shown as the description line in debug mode; the timer colour mirrors it):
 *   idle      — no turn in progress (between conversations / before you speak). "0.00 s".
 *   talking   — you are speaking, or Gemini is still transcribing what you said. "0.00 s",
 *               not counting.
 *   waiting   — you have stopped; the clock is running, shown in BLACK. This span is
 *               dominated by Gemini's server-side VAD still "listening" for more speech
 *               (GEMINI_VAD_SILENCE_DURATION_MS) before it commits your turn. Lowering
 *               that env var should shrink this stage.
 *   replying  — your transcript has settled ⇒ Gemini has closed your turn and the model
 *               is generating. Timer turns RED. This span ≈ model time-to-first-audio.
 *   done      — Brenda's audio has started; timer stopped, holding the total
 *               (waiting + replying) in RED until you talk again.
 *
 * DEBUG LINE (second line, `?vadsw=debug` or VAD_STOPWATCH.debug = true):
 *   "<stage> · <mic|txt> [· Brenda speaking] [· NO-HOOK]   r<n> g<n> f<n>"
 *     mic|txt        — which "stopped talking" signal is active. Auto-mode uses the mic
 *                      (precise) while the room is quiet and switches to the speech-
 *                      transcript stream when the noise floor is too high to trust it
 *                      (fan / wind / traffic).
 *     Brenda speaking — her audio is playing (detection is paused).
 *     NO-HOOK         — the script failed to attach to the voice agent (should not appear).
 *     r = rms   (×1000) — current mic loudness this frame (root-mean-square amplitude).
 *     g = gate  (×1000) — adaptive speech/silence threshold: sits ~22% of the way from
 *                         the noise floor up to the speech level learned from your voice.
 *                         r ≥ g ⇒ "speaking";  r < g ⇒ "quiet".
 *     f = floor (×1000) — learned background-noise level (mic RMS when you're not
 *                         talking). g is derived from it; when f approaches NOISE_CUTOFF
 *                         auto-mode drops from "mic" to "txt".
 *
 * Shows only while Talk mode is selected. Pure overlay (pointer-events:none,
 * no layout impact). Wraps the voice-agent callbacks at runtime; edits nothing
 * in app.js / voiceAgent.js.
 *
 * TO DISABLE : comment out the <script src="vad-stopwatch.js"> line in index.html
 * TO REMOVE  : delete that line and this file.
 *
 * Console knobs (all live; call .save() to keep them across reloads):
 *   window.VAD_STOPWATCH.MIC = "auto" | true | false   // "stopped talking" signal source
 *   window.VAD_STOPWATCH.NOISE_CUTOFF = 0.026          // auto: use txt (not mic) above this floor
 *   window.VAD_STOPWATCH.SILENCE_HOLD_MS = 260         // MIC: silence this long ⇒ "stopped"
 *   window.VAD_STOPWATCH.MIN_SPEECH_MS = 120           // MIC: last speech run must be ≥ this
 *   window.VAD_STOPWATCH.RUN_GAP_MS = 180              // MIC: silence longer than this ends a speech run
 *   window.VAD_STOPWATCH.TX_STOP_MS = 650              // TXT: no fragment this long ⇒ "stopped"
 *   window.VAD_STOPWATCH.TRANSCRIPT_STALL_MS = 450     // waiting→replying: transcript quiet this long
 *   window.VAD_STOPWATCH.REARM_MS = 260               // MIC: continuous speech needed to reset while counting
 *   window.VAD_STOPWATCH.SPEAKING_RMS = 0.03           // fixed gate, only when MIC === true
 *   window.VAD_STOPWATCH.OFFSET_Y = 0.5 ; .NUDGE_PX = -7   // on-screen position
 *   window.VAD_STOPWATCH.debug = true
 *   window.VAD_STOPWATCH.status()  // dump internal state
 *   window.VAD_STOPWATCH.save()    // persist current knobs to localStorage
 *   window.VAD_STOPWATCH.reset()   // clear persisted knobs + reload
 * ──────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var CFG = (window.VAD_STOPWATCH = window.VAD_STOPWATCH || {});
  var LS_KEY = "vadsw";
  var PERSIST = ["MIC", "NOISE_CUTOFF", "SPEAKING_RMS", "SILENCE_RMS", "SILENCE_HOLD_MS",
    "MIN_SPEECH_MS", "RUN_GAP_MS", "TX_STOP_MS", "TRANSCRIPT_STALL_MS", "REARM_MS", "OFFSET_Y", "NUDGE_PX", "debug"];

  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    for (var sk in saved) if (Object.prototype.hasOwnProperty.call(saved, sk)) CFG[sk] = saved[sk];
  } catch (e) { /* private mode etc. */ }

  CFG.MIC                 = CFG.MIC                 ?? "auto";  // "auto" | true | false
  CFG.NOISE_CUTOFF        = CFG.NOISE_CUTOFF        ?? 0.026;   // auto: mic considered unusable above this ambient floor
  CFG.SPEAKING_RMS        = CFG.SPEAKING_RMS        ?? 0.030;   // fixed gate, used only when MIC === true
  CFG.SILENCE_RMS         = CFG.SILENCE_RMS         ?? 0.008;   // (reserved)
  CFG.SILENCE_HOLD_MS     = CFG.SILENCE_HOLD_MS     ?? 260;     // MIC: silence this long → "stopped talking"
  CFG.MIN_SPEECH_MS       = CFG.MIN_SPEECH_MS       ?? 120;     // MIC: last speech run must have lasted this long to count as a real turn
  CFG.RUN_GAP_MS          = CFG.RUN_GAP_MS          ?? 180;     // MIC: a silence longer than this ends the current speech run
  CFG.TX_STOP_MS          = CFG.TX_STOP_MS          ?? 650;     // TRANSCRIPT: no new fragment this long → "stopped talking" (must clear mid-utterance gaps)
  CFG.TRANSCRIPT_STALL_MS = CFG.TRANSCRIPT_STALL_MS ?? 450;     // black→red: transcript settled this long after counting started
  CFG.REARM_MS            = CFG.REARM_MS            ?? 260;      // MIC: once counting, need this much CONTINUOUS speech to reset (ignores blips)
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

  var elTime = null, elDbg = null;

  function make() {
    el = document.createElement("div");
    el.id = "vadStopwatch";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = [
      "position:fixed", "z-index:45", "pointer-events:none",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "letter-spacing:.02em", "background:none", "display:none",
      "max-width:60vw",
    ].join(";");

    elTime = document.createElement("div");
    elTime.style.cssText = "font-weight:300;font-size:13px;line-height:1.15;white-space:nowrap;color:" + BLACK + ";transition:color .08s linear";
    elTime.textContent = "0.00 s";

    elDbg = document.createElement("div");
    elDbg.style.cssText = "font-weight:400;font-size:10px;line-height:1.25;color:#555;white-space:normal;display:none";

    el.appendChild(elTime);
    el.appendChild(elDbg);
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
  var _rms = 0, _gate = 0;               // last mic frame — for the debug line

  // Operational stage names (not colour names).
  var STAGE = { idle: "idle", talking: "talking", black: "waiting", red: "replying", frozen: "done" };
  function m3(x) { return Math.round(x * 1000); }
  function dbgLine() {
    var now = performance.now();
    var runMs = lastLoudAt ? Math.round(lastLoudAt - loudRunStart) : 0;
    var quietMs = lastLoudAt ? Math.round(now - lastLoudAt) : 0;
    var txMs = lastUserTxAt ? Math.round(now - lastUserTxAt) : 0;
    return STAGE[state] + " · " + (micUsable() ? "mic" : "txt") +
      (brendaSpeaking ? " · Brenda speaking" : "") +
      (patched ? "" : " · NO-HOOK") +
      "  r" + m3(_rms) + " g" + m3(_gate) + " f" + m3(noiseFloor) +
      "  run" + runMs + " quiet" + quietMs + " tx" + txMs;
  }
  function paint(txt, color) {
    if (!el) return;
    if (txt != null) baseText = txt;
    if (color) baseColor = color;
    if (elTime) { elTime.textContent = baseText; elTime.style.color = baseColor; }
    if (elDbg) {
      elDbg.style.display = CFG.debug ? "block" : "none";
      if (CFG.debug) elDbg.textContent = dbgLine();
    }
  }

  // ── signals ───────────────────────────────────────────────────────────────
  var speechEnv = 0.02;   // envelope of recent speech-level RMS — fast attack, slow release

  function onMic(float32) {
    if (!float32 || !float32.length || brendaSpeaking) return;
    var s = 0;
    for (var i = 0; i < float32.length; i++) { var v = float32[i]; s += v * v; }
    var rms = Math.sqrt(s / float32.length);
    var now = performance.now();
    _rms = rms;

    // Adapt floor + speech envelope only when NOT measuring, so the gate is
    // stable for the whole count.
    if (state === "idle" || state === "talking") {
      var k = rms > noiseFloor ? 0.0008 : 0.03;          // creep up slow, drop fast
      noiseFloor += (rms - noiseFloor) * k;
      if (noiseFloor < 0.003) noiseFloor = 0.003;
      else if (noiseFloor > 0.06) noiseFloor = 0.06;

      if (rms > noiseFloor * 2) {                         // learn the real speech level
        speechEnv += (rms - speechEnv) * (rms > speechEnv ? 0.25 : 0.004);
      }
      if (speechEnv < noiseFloor + 0.006) speechEnv = noiseFloor + 0.006;
      else if (speechEnv > 0.4) speechEnv = 0.4;
    }

    // RELATIVE gate: a fraction of the way from the noise floor up to the
    // learned speech level. Auto-scales to whatever this mic actually delivers
    // (phone mics with heavy AGC can put speech RMS at ~0.012 — a fixed 0.026
    // gate would never trip, so the clock would "start" the moment you began).
    var gate;
    if (CFG.MIC === true) gate = CFG.SPEAKING_RMS;
    else {
      var rel = noiseFloor + (speechEnv - noiseFloor) * 0.22;
      var absMin = noiseFloor * 1.5 + 0.0015;
      gate = Math.max(rel, absMin);
    }
    _gate = gate;

    if (rms >= gate) {
      if (now - lastLoudAt > CFG.RUN_GAP_MS) loudRunStart = now;   // fresh run after a real gap (not inter-syllable dips)
      lastLoudAt = now;
    }

    if (CFG.debug && now - _dbgLast > 150) {
      _dbgLast = now;
      console.log("[vad-stopwatch]", state,
        "| rms", rms.toFixed(4), "floor", noiseFloor.toFixed(4),
        "env", speechEnv.toFixed(4), "gate", gate.toFixed(4),
        "| runMs", (lastLoudAt - loudRunStart).toFixed(0),
        "| mic", micUsable() ? "on" : "off");
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
      var micSpokeEnough = (lastLoudAt - loudRunStart) >= CFG.MIN_SPEECH_MS;
      var micQuiet = m && !recentlyLoud && lastLoudAt > 0 &&
        (now - lastLoudAt) >= CFG.SILENCE_HOLD_MS && micSpokeEnough;
      var txStopped = haveTx && (now - lastUserTxAt) >= CFG.TX_STOP_MS;
      // Hard transcript stall + mic not currently loud: the user has clearly
      // stopped even if the mic run never looked "clean" (choppy signal, high
      // gate). Without this, a flaky mic could keep it stuck on 0.00 s for
      // whole turns.
      var txStalledHard = txStopped && !recentlyLoud && (now - lastUserTxAt) >= CFG.TX_STOP_MS * 2;

      var stopped, anchorMic;
      if (m && haveTx) {
        // Prefer agreement (kills the mid-utterance false start); fall back to
        // whichever signal is unambiguous on its own.
        if (micQuiet && (txStopped || (now - lastLoudAt) > 2000)) { stopped = true; anchorMic = true; }
        else if (txStalledHard) { stopped = true; anchorMic = false; }
        else stopped = false;
      } else if (m) {
        // mic-only (no transcript this turn): normal quiet-detection, plus a
        // 3 s hard-silence safety net for a choppy run that never looked clean.
        stopped = micQuiet || (lastLoudAt > 0 && !recentlyLoud && (now - lastLoudAt) > 3000);
        anchorMic = true;
      } else {
        stopped = txStopped; anchorMic = false;
      }

      if (stopped) {
        t0 = anchorMic ? (lastLoudAt || now) : (lastUserTxAt || now);
        state = "black";
        paint(fmt(now - t0), BLACK);
      }
      return;
    }

    if (state === "black" || state === "red") {
      // Resumed talking → back to 0.00.
      //  • mic: a sustained fresh speech run (ignores blips)
      //  • transcript: any fresh fragment — accepts that a late fragment of the
      //    same utterance may bounce it; TX_STOP_MS then re-settles it. Far
      //    better than being stuck counting from mid-speech.
      var resumed = (m && sustainedLoud) ||
        (!m && haveTx && (now - lastUserTxAt) < 200);
      if (resumed) { state = "talking"; haveTx = false; lastUserTxAt = 0; paint("0.00 s", BLACK); return; }

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
