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

// data-ga-name is the approved-name path (see PRD-GA-Event-Naming-Standardization-AUDIT.md);
// anything still missing it falls back to the original id/data-nav/data-action/class
// derivation so nothing currently tracked goes dark while coverage is rolled out.
const CLICK_SELECTOR = "button, [role='button'], [data-nav], [data-ga-name]";

function initClickTracking() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.(CLICK_SELECTOR);
    if (!el) return;

    const params = { element_tag: el.tagName.toLowerCase() };
    params.element_label = el.dataset?.gaName || labelForElement(el);

    // Per-instance identity for dynamic/repeated elements (plan cards, headline
    // cards, task list rows) — a constant data-ga-name identifies the role,
    // this carries which specific instance was tapped.
    const itemId = el.dataset?.gaItemId || el.dataset?.planId;
    if (itemId) params.element_id = itemId;

    trackEvent(el.dataset?.gaEvent || "button_click", params);
  });
}

// Every overlay/panel in this app either has an id ending in "Overlay"/"Tile"
// or is a .sidenav-panel, and both consistently toggle aria-hidden when shown or
// hidden — "true"/"false", or the attribute is removed entirely (see
// taskManager.js's open()) — regardless of which CSS class scheme (.hidden,
// .sidenav-open, etc.) each one uses to actually animate.
const POPUP_SELECTOR = '[id$="Overlay"], [id$="Tile"], .sidenav-panel';

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

      trackEvent(isOpen ? "popup_open" : "popup_close", { popup_id: el.dataset?.gaName || el.id });
    }
  });

  observer.observe(document.body, { attributes: true, attributeFilter: ["aria-hidden"], subtree: true });
}

export function initAnalytics() {
  initClickTracking();
  initPopupTracking();
}
