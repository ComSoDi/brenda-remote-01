/* ────────────────────────────────────────────────────────────────────────────
 * backButton.js — the phone's Back button closes the open popup (like its ×)
 * instead of leaving the app.
 *
 * Why: the Android shell hands Back to the page only when the WebView has
 * history (MainActivity: canGoBack() → goBack(), otherwise the app exits).
 * Popups never added history, so Back closed aiBrenda. Here every popup that
 * opens adds a history entry; Back pops it and we "tap" that popup's close
 * button. Closing with the × removes the entry again, so history stays in
 * step. Works the same in a desktop browser.
 *
 * Popups that must be answered (AI consent, voice disclaimer, required
 * login) have no visible close button: Back does nothing there.
 * The TALK call screen isn't a popup — the shell sends the app to the
 * background during a conversation.
 *
 * Generic on purpose: new popups using these classes are covered with no
 * extra code. A popup with another kind of close button can opt in with
 * data-back-close on that button.
 * ──────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var POPUPS = ".popup-overlay, .brenda-overlay, .auth-overlay, .help-overlay, .task-overlay, .sidenav-panel";
  var CLOSERS = ".popup-close-btn, .help-close-btn, .brenda-close-btn, .sidenav-close-btn, .plan-card-close, [data-back-close]";

  var open = [];             // open popups, most recent last
  var closedByBack = [];     // closed by us from popstate — their entry is already gone
  var ignorePops = 0;        // popstates caused by our own history.back()

  function isOpen(el) {
    return el.classList.contains("sidenav-panel")
      ? el.classList.contains("sidenav-open")
      : !el.classList.contains("hidden");
  }

  function visibleCloser(el) {
    var btns = el.querySelectorAll(CLOSERS);
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!b.disabled && !b.classList.contains("hidden") && b.offsetParent !== null) return b;
    }
    return null;
  }

  function sync() {
    var drop = 0;                           // entries of popups closed with ×
    var all = document.querySelectorAll(POPUPS);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var idx = open.indexOf(el);
      if (isOpen(el) && idx === -1) {
        open.push(el);
        history.pushState({ brendaPopup: el.id || true }, "");
      } else if (!isOpen(el) && idx !== -1) {
        open.splice(idx, 1);
        var byBack = closedByBack.indexOf(el);
        if (byBack !== -1) {
          closedByBack.splice(byBack, 1);   // its entry was popped by Back
        } else {
          drop++;                           // closed with ×: drop its entry
        }
      }
    }
    if (drop > 0) {
      ignorePops++;                         // one popstate for the whole jump
      history.go(-drop);
    }
  }

  window.addEventListener("popstate", function () {
    if (ignorePops > 0) { ignorePops--; return; }
    var top = open[open.length - 1];
    if (!top) return;                       // no popup: normal back
    var btn = visibleCloser(top);
    if (btn) {
      closedByBack.push(top);
      btn.click();
      // Some closers keep the popup open (e.g. a sub-form going back to its
      // list): then the popup still needs an entry for the next Back.
      setTimeout(function () {
        var i = closedByBack.indexOf(top);
        if (i !== -1 && isOpen(top)) {
          closedByBack.splice(i, 1);
          history.pushState({ brendaPopup: top.id || true }, "");
        }
      }, 300);
    } else {
      // Must-answer popup: stay put — put the entry back.
      history.pushState({ brendaPopup: top.id || true }, "");
    }
  });

  function start() {
    var all = document.querySelectorAll(POPUPS);
    var mo = new MutationObserver(sync);
    for (var i = 0; i < all.length; i++) {
      mo.observe(all[i], { attributes: true, attributeFilter: ["class"] });
    }
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
