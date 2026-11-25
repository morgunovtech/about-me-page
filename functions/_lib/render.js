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

import { pick, NEW_TAB, outMark } from './i18n.js';
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
  usesPrinciples: 'sections.principles.groups',
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
// A «more» link names what is behind it; the glyph is the renderer's, never
// the content's: «→» for a page of this site, «↗» for a link that leaves it.
// A glyph typed into the label is dropped, so a stored «→ …» cannot double it.
export function plainLabel(label) {
  return String(label == null ? '' : label).replace(/^\s*[→↗]\s*/, '').replace(/\s*[→↗]\s*$/, '');
}

function moreLink(more, lang, edit, path) {
  const href = safeHref(pick(more.href, lang));
  const label = escapeHtml(plainLabel(pick(more.label, lang)));
  const ext = isExternal(href);
  const mark = ext ? outMark(lang) : '<span aria-hidden="true">&nbsp;→</span>';
  return `<div class="v4-more"><a href="${escapeAttr(href)}"${
    ext ? ' target="_blank" rel="noopener noreferrer"' : ''
  }><span${path ? eText(edit, path + '.label') : ''}>${label}</span>${mark}</a></div>`;
}

function group(n, sep) {
  return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
export function fmtNum(n, lang) {
  return group(n, lang === 'en' ? ',' : '\u00a0');
}

// Subscriber counters — THE single source for every number on the page that
// mentions followers (the stats strip, the /notes channel panel, llms.txt).
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
  // «Now» is said once, by the period («2026 — сейчас») and the first place in
  // the list: no live dot and no sr-only «current role» beside the company.
  const company = eWrapMd(edit, path + '.company', renderInline(pick(it.company, lang)));
  return `<div class="v4-career-row"${eItem(edit, path)}>
            <div class="period"${eText(edit, path + '.period')}>${escapeHtml(pick(it.period, lang))}</div>
            <div>
              <div class="company">${company}</div>
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
// software, /consulting tiers): head row (the caption · a fact), name, body,
// CTA. Every text leaf is inline markdown → renderInline escapes it.
// No «live» mark: a product under «Работает» says so by standing there (the
// pulsing dot beside every card of the list told nothing, owner 2026-11-25);
// a doc's `live` flag is simply not read.
function card({ item, cls, tag, meta, metaClass, metaPath, name, nameTag = 'h3', body, cta, edit, path }) {
  // metaPath: the meta's own edit leaf; null when the meta carries its own anchors.
  const metaLeaf = metaPath === undefined ? path + '.version' : metaPath;
  return `<article class="v4-product${cls ? ' ' + cls : ''}"${item ? eItem(edit, path) : ''}>
          <div class="v4-product-head">
            <span class="v4-tag"${eText(edit, path + '.tag')}>${tag}</span>
            <span${metaClass ? ` class="${metaClass}"` : ''}${metaLeaf ? eText(edit, metaLeaf) : ''}>${meta}</span>
          </div>
          <${nameTag} class="v4-product-name"${eText(edit, path + '.name')}>${name}</${nameTag}>
          ${body}${cta ? `\n          ${cta}` : ''}
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
    meta: renderInline(it.version),
    metaClass: 'v4-version', // data: mono
    name: !edit && href ? `<a href="${escapeAttr(href)}"${isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${name}</a>` : name,
    body: `<p class="v4-product-desc"${eText(edit, path + '.desc')}>${renderInline(pick(it.desc, lang))}</p>`,
    cta: btn(it.cta, lang, edit, path + '.cta', false),
    edit, path,
  });
}

// The Telegram channel block on /notes: a panel that says what the channel is
// and how it differs from the notes here (posts are more frequent and looser),
// how many read it — the live counter with its noun declined — and one small
// «Подписаться» button. It replaced a «CHANNEL» tag with a counter floating at
// the other end of the row (owner, 2026-11-25).
const SUBSCRIBERS_RU = ['подписчик', 'подписчика', 'подписчиков'];
export function channelItem(it, lang, doc) {
  const l = lang === 'en' ? 'en' : 'ru';
  const c = counters(doc, l);
  const n = Number(String(c.telegram == null ? '' : c.telegram).replace(/\D/g, ''));
  const count = c.telegram && n > 0
    ? `${c.telegram}&nbsp;${l === 'ru' ? pluralRu(n, SUBSCRIBERS_RU) : n === 1 ? 'subscriber' : 'subscribers'}`
    : '';
  const since = pick(it.since, l) ? escapeHtml(pick(it.since, l)) : '';
  const more = it.more ? extLink({ label: plainLabel(pick(it.more.label, l)), href: it.more.href }, l) : '';
  const meta = [count, since, more].filter(Boolean).join(' · ');
  const href = it.cta ? safeHref(pick(it.cta.href, l) || it.cta.href) : '';
  const cta = href
    ? `\n          <a class="v4-btn v4-btn--sm" href="${escapeAttr(href)}"${
      isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(pick(it.cta.label, l))}</a>`
    : '';
  return `<section class="v4-channel" aria-labelledby="channel-title">
          <div>
            <h2 class="v4-channel-title" id="channel-title">${renderInline(pick(it.title, l))}</h2>
            <p class="v4-channel-desc">${renderInline(pick(it.prose, l))}</p>${
      meta ? `\n            <p class="v4-channel-meta">${meta}</p>` : ''}
          </div>${cta}
        </section>`;
}

// --- /privacy (structured) ---
// «Мои инструменты»: the live tools are the homepage product cards (the same
// card, version and description synced from GitHub by sync-products.mjs); a
// tool that is not ready yet is a pale card — «скоро» in place of the version,
// no link, no button.
function soonCard(it, lang) {
  return card({
    cls: 'v4-product--soon',
    tag: renderInline(it.tag),
    meta: escapeHtml(lang === 'en' ? 'Soon' : 'Скоро'),
    name: renderInline(it.name),
    body: `<p class="v4-product-desc">${renderInline(pick(it.desc, lang))}</p>`,
    cta: '',
    edit: false, path: '',
  });
}

// An off-site link inside a block of facts or a line of meta. `mark: false`
// leaves the «↗» out where every link of the block leaves the site (the kit's
// facts: six arrows a row said nothing); the new-tab note for screen readers
// stays either way.
function extLink(l, lang, { mark = true } = {}) {
  const href = safeHref(pick(l.href, lang) || l.href);
  const tail = mark ? outMark(lang) : `<span class="sr-only">${NEW_TAB[lang === 'en' ? 'en' : 'ru']}</span>`;
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${renderInline(pick(l.label, lang))}${tail}</a>`;
}

const KIT_TERMS = {
  ru: { site: 'Сайт', audit: 'Аудит', none: 'публичного нет', code: 'Код', os: 'Где работает', alt: 'Ещё' },
  en: { site: 'Site', audit: 'Audit', none: 'none published', code: 'Code', os: 'Runs on', alt: 'Also' },
};

// «Джентльменский набор»: one ROW per app — everything about it on one line of
// the page. Left: the name (a link to the official site), what it is and what
// it costs. Middle: why this one. Right: the proof as links — the official
// site by its domain, so a reader sees the address to download from, the
// independent audits, the source code, the platforms, the alternatives.
// (They were cards with a spec table and a button: 500px each, two a row.)
function kitRow(it, lang) {
  const t = KIT_TERMS[lang === 'en' ? 'en' : 'ru'];
  const href = it.cta ? safeHref(pick(it.cta.href, lang) || it.cta.href) : '';
  const name = renderInline(it.name);
  const kind = [pick(it.tag, lang), pick(it.price, lang)].filter(Boolean).map((x) => renderInline(x)).join(' · ');
  const link = (l) => extLink(l, lang, { mark: false });
  const rows = [];
  if (href) rows.push([t.site, link({ label: plainLabel(pick(it.cta.label, lang)), href })]);
  // A row without an audit says so in the same place — it only appears in a
  // group marked `unaudited` (tests/privacy.test.mjs keeps it there).
  rows.push([t.audit, (it.audits || []).length ? it.audits.map(link).join('; ') : t.none]);
  if (it.source) rows.push([t.code, link(it.source)]);
  if (it.platforms) rows.push([t.os, renderInline(pick(it.platforms, lang))]);
  if ((it.alternatives || []).length) rows.push([t.alt, it.alternatives.map(link).join(', ')]);
  return `<article class="v4-kit-row">
            <div class="v4-kit-id">
              <h4 class="v4-kit-name">${href ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${name}<span class="sr-only">${NEW_TAB[lang === 'en' ? 'en' : 'ru']}</span></a>` : name}</h4>${
      kind ? `\n              <p class="v4-kit-kind">${kind}</p>` : ''}
            </div>
            <p class="v4-kit-desc">${renderInline(pick(it.desc, lang))}</p>
            <dl class="v4-kit-facts">${rows.map(([dt, dd]) => `<div><dt>${dt}</dt> <dd>${dd}</dd></div>`).join('')}</dl>
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

// Where a feed entry lives, in one word: the platform of an external material
// (derived from its address, so it cannot be mistyped) or «Заметка» for a note
// of this site. It replaces the free-text tag (TALK / VIDEO / ARTICLE).
export function feedSource(e, lang) {
  if (e.kind === 'note') return lang === 'en' ? 'Note' : 'Заметка';
  let host = '';
  try { host = new URL(e.item.href).hostname.replace(/^www\./, ''); } catch { host = ''; }
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'YouTube';
  return host;
}

// «06.2025»: the month is enough in a list of links; <time> keeps the full date.
export function feedMonth(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  return m ? `${m[2]}.${m[1]}` : '';
}

// One homepage «Публикации» row: «date · source» in mono, then the title. Own
// notes stay on the site; external materials open in a new tab with «↗». On
// the English page an external material is in Russian unless it says otherwise
// (`lang: 'en'`), and the row says so — as its row on /en/notes does.
function feedRow(e, lang) {
  const it = e.item;
  const date = it.date ? `<time datetime="${escapeAttr(it.date)}">${escapeHtml(feedMonth(it.date))}</time>` : '';
  const foreign = e.kind !== 'note' && lang === 'en' && (it.lang || 'ru') !== 'en' ? 'in Russian' : '';
  const meta = [date, escapeHtml(feedSource(e, lang)), foreign].filter(Boolean).join(' · ');
  const title = escapeHtml(pick(it.title, lang));
  const link = e.kind === 'note'
    ? `<a class="v4-feed-title" href="${noteUrl(it.slug, lang)}">${title}</a>`
    : `<a class="v4-feed-title" href="${escapeAttr(safeHref(it.href))}" target="_blank" rel="noopener noreferrer">${title}${outMark(lang)}</a>`;
  return `<li class="v4-feed-row"><span class="v4-feed-meta">${meta}</span>${link}</li>`;
}

// The repos of the /privacy tools — the homepage groups those products (v2.2.2).
export function privacyRepos(privacyDoc) {
  const items = (privacyDoc && privacyDoc.sections && privacyDoc.sections.tools && privacyDoc.sections.tools.items) || [];
  return items.map((it) => it && it.repo).filter(Boolean);
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

  // «Работает» (v2.2.2): the products that are also tools on /privacy (`_privacyRepos`,
  // read from the privacy doc) get their own grid under the /privacy link —
  // the link introduces them instead of sitting in a stack of «more» links.
  // Without that list, or with nothing on one side, it is one grid as before.
  products: (doc, lang, edit) => {
    const sec = doc.sections.products;
    const card = (it) => productCard(it, lang, edit, 'sections.products.items.' + sec.items.indexOf(it));
    const grid = (list) => `<div class="v4-products">\n          ${list.map(card).join('\n          ')}\n        </div>`;
    const repos = new Set(doc._privacyRepos || []);
    const priv = sec.items.filter((it) => it.repo && repos.has(it.repo));
    const rest = sec.items.filter((it) => !priv.includes(it));
    if (!sec.privacy || !priv.length || !rest.length) return grid(sec.items);
    return `${grid(rest)}\n        ${moreLink(sec.privacy, lang, edit, 'sections.products.privacy')}\n        ${grid(priv)}`;
  },

  // «Публикации»: the three newest feed entries (own notes + external materials),
  // attached to the doc as `_feed` by _middleware.js / the admin preview /
  // render-static. Not editable here — the feed has its own sources.
  notesFeed: (doc, lang, edit) => {
    const sec = doc.sections.notes || {};
    const rows = (doc._feed || []).slice(0, 3).map((e) => feedRow(e, lang)).join('\n            ');
    const cta = sec.cta ? moreLink(sec.cta, lang, edit, 'sections.notes.cta') : '';
    return `${rows ? `<ul class="v4-feed">\n            ${rows}\n          </ul>\n          ` : ''}${cta}`;
  },

  // «Связаться»: one panel. Left — who writes and why. Right — ONE button
  // (Telegram) and, under it, the lines that go with it: the reply time and
  // the second channel as a line of text, never a second button. Under the
  // panel, last — the link to read more first. A cta whose href is mailto: is
  // the second channel: it never renders as a button.
  contact: (doc, lang, edit) => {
    const sec = doc.sections.contact;
    const hrefOf = (c) => String(pick(c.href, lang) || c.href || '');
    const isMail = (c) => /^mailto:/i.test(hrefOf(c));
    const buttons = sec.ctas.map((c, i) => (isMail(c) ? '' : btn(c, lang, edit, 'sections.contact.ctas.' + i, true)))
      .filter(Boolean).join('\n              ');
    const reply = sec.reply ? `\n            <p class="v4-contact-reply"${eText(edit, 'sections.contact.reply')}>${escapeHtml(pick(sec.reply, lang))}</p>` : '';
    const mails = sec.ctas.map((c, i) => (isMail(c)
      ? `<a href="${escapeAttr(safeHref(hrefOf(c)))}"${eText(edit, 'sections.contact.ctas.' + i + '.label')}>${escapeHtml(pick(c.label, lang))}</a>`
      : '')).filter(Boolean);
    const alt = mails.length ? `\n            <p class="v4-contact-alt">${lang === 'en' ? 'Or by e-mail: ' : 'Или на почту: '}${mails.join(', ')}</p>` : '';
    const links = (sec.links || []).map((l, i) => moreLink(l, lang, edit, 'sections.contact.links.' + i)).join('\n          ');
    return `<div class="v4-contact">
          <p class="v4-contact-note"${eText(edit, 'sections.contact.note')}>${escapeHtml(pick(sec.note, lang))}</p>
          <div class="v4-contact-act">
            <div class="v4-cta-row">
              ${buttons}
            </div>${reply}${alt}
          </div>
        </div>${
      links ? `\n        <div class="v4-contact-links">\n          ${links}\n        </div>` : ''}`;
  },

  // «Как устроен этот сайт» on /uses (v4.0.0, the former /about «Принципы»):
  // a few short parts, each a caption and markdown prose.
  usesPrinciples: (doc, lang) => {
    const s = doc.sections.principles;
    if (!s) return '';
    return (s.groups || [])
      .map((g) => `<h3 class="v4-h3">${escapeHtml(pick(g.title, lang))}</h3>\n            ${renderProse(pick(g.body, lang))}`)
      .join('\n            ');
  },

  usesGear: (doc, lang) =>
    ((doc.sections.hardware && doc.sections.hardware.groups) || []).map((g) => gearGroup(g, lang)).join('\n\n            '),

  usesProducts: (doc, lang) => {
    const sec = doc.sections.software || {};
    return `<div class="v4-prose">
              <p>${renderInline(pick(sec.intro, lang))}</p>
            </div>
            <div class="v4-products v4-products--after">
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
            ${s.proof ? `<p class="v4-collab-clients">${renderInline(pick(s.proof, lang))}</p>` : ''}
          </div>
        </div>`;
  },

  // The one phrase «с чем ко мне приходить» above the tiers, the reply time
  // under them, then who signs the contract (all optional: a doc saved before
  // v1.2.7 has none of them, before v2.2.2 no `legal`).
  collabConsulting: (doc, lang) => {
    const s = doc.sections.consulting;
    const lead = pick(s.prose, lang);
    const note = pick(s.note, lang);
    const legal = pick(s.legal, lang);
    return `${lead ? `<p class="v4-tagline v4-tagline--compact">${renderInline(lead)}</p>\n        ` : ''}<div class="v4-products">
          ${(s.tiers || []).map((t) => tierCard(t, lang)).join('\n          ')}
        </div>${note ? `\n        <p class="v4-terms">${renderInline(note)}</p>` : ''}${legal ? `\n        <p class="v4-terms">${renderInline(legal)}</p>` : ''}`;
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

  // «Партнёрства и медиа» (v1.7.0): what the owner is open to outside paid
  // consulting, the independence terms in the same paragraph, one button to the
  // page's contact. No prices, no audience numbers.
  collabPartnerships: (doc, lang) => {
    const s = doc.sections.partnerships;
    if (!s) return '';
    return `<div class="v4-body">
          <div class="v4-body-aside"></div>
          <div>
            <div class="v4-prose">
              ${renderProse(pick(s.prose, lang))}
              ${liList(s.items, lang, 'v4-list v4-list--spaced')}
            </div>
            <div class="v4-help-cta">${btn(s.cta, lang, false, '', false, false)}</div>
          </div>
        </div>`;
  },

  // /privacy «Мои инструменты»: a lead line, then the cards.
  privacyTools: (doc, lang) => {
    const s = doc.sections.tools || {};
    const lead = pick(s.prose, lang);
    const cards = (s.items || []).map((it, i) =>
      (it.soon ? soonCard(it, lang) : productCard(it, lang, false, 'sections.tools.items.' + i)));
    return `${lead ? `<p class="v4-tagline v4-tagline--compact">${renderInline(lead)}</p>\n        ` : ''}<div class="v4-products">
          ${cards.join('\n          ')}
        </div>`;
  },

  // /privacy «Джентльменский набор»: how the list was made (block prose), the
  // cards in groups by task, then the date the list was checked. A group may
  // carry a note under its caption — the group of the open-source tools that
  // have no audit yet explains why it is there.
  privacyKit: (doc, lang) => {
    const s = doc.sections.kit || {};
    const groups = (s.groups || []).map((g) => `<h3 class="v4-h3">${renderInline(pick(g.heading, lang))}</h3>${
      pick(g.note, lang) ? `\n        <p class="v4-kit-note">${renderInline(pick(g.note, lang))}</p>` : ''}
        <div class="v4-kit">
          ${(g.items || []).map((it) => kitRow(it, lang)).join('\n          ')}
        </div>`).join('\n        ');
    const note = pick(s.note, lang);
    return `<div class="v4-prose">${renderProse(pick(s.prose, lang))}</div>
        ${groups}${note ? `\n        <p class="v4-terms">${renderInline(note)}</p>` : ''}`;
  },

  // /privacy «Статьи»: the published notes of the doc's `topic` (newest first),
  // or — a doc saved before v2.2.0 — the notes it names by slug in `items`, in
  // that order; as rows of the publications feed («11.2025 · Заметка» + title →
  // /notes/<slug>), then «Все публикации →». `_articles` is attached by
  // _middleware.js / the admin preview; the English page lists a note only once
  // it has an English title — /en/notes/<slug> exists from then on.
  privacyArticles: (doc, lang) => {
    const s = doc.sections.articles || {};
    const all = doc._articles || [];
    const bySlug = new Map(all.map((a) => [a.slug, a]));
    const picked = s.topic
      ? all.filter((a) => Array.isArray(a.tags) && a.tags.includes(s.topic))
      : (s.items || []).map((slug) => bySlug.get(slug));
    const rows = picked
      .filter((a) => a && (lang !== 'en' || String((a.title && a.title.en) || '').trim()))
      .map((a) => feedRow({ kind: 'note', item: a }, lang))
      .join('\n            ');
    const lead = pick(s.prose, lang);
    const more = s.more ? moreLink(s.more, lang, false, '') : '';
    return `${lead ? `<p class="v4-tagline v4-tagline--compact">${renderInline(lead)}</p>\n        ` : ''}${
      rows ? `<ul class="v4-feed">\n            ${rows}\n          </ul>\n          ` : ''}${more}`;
  },

  // Shared by /consulting, /collaborate and /privacy: the same panel as the
  // homepage's — one line, one button.
  collabContact: (doc, lang) => {
    const s = doc.sections.contact;
    return `<div class="v4-contact">
          <p class="v4-contact-note">${renderInline(pick(s.note, lang))}</p>
          <div class="v4-contact-act">
            <div class="v4-cta-row">
              ${(s.ctas || []).map((c, i) => btn(c, lang, false, '', false, i === 0)).join('\n              ')}
            </div>
          </div>
        </div>`;
  },
};
