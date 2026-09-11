// Regenerates the JSON-LD @graph from content + seo data, so the structured
// data is a projection of the same source of truth as the visible page and the
// share/meta tags. Mirrors the schema the site already publishes.

import { pick } from './i18n.js';
import { ORIGIN } from './site.js';

const HERO_IMAGE = ORIGIN + '/images/Hero_Photo.webp';
const EMAIL = 's@morgunov.tech';
// First commit of the site (v0.1) — ProfilePage.dateCreated.
const SITE_LAUNCHED = '2025-10-07';

// Serialize a JSON-LD graph and escape characters that could break out of the
// <script> element it's injected into (JSON.stringify escapes none of these).
export function serializeLd(graph) {
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
    // One entity, one canonical url — the RU homepage — on both languages
    // (the WebPage node carries the language-specific url).
    url: ORIGIN + '/',
    image: HERO_IMAGE,
    email: EMAIL,
    knowsLanguage: ['ru', 'en'],
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
      // Per-item overrides live in `schema` (the two privacy web apps are the
      // default; e.g. the Telegram bot is a DeveloperApplication under MIT).
      // Every product is free unless `schema.free === false`.
      item: Object.assign(
        {
          '@type': (it.schema && it.schema.type) || 'WebApplication',
          name: it.name,
          url: pick(it.cta.href, lang),
          applicationCategory: (it.schema && it.schema.category) || 'PrivacyApplication',
          operatingSystem: (it.schema && it.schema.os) || 'Web',
          description: pick(it.desc, lang),
          isAccessibleForFree: !(it.schema && it.schema.free === false),
        },
        it.version ? { softwareVersion: String(it.version).replace(/^v/i, '') } : {},
        it.schema && it.schema.license ? { license: it.schema.license } : {}
      ),
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
        // ProfilePage: the page IS this person (Google's profile-page shape).
        '@type': ['WebPage', 'ProfilePage'],
        '@id': url + '#webpage',
        url,
        name: pick(doc.meta.title, lang),
        inLanguage: lang,
        isPartOf: { '@id': ORIGIN + '/#website' },
        primaryImageOfPage: HERO_IMAGE,
        about: { '@id': ORIGIN + '/#person' },
        mainEntity: { '@id': ORIGIN + '/#person' },
        dateCreated: SITE_LAUNCHED,
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

// --- Sub-pages: WebPage (+ Service/OfferCatalog on /collaborate, BreadcrumbList
// elsewhere) regenerated from the page doc, so name/dateModified/prices follow
// KV edits and agree with the sitemap. Home keeps its own richer graph.
const SERVICE = {
  ru: {
    name: 'Консалтинг и ангельские инвестиции',
    description: 'Консалтинг и ангельские инвестиции для компаний в e-com, ритейле и FinTech.',
    catalog: 'Консалтинговые услуги',
  },
  en: {
    name: 'Consulting and angel investing',
    description: 'Consulting and angel investing for companies in e-com, retail, and FinTech.',
    catalog: 'Consulting services',
  },
};
const HOME_NAME = { ru: 'Главная', en: 'Home' };

// Text leaves are inline markdown (legacy KV docs may still carry HTML) —
// JSON-LD wants plain text.
const plain = (md) =>
  String(md == null ? '' : md)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\[([^\]]+)\]\([^)\s]*\)/g, '$1')
    .replace(/\*\*|`/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();

export function renderPageJsonLd(doc, lang, page) {
  if (page === 'home') return renderJsonLd(doc, lang);
  const l = lang === 'en' ? 'en' : 'ru';
  const url = ORIGIN + (l === 'en' ? '/en' : '') + '/' + page;
  const title = plain(pick(doc.meta && doc.meta.title, l)).replace(/\s*\|\s*morgunov\.tech\s*$/i, '');
  const webpage = {
    '@type': 'WebPage',
    '@id': url + '#webpage',
    url,
    name: title,
    inLanguage: l,
    isPartOf: { '@id': ORIGIN + '/#website' },
    about: { '@id': ORIGIN + '/#person' },
    dateModified: doc.dateModified,
  };
  const graph = [webpage];
  if (page === 'collaborate') {
    const tiers = (doc.sections && doc.sections.consulting && doc.sections.consulting.tiers) || [];
    const priceOf = (t) => {
      const m = plain(pick(t.price, l)).replace(/[\s\u00a0]/g, '').match(/(\d[\d,]*(?:\.\d+)?)/);
      return m ? m[1].replace(/,/g, '') : undefined;
    };
    graph.push({
      '@type': 'Service',
      '@id': url + '#service',
      name: SERVICE[l].name,
      description: SERVICE[l].description,
      url,
      provider: { '@id': ORIGIN + '/#person' },
      areaServed: ['Russia', 'CIS', 'MENA', 'Eastern Europe'],
      serviceType: ['Product consulting', 'Strategic advisory', 'Angel investing'],
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: SERVICE[l].catalog,
        itemListElement: tiers.map((t) => ({
          '@type': 'Offer',
          name: plain(pick(t.name, l)),
          description: plain(pick(t.features && t.features[0], l)),
          price: priceOf(t),
          priceCurrency: 'USD',
        })),
      },
    });
  } else {
    webpage.breadcrumb = { '@id': url + '#breadcrumb' };
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': url + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: HOME_NAME[l], item: ORIGIN + (l === 'en' ? '/en/' : '/') },
        { '@type': 'ListItem', position: 2, name: plain(pick(doc.hero && doc.hero.name, l)) || title, item: url },
      ],
    });
  }
  return serializeLd({ '@context': 'https://schema.org', '@graph': graph });
}
