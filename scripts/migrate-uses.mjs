#!/usr/bin/env node
// One-off: parse the current uses.html (RU) + en/uses.html (EN) gear/software
// cards into the structured `uses` content model and splice it into
// content.seed.json. Run once; kept for reference/reproducibility.
//
//   node scripts/migrate-uses.mjs            # writes content.seed.json
//   node scripts/migrate-uses.mjs --dry      # prints, no write
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
const decode = (s) => s.replace(/\s+/g, ' ').trim();
const attr = (tag, name) => (tag.match(new RegExp(name + '="([^"]*)"', 'i')) || [])[1] || '';
const inner = (html, re) => { const m = html.match(re); return m ? m[1] : ''; };

// hardware: a sequence of <h3>heading</h3> + <div class="v4-uses">…cards…</div>
function parseGear(sectionHtml) {
  const groups = [];
  const re = /<h3 class="v4-h3">([\s\S]*?)<\/h3>\s*<div class="v4-uses">([\s\S]*?)<\/div>\s*(?=<h3|<\/div>\s*<\/div>\s*<\/div>\s*<\/section>|$)/g;
  let m;
  while ((m = re.exec(sectionHtml))) {
    const heading = decode(m[1]);
    const cards = [];
    const cardRe = /<article class="v4-use">([\s\S]*?)<\/article>/g;
    let c;
    while ((c = cardRe.exec(m[2]))) {
      const a = c[1];
      const img = (a.match(/<img\b[^>]*>/i) || [''])[0];
      cards.push({
        image: attr(img, 'src').replace(/\?v=[0-9a-f]+/i, ''),
        alt: decode(attr(img, 'alt')),
        tag: decode(inner(a, /<span class="v4-tag">([\s\S]*?)<\/span>/)),
        name: decode(inner(a, /<h4 class="v4-use-name">([\s\S]*?)<\/h4>/)),
        desc: decode(inner(a, /<p class="v4-use-desc">([\s\S]*?)<\/p>/)),
      });
    }
    groups.push({ heading, cards });
  }
  return groups;
}

// software: an intro <div class="v4-prose"><p>…</p></div> + <div class="v4-softs">…products…</div>
function parseProducts(sectionHtml) {
  const intro = decode(inner(sectionHtml, /<div class="v4-prose">\s*<p>([\s\S]*?)<\/p>/));
  const cards = [];
  const cardRe = /<article class="v4-product">([\s\S]*?)<\/article>/g;
  let c;
  while ((c = cardRe.exec(sectionHtml))) {
    const a = c[1];
    const head = inner(a, /<div class="v4-product-head">([\s\S]*?)<\/div>/);
    const spans = [...head.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((x) => decode(x[1]));
    const cta = (a.match(/<a class="v4-btn"[^>]*>([\s\S]*?)<\/a>/) || [])[0] || '';
    cards.push({
      tag: spans[0] || '',
      price: spans[1] || '',
      name: decode(inner(a, /<h4 class="v4-product-name">([\s\S]*?)<\/h4>/)),
      desc: decode(inner(a, /<p class="v4-product-desc">([\s\S]*?)<\/p>/)),
      cta: { label: decode(inner(cta, />([\s\S]*?)<\/a>/)), href: attr(cta, 'href') },
    });
  }
  return { intro, cards };
}

const sectionHtml = (html, id) => inner(html, new RegExp(`<section id="${id}"[\\s\\S]*?>([\\s\\S]*?)<\\/section>`));

const ru = read('/uses.html');
const en = read('/en/uses.html');

const gearRu = parseGear(sectionHtml(ru, 'hardware'));
const gearEn = parseGear(sectionHtml(en, 'hardware'));
const softRu = parseProducts(sectionHtml(ru, 'software'));
const softEn = parseProducts(sectionHtml(en, 'software'));

// Merge RU+EN by position. Brand name + image + href are scalar (lang-neutral).
const loc = (r, e) => ({ ru: r, en: e });
const hardware = {
  num: '01',
  title: loc('Железо', 'Hardware'),
  kind: 'gear',
  groups: gearRu.map((g, i) => ({
    heading: loc(g.heading, (gearEn[i] || {}).heading || g.heading),
    cards: g.cards.map((card, j) => {
      const ec = ((gearEn[i] || {}).cards || [])[j] || {};
      return { image: card.image, name: card.name, alt: loc(card.alt, ec.alt || card.alt), tag: loc(card.tag, ec.tag || card.tag), desc: loc(card.desc, ec.desc || card.desc) };
    }),
  })),
};
const software = {
  num: '02',
  title: loc('Софт', 'Software'),
  kind: 'products',
  intro: loc(softRu.intro, softEn.intro),
  cards: softRu.cards.map((card, j) => {
    const ec = softEn.cards[j] || {};
    return { name: card.name, tag: loc(card.tag, ec.tag || card.tag), price: loc(card.price, ec.price || card.price), desc: loc(card.desc, ec.desc || card.desc), cta: { label: loc(card.cta.label, (ec.cta || {}).label || card.cta.label), href: card.cta.href } };
  }),
};

const out = { hardware, software };
if (process.argv.includes('--dry')) {
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nhardware groups: ${hardware.groups.length} (${hardware.groups.map((g) => g.heading.ru + ':' + g.cards.length).join(', ')})`);
  console.log(`software cards: ${software.cards.length}`);
} else {
  const seedPath = ROOT + 'content.seed.json';
  const seed = JSON.parse(read('/content.seed.json'));
  seed.uses.sections.hardware = hardware;
  seed.uses.sections.software = software;
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
  console.log('content.seed.json updated: uses.sections.{hardware,software}');
}
