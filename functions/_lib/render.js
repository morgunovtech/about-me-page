// Component renderers. Each entry in `renderers` returns the inner HTML for a
// container marked with data-cms-list in the template. Markup mirrors the
// static templates exactly so the rendered page is visually identical.

import { pick } from './i18n.js';
import { escapeHtml, renderInline, renderProse, renderCtx } from './markdown.js';

const isExternal = (href) => /^https?:\/\//i.test(String(href));
const attrEsc = (s) => escapeHtml(s).replace(/"/g, '&quot;');

// Channel icons for the subscribers stat — verbatim from the template.
const TG_SVG = `<svg class="v4-stat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 1.5 7.5 8.5"/><path d="M14.5 1.5 10 14.5 7.5 8.5 1.5 6Z"/></svg>`;
const LI_SVG = `<svg class="v4-stat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/><path d="M4.5 7v4.5"/><circle cx="4.5" cy="4.5" r="0.6" fill="currentColor"/><path d="M8 11.5v-4.5M8 9c0-1.3.8-2 2-2s2 .7 2 2v2.5"/></svg>`;
const YT_SVG = `<svg class="v4-stat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3.5" width="14" height="9" rx="2"/><path d="M6.5 6 11 8 6.5 10Z" fill="currentColor" stroke="none"/></svg>`;

// A single CTA / button anchor. Primary styling and target/rel are derived.
function btn(cta, lang) {
  const href = pick(cta.href, lang);
  const label = escapeHtml(pick(cta.label, lang));
  const cls = 'v4-btn' + (cta.primary === true ? ' v4-btn-primary' : '');
  const ext = isExternal(href);
  return `<a class="${cls}" href="${attrEsc(href)}"${
    ext ? ' target="_blank" rel="noopener noreferrer"' : ''
  }>${label}</a>`;
}

// A "→ ..." footer link (always external in home content).
function moreLink(more, lang) {
  const href = pick(more.href, lang);
  const label = escapeHtml(pick(more.label, lang));
  const ext = isExternal(href);
  return `<div class="v4-more"><a href="${attrEsc(href)}"${
    ext ? ' target="_blank" rel="noopener noreferrer"' : ''
  }>${label}</a></div>`;
}

function group(n, sep) {
  return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
function fmtNum(n, lang) {
  return group(n, lang === 'en' ? ',' : '\u00a0');
}

function statBlock(s, lang, live) {
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
    return `<div class="v4-stat">
        <div class="v4-stat-value">${total}</div>
        <div class="v4-stat-unit">${escapeHtml(pick(s.unit, lang))}</div>
        <div class="v4-stat-aside v4-stat-channels">
          <span class="v4-stat-channel">${TG_SVG}<span class="sr-only">Telegram:</span>${tg}</span>
          <span class="v4-stat-channel">${LI_SVG}<span class="sr-only">LinkedIn:</span>${li}</span>
          <span class="v4-stat-channel">${YT_SVG}<span class="sr-only">YouTube:</span>${yt}</span>
        </div>
      </div>`;
  }
  return `<div class="v4-stat">
        <div class="v4-stat-value">${escapeHtml(pick(s.value, lang))}</div>
        <div class="v4-stat-unit">${escapeHtml(pick(s.unit, lang))}</div>
        <div class="v4-stat-aside">${escapeHtml(pick(s.aside, lang))}</div>
      </div>`;
}

function careerRow(it, lang) {
  const company = renderInline(pick(it.company, lang));
  const srLabel = lang === 'en' ? 'Current role:' : 'Текущая роль:';
  const companyInner = it.current
    ? `<span class="sr-only">${srLabel}</span> ${company} <span class="v4-live-dot" aria-hidden="true"></span>`
    : company;
  return `<div class="v4-career-row">
            <div class="period">${escapeHtml(pick(it.period, lang))}</div>
            <div>
              <div class="company">${companyInner}</div>
              <div class="role">${escapeHtml(pick(it.role, lang))}</div>
            </div>
            <div class="ctx">${renderCtx(pick(it.ctx, lang))}</div>
          </div>`;
}

function helpBlock(b, lang) {
  if (b.type === 'subhead') return `<h3 class="v4-h3">${escapeHtml(pick(b.text, lang))}</h3>`;
  if (b.type === 'list') {
    return `<ul class="v4-list">${b.items
      .map((i) => `<li>${renderInline(pick(i, lang))}</li>`)
      .join('')}</ul>`;
  }
  return '';
}

function ventureRow(it, lang) {
  return `<div class="v4-venture">
            <div class="year">${escapeHtml(it.year)}</div>
            <div>
              <div class="name">${renderInline(pick(it.name, lang))} <span class="role-aside">· ${escapeHtml(pick(it.role, lang))}</span></div>
              <div class="arc">${escapeHtml(pick(it.arc, lang))}</div>
            </div>
          </div>`;
}

function productCard(it, lang) {
  const liveDot = it.live ? '<span class="v4-live-dot" aria-hidden="true"></span>' : '';
  return `<article class="v4-product">
          <div class="v4-product-head">
            <span class="v4-product-tag-row">
              <span class="v4-tag">${escapeHtml(it.tag)}</span>
              ${liveDot}
            </span>
            <span>${escapeHtml(it.version)}</span>
          </div>
          <h3 class="v4-product-name">${escapeHtml(it.name)}</h3>
          <p class="v4-product-desc">${escapeHtml(pick(it.desc, lang))}</p>
          ${btn(it.cta, lang)}
        </article>`;
}

function pubItem(it, lang) {
  const head = `<div class="v4-pub-head"><span class="v4-tag">${escapeHtml(
    it.tag
  )}</span><span>${escapeHtml(pick(it.meta, lang))}</span></div>`;
  if (it.kind === 'links') {
    const lis = it.links
      .map(
        (l) =>
          `<li><a href="${attrEsc(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            pick(l.label, lang)
          )}</a></li>`
      )
      .join('');
    return `<article class="v4-pub">
          ${head}
          <ul class="v4-list">${lis}</ul>
        </article>`;
  }
  const prose = `<p class="v4-prose">${renderInline(pick(it.prose, lang))}</p>`;
  const more = it.more ? moreLink(it.more, lang) : '';
  return `<article class="v4-pub">
          ${head}
          ${prose}
          ${more}
        </article>`;
}

export const renderers = {
  heroCtas: (doc, lang) => doc.hero.ctas.map((c) => btn(c, lang)).join('\n          '),

  stats: (doc, lang) => doc.stats.map((s) => statBlock(s, lang, doc._live)).join('\n      '),

  career: (doc, lang) => {
    const sec = doc.sections.career;
    const rows = sec.items.map((it) => careerRow(it, lang)).join('\n          ');
    return rows + '\n          ' + moreLink(sec.more, lang);
  },

  help: (doc, lang) => {
    const sec = doc.sections.help;
    const blocks = sec.blocks.map((b) => helpBlock(b, lang)).join('\n          ');
    return blocks + `\n          <div class="v4-help-cta">${btn(sec.cta, lang)}</div>`;
  },

  ventures: (doc, lang) =>
    doc.sections.ventures.items.map((it) => ventureRow(it, lang)).join('\n          '),

  products: (doc, lang) =>
    doc.sections.products.items.map((it) => productCard(it, lang)).join('\n        '),

  publications: (doc, lang) =>
    doc.sections.publications.items.map((it) => pubItem(it, lang)).join('\n        '),

  contact: (doc, lang) => {
    const sec = doc.sections.contact;
    const ctas = sec.ctas.map((c) => btn(c, lang)).join('\n          ');
    return `<p class="v4-contact-note">${escapeHtml(pick(sec.note, lang))}</p>
        <div class="v4-cta-row">
          ${ctas}
        </div>`;
  },
};

// Re-exported for the about prose (block markdown overlay).
export { renderProse };
