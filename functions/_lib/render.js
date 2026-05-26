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

import { pick } from './i18n.js';
import { escapeHtml, escapeAttr, isExternal, safeHref, renderInline, renderCtx } from './markdown.js';

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
  help: 'sections.help.blocks',
  ventures: 'sections.ventures.items',
  products: 'sections.products.items',
  publications: 'sections.publications.items',
  contact: 'sections.contact.ctas',
  usesGear: 'sections.hardware.groups',
  usesProducts: 'sections.software.cards',
};

// Channel icons for the subscribers stat — verbatim from the template.
const TG_SVG = `<svg class="v4-stat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 1.5 7.5 8.5"/><path d="M14.5 1.5 10 14.5 7.5 8.5 1.5 6Z"/></svg>`;
const LI_SVG = `<svg class="v4-stat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/><path d="M4.5 7v4.5"/><circle cx="4.5" cy="4.5" r="0.6" fill="currentColor"/><path d="M8 11.5v-4.5M8 9c0-1.3.8-2 2-2s2 .7 2 2v2.5"/></svg>`;
const YT_SVG = `<svg class="v4-stat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3.5" width="14" height="9" rx="2"/><path d="M6.5 6 11 8 6.5 10Z" fill="currentColor" stroke="none"/></svg>`;

// A single CTA / button anchor. Primary styling and target/rel are derived.
// `path` points at the cta object; `asItem` marks it as a reorderable list item.
function btn(cta, lang, edit, path, asItem) {
  const href = safeHref(pick(cta.href, lang));
  const label = escapeHtml(pick(cta.label, lang));
  const cls = 'v4-btn' + (cta.primary === true ? ' v4-btn-primary' : '');
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
function fmtNum(n, lang) {
  return group(n, lang === 'en' ? ',' : '\u00a0');
}

function statBlock(s, lang, live, edit, path) {
  if (s.kind === 'subscribers') {
    let tg, li, yt, total;
    if (s.auto !== false && live && live.subscribers) {
      const sub = live.subscribers;
      tg = fmtNum(sub.telegram, lang);
      li = fmtNum(sub.linkedin, lang);
      yt = fmtNum(sub.youtube, lang);
      total = fmtNum((+sub.telegram || 0) + (+sub.linkedin || 0) + (+sub.youtube || 0), lang);
    } else {
      const ch = s.channels;
      tg = escapeHtml(pick(ch.telegram, lang));
      li = escapeHtml(pick(ch.linkedin, lang));
      yt = escapeHtml(pick(ch.youtube, lang));
      total = escapeHtml(pick(s.value, lang));
    }
    // The total/channel numbers are auto/live (managed via the Settings drawer),
    // so only the unit label is inline-editable here.
    return `<div class="v4-stat"${eItem(edit, path)}>
        <div class="v4-stat-value">${total}</div>
        <div class="v4-stat-unit"${eText(edit, path + '.unit')}>${escapeHtml(pick(s.unit, lang))}</div>
        <div class="v4-stat-aside v4-stat-channels">
          <span class="v4-stat-channel">${TG_SVG}<span class="sr-only">Telegram:</span>${tg}</span>
          <span class="v4-stat-channel">${LI_SVG}<span class="sr-only">LinkedIn:</span>${li}</span>
          <span class="v4-stat-channel">${YT_SVG}<span class="sr-only">YouTube:</span>${yt}</span>
        </div>
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

function productCard(it, lang, edit, path) {
  const liveDot = it.live ? '<span class="v4-live-dot" aria-hidden="true"></span>' : '';
  return `<article class="v4-product"${eItem(edit, path)}>
          <div class="v4-product-head">
            <span class="v4-product-tag-row">
              <span class="v4-tag"${eText(edit, path + '.tag')}>${escapeHtml(it.tag)}</span>
              ${liveDot}
            </span>
            <span${eText(edit, path + '.version')}>${escapeHtml(it.version)}</span>
          </div>
          <h3 class="v4-product-name"${eText(edit, path + '.name')}>${escapeHtml(it.name)}</h3>
          <p class="v4-product-desc"${eText(edit, path + '.desc')}>${escapeHtml(pick(it.desc, lang))}</p>
          ${btn(it.cta, lang, edit, path + '.cta', false)}
        </article>`;
}

function pubItem(it, lang, edit, path) {
  const head = `<div class="v4-pub-head"><span class="v4-tag"${eText(edit, path + '.tag')}>${escapeHtml(
    it.tag
  )}</span><span${eText(edit, path + '.meta')}>${escapeHtml(pick(it.meta, lang))}</span></div>`;
  if (it.kind === 'links') {
    const lis = it.links
      .map(
        (l, j) =>
          `<li${eItem(edit, path + '.links.' + j)}><a href="${escapeAttr(safeHref(l.href))}" target="_blank" rel="noopener noreferrer"${eText(
            edit,
            path + '.links.' + j + '.label'
          )}>${escapeHtml(pick(l.label, lang))}</a></li>`
      )
      .join('');
    return `<article class="v4-pub"${eItem(edit, path)}>
          ${head}
          <ul class="v4-list"${edit ? ` data-edit-list="${path}.links"` : ''}>${lis}</ul>
        </article>`;
  }
  const prose = `<p class="v4-prose"${eMd(edit, path + '.prose')}>${renderInline(pick(it.prose, lang))}</p>`;
  const more = it.more ? moreLink(it.more, lang, edit, path + '.more') : '';
  return `<article class="v4-pub"${eItem(edit, path)}>
          ${head}
          ${prose}
          ${more}
        </article>`;
}

// --- /uses cards (structured, replaces the old verbatim-HTML blocks) ---
// Text fields (tag/name/desc/heading/intro/price/label) are stored as verbatim
// HTML fragments (they carry &nbsp; and inline <code>), so they're emitted RAW.
// alt + href + image are attribute-escaped.
function gearCard(c, lang) {
  return `<article class="v4-use">
                <div class="v4-use-image">
                  <img src="${escapeAttr(c.image)}" alt="${escapeAttr(pick(c.alt, lang))}" loading="lazy" width="800" height="800" />
                </div>
                <span class="v4-tag">${pick(c.tag, lang)}</span>
                <h4 class="v4-use-name">${c.name}</h4>
                <p class="v4-use-desc">${pick(c.desc, lang)}</p>
              </article>`;
}
function gearGroup(g, lang) {
  return `<h3 class="v4-h3">${pick(g.heading, lang)}</h3>
            <div class="v4-uses">
              ${g.cards.map((c) => gearCard(c, lang)).join('\n              ')}
            </div>`;
}
function softCard(c, lang) {
  return `<article class="v4-product">
                <div class="v4-product-head">
                  <span class="v4-tag">${pick(c.tag, lang)}</span>
                  <span>${pick(c.price, lang)}</span>
                </div>
                <h4 class="v4-product-name">${c.name}</h4>
                <p class="v4-product-desc">${pick(c.desc, lang)}</p>
                <a class="v4-btn" href="${escapeAttr(safeHref(c.cta.href))}" target="_blank" rel="noopener noreferrer">${pick(c.cta.label, lang)}</a>
              </article>`;
}

// --- /collaborate (structured, replaces verbatim-HTML blocks) ---
// Text fields carry inline HTML (&nbsp;, <strong>, <b>) → emitted raw; hrefs
// via safeHref. Multi-paragraph prose is stored \n\n-joined.
const paras = (md, lang) => (pick(md, lang) || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p}</p>`).join('\n            ');
const liList = (items, lang, cls = 'v4-list') => `<ul class="${cls}">${(items || []).map((i) => `<li>${pick(i, lang)}</li>`).join('')}</ul>`;
function collabCta(cta, lang, primary) {
  const href = safeHref(pick(cta.href, lang) || cta.href);
  return `<a class="v4-btn${primary ? ' v4-btn-primary' : ''}" href="${escapeAttr(href)}"${isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${pick(cta.label, lang)}</a>`;
}
function collabGroups(groups, lang) {
  return (groups || []).map((g) => {
    let inner = '';
    if (g.kind === 'list') inner = liList(g.items, lang);
    else if (g.kind === 'spec') inner = `<dl class="v4-spec">${(g.rows || []).map((r) => `<dt>${pick(r.term, lang)}</dt><dd>${pick(r.def, lang)}</dd>`).join('')}</dl>`;
    else inner = `<div class="v4-prose">${paras(g.prose, lang)}</div>`;
    return `<h3 class="v4-h3">${pick(g.heading, lang)}</h3>\n            ${inner}`;
  }).join('\n            ');
}

export const renderers = {
  heroCtas: (doc, lang, edit) =>
    doc.hero.ctas.map((c, i) => btn(c, lang, edit, 'hero.ctas.' + i, true)).join('\n          '),

  stats: (doc, lang, edit) =>
    doc.stats.map((s, i) => statBlock(s, lang, doc._live, edit, 'stats.' + i)).join('\n      '),

  career: (doc, lang, edit) => {
    const sec = doc.sections.career;
    const rows = sec.items.map((it, i) => careerRow(it, lang, edit, 'sections.career.items.' + i)).join('\n          ');
    return rows + '\n          ' + moreLink(sec.more, lang, edit, 'sections.career.more');
  },

  help: (doc, lang, edit) => {
    const sec = doc.sections.help;
    const blocks = sec.blocks.map((b, i) => helpBlock(b, lang, edit, 'sections.help.blocks.' + i)).join('\n          ');
    return blocks + `\n          <div class="v4-help-cta">${btn(sec.cta, lang, edit, 'sections.help.cta', false)}</div>`;
  },

  ventures: (doc, lang, edit) =>
    doc.sections.ventures.items.map((it, i) => ventureRow(it, lang, edit, 'sections.ventures.items.' + i)).join('\n          '),

  products: (doc, lang, edit) =>
    doc.sections.products.items.map((it, i) => productCard(it, lang, edit, 'sections.products.items.' + i)).join('\n        '),

  publications: (doc, lang, edit) =>
    doc.sections.publications.items.map((it, i) => pubItem(it, lang, edit, 'sections.publications.items.' + i)).join('\n        '),

  contact: (doc, lang, edit) => {
    const sec = doc.sections.contact;
    const ctas = sec.ctas.map((c, i) => btn(c, lang, edit, 'sections.contact.ctas.' + i, true)).join('\n          ');
    return `<p class="v4-contact-note"${eText(edit, 'sections.contact.note')}>${escapeHtml(pick(sec.note, lang))}</p>
        <div class="v4-cta-row">
          ${ctas}
        </div>`;
  },

  usesGear: (doc, lang) =>
    ((doc.sections.hardware && doc.sections.hardware.groups) || []).map((g) => gearGroup(g, lang)).join('\n\n            '),

  usesProducts: (doc, lang) => {
    const sec = doc.sections.software || {};
    return `<div class="v4-prose">
              <p>${pick(sec.intro, lang)}</p>
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
            ${paras(s.prose, lang)}
            ${liList(s.points, lang, 'v4-list v4-list--spaced')}
            <p class="v4-collab-clients">${pick(s.clients, lang)}</p>
          </div>
        </div>`;
  },

  collabConsulting: (doc, lang) => {
    const s = doc.sections.consulting;
    return `<div class="v4-products">
          ${(s.tiers || []).map((t) => `<article class="v4-product">
            <div class="v4-product-head">
              <span class="v4-tag">${pick(t.tag, lang)}</span>
              <span class="v4-pricing">${pick(t.price, lang)}</span>
            </div>
            <h3 class="v4-product-name">${t.name}</h3>
            ${liList(t.features, lang)}
            ${collabCta(t.cta, lang, false)}
          </article>`).join('\n          ')}
        </div>`;
  },

  collabStrategy: (doc, lang) => {
    const s = doc.sections.strategy;
    return `<div class="v4-body">
          <div class="v4-body-aside"></div>
          <div>
            <p class="v4-tagline v4-tagline--compact">${pick(s.tagline, lang)}</p>
            ${collabGroups(s.groups, lang)}
            <p class="v4-terms">${pick(s.terms, lang)}</p>
            <div class="v4-help-cta">${collabCta(s.cta, lang, false)}</div>
          </div>
        </div>`;
  },

  collabAngel: (doc, lang) => {
    const s = doc.sections.angel;
    return `<div class="v4-body">
          <div class="v4-body-aside"></div>
          <div>
            ${collabGroups(s.groups, lang)}
            <div class="v4-help-cta">${collabCta(s.cta, lang, true)}</div>
          </div>
        </div>`;
  },

  collabContact: (doc, lang) => {
    const s = doc.sections.contact;
    return `<div class="v4-contact">
          <div>
            <p class="v4-contact-note">${pick(s.note, lang)}</p>
          </div>
          <div class="v4-cta-row">
            ${(s.ctas || []).map((c, i) => collabCta(c, lang, i === 0)).join('\n            ')}
          </div>
        </div>`;
  },
};
