#!/usr/bin/env node
// One-off: parse collaborate.html (RU) + en/collaborate.html (EN) into the
// structured collaborate model and splice into content.seed.json.
//   node scripts/migrate-collaborate.mjs --dry
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
const dec = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const sectionInner = (html, id) => (html.match(new RegExp(`<section id="${id}"[^>]*>([\\s\\S]*?)<\\/section>`)) || [])[1] || '';
const all = (re, s) => [...s.matchAll(re)].map((m) => m[1]);
const lis = (ulHtml) => all(/<li>([\s\S]*?)<\/li>/g, ulHtml).map(dec);
const firstUl = (s) => (s.match(/<ul[^>]*>([\s\S]*?)<\/ul>/) || [])[1] || '';
const ctaOf = (s) => {
  const m = s.match(/<a class="v4-btn[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
  return m ? { href: m[1], label: dec(m[2]) } : { href: '', label: '' };
};
const loc = (r, e) => ({ ru: r, en: e });

const RU = read('/collaborate.html');
const EN = read('/en/collaborate.html');
const S = (id) => [sectionInner(RU, id), sectionInner(EN, id)];

// --- about: 2 prose paragraphs + bullet list + clients line ---
function about() {
  const [r, e] = S('about');
  const proseOf = (s) => all(/<p>([\s\S]*?)<\/p>/g, s).map(dec).join('\n\n');
  const clientsOf = (s) => dec((s.match(/<p class="v4-collab-clients">([\s\S]*?)<\/p>/) || [])[1] || '');
  return {
    num: '01', title: loc('Чем занимаюсь', 'What I do'),
    prose: loc(proseOf(r), proseOf(e)),
    points: lis(firstUl(r)).map((x, i) => loc(x, lis(firstUl(e))[i] || x)),
    clients: loc(clientsOf(r), clientsOf(e)),
  };
}

// --- consulting: product tiers ---
function tiers() {
  const [r, e] = S('consulting');
  const cards = (s) => all(/<article class="v4-product">([\s\S]*?)<\/article>/g, s).map((a) => ({
    tag: dec((a.match(/<span class="v4-tag">([\s\S]*?)<\/span>/) || [])[1]),
    price: dec((a.match(/<span class="v4-pricing">([\s\S]*?)<\/span>/) || [])[1]),
    name: dec((a.match(/<h3 class="v4-product-name">([\s\S]*?)<\/h3>/) || [])[1]),
    features: lis(firstUl(a)),
    cta: ctaOf(a),
  }));
  const rc = cards(r), ec = cards(e);
  return {
    num: '02', title: loc('Консалтинг', 'Consulting'),
    tiers: rc.map((c, i) => ({
      tag: loc(c.tag, (ec[i] || {}).tag || c.tag),
      price: loc(c.price, (ec[i] || {}).price || c.price),
      name: c.name,
      features: c.features.map((f, j) => loc(f, ((ec[i] || {}).features || [])[j] || f)),
      cta: { href: c.cta.href, label: loc(c.cta.label, (ec[i] || {}).cta.label || c.cta.label) },
    })),
  };
}

// --- strategy / angel: tagline? + groups (heading + list|prose|spec) + cta ---
function grouped(id, num, titleRu, titleEn, hasTagline) {
  const [r, e] = S(id);
  const taglineOf = (s) => dec((s.match(/<p class="v4-tagline[^"]*">([\s\S]*?)<\/p>/) || [])[1] || '');
  const termsOf = (s) => dec((s.match(/<p class="v4-terms">([\s\S]*?)<\/p>/) || [])[1] || '');
  // Each <h3> heads a block: the following <ul> (list), <dl> (spec) or <p>/<div.v4-prose> (prose).
  const groupsOf = (s) => {
    const out = [];
    const re = /<h3 class="v4-h3">([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3 class="v4-h3">|<p class="v4-terms">|<div class="v4-help-cta">|$)/g;
    let m;
    while ((m = re.exec(s))) {
      const heading = dec(m[1]);
      const rest = m[2];
      if (/<dl class="v4-spec">/.test(rest)) {
        const rows = [...rest.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map((x) => ({ term: dec(x[1]), def: dec(x[2]) }));
        out.push({ heading, kind: 'spec', rows });
      } else if (/<ul[^>]*>/.test(rest)) {
        out.push({ heading, kind: 'list', items: lis(firstUl(rest)) });
      } else {
        const prose = all(/<p[^>]*>([\s\S]*?)<\/p>/g, rest).map(dec).join('\n\n');
        out.push({ heading, kind: 'prose', prose });
      }
    }
    return out;
  };
  const rg = groupsOf(r), eg = groupsOf(e);
  const mergeGroup = (g, eg) => ({
    heading: loc(g.heading, (eg || {}).heading || g.heading),
    kind: g.kind,
    ...(g.kind === 'list' ? { items: g.items.map((it, j) => loc(it, ((eg || {}).items || [])[j] || it)) } : {}),
    ...(g.kind === 'prose' ? { prose: loc(g.prose, (eg || {}).prose || g.prose) } : {}),
    ...(g.kind === 'spec' ? { rows: g.rows.map((row, j) => ({ term: loc(row.term, (((eg || {}).rows || [])[j] || {}).term || row.term), def: loc(row.def, (((eg || {}).rows || [])[j] || {}).def || row.def) })) } : {}),
  });
  const out = {
    num, title: loc(titleRu, titleEn),
    groups: rg.map((g, i) => mergeGroup(g, eg[i])),
    terms: loc(termsOf(r), termsOf(e)),
    cta: { href: ctaOf(r).href, label: loc(ctaOf(r).label, ctaOf(e).label) },
  };
  if (hasTagline) out.tagline = loc(taglineOf(r), taglineOf(e));
  return out;
}

// --- contact: note + cta row ---
function contact() {
  const [r, e] = S('contact');
  const noteOf = (s) => dec((s.match(/<p class="v4-contact-note">([\s\S]*?)<\/p>/) || [])[1] || '');
  const ctasOf = (s) => all(/<a class="v4-btn[^"]*"[^>]*>([\s\S]*?)<\/a>/g, s); // labels
  const hrefs = (s) => [...s.matchAll(/<a class="v4-btn[^"]*"[^>]*href="([^"]*)"/g)].map((m) => m[1]);
  const rl = ctasOf(r).map(dec), el2 = ctasOf(e).map(dec), rh = hrefs(r);
  return {
    num: '05', title: loc('Не уверены, что вам нужно?', 'Not sure what you need?'),
    note: loc(noteOf(r), noteOf(e)),
    ctas: rl.map((label, i) => ({ href: rh[i] || '', label: loc(label, el2[i] || label) })),
  };
}

const out = {
  about: about(),
  consulting: tiers(),
  strategy: grouped('strategy', '03', 'Стратегический консалтинг', 'Strategic consulting', true),
  angel: grouped('angel', '04', 'Ангельские инвестиции', 'Angel investing', false),
  contact: contact(),
};

if (process.argv.includes('--dry')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const seed = JSON.parse(read('/content.seed.json'));
  seed.collaborate.sections = out;
  fs.writeFileSync(ROOT + 'content.seed.json', JSON.stringify(seed, null, 2) + '\n');
  console.log('content.seed.json updated: collaborate.sections');
}
