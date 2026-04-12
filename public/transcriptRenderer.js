// public/transcriptRenderer.js

/** Returns a string key like "2026-3-12" to detect date changes. */
function toDateKey(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Formats a timestamp into a localised date label.
 *   en-US / en-GB  → "Sunday, April 12, 2026"
 *   es-ES / es-419 → "domingo, 12 de abril de 2026"
 */
function formatDateSeparator(ts, localeVariant) {
  const date = new Date(ts || Date.now());
  const isSpanish = String(localeVariant || "").toLowerCase().startsWith("es");
  // Force en-US for all English variants so month always precedes day.
  const locale = isSpanish ? localeVariant : "en-US";
  return date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function renderTranscript({
  containerEl,
  messages,
  localeVariant,
  t,
  shouldStickToBottomRef
}) {
  const esc = (s) => {
    const d = document.createElement("div");
    d.textContent = s ?? "";
    return d.innerHTML;
  };

  const you = `${t(localeVariant, "youLabel")}:`;
  const brenda = `${t(localeVariant, "assistantLabel")}:`;

  let lastDateKey = null;
  const parts = [];

  messages
    .filter((m) => !m?.skipRender)
    .forEach((m) => {
      const dateKey = toDateKey(m.ts);
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        const label = esc(formatDateSeparator(m.ts, localeVariant));
        parts.push(
          `<div class="date-separator"><span class="date-separator-label">${label}</span></div>`
        );
      }
      const cls = m.role === "user" ? "bubble user" : "bubble ai";
      const msgLabel = m.role === "user" ? you : brenda;
      parts.push(`
        <div class="${cls}" data-id="${esc(m.id)}">
          <div class="bubble-header">${esc(msgLabel)}</div>
          <div class="bubble-body">${esc(m.text)}</div>
        </div>`);
    });

  containerEl.innerHTML = parts.join("");

  // Autoscroll behaviour:
  // - stick to bottom by default
  // - if user scrolls up, stop auto-scrolling until they return near bottom
  if (shouldStickToBottomRef?.value) {
    const outer = containerEl.parentElement; // #transcript
    if (outer) outer.scrollTop = outer.scrollHeight;
  }
}

export function wireAutoScroll(outerScrollEl, shouldStickToBottomRef) {
  const nearBottom = () => {
    const threshold = 48;
    return outerScrollEl.scrollHeight - outerScrollEl.scrollTop - outerScrollEl.clientHeight < threshold;
  };

  outerScrollEl.addEventListener("scroll", () => {
    shouldStickToBottomRef.value = nearBottom();
  }, { passive: true });

  // initialise
  shouldStickToBottomRef.value = true;
}
