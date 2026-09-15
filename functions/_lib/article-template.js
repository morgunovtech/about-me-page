// The article page shell and the /notes index shell, built from ONE set of
// chrome helpers (head links, top bar, footer, page tail) so the two never
// drift from each other — and from the static pages, whose header markup the
// helpers reproduce verbatim (nav dropdown, language menu, theme menu).
// Embedded (not a static file) so there's no stray public /article URL and no
// RU/EN template pair to keep in structural sync. Content is filled by
// overlay() via the data-cms-* hooks; the article route precomputes the scalar
// helpers (_url, _urlRu, _urlEn, _noEn, _dateDisplay, _coverHtml).
// Long-form styles (.v4-article-*, .v4-note-*) live in styles.css; the inline
// block below is only the above-the-fold subset, guarded by check-critical.

import { ORIGIN, NAME, BUILD } from './site.js';

const CRITICAL_CSS = `
    :root{--v4-bg:#edeae5;--v4-paper:#f5f2ed;--v4-fg:#14110d;--v4-muted:#5a554c;--v4-dim:#6c6759;--v4-line:#c9c5bd;--v4-line-soft:#d8d4cc;--v4-orange:#d9531e;--v4-orange-text:#b03e10;--v4-on-accent:#14110d;--v4-on-fg:#f5f2ed;--v4-mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;--v4-sans:"IBM Plex Sans",ui-sans-serif,-apple-system,"Segoe UI",sans-serif;--v4-label-size:11px;--v4-label-tracking:.1em;--v4-label-xs-size:10px;--v4-label-xs-tracking:.12em;--v4-label-weight:500;color-scheme:light dark}
    [data-theme="dark"]{--v4-bg:#14130f;--v4-paper:#1c1a16;--v4-fg:#ece7dd;--v4-muted:#b8b0a2;--v4-dim:#8a8378;--v4-line:#3a3530;--v4-line-soft:#2a2620;--v4-orange:#ff6a2e;--v4-orange-text:#ff6a2e;--v4-on-accent:#14130f;--v4-on-fg:#14130f;color-scheme:dark}
    [data-theme="high-contrast"]{--v4-bg:#000;--v4-paper:#0a0a0a;--v4-fg:#fff;--v4-muted:#f1eee7;--v4-dim:#d6d0c8;--v4-line:#fff;--v4-line-soft:#c8c8c8;--v4-orange:#ffd166;--v4-orange-text:#ffd166;--v4-on-accent:#000;--v4-on-fg:#000;color-scheme:dark}
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0}
    body.no-transition,body.no-transition *{transition:none!important}
    body.v4-page{background:var(--v4-bg);color:var(--v4-fg);font-family:var(--v4-sans);font-size:14px;line-height:1.55;letter-spacing:-0.005em}
    [data-theme="high-contrast"] body.v4-page{font-size:16px}
    .v4-page .skip-link{position:fixed;top:-10rem;left:16px;background:var(--v4-orange);color:var(--v4-on-accent);padding:6px 12px;z-index:100;text-decoration:none;font-size:13px;transition:top .2s}
    .v4-page .skip-link:focus{top:8px}
`;

const CHEVRON = '<svg class="v4-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>';

const THEME_SCRIPT = `(function(){var d=document.documentElement;var p='auto';try{p=localStorage.getItem('theme-preference')||'auto'}catch(e){}var t=p==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;d.setAttribute('data-theme',t);d.setAttribute('data-theme-preference',p);if(p!=='auto'){var c=t==='dark'?'#14130f':t==='high-contrast'?'#000000':'#edeae5';var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute('content',c)}})();`;

const T = {
  ru: {
    skip: 'Перейти к основному содержимому',
    mainNav: 'Основная навигация',
    notes: 'Заметки',
    home: 'Главная',
    back: '← Все заметки',
    menu: 'Меню',
    langLabel: 'сменить язык',
    themeLabel: 'Сменить тему оформления',
    themes: ['Светлая', 'Тёмная', 'Авто', 'Высокий контраст'],
    privacy: 'Без Cookies, трекеров и аналитики',
    principles: 'принципы',
    uses: 'стек',
    notesFoot: 'заметки',
    typo: 'нашли опечатку?',
    typoSubject: 'Опечатка на morgunov.tech',
    scrollTop: 'Наверх',
    feed: 'Заметки — RSS',
    locale: 'ru_RU',
    altLocale: 'en_US',
  },
  en: {
    skip: 'Skip to main content',
    mainNav: 'Main navigation',
    notes: 'Notes',
    home: 'Home',
    back: '← All notes',
    menu: 'Menu',
    langLabel: 'change language',
    themeLabel: 'Switch theme',
    themes: ['Light', 'Dark', 'Auto', 'High contrast'],
    privacy: 'No cookies, no trackers, no analytics',
    principles: 'principles',
    uses: 'uses',
    notesFoot: 'notes',
    typo: 'found a typo?',
    typoSubject: 'Typo on morgunov.tech',
    scrollTop: 'Back to top',
    feed: 'Notes — RSS',
    locale: 'en_US',
    altLocale: 'ru_RU',
  },
};

const STYLES_VER = 'v=244a73f1';
const SCRIPT_VER = 'v=c2d17bcd';
const FONTS_VER = 'v=64eea157';
const TOKENS_VER = 'v=fa7fc139';
const BASE_VER = 'v=0e404315';
const COMPONENTS_VER = 'v=434c30e7';

const L = (lang) => (lang === 'en' ? 'en' : 'ru');
const p = (lang, path) => (L(lang) === 'en' ? '/en' : '') + path;

// Icons, theme-color, the minimal critical block, font preloads, the five
// render-blocking stylesheets and the FOUC script — identical on both shells
// and mirrors the static pages' <head>.
function headChrome(lang) {
  // Latin faces always (digits, «RU», latin words, morgunov.tech); cyrillic on RU.
  const subs = L(lang) === 'en' ? ['latin'] : ['cyr', 'latin'];
  const fontPreloads = subs
    .flatMap((sub) => [`plex-sans-${sub}-400`, `plex-sans-${sub}-500`, `plex-sans-${sub}-600`, `plex-mono-${sub}-400`])
    .concat(['plex-mono-latin-500'])
    .filter((f, i, a) => a.indexOf(f) === i)
    .map((f) => `  <link rel="preload" as="font" type="font/woff2" href="/fonts/${f}.woff2" crossorigin />`)
    .join('\n');
  return `  <meta name="author" content="${NAME.en}" />
  <meta name="theme-color" content="#edeae5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#14130f" media="(prefers-color-scheme: dark)" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/images/favicon.svg" type="image/svg+xml" media="(prefers-color-scheme: light)" />
  <link rel="icon" href="/images/favicon-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-friendly content" />
  <style>${CRITICAL_CSS}</style>
${fontPreloads}
  <link rel="stylesheet" href="/ds/v1/fonts.css?${FONTS_VER}" />
  <link rel="stylesheet" href="/ds/v1/tokens.css?${TOKENS_VER}" />
  <link rel="stylesheet" href="/ds/v1/base.css?${BASE_VER}" />
  <link rel="stylesheet" href="/ds/v1/components.css?${COMPONENTS_VER}" />
  <link rel="stylesheet" href="/styles.css?${STYLES_VER}" />
  <script data-cfasync="false">${THEME_SCRIPT}</script>`;
}

// Share card meta for a static (non-CMS) page: the branded 1200×630 card.
function shareChrome(lang, { title, description, url }) {
  const t = T[L(lang)];
  const img = `${ORIGIN}/images/og-card-${L(lang)}.png`;
  return `  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${title}" />
  <meta property="og:site_name" content="morgunov.tech" />
  <meta property="og:locale" content="${t.locale}" />
  <meta property="og:locale:alternate" content="${t.altLocale}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${img}" />
  <meta name="twitter:image:alt" content="${title}" />`;
}

function themeMenu(lang) {
  const t = T[L(lang)];
  return `        <div class="v4-dropdown v4-theme">
          <button class="v4-icon-btn" type="button" aria-haspopup="menu" aria-controls="theme-menu" id="theme-toggle" aria-label="${t.themeLabel}">
            <svg class="v4-icon-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"></path></svg>
            <svg class="v4-icon-moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9A6 6 0 1 1 7 2.5a4.5 4.5 0 0 0 6.5 6.5z"></path></svg>
            <svg class="v4-icon-contrast" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M8 2v12a6 6 0 0 0 0-12z" fill="currentColor"></path></svg>
          </button>
          <div class="v4-menu v4-theme-menu" id="theme-menu" role="menu" aria-labelledby="theme-toggle">
            <button class="v4-menu-item v4-theme-btn" type="button" role="menuitemradio" data-theme-value="light" aria-checked="false">${t.themes[0]}</button>
            <button class="v4-menu-item v4-theme-btn" type="button" role="menuitemradio" data-theme-value="dark" aria-checked="false">${t.themes[1]}</button>
            <button class="v4-menu-item v4-theme-btn" type="button" role="menuitemradio" data-theme-value="auto" aria-checked="false">${t.themes[2]}</button>
            <button class="v4-menu-item v4-theme-btn" type="button" role="menuitemradio" data-theme-value="high-contrast" aria-checked="false">${t.themes[3]}</button>
          </div>
        </div>`;
}

// The top bar. `ru`/`en` are the two language hrefs; `enAttrs` lets the
// article shell tag the English item for removal when no EN text exists.
function barChrome(lang, { ru, en, ruAttrs = '', enAttrs = '' }) {
  const l = L(lang);
  const t = T[l];
  return `    <header class="v4-bar" id="top">
      <nav class="v4-nav v4-dropdown" aria-label="${t.mainNav}">
        <button class="v4-bar-btn v4-nav-toggle" type="button" aria-controls="site-nav">${t.menu}${CHEVRON}</button>
        <div class="v4-bar-mid" id="site-nav">
          <a href="${p(l, '/')}">${t.home}</a>
          <a href="${p(l, '/notes')}">${t.notes}</a>
        </div>
      </nav>
      <div class="v4-bar-right">
        <div class="v4-dropdown v4-lang">
          <button class="v4-bar-btn v4-lang-btn" type="button" aria-haspopup="menu" aria-controls="lang-menu" id="lang-toggle" aria-label="${l === 'en' ? 'EN' : 'RU'} — ${t.langLabel}">${l === 'en' ? 'EN' : 'RU'}${CHEVRON}</button>
          <div class="v4-menu" id="lang-menu" role="menu" aria-labelledby="lang-toggle">
            <a class="v4-menu-item v4-lang-link" role="menuitemradio" aria-checked="${l === 'ru'}"${ruAttrs} href="${ru}" hreflang="ru" lang="ru">Русский</a>
            <a class="v4-menu-item v4-lang-link" role="menuitemradio" aria-checked="${l === 'en'}"${enAttrs} href="${en}" hreflang="en" lang="en">English</a>
          </div>
        </div>
${themeMenu(l)}
      </div>
    </header>`;
}

// Same footer as the static pages. The build link shows the deployed commit:
// the article shell gets it via overlay (_build/_buildUrl), the server-built
// notes index receives it as `build`; the literal is the stamped fallback.
function footChrome(lang, build) {
  const l = L(lang);
  const t = T[l];
  const sha = build || BUILD;
  return `    <footer class="v4-foot">
      <span>morgunov.tech · 2026 · build&nbsp;<a href="https://github.com/morgunovtech/about-me-page/commit/${sha}" data-cms-href="_buildUrl" target="_blank" rel="noopener noreferrer"><code data-cms-text="_build">${sha}</code></a> · <a href="${p(l, '/notes')}">${t.notesFoot}</a> · <a href="${p(l, '/about')}">${t.principles}</a> · <a href="${p(l, '/uses')}">${t.uses}</a> · <a href="mailto:s@morgunov.tech?subject=${encodeURIComponent(t.typoSubject)}">${t.typo}</a></span>
      <span class="v4-foot-privacy">${t.privacy}</span>
    </footer>`;
}

// `ldScript`: the JSON-LD block sits at the end of <body> so the parser reaches
// the content sooner (search engines read it anywhere in the document).
function tailChrome(lang, ldScript) {
  const t = T[L(lang)];
  return `  <button class="v4-scroll-top" type="button" aria-label="${t.scrollTop}">↑</button>
  <div class="v4-scroll-progress" aria-hidden="true"></div>
  ${ldScript}
  <script data-cfasync="false" defer src="/script.js?${SCRIPT_VER}"></script>`;
}

export function articleShell(lang) {
  const l = L(lang);
  const t = T[l];
  const notesHref = p(l, '/notes');
  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title data-cms-text="meta.title">${t.notes}</title>
  <meta name="description" data-cms-content="meta.description" content="" />
  <link rel="canonical" data-cms-href="_url" href="" />
  <link rel="alternate" hreflang="ru" data-cms-href="_urlRu" href="" />
  <link rel="alternate" hreflang="en" data-cms-href="_urlEn" data-cms-omit="_noEn" href="" />
  <link rel="alternate" hreflang="x-default" data-cms-href="_urlRu" href="" />
  <link rel="alternate" type="application/rss+xml" title="${t.feed}" href="${notesHref}/feed.xml" />
  <meta property="og:type" content="article" />
  <meta property="og:title" data-cms-content="share.title" content="" />
  <meta property="og:description" data-cms-content="share.description" content="" />
  <meta property="og:url" data-cms-content="_url" content="" />
  <meta property="og:image" data-cms-abs="share.image" content="" />
  <meta property="og:image:alt" data-cms-content="share.imageAlt" content="" />
  <meta property="og:site_name" content="morgunov.tech" />
  <meta property="og:locale" content="${t.locale}" />
  <meta property="og:locale:alternate" content="${t.altLocale}" />
  <meta property="article:published_time" data-cms-content="date" content="" />
  <meta property="article:modified_time" data-cms-content="dateModified" content="" />
  <meta property="article:author" content="${ORIGIN}/" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" data-cms-content="share.title" content="" />
  <meta name="twitter:description" data-cms-content="share.description" content="" />
  <meta name="twitter:image" data-cms-abs="share.image" content="" />
  <meta name="twitter:image:alt" data-cms-content="share.imageAlt" content="" />
${headChrome(l)}
</head>
<body class="v4-page no-transition" data-lang="${l}">
  <a href="#main" class="skip-link">${t.skip}</a>
  <div class="v4-root">
${barChrome(l, { ru: '/notes', en: '/en/notes', ruAttrs: ' data-cms-href="_urlRu"', enAttrs: ' data-cms-href="_urlEn" data-cms-omit="_noEn"' })}
    <main id="main">
      <article class="v4-article">
        <header>
          <p class="v4-article-eyebrow"><a href="${notesHref}">${t.notes}</a></p>
          <h1 class="v4-article-title" data-cms-text="title"></h1>
          <p class="v4-article-byline">${NAME[l]} · <span data-cms-html="_dateHtml"></span></p>
          <figure class="v4-article-cover" data-cms-html="_coverHtml"></figure>
        </header>
        <div class="v4-article-body" data-cms-html="body"></div>
        <footer class="v4-article-foot">
          <a class="v4-btn" href="${notesHref}">${t.back}</a>
        </footer>
      </article>
    </main>
${footChrome(l)}
  </div>
${tailChrome(l, '<script type="application/ld+json" data-cms-jsonld></script>')}
</body>
</html>`;
}

// The /notes feed/index page. Server-built (no KV overlay): listHtml and jsonLd
// are assembled by render-notes.js. Same chrome as articleShell.
export function notesIndexHtml(lang, listHtml, jsonLd, build) {
  const l = L(lang);
  const t = T[l];
  const self = ORIGIN + p(l, '/notes');
  const title = `${t.notes} — ${NAME[l]}`;
  const intro = l === 'en'
    ? 'Notes and essays — also on my Telegram channel, here without the platform lock-in.'
    : 'Заметки и эссе — то же, что в Telegram-канале, но без привязки к платформе.';
  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${intro}" />
  <link rel="canonical" href="${self}" />
  <link rel="alternate" hreflang="ru" href="${ORIGIN}/notes" />
  <link rel="alternate" hreflang="en" href="${ORIGIN}/en/notes" />
  <link rel="alternate" hreflang="x-default" href="${ORIGIN}/notes" />
  <link rel="alternate" type="application/rss+xml" title="${t.feed}" href="${p(l, '/notes')}/feed.xml" />
${shareChrome(l, { title, description: intro, url: self })}
${headChrome(l)}
</head>
<body class="v4-page no-transition" data-lang="${l}">
  <a href="#main" class="skip-link">${t.skip}</a>
  <div class="v4-root">
${barChrome(l, { ru: '/notes', en: '/en/notes' })}
    <main id="main">
      <div class="v4-article">
        <h1 class="v4-notes-title">${t.notes}</h1>
        <p class="v4-notes-intro">${intro}</p>
        ${listHtml}
      </div>
    </main>
${footChrome(l, build)}
  </div>
${tailChrome(l, `<script type="application/ld+json">${jsonLd}</script>`)}
</body>
</html>`;
}
