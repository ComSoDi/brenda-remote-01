// config/outlets.js
// Master outlet registry — single source of truth for all media outlets.
// To add/remove an outlet — or a whole country — edit only this file.
// No other files need changing.

// One entry per country that has outlets below: the name used in the Gemini
// request and the language the request + headlines are written in.
// (A saved country not listed here falls back to US — api/brenda/headlines.js.)
export const COUNTRIES = {
  ES: { name: 'España',             lang: 'es' },
  US: { name: 'the United States',  lang: 'en' },
  GB: { name: 'the United Kingdom', lang: 'en' },
  MX: { name: 'México',             lang: 'es' },
  CO: { name: 'Colombia',           lang: 'es' },
  AR: { name: 'Argentina',          lang: 'es' },
  VE: { name: 'Venezuela',          lang: 'es' },
};

export const OUTLETS = [
  {
    id: 'antena3', name: 'Antena 3', country: 'ES', city: null, enabled: true,
    categories: ['tv', 'gossip', 'actualidad', 'sport'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'Antena 3 noticias',
  },
  {
    id: 'telecinco', name: 'Telecinco', country: 'ES', city: null, enabled: false,
    categories: ['tv', 'gossip', 'actualidad'],
    textColor: '#3B6D11', bgColor: '#EAF3DE',
    searchHint: 'Telecinco noticias',
  },
  {
    id: 'lasexta', name: 'La Sexta', country: 'ES', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#854F0B', bgColor: '#FAEEDA',
    searchHint: 'La Sexta noticias',
  },
  {
    id: 'rtve', name: 'RTVE', country: 'ES', city: null, enabled: true,
    categories: ['actualidad', 'politica', 'sport'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'RTVE noticias',
  },
  {
    id: 'elpais', name: 'El País', country: 'ES', city: null, enabled: false,
    categories: ['actualidad', 'politica'],
    textColor: '#534AB7', bgColor: '#EEEDFE',
    searchHint: 'El País noticias',
  },
  {
    id: 'elmundo', name: 'El Mundo', country: 'ES', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#5F5E5A', bgColor: '#F1EFE8',
    searchHint: 'El Mundo noticias',
  },
  {
    id: 'theobjective', name: 'The Objective', country: 'ES', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#0F766E', bgColor: '#E6F7F6',
    searchHint: 'The Objective noticias',
  },
  {
    id: 'libertaddigital', name: 'Libertad Digital', country: 'ES', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#1D4ED8', bgColor: '#E8F0FE',
    searchHint: 'Libertad Digital noticias',
  },
  {
    id: 'eldebate', name: 'El Debate', country: 'ES', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#9A3412', bgColor: '#FFF1E8',
    searchHint: 'El Debate noticias',
  },
  {
    id: 'abc', name: 'ABC', country: 'ES', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#365314', bgColor: '#F0FADF',
    searchHint: 'ABC España noticias',
  },
  {
    id: 'marca', name: 'Marca', country: 'ES', city: null, enabled: false,
    categories: ['sport'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'Marca deportes',
  },
  {
    id: 'hola', name: '¡Hola!', country: 'ES', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#993C1D', bgColor: '#FAECE7',
    searchHint: '¡Hola! Revista cotilleo de famosos',
  },
  {
    id: 'lecturas', name: 'Lecturas', country: 'ES', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'Lecturas. Revista de cotilleo de famosos',
  },
  {
    id: '20min', name: '20minutos', country: 'ES', city: null, enabled: false,
    categories: ['actualidad', 'politica', 'sport'],
    textColor: '#5F5E5A', bgColor: '#F1EFE8',
    searchHint: '20minutos noticias',
  },

  // ── United States (US) ──────────────────────────────────────────────────
  // Mix across the political spectrum + wire service, gossip and sport.
  {
    id: 'apnews', name: 'AP News', country: 'US', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#5F5E5A', bgColor: '#F1EFE8',
    searchHint: 'AP News top stories',
  },
  {
    id: 'abcnews', name: 'ABC News', country: 'US', city: null, enabled: true,
    categories: ['actualidad', 'politica', 'tv'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'ABC News US headlines',
  },
  {
    id: 'cbsnews', name: 'CBS News', country: 'US', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#534AB7', bgColor: '#EEEDFE',
    searchHint: 'CBS News headlines',
  },
  {
    id: 'nbcnews', name: 'NBC News', country: 'US', city: null, enabled: false,
    categories: ['actualidad', 'politica'],
    textColor: '#854F0B', bgColor: '#FAEEDA',
    searchHint: 'NBC News headlines',
  },
  {
    id: 'cnn', name: 'CNN', country: 'US', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#9A3412', bgColor: '#FFF1E8',
    searchHint: 'CNN US news',
  },
  {
    id: 'foxnews', name: 'Fox News', country: 'US', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#1D4ED8', bgColor: '#E8F0FE',
    searchHint: 'Fox News headlines',
  },
  {
    id: 'wsj', name: 'The Wall Street Journal', country: 'US', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#365314', bgColor: '#F0FADF',
    searchHint: 'Wall Street Journal news',
  },
  {
    id: 'usatoday', name: 'USA Today', country: 'US', city: null, enabled: false,
    categories: ['actualidad', 'tv', 'sport'],
    textColor: '#0F766E', bgColor: '#E6F7F6',
    searchHint: 'USA Today news',
  },
  {
    id: 'people', name: 'People', country: 'US', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'People magazine celebrity news',
  },
  {
    id: 'tmz', name: 'TMZ', country: 'US', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#993C1D', bgColor: '#FAECE7',
    searchHint: 'TMZ celebrity gossip',
  },
  {
    id: 'espn', name: 'ESPN', country: 'US', city: null, enabled: true,
    categories: ['sport'],
    textColor: '#3B6D11', bgColor: '#EAF3DE',
    searchHint: 'ESPN sports news',
  },

  // ── United Kingdom (GB) ─────────────────────────────────────────────────
  {
    id: 'bbcnews', name: 'BBC News', country: 'GB', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#5F5E5A', bgColor: '#F1EFE8',
    searchHint: 'BBC News UK',
  },
  {
    id: 'skynews', name: 'Sky News', country: 'GB', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#1D4ED8', bgColor: '#E8F0FE',
    searchHint: 'Sky News UK',
  },
  {
    id: 'itvnews', name: 'ITV News', country: 'GB', city: null, enabled: true,
    categories: ['actualidad', 'tv'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'ITV News',
  },
  {
    id: 'guardian', name: 'The Guardian', country: 'GB', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#534AB7', bgColor: '#EEEDFE',
    searchHint: 'The Guardian UK news',
  },
  {
    id: 'thetimes', name: 'The Times', country: 'GB', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#365314', bgColor: '#F0FADF',
    searchHint: 'The Times UK news',
  },
  {
    id: 'telegraph', name: 'The Telegraph', country: 'GB', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#854F0B', bgColor: '#FAEEDA',
    searchHint: 'The Telegraph UK news',
  },
  {
    id: 'dailymail', name: 'Daily Mail', country: 'GB', city: null, enabled: true,
    categories: ['gossip', 'actualidad'],
    textColor: '#9A3412', bgColor: '#FFF1E8',
    searchHint: 'Daily Mail UK news showbiz',
  },
  {
    id: 'thesun', name: 'The Sun', country: 'GB', city: null, enabled: false,
    categories: ['gossip', 'tv', 'sport'],
    textColor: '#993C1D', bgColor: '#FAECE7',
    searchHint: 'The Sun UK showbiz',
  },
  {
    id: 'hellouk', name: 'HELLO!', country: 'GB', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'HELLO! magazine UK royals celebrities',
  },
  {
    id: 'bbcsport', name: 'BBC Sport', country: 'GB', city: null, enabled: true,
    categories: ['sport'],
    textColor: '#3B6D11', bgColor: '#EAF3DE',
    searchHint: 'BBC Sport',
  },
  {
    id: 'skysports', name: 'Sky Sports', country: 'GB', city: null, enabled: false,
    categories: ['sport'],
    textColor: '#0F766E', bgColor: '#E6F7F6',
    searchHint: 'Sky Sports news',
  },

  // ── Mexico (MX) ─────────────────────────────────────────────────────────
  {
    id: 'eluniversalmx', name: 'El Universal', country: 'MX', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'El Universal México noticias',
  },
  {
    id: 'reforma', name: 'Reforma', country: 'MX', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#365314', bgColor: '#F0FADF',
    searchHint: 'Reforma México noticias',
  },
  {
    id: 'milenio', name: 'Milenio', country: 'MX', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#854F0B', bgColor: '#FAEEDA',
    searchHint: 'Milenio noticias México',
  },
  {
    id: 'elfinanciero', name: 'El Financiero', country: 'MX', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#534AB7', bgColor: '#EEEDFE',
    searchHint: 'El Financiero México noticias',
  },
  {
    id: 'latinus', name: 'Latinus', country: 'MX', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#9A3412', bgColor: '#FFF1E8',
    searchHint: 'Latinus noticias México',
  },
  {
    id: 'nmas', name: 'N+ (Televisa)', country: 'MX', city: null, enabled: true,
    categories: ['actualidad', 'tv'],
    textColor: '#1D4ED8', bgColor: '#E8F0FE',
    searchHint: 'N+ noticias Televisa',
  },
  {
    id: 'aztecanoticias', name: 'Azteca Noticias', country: 'MX', city: null, enabled: false,
    categories: ['actualidad', 'tv'],
    textColor: '#0F766E', bgColor: '#E6F7F6',
    searchHint: 'Azteca Noticias TV Azteca',
  },
  {
    id: 'quien', name: 'Quién', country: 'MX', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'Revista Quién famosos México',
  },
  {
    id: 'tvnotas', name: 'TVNotas', country: 'MX', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#993C1D', bgColor: '#FAECE7',
    searchHint: 'TVNotas espectáculos México',
  },
  {
    id: 'recordmx', name: 'Récord', country: 'MX', city: null, enabled: true,
    categories: ['sport'],
    textColor: '#3B6D11', bgColor: '#EAF3DE',
    searchHint: 'Récord deportes México',
  },

  // ── Colombia (CO) ───────────────────────────────────────────────────────
  {
    id: 'eltiempo', name: 'El Tiempo', country: 'CO', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'El Tiempo Colombia noticias',
  },
  {
    id: 'elespectador', name: 'El Espectador', country: 'CO', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#534AB7', bgColor: '#EEEDFE',
    searchHint: 'El Espectador Colombia noticias',
  },
  {
    id: 'semana', name: 'Semana', country: 'CO', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#9A3412', bgColor: '#FFF1E8',
    searchHint: 'Revista Semana Colombia noticias',
  },
  {
    id: 'elcolombiano', name: 'El Colombiano', country: 'CO', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#365314', bgColor: '#F0FADF',
    searchHint: 'El Colombiano noticias',
  },
  {
    id: 'caracol', name: 'Noticias Caracol', country: 'CO', city: null, enabled: true,
    categories: ['actualidad', 'tv'],
    textColor: '#854F0B', bgColor: '#FAEEDA',
    searchHint: 'Noticias Caracol Colombia',
  },
  {
    id: 'rcn', name: 'Noticias RCN', country: 'CO', city: null, enabled: true,
    categories: ['actualidad', 'tv'],
    textColor: '#1D4ED8', bgColor: '#E8F0FE',
    searchHint: 'Noticias RCN Colombia',
  },
  {
    id: 'pulzo', name: 'Pulzo', country: 'CO', city: null, enabled: true,
    categories: ['gossip', 'actualidad'],
    textColor: '#993C1D', bgColor: '#FAECE7',
    searchHint: 'Pulzo entretenimiento Colombia',
  },
  {
    id: 'tvynovelasco', name: 'TVyNovelas Colombia', country: 'CO', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'TVyNovelas Colombia farándula',
  },
  {
    id: 'futbolred', name: 'Futbolred', country: 'CO', city: null, enabled: true,
    categories: ['sport'],
    textColor: '#3B6D11', bgColor: '#EAF3DE',
    searchHint: 'Futbolred deportes Colombia',
  },

  // ── Argentina (AR) ──────────────────────────────────────────────────────
  {
    id: 'clarin', name: 'Clarín', country: 'AR', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'Clarín Argentina noticias',
  },
  {
    id: 'lanacion', name: 'La Nación', country: 'AR', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#365314', bgColor: '#F0FADF',
    searchHint: 'La Nación Argentina noticias',
  },
  {
    id: 'infobae', name: 'Infobae', country: 'AR', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#9A3412', bgColor: '#FFF1E8',
    searchHint: 'Infobae Argentina noticias',
  },
  {
    id: 'pagina12', name: 'Página/12', country: 'AR', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#534AB7', bgColor: '#EEEDFE',
    searchHint: 'Página 12 Argentina noticias',
  },
  {
    id: 'perfil', name: 'Perfil', country: 'AR', city: null, enabled: false,
    categories: ['actualidad', 'politica'],
    textColor: '#5F5E5A', bgColor: '#F1EFE8',
    searchHint: 'Perfil Argentina noticias',
  },
  {
    id: 'tn', name: 'TN (Todo Noticias)', country: 'AR', city: null, enabled: true,
    categories: ['actualidad', 'tv'],
    textColor: '#1D4ED8', bgColor: '#E8F0FE',
    searchHint: 'TN Todo Noticias Argentina',
  },
  {
    id: 'teleshow', name: 'Teleshow (Infobae)', country: 'AR', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#993C1D', bgColor: '#FAECE7',
    searchHint: 'Teleshow Infobae espectáculos',
  },
  {
    id: 'caras', name: 'Caras', country: 'AR', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'Revista Caras Argentina famosos',
  },
  {
    id: 'ole', name: 'Olé', country: 'AR', city: null, enabled: true,
    categories: ['sport'],
    textColor: '#3B6D11', bgColor: '#EAF3DE',
    searchHint: 'Olé deportes Argentina',
  },
  {
    id: 'tycsports', name: 'TyC Sports', country: 'AR', city: null, enabled: false,
    categories: ['sport'],
    textColor: '#0F766E', bgColor: '#E6F7F6',
    searchHint: 'TyC Sports noticias',
  },

  // ── Venezuela (VE) ──────────────────────────────────────────────────────
  // Independent digital outlets, most run from abroad or by exiled teams and
  // blocked inside Venezuela — chosen to avoid state-controlled/censored media.
  // (Gemini's Google Search runs outside VE, so in-country blocking doesn't
  // affect us.) Deliberately NO state media (VTV, Telesur, Últimas Noticias…).
  {
    id: 'efectococuyo', name: 'Efecto Cocuyo', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#0F766E', bgColor: '#E6F7F6',
    searchHint: 'Efecto Cocuyo Venezuela noticias',
  },
  {
    id: 'elpitazo', name: 'El Pitazo', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#9A3412', bgColor: '#FFF1E8',
    searchHint: 'El Pitazo Venezuela noticias',
  },
  {
    id: 'elnacionalve', name: 'El Nacional', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#0C447C', bgColor: '#E6F1FB',
    searchHint: 'El Nacional Venezuela noticias',
  },
  {
    id: 'talcual', name: 'Tal Cual', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#534AB7', bgColor: '#EEEDFE',
    searchHint: 'Tal Cual Digital Venezuela',
  },
  {
    id: 'runrunes', name: 'Runrun.es', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'politica'],
    textColor: '#365314', bgColor: '#F0FADF',
    searchHint: 'Runrun.es Venezuela',
  },
  {
    id: 'armandoinfo', name: 'Armando.info', country: 'VE', city: null, enabled: false,
    categories: ['politica'],
    textColor: '#5F5E5A', bgColor: '#F1EFE8',
    searchHint: 'Armando.info investigación Venezuela',
  },
  {
    id: 'lapatilla', name: 'La Patilla', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'politica', 'gossip'],
    textColor: '#854F0B', bgColor: '#FAEEDA',
    searchHint: 'La Patilla Venezuela noticias',
  },
  {
    id: 'caraota', name: 'Caraota Digital', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'gossip', 'tv'],
    textColor: '#993C1D', bgColor: '#FAECE7',
    searchHint: 'Caraota Digital Venezuela noticias farándula',
  },
  {
    id: 'evtv', name: 'EVTV Miami', country: 'VE', city: null, enabled: true,
    categories: ['actualidad', 'tv'],
    textColor: '#1D4ED8', bgColor: '#E8F0FE',
    searchHint: 'EVTV Miami Venezuela noticias',
  },
  {
    id: 'liderendeportes', name: 'Líder en Deportes', country: 'VE', city: null, enabled: true,
    categories: ['sport'],
    textColor: '#3B6D11', bgColor: '#EAF3DE',
    searchHint: 'Líder en Deportes Venezuela',
  },
];

// Returns enabled outlets matching the user's country and city.
// Outlets with city: null are national and match any city in that country.
export function getOutletsForUser(country, city = null) {
  return OUTLETS.filter(
    (o) =>
      o.enabled &&
      o.country === country &&
      (o.city === null || o.city === city)
  );
}
