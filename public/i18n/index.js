// public/i18n/index.js
// Loader: dynamically imports only the needed locale file(s).
// Always loads en-US as fallback unless the user locale IS en-US.

const _dicts = {};

export async function preloadLocale(variant) {
  const needed = variant === "en-US" ? ["en-US"] : [variant, "en-US"];
  await Promise.all(needed.map(async (v) => {
    if (!_dicts[v]) {
      const mod = await import(`./${v}.js`);
      _dicts[v] = mod.default;
    }
  }));
}

export function t(localeVariant, key, params) {
  const dict = _dicts[localeVariant] || {};
  const enUS = _dicts["en-US"] || {};
  let str = dict[key] ?? enUS[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}
