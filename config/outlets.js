// config/outlets.js
// Master outlet registry — single source of truth for all media outlets.
// To add/remove an outlet, edit only this file. No other files need changing.

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
    searchHint: '¡Hola! revista gossip famosos',
  },
  {
    id: 'lecturas', name: 'Lecturas', country: 'ES', city: null, enabled: true,
    categories: ['gossip', 'tv'],
    textColor: '#72243E', bgColor: '#FBEAF0',
    searchHint: 'Lecturas revista gossip famosos',
  },
  {
    id: '20min', name: '20minutos', country: 'ES', city: null, enabled: false,
    categories: ['actualidad', 'politica', 'sport'],
    textColor: '#5F5E5A', bgColor: '#F1EFE8',
    searchHint: '20minutos noticias',
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
