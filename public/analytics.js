// public/analytics.js
// Generic GA4 activity tracking for every button/pill tap and every
// popup/panel open-close, without wiring each individual handler by hand.
// Safe no-op if gtag isn't loaded (ad blockers, offline, gtag.js not yet
// fetched).

function gtagSafe(...args) {
  if (typeof window.gtag === "function") window.gtag(...args);
}

export function trackEvent(name, params = {}) {
  gtagSafe("event", name, params);
}

function labelForElement(el) {
  if (el.id) return el.id;
  if (el.dataset?.nav) return `nav:${el.dataset.nav}`;
  if (el.dataset?.action) {
    return el.dataset.planId ? `${el.dataset.action}:${el.dataset.planId}` : el.dataset.action;
  }
  if (el.classList?.length) return el.classList[0];
  return el.tagName.toLowerCase();
}

// Real <button> elements cover most of the app; a handful of tappable rows
// (sidenav pills, headline cards, the header avatar) are plain divs/images
// with their own click listeners instead.
const CLICK_SELECTOR = "button, [role='button'], [data-nav], .headline-card, #brendaAvatar";

function initClickTracking() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.(CLICK_SELECTOR);
    if (!el) return;
    trackEvent("button_click", {
      element_label: labelForElement(el),
      element_tag: el.tagName.toLowerCase(),
    });
  });
}

// Every overlay/panel in this app either has an id ending in "Overlay" or is
// a .sidenav-panel, and both consistently toggle aria-hidden when shown or
// hidden — "true"/"false", or the attribute is removed entirely (see
// taskManager.js's open()) — regardless of which CSS class scheme (.hidden,
// .sidenav-open, etc.) each one uses to actually animate.
const POPUP_SELECTOR = '[id$="Overlay"], .sidenav-panel';

function initPopupTracking() {
  const openState = new WeakMap();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const el = m.target;
      if (!(el instanceof Element) || !el.matches(POPUP_SELECTOR)) continue;

      const attr = el.getAttribute("aria-hidden");
      const isOpen = attr === null || attr === "false";
      if (openState.get(el) === isOpen) continue;
      openState.set(el, isOpen);

      trackEvent(isOpen ? "popup_open" : "popup_close", { popup_id: el.id });
    }
  });

  observer.observe(document.body, { attributes: true, attributeFilter: ["aria-hidden"], subtree: true });
}

export function initAnalytics() {
  initClickTracking();
  initPopupTracking();
}
