// Regenerates the JSON-LD @graph from content + seo data, so the structured
// data is a projection of the same source of truth as the visible page and the
// share/meta tags. Mirrors the schema the site already publishes.

import { pick } from './i18n.js';

const ORIGIN = 'https://s.morgunov.tech';
const HERO_IMAGE = ORIGIN + '/images/Hero_Photo.webp';
const EMAIL = 's@morgunov.tech';

// Serialize a JSON-LD graph and escape characters that could break out of the
// <script> element it's injected into (JSON.stringify escapes none of these).
function serializeLd(graph) {
  return JSON.stringify(graph, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Alumni history is append-only and rarely changes — kept here as a constant.
const ALUMNI = [
  { '@type': 'Organization', name: 'Korzinka', url: 'https://korzinka.uz' },
  { '@type': 'Organization', name: 'Yandex Services', url: 'https://uslugi.yandex.ru/' },
  { '@type': 'Organization', name: 'Skyeng', url: 'https://skyeng.ru' },
  { '@type': 'Organization', name: 'Skysmart', url: 'https://skysmart.ru' },
];

export function renderJsonLd(doc, lang) {
  const url = lang === 'en' ? ORIGIN + '/en/' : ORIGIN + '/';
  const seo = doc.seo;

  const person = {
    '@type': 'Person',
    '@id': ORIGIN + '/#person',
    name: pick(doc.hero.name, lang),
    alternateName: pick(seo.alternateName, lang),
    jobTitle: seo.jobTitle,
    description: pick(seo.personDescription, lang),
    url,
    image: HERO_IMAGE,
    email: EMAIL,
    knowsLanguage: lang === 'en' ? ['en', 'ru'] : ['ru', 'en'],
    knowsAbout: seo.knowsAbout,
    sameAs: seo.sameAs,
    worksFor: { '@type': 'Organization', name: seo.worksFor.name, url: seo.worksFor.url },
    hasOccupation: [
      {
        '@type': 'Occupation',
        name: seo.jobTitle,
        occupationLocation: { '@type': 'City', name: 'Tashkent' },
        startDate: seo.occupationStartDate,
      },
    ],
    alumniOf: ALUMNI,
    address: {
      '@type': 'PostalAddress',
      addressLocality: pick(seo.addressLocality, lang),
      addressCountry: 'UZ',
    },
  };

  const products = {
    '@type': 'ItemList',
    '@id': url + '#products',
    name: lang === 'en' ? 'Products by Semyon Morgunov' : 'Продукты Семёна Моргунова',
    itemListElement: doc.sections.products.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'WebApplication',
        name: it.name,
        url: pick(it.cta.href, lang),
        applicationCategory: 'PrivacyApplication',
        operatingSystem: 'Web',
        description: pick(it.desc, lang),
      },
    })),
  };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': ORIGIN + '/#website',
        url: ORIGIN + '/',
        name: 'morgunov.tech',
        inLanguage: ['ru', 'en'],
        publisher: { '@id': ORIGIN + '/#person' },
      },
      {
        '@type': 'WebPage',
        '@id': url + '#webpage',
        url,
        name: pick(doc.meta.title, lang),
        inLanguage: lang,
        isPartOf: { '@id': ORIGIN + '/#website' },
        primaryImageOfPage: HERO_IMAGE,
        about: { '@id': ORIGIN + '/#person' },
        dateModified: doc.dateModified,
      },
      person,
      products,
    ],
  };

  return serializeLd(graph);
}

// JSON-LD for a single article: schema.org/Article, authored by the same
// Person @id the rest of the site publishes, so an LLM/crawler links the piece
// to the author identity. `doc._url` is the canonical article URL (set by the
// route, language-specific).
export function renderArticleJsonLd(doc, lang) {
  const url = doc._url;
  const image = pick(doc.cover && doc.cover.src, lang) || HERO_IMAGE;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': url + '#article',
        headline: pick(doc.title, lang),
        description: pick(doc.excerpt, lang),
        inLanguage: lang,
        url,
        mainEntityOfPage: url,
        datePublished: doc.date,
        dateModified: doc.dateModified || doc.date,
        image: /^https?:/i.test(image) ? image : ORIGIN + image,
        author: { '@id': ORIGIN + '/#person' },
        publisher: { '@id': ORIGIN + '/#person' },
        isPartOf: { '@id': ORIGIN + '/#website' },
      },
      {
        '@type': 'Person',
        '@id': ORIGIN + '/#person',
        name: lang === 'en' ? 'Semyon Morgunov' : '\u0421\u0435\u043c\u0451\u043d \u041c\u043e\u0440\u0433\u0443\u043d\u043e\u0432',
        url: ORIGIN + (lang === 'en' ? '/en/' : '/'),
      },
    ],
  };
  return serializeLd(graph);
}
