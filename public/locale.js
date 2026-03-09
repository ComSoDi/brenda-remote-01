// public/locale.js
// Detect best-effort locale from browser settings.
// We support English and Spanish first, with regional variants:
//  - en-US (default), en-GB
//  - es-ES, es-419 (LatAm default)

export function detectLocale() {
  const langs = (navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language]
  ).filter(Boolean);

  // Find first supported language
  let found = null;
  for (const l of langs) {
    const code = l.toLowerCase();
    if (code.startsWith("es") || code.startsWith("en")) {
      found = code;
      break;
    }
  }

  const tag = (found || "en-US").toLowerCase();
  const [langRaw, regionRaw] = tag.split("-");
  const lang = langRaw || "en";
  const region = (regionRaw || "").toUpperCase();

  if (lang === "es") {
    // If it's es-ES or we find Spanish in a generic context, try to detect Spain
    const isSpain = region === "ES" || tag === "es";
    // Default to es-419 for other Spanish unless it's strictly ES
    return { lang: "es", variant: isSpain ? "es-ES" : "es-419" };
  }

  if (lang === "en") {
    return { lang: "en", variant: region === "GB" ? "en-GB" : "en-US" };
  }

  return { lang: "en", variant: "en-US" };
}
