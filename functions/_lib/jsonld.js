// Regenerates the JSON-LD @graph from content + seo data, so the structured
// data is a projection of the same source of truth as the visible page and the
// share/meta tags. Mirrors the schema the site already publishes.

import { pick } from './i18n.js';

const ORIGIN = 'https://s.morgunov.tech';
const HERO_IMAGE = ORIGIN + '/images/Hero_Photo.webp';
const EMAIL = 's@morgunov.tech';

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

  return JSON.stringify(graph, null, 2);
}
