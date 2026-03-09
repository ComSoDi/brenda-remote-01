// public/transcriptRenderer.js
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

  const html = messages
    .filter((m) => !m?.skipRender)
    .map((m) => {
      const cls = m.role === "user" ? "bubble user" : "bubble ai";
      const label = m.role === "user" ? you : brenda;
      return `
        <div class="${cls}" data-id="${esc(m.id)}">
          <div class="bubble-header">${esc(label)}</div>
          <div class="bubble-body">${esc(m.text)}</div>
        </div>`;
    })
    .join("");

  containerEl.innerHTML = html;

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
