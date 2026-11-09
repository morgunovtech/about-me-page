// Component renderers. Each entry in `renderers` returns the inner HTML for a
// container marked with data-cms-list in the template. Markup mirrors the
// static templates exactly so the rendered page is visually identical.
//
// Edit mode: when called with edit=true (only from the admin preview), each
// renderer also emits invisible edit anchors so the inline editor can map a
// clicked element back to a doc path:
//   data-cms-text="path"   → plaintext leaf (contenteditable)
//   data-cms-md="path"     → inline-markdown leaf
//   data-edit-item="path"  → a list item (reorder / delete handle)
// The list container itself gets data-edit-list (set in overlay.js).
// edit=false (the public render) emits none of these → output is byte-identical.

import { pick, fmtDate, NEW_TAB } from './i18n.js';
import { noteUrl } from './articles.js';
import { escapeHtml, escapeAttr, isExternal, safeHref, renderInline, renderCtx, renderProse } from './markdown.js';

// Edit-anchor emitters — all yield '' unless edit is true.
const eItem = (edit, path) => (edit ? ` data-edit-item="${path}"` : '');
const eText = (edit, path) => (edit ? ` data-cms-text="${path}"` : '');
const eMd = (edit, path) => (edit ? ` data-cms-md="${path}"` : '');
// Wrap an inline run in an editable span (edit only); pass-through otherwise so
// the public render keeps the exact original markup. eWrap = plaintext leaf,
// eWrapMd = inline-markdown leaf (renderInline output → preserves links/bold).
const eWrap = (edit, path, html) => (edit ? `<span data-cms-text="${path}">${html}</span>` : html);
const eWrapMd = (edit, path, html) => (edit ? `<span data-cms-md="${path}">${html}</span>` : html);

// Doc paths for each list slot — used by overlay.js to mark the container with
// data-edit-list (the "+ add" target) and by the editor for reorder/delete.
export const LIST_PATHS = {
  heroCtas: 'hero.ctas',
  stats: 'stats',
  career: 'sections.career.items',
  ventures: 'sections.ventures.items',
  products: 'sections.products.items',
  contact: 'sections.contact.ctas',
  usesGear: 'sections.hardware.groups',
  usesProducts: 'sections.software.cards',
};

// Subscribers stat channels: mono abbreviations, not icons — the design system
// keeps content icon-free. The abbreviation is visual; screen readers get the name.
const CHANNELS = [
  ['telegram', 'TG', 'Telegram'],
  ['linkedin', 'LI', 'LinkedIn'],
  ['youtube', 'YT', 'YouTube'],
];

// A single CTA / button anchor. Labels are plaintext (no markdown) — they are
// data-cms-text leaves in the editor; primary styling and target/rel are derived.
// `path` points at the cta object; `asItem` marks it as a reorderable list item.
function btn(cta, lang, edit, path, asItem, primary) {
  const href = safeHref(pick(cta.href, lang) || cta.href);
  const label = escapeHtml(pick(cta.label, lang)); // labels are plaintext leaves (data-cms-text)
  const isPrimary = primary == null ? cta.primary === true : !!primary;
  const cls = 'v4-btn' + (isPrimary ? ' v4-btn-primary' : '');
  const ext = isExternal(href);
  return `<a class="${cls}" href="${escapeAttr(href)}"${
    ext ? ' target="_blank" rel="noopener noreferrer"' : ''
  }${asItem ? eItem(edit, path) : ''}${path ? eText(edit, path + '.label') : ''}>${label}</a>`;
}

// A "→ ..." footer link (always external in home content).
function moreLink(more, lang, edit, path) {
  const href = safeHref(pick(more.href, lang));
  const label = escapeHtml(pick(more.label, lang));
  const ext = isExternal(href);
  return `<div class="v4-more"><a href="${escapeAttr(href)}"${
    ext ? ' target="_blank" rel="noopener noreferrer"' : ''
  }${path ? eText(edit, path + '.label') : ''}>${label}</a></div>`;
}

function group(n, sep) {
  return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
export function fmtNum(n, lang) {
  return group(n, lang === 'en' ? ',' : '\u00a0');
}

// Subscriber counters — THE single source for every number on the page that
// mentions followers (the stats strip and the /notes channel block meta).
// Live SocialBot numbers win when the subscribers stat is on auto; otherwise
// the doc's own channel values. Formatted per language (RU nbsp / EN comma).
export function counters(doc, lang) {
  const stat = (doc.stats || []).find((x) => x && x.kind === 'subscribers');
  const live = doc._live && doc._live.subscribers;
  const useLive = !!live && (!stat || stat.auto !== false);
  const out = {};
  for (const ch of ['telegram', 'linkedin', 'youtube']) {
    if (useLive && live[ch] != null) out[ch] = fmtNum(live[ch], lang);
    else if (stat && stat.channels && stat.channels[ch] != null) out[ch] = escapeHtml(pick(stat.channels[ch], lang));
  }
  if (useLive) out.total = fmtNum((+live.telegram || 0) + (+live.linkedin || 0) + (+live.youtube || 0), lang);
  else if (stat && stat.value != null) out.total = escapeHtml(pick(stat.value, lang));
  return out;
}

// "{telegram} в Telegram" → "1 141 в Telegram". A known counter with no value
// (no live data AND no subscribers stat in the doc) drops out rather than
// leaking braces to the page; unknown placeholders stay as-is.
// Returns HTML-safe text (the counters are already escaped/formatted).
export function fillCounters(text, doc, lang) {
  const c = counters(doc, lang);
  return escapeHtml(text)
    .replace(/\{(telegram|linkedin|youtube|total)\}/g, (m, k) => (c[k] != null ? c[k] : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Russian plural for a counted noun: 1 подписчик · 2 подписчика · 5 подписчиков.
export function pluralRu(n, forms) {
  const a = Math.abs(Math.floor(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

// The subscribers total is live, so its RU unit must agree with whatever
// number arrives («6 069 подписчиков», «5 772 подписчика»). Recognised nouns
// are declined from the stored unit; anything else (and EN) passes through.
const RU_PLURALS = [['подписчик', 'подписчика', 'подписчиков']];
export function unitFor(unit, lang, total) {
  if (lang !== 'ru' || total == null) return unit;
  const n = Number(String(total).replace(/\D/g, ''));
  if (!Number.isFinite(n) || !String(total).replace(/\D/g, '')) return unit;
  const forms = RU_PLURALS.find((f) => f.includes(String(unit).trim()));
  return forms ? pluralRu(n, forms) : unit;
}

function statBlock(s, lang, doc, edit, path) {
  if (s.kind === 'subscribers') {
    const c = counters(doc, lang);
    // The total/channel numbers are auto/live (managed via the Settings drawer),
    // so only the unit label is inline-editable here.
    return `<div class="v4-stat"${eItem(edit, path)}>
        <div class="v4-stat-value">${c.total || ''}</div>
        <div class="v4-stat-unit"${eText(edit, path + '.unit')}>${escapeHtml(edit ? pick(s.unit, lang) : unitFor(pick(s.unit, lang), lang, c.total))}</div>
        <div class="v4-stat-aside">${CHANNELS.filter(([ch]) => c[ch])
          .map(([ch, abbr, name]) => `<span class="v4-stat-channel"><span aria-hidden="true">${abbr}</span><span class="sr-only">${name}:</span>&nbsp;${c[ch]}</span>`)
          .join('<span aria-hidden="true"> · </span>')}</div>
      </div>`;
  }
  return `<div class="v4-stat"${eItem(edit, path)}>
        <div class="v4-stat-value"${eText(edit, path + '.value')}>${escapeHtml(pick(s.value, lang))}</div>
        <div class="v4-stat-unit"${eText(edit, path + '.unit')}>${escapeHtml(pick(s.unit, lang))}</div>
        <div class="v4-stat-aside"${eText(edit, path + '.aside')}>${escapeHtml(pick(s.aside, lang))}</div>
      </div>`;
}

function careerRow(it, lang, edit, path) {
  // company renders inline markdown (may be a link) and, for the current role,
  // sits alongside an sr-only label + live-dot — so it's an md leaf wrapping
  // only the company name, never the surrounding structure.
  const company = eWrapMd(edit, path + '.company', renderInline(pick(it.company, lang)));
  const srLabel = lang === 'en' ? 'Current role:' : 'Текущая роль:';
  const companyInner = it.current
    ? `<span class="sr-only">${srLabel}</span> ${company} <span class="v4-live-dot" aria-hidden="true"></span>`
    : company;
  return `<div class="v4-career-row"${eItem(edit, path)}>
            <div class="period"${eText(edit, path + '.period')}>${escapeHtml(pick(it.period, lang))}</div>
            <div>
              <div class="company">${companyInner}</div>
              <div class="role"${eText(edit, path + '.role')}>${escapeHtml(pick(it.role, lang))}</div>
            </div>
            <div class="ctx"${eMd(edit, path + '.ctx')}>${renderCtx(pick(it.ctx, lang))}</div>
          </div>`;
}

function helpBlock(b, lang, edit, path) {
  if (b.type === 'subhead')
    return `<h3 class="v4-h3"${eItem(edit, path)}${eText(edit, path + '.text')}>${escapeHtml(pick(b.text, lang))}</h3>`;
  if (b.type === 'list') {
    return `<ul class="v4-list"${eItem(edit, path)}${edit ? ` data-edit-list="${path}.items"` : ''}>${b.items
      .map((i, j) => `<li${eItem(edit, path + '.items.' + j)}${eMd(edit, path + '.items.' + j)}>${renderInline(pick(i, lang))}</li>`)
      .join('')}</ul>`;
  }
  return '';
}

function ventureRow(it, lang, edit, path) {
  return `<div class="v4-venture"${eItem(edit, path)}>
            <div class="year"${eText(edit, path + '.year')}>${escapeHtml(it.year)}</div>
            <div>
              <div class="name">${eWrapMd(edit, path + '.name', renderInline(pick(it.name, lang)))} <span class="role-aside">· ${eWrap(edit, path + '.role', escapeHtml(pick(it.role, lang)))}</span></div>
              <div class="arc"${eText(edit, path + '.arc')}>${escapeHtml(pick(it.arc, lang))}</div>
            </div>
          </div>`;
}

// One card for every card-shaped thing on the site (home products, /uses
// software, /collaborate tiers): head row (tag [+ live dot] · meta), name,
// body, CTA. Every text leaf is inline markdown → renderInline escapes it.
function card({ item, tag, live, liveLabel, meta, metaClass, metaPath, name, body, cta, edit, path }) {
  // metaPath: the meta's own edit leaf; null when the meta carries its own anchors.
  const metaLeaf = metaPath === undefined ? path + '.version' : metaPath;
  const liveDot = live
    ? `\n              <span class="v4-live-dot" aria-hidden="true"></span>${liveLabel ? `<span class="sr-only">${liveLabel}</span>` : ''}`
    : '';
  const tagHtml = live
    ? `<span class="v4-product-tag-row">
              <span class="v4-tag"${eText(edit, path + '.tag')}>${tag}</span>${liveDot}
            </span>`
    : `<span class="v4-tag"${eText(edit, path + '.tag')}>${tag}</span>`;
  return `<article class="v4-product"${item ? eItem(edit, path) : ''}>
          <div class="v4-product-head">
            ${tagHtml}
            <span${metaClass ? ` class="${metaClass}"` : ''}${metaLeaf ? eText(edit, metaLeaf) : ''}>${meta}</span>
          </div>
          <h3 class="v4-product-name"${eText(edit, path + '.name')}>${name}</h3>
          ${body}
          ${cta}
        </article>`;
}

function productCard(it, lang, edit, path) {
  // Head meta: the version (synced from GitHub by scripts/sync-products.mjs).
  // The name links to the product like its button does — except in the
  // editor, where a click edits.
  const href = it.cta ? safeHref(pick(it.cta.href, lang) || it.cta.href) : '';
  const name = renderInline(it.name);
  return card({
    item: true,
    tag: renderInline(it.tag),
    live: !!it.live,
    liveLabel: lang === 'en' ? 'Live' : 'Работает',
    meta: renderInline(it.version),
    name: !edit && href ? `<a href="${escapeAttr(href)}"${isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${name}</a>` : name,
    body: `<p class="v4-product-desc"${eText(edit, path + '.desc')}>${renderInline(pick(it.desc, lang))}</p>`,
    cta: btn(it.cta, lang, edit, path + '.cta', false),
    edit, path,
  });
}

// The Telegram channel block on /notes (v0.31.0 moved it there from the
// homepage publications): tag + live counter, one line of prose, a «→» link.
export function channelItem(it, lang, doc) {
  const meta = fillCounters(pick(it.meta, lang), doc, lang);
  const more = it.more ? moreLink(it.more, lang, false, '') : '';
  return `<article class="v4-pub">
          <div class="v4-pub-head"><span class="v4-tag">${escapeHtml(it.tag)}</span><span>${meta}</span></div>
          <p class="v4-prose">${renderInline(pick(it.prose, lang))}</p>
          ${more}
        </article>`;
}

// --- /uses cards (structured) ---
// Text leaves are inline markdown (**bold**, `code`, literal NBSP) — the same
// contract as the home page; alt/href/image are attribute-escaped.
function gearCard(c, lang) {
  return `<article class="v4-use">
                <div class="v4-use-image">
                  <img src="${escapeAttr(c.image)}" alt="${escapeAttr(pick(c.alt, lang))}" loading="lazy" width="800" height="800" />
                </div>
                <span class="v4-tag">${renderInline(pick(c.tag, lang))}</span>
                <h4 class="v4-use-name">${renderInline(pick(c.name, lang))}</h4>
                <p class="v4-use-desc">${renderInline(pick(c.desc, lang))}</p>
              </article>`;
}
function gearGroup(g, lang) {
  return `<h3 class="v4-h3">${renderInline(pick(g.heading, lang))}</h3>
            <div class="v4-uses">
              ${g.cards.map((c) => gearCard(c, lang)).join('\n              ')}
            </div>`;
}
function softCard(c, lang) {
  return card({
    tag: renderInline(pick(c.tag, lang)),
    meta: renderInline(pick(c.price, lang)),
    name: renderInline(pick(c.name, lang)),
    body: `<p class="v4-product-desc">${renderInline(pick(c.desc, lang))}</p>`,
    cta: btn(c.cta, lang, false, '', false),
    edit: false, path: '',
  });
}

// --- /collaborate (structured) ---
// Multi-paragraph prose is block markdown (\n\n-joined paragraphs, "- " lists).
const liList = (items, lang, cls = 'v4-list') => `<ul class="${cls}">${(items || []).map((i) => `<li>${renderInline(pick(i, lang))}</li>`).join('')}</ul>`;
function collabGroups(groups, lang) {
  return (groups || []).map((g) => {
    let inner = '';
    if (g.kind === 'list') inner = liList(g.items, lang);
    else if (g.kind === 'spec') inner = `<dl class="v4-spec">${(g.rows || []).map((r) => `<dt>${renderInline(pick(r.term, lang))}</dt><dd>${renderInline(pick(r.def, lang))}</dd>`).join('')}</dl>`;
    else inner = `<div class="v4-prose">${renderProse(pick(g.prose, lang))}</div>`;
    return `<h3 class="v4-h3">${renderInline(pick(g.heading, lang))}</h3>\n            ${inner}`;
  }).join('\n            ');
}
function tierCard(t, lang) {
  return card({
    tag: renderInline(pick(t.tag, lang)),
    meta: renderInline(pick(t.price, lang)),
    metaClass: 'v4-pricing',
    name: renderInline(pick(t.name, lang)),
    body: liList(t.features, lang),
    cta: btn(t.cta, lang, false, '', false),
    edit: false, path: '',
  });
}

// One homepage «Публикации» row: date · tag · title. Own notes stay on the site;
// external materials open in a new tab with a trailing «→» (they leave the site).
function feedRow(e, lang) {
  const it = e.item;
  const date = it.date ? `<time class="v4-feed-date" datetime="${escapeAttr(it.date)}">${escapeHtml(fmtDate(it.date, lang))}</time>` : '';
  const tag = `<span class="v4-tag">${escapeHtml(e.kind === 'note' ? 'NOTE' : it.tag || 'LINK')}</span>`;
  const title = escapeHtml(pick(it.title, lang));
  const link = e.kind === 'note'
    ? `<a class="v4-feed-title" href="${noteUrl(it.slug, lang)}">${title}</a>`
    : `<a class="v4-feed-title" href="${escapeAttr(safeHref(it.href))}" target="_blank" rel="noopener noreferrer">${title}<span aria-hidden="true">&nbsp;→</span><span class="sr-only">${NEW_TAB[lang === 'en' ? 'en' : 'ru']}</span></a>`;
  return `<li class="v4-feed-row">${date}${tag}${link}</li>`;
}

export const renderers = {
  heroCtas: (doc, lang, edit) =>
    doc.hero.ctas.map((c, i) => btn(c, lang, edit, 'hero.ctas.' + i, true)).join('\n          '),

  stats: (doc, lang, edit) =>
    doc.stats.map((s, i) => statBlock(s, lang, doc, edit, 'stats.' + i)).join('\n      '),

  career: (doc, lang, edit) => {
    const sec = doc.sections.career;
    const rows = sec.items.map((it, i) => careerRow(it, lang, edit, 'sections.career.items.' + i)).join('\n          ');
    return rows + '\n          ' + moreLink(sec.more, lang, edit, 'sections.career.more');
  },

  ventures: (doc, lang, edit) =>
    doc.sections.ventures.items.map((it, i) => ventureRow(it, lang, edit, 'sections.ventures.items.' + i)).join('\n          '),

  products: (doc, lang, edit) =>
    doc.sections.products.items.map((it, i) => productCard(it, lang, edit, 'sections.products.items.' + i)).join('\n        '),

  // «Публикации»: the three newest feed entries (own notes + external materials),
  // attached to the doc as `_feed` by _middleware.js / the admin preview /
  // render-static. Not editable here — the feed has its own sources.
  notesFeed: (doc, lang, edit) => {
    const sec = doc.sections.notes || {};
    const rows = (doc._feed || []).slice(0, 3).map((e) => feedRow(e, lang)).join('\n            ');
    // «→ Все публикации» — a plain «→» link like «→ Подробнее на LinkedIn».
    const cta = sec.cta ? moreLink(sec.cta, lang, edit, 'sections.notes.cta') : '';
    return `${rows ? `<ul class="v4-feed">\n            ${rows}\n          </ul>\n          ` : ''}${cta}`;
  },

  // «Связаться»: who writes and why, the «→» link to read more first, then
  // one Telegram button with the reply time beside it.
  contact: (doc, lang, edit) => {
    const sec = doc.sections.contact;
    const ctas = sec.ctas.map((c, i) => btn(c, lang, edit, 'sections.contact.ctas.' + i, true)).join('\n          ');
    const reply = sec.reply ? `\n          <p class="v4-contact-reply"${eText(edit, 'sections.contact.reply')}>${escapeHtml(pick(sec.reply, lang))}</p>` : '';
    const links = (sec.links || []).map((l, i) => moreLink(l, lang, edit, 'sections.contact.links.' + i)).join('\n          ');
    return `<p class="v4-contact-note"${eText(edit, 'sections.contact.note')}>${escapeHtml(pick(sec.note, lang))}</p>${
      links ? `\n        <div class="v4-contact-links">\n          ${links}\n        </div>` : ''}
        <div class="v4-cta-row">
          ${ctas}${reply}
        </div>`;
  },

  usesGear: (doc, lang) =>
    ((doc.sections.hardware && doc.sections.hardware.groups) || []).map((g) => gearGroup(g, lang)).join('\n\n            '),

  usesProducts: (doc, lang) => {
    const sec = doc.sections.software || {};
    return `<div class="v4-prose">
              <p>${renderInline(pick(sec.intro, lang))}</p>
            </div>
            <div class="v4-softs">
              ${(sec.cards || []).map((c) => softCard(c, lang)).join('\n              ')}
            </div>`;
  },

  collabAbout: (doc, lang) => {
    const s = doc.sections.about;
    return `<div class="v4-body">
          <div class="v4-body-aside"></div>
          <div class="v4-prose">
            ${renderProse(pick(s.prose, lang))}
            ${liList(s.points, lang, 'v4-list v4-list--spaced')}
            <p class="v4-collab-clients">${renderInline(pick(s.clients, lang))}</p>
          </div>
        </div>`;
  },

  collabConsulting: (doc, lang) => {
    const s = doc.sections.consulting;
    return `<div class="v4-products">
          ${(s.tiers || []).map((t) => tierCard(t, lang)).join('\n          ')}
        </div>`;
  },

  collabStrategy: (doc, lang) => {
    const s = doc.sections.strategy;
    return `<div class="v4-body">
          <div class="v4-body-aside"></div>
          <div>
            <p class="v4-tagline v4-tagline--compact">${renderInline(pick(s.tagline, lang))}</p>
            ${collabGroups(s.groups, lang)}
            <p class="v4-terms">${renderInline(pick(s.terms, lang))}</p>
            <div class="v4-help-cta">${btn(s.cta, lang, false, '', false, false)}</div>
          </div>
        </div>`;
  },

  collabAngel: (doc, lang) => {
    const s = doc.sections.angel;
    return `<div class="v4-body">
          <div class="v4-body-aside"></div>
          <div>
            ${collabGroups(s.groups, lang)}
            <div class="v4-help-cta">${btn(s.cta, lang, false, '', false, true)}</div>
          </div>
        </div>`;
  },

  // «Как работаю / Чего не делаю» — moved here from the homepage (v0.31.1).
  collabWork: (doc, lang) => {
    const s = doc.sections.work;
    if (!s) return '';
    return `<div class="v4-body">
          <div class="v4-body-aside"></div>
          <div>
            ${(s.blocks || []).map((b) => helpBlock(b, lang, false, '')).join('\n            ')}
          </div>
        </div>`;
  },

  collabContact: (doc, lang) => {
    const s = doc.sections.contact;
    return `<div class="v4-contact">
          <div>
            <p class="v4-contact-note">${renderInline(pick(s.note, lang))}</p>
          </div>
          <div class="v4-cta-row">
            ${(s.ctas || []).map((c, i) => btn(c, lang, false, '', false, i === 0)).join('\n            ')}
          </div>
        </div>`;
  },
};
