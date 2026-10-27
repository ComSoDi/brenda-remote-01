// Builds public/legal/<locale>/<doc>.html from docs/legal/src/<locale>.md
// (one file per locale, documents separated by "=== <doc>" lines).
// Usage: node docs/legal/build.mjs   — re-run after editing any src/*.md, then commit both.
// Markup: "# " first = page title, later "# " = section, "## " = subsection, "- " = list item,
// "| a | b |" = table row (first row = header), "_text_" = "last updated" line,
// "!! " = highlighted callout, **bold**, `code`, [text](url); x@aibrenda.co becomes a mailto link.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outRoot = join(repoRoot, "public", "legal");

const SITE = "https://aibrenda.co";
const DOCS = ["about", "terms", "privacy", "cookies", "legal"];

const LOCALES = {
  "en-US": {
    label: "English (US)",
    ui: { langs: "Language", docs: "Legal documents", back: "Back to aiBrenda", top: "Back to top" },
    nav: { about: "About", terms: "Terms", privacy: "Privacy", cookies: "Cookies", legal: "Legal notice" },
  },
  "en-GB": {
    label: "English (UK)",
    ui: { langs: "Language", docs: "Legal documents", back: "Back to aiBrenda", top: "Back to top" },
    nav: { about: "About", terms: "Terms", privacy: "Privacy", cookies: "Cookies", legal: "Legal notice" },
  },
  "es-ES": {
    label: "Español (España)",
    ui: { langs: "Idioma", docs: "Documentos legales", back: "Volver a aiBrenda", top: "Volver arriba" },
    nav: { about: "Acerca de", terms: "Condiciones", privacy: "Privacidad", cookies: "Cookies", legal: "Aviso legal" },
  },
  "es-419": {
    label: "Español (Latinoamérica)",
    ui: { langs: "Idioma", docs: "Documentos legales", back: "Volver a aiBrenda", top: "Volver arriba" },
    nav: { about: "Acerca de", terms: "Condiciones", privacy: "Privacidad", cookies: "Cookies", legal: "Aviso legal" },
  },
};

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const inline = (raw) => {
  const links = [];
  let s = escapeHtml(raw).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const external = /^https?:/.test(href);
    links.push(`<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\b([a-z0-9._-]+@aibrenda\.co)\b/g, '<a href="mailto:$1">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
};

const renderBody = (md) => {
  const lines = md.split(/\r?\n/);
  const out = [];
  let title = "";
  let description = "";
  let list = null;
  let table = null;

  const flush = () => {
    if (list) out.push(`<ul>\n${list.map((li) => `  <li>${inline(li)}</li>`).join("\n")}\n</ul>`);
    if (table) {
      const [head, ...rows] = table;
      const cells = (r, tag) => r.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("");
      out.push(
        `<div class="table-wrap"><table>\n  <thead><tr>${cells(head, "th")}</tr></thead>\n  <tbody>\n${rows
          .map((r) => `    <tr>${cells(r, "td")}</tr>`)
          .join("\n")}\n  </tbody>\n</table></div>`,
      );
    }
    list = null;
    table = null;
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith("- ")) { if (table) flush(); (list ??= []).push(t.slice(2)); continue; }
    if (t.startsWith("|")) { if (list) flush(); (table ??= []).push(t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); continue; }
    flush();
    if (t.startsWith("## ")) { out.push(`<h3>${inline(t.slice(3))}</h3>`); continue; }
    if (t.startsWith("# ")) {
      const text = t.slice(2);
      if (!title) { title = text; out.push(`<h1>${inline(text)}</h1>`); }
      else out.push(`<h2 id="${slugify(text)}">${inline(text)}</h2>`);
      continue;
    }
    if (/^_.+_$/.test(t)) { out.push(`<p class="updated">${inline(t.slice(1, -1))}</p>`); continue; }
    if (t.startsWith("!! ")) { out.push(`<p class="callout">${inline(t.slice(3))}</p>`); continue; }
    if (!description) description = t.replace(/\*\*|\[|\]\([^)]*\)/g, "");
    out.push(`<p>${inline(t)}</p>`);
  }
  flush();
  if (description.length > 160) description = description.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return { title, description, html: out.join("\n\n") };
};

const page = (locale, doc, { title, description, html }) => {
  const L = LOCALES[locale];
  const alternates = Object.keys(LOCALES)
    .map((loc) => `  <link rel="alternate" hreflang="${loc}" href="${SITE}/legal/${loc}/${doc}.html">`)
    .concat(`  <link rel="alternate" hreflang="x-default" href="${SITE}/legal/en-US/${doc}.html">`)
    .join("\n");
  const langLinks = Object.entries(LOCALES)
    .map(([loc, { label }]) =>
      loc === locale
        ? `<a href="../${loc}/${doc}.html" lang="${loc}" hreflang="${loc}" aria-current="true">${label}</a>`
        : `<a href="../${loc}/${doc}.html" lang="${loc}" hreflang="${loc}">${label}</a>`,
    )
    .join("\n        ");
  const docLinks = DOCS.map((d) =>
    d === doc ? `<a href="${d}.html" aria-current="page">${L.nav[d]}</a>` : `<a href="${d}.html">${L.nav[d]}</a>`,
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · aiBrenda</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#1a1a2e">
  <link rel="canonical" href="${SITE}/legal/${locale}/${doc}.html">
${alternates}
  <link rel="icon" href="/images/brenda-avatar-32x32.png">
  <link rel="stylesheet" href="../legal.css">
  <script defer src="https://cloud.umami.is/script.js" data-website-id="9a28dbad-36d5-4c15-a472-fe91b7e68636"></script>
</head>
<body>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="/">
        <img src="/images/brenda-avatar-32x32.png" alt="" width="32" height="32">
        <span>aiBrenda</span>
      </a>
      <nav class="lang-switch" aria-label="${L.ui.langs}">
        ${langLinks}
      </nav>
    </div>
  </header>

  <nav class="doc-nav" aria-label="${L.ui.docs}">
    <div class="doc-nav__inner">
      ${docLinks}
    </div>
  </nav>

  <main class="doc" id="top">
${html
  .split("\n")
  .map((l) => (l ? "    " + l : l))
  .join("\n")}
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <a href="#top">${L.ui.top} ↑</a>
      <a href="/">${L.ui.back}</a>
      <span>© 2026 Comercio Social Digital, S.L.</span>
    </div>
  </footer>
</body>
</html>
`;
};

for (const locale of Object.keys(LOCALES)) {
  const src = readFileSync(join(here, "src", `${locale}.md`), "utf8");
  const parts = Object.fromEntries(
    src.split(/^=== /m).filter(Boolean).map((chunk) => {
      const nl = chunk.indexOf("\n");
      return [chunk.slice(0, nl).trim(), chunk.slice(nl + 1)];
    }),
  );
  mkdirSync(join(outRoot, locale), { recursive: true });
  for (const doc of DOCS) {
    if (!parts[doc]) throw new Error(`Missing "${doc}" in ${locale}.md`);
    const file = join(outRoot, locale, `${doc}.html`);
    writeFileSync(file, page(locale, doc, renderBody(parts[doc])));
    console.log("wrote", file);
  }
}
