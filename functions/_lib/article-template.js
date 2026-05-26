// The article page shell, shared by the RU and EN /notes/<slug> routes. Embedded
// (not a static file) so there's no stray public /article URL and no RU/EN
// template pair to keep in structural sync. Chrome (critical CSS, FOUC theme
// script, fonts, header, footer) mirrors the other v4 pages. Content is filled
// by overlay() via the data-cms-* hooks; the route precomputes the scalar
// helpers (_url, _urlRu, _urlEn, _dateDisplay, _coverHtml).

const CRITICAL_CSS = `
    :root{--v4-bg:#edeae5;--v4-paper:#f5f2ed;--v4-fg:#14110d;--v4-muted:#5a554c;--v4-dim:#6c6759;--v4-line:#c9c5bd;--v4-line-soft:#d8d4cc;--v4-orange:#d9531e;--v4-orange-text:#b03e10;--v4-on-accent:#14110d;--v4-on-fg:#f5f2ed;--v4-mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;--v4-sans:"IBM Plex Sans",ui-sans-serif,-apple-system,"Segoe UI",sans-serif}
    [data-theme="dark"]{--v4-bg:#14130f;--v4-paper:#1c1a16;--v4-fg:#ece7dd;--v4-muted:#b8b0a2;--v4-dim:#8a8378;--v4-line:#3a3530;--v4-line-soft:#2a2620;--v4-orange:#ff6a2e;--v4-orange-text:#ff6a2e;--v4-on-accent:#14130f;--v4-on-fg:#14130f}
    [data-theme="high-contrast"]{--v4-bg:#000;--v4-paper:#0a0a0a;--v4-fg:#fff;--v4-muted:#f1eee7;--v4-dim:#d6d0c8;--v4-line:#fff;--v4-line-soft:#c8c8c8;--v4-orange:#ffd166;--v4-orange-text:#ffd166;--v4-on-accent:#000;--v4-on-fg:#000}
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0}
    body.v4-page{background:var(--v4-bg);color:var(--v4-fg);font-family:var(--v4-sans);font-size:14px;line-height:1.55;letter-spacing:-0.005em}
    [data-theme="high-contrast"] body.v4-page{font-size:16px}
    .v4-page .skip-link{position:fixed;top:-10rem;left:16px;background:var(--v4-orange);color:var(--v4-on-accent);padding:6px 12px;z-index:100;text-decoration:none;font-size:13px;transition:top .2s}
    .v4-page .skip-link:focus{top:8px}
    .v4-root{background:var(--v4-bg);color:var(--v4-fg);padding:36px 56px 56px;max-width:1280px;margin:0 auto}
    .v4-bar{display:flex;justify-content:space-between;align-items:center;padding:0 0 14px;margin-bottom:32px;border-bottom:1px solid var(--v4-fg);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .v4-bar-mid{display:flex;gap:6px 22px;justify-content:center;color:var(--v4-muted);flex-wrap:wrap}
    .v4-bar-mid a{color:inherit;text-decoration:none;padding:8px 4px;white-space:nowrap}
    .v4-bar-right{display:flex;gap:12px;justify-content:flex-end;align-items:center;color:var(--v4-fg)}
    .v4-lang{display:inline-flex;align-items:center;gap:6px}
    .v4-lang-link{color:var(--v4-muted);text-decoration:none;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;padding:8px 6px;border-bottom:1px solid transparent}
    .v4-lang-link.is-active{color:var(--v4-fg);border-bottom-color:var(--v4-orange)}
    .v4-lang-sep{color:var(--v4-dim)}
    .v4-theme{position:relative}
    .v4-icon-btn{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;background:transparent;color:var(--v4-fg);cursor:pointer;padding:0;font:inherit;border:none}
    .v4-icon-btn svg{width:14px;height:14px}
    .v4-icon-btn .v4-icon-moon,.v4-icon-btn .v4-icon-contrast{display:none}
    [data-theme="dark"] .v4-icon-btn .v4-icon-sun{display:none}
    [data-theme="dark"] .v4-icon-btn .v4-icon-moon{display:block}
    [data-theme="high-contrast"] .v4-icon-btn .v4-icon-sun{display:none}
    [data-theme="high-contrast"] .v4-icon-btn .v4-icon-contrast{display:block}
    .v4-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 16px;min-height:40px;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;text-decoration:none;cursor:pointer;border:1px solid var(--v4-fg);background:transparent;color:var(--v4-fg);font-family:inherit}
    .v4-article{max-width:680px;margin:0 auto}
    .v4-article-eyebrow{font-family:var(--v4-mono);font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--v4-muted);margin:0 0 16px}
    .v4-article-eyebrow a{color:inherit;text-decoration:none;border-bottom:1px solid var(--v4-line)}
    .v4-article-title{font-size:44px;line-height:1.05;letter-spacing:-.02em;font-weight:600;margin:0 0 14px}
    .v4-article-byline{font-family:var(--v4-mono);font-size:12px;color:var(--v4-dim);margin:0 0 28px}
    .v4-article-cover{margin:0 0 28px}
    .v4-article-cover img{width:100%;height:auto;display:block}
    .v4-article-body{font-size:17px;line-height:1.65;counter-reset:sec}
    .v4-article-body p{margin:0 0 18px}
    /* H2 renders like an /about numbered section: mono 01/02 + a top divider. */
    .v4-article-body h2{counter-increment:sec;border-top:1px solid var(--v4-fg);padding-top:14px;margin:40px 0 14px;font-size:22px;font-weight:600;letter-spacing:-.015em}
    .v4-article-body h2::before{content:counter(sec,decimal-leading-zero);display:block;font-family:var(--v4-mono);font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.1em;color:var(--v4-muted);margin-bottom:6px}
    .v4-article-body h2:first-child{border-top:none;padding-top:0;margin-top:0}
    .v4-article-body h3{font-size:20px;font-weight:600;margin:28px 0 10px}
    .v4-article-body blockquote{margin:0 0 18px;padding:2px 0 2px 18px;border-left:2px solid var(--v4-orange);color:var(--v4-muted)}
    .v4-article-body ul,.v4-article-body ol{margin:0 0 18px;padding-left:22px}
    .v4-article-body li{margin:0 0 6px}
    .v4-article-body a{color:var(--v4-fg);text-decoration:underline;text-decoration-color:var(--v4-orange);text-underline-offset:2px}
    .v4-article-body img{max-width:100%;height:auto;display:block;margin:24px 0}
    .v4-article-body pre{background:var(--v4-paper);border:1px solid var(--v4-line);padding:14px;overflow:auto;font-family:var(--v4-mono);font-size:13px;margin:0 0 18px}
    .v4-article-body code{font-family:var(--v4-mono);font-size:.9em}
    .v4-article-body hr{border:none;border-top:1px solid var(--v4-line);margin:30px 0}
    .v4-article-foot{margin-top:40px;padding-top:20px;border-top:1px solid var(--v4-line)}
    .v4-notes-title{font-size:40px;line-height:1.05;letter-spacing:-.02em;font-weight:600;margin:0 0 8px}
    .v4-notes-intro{color:var(--v4-muted);margin:0 0 32px}
    .v4-note-item{padding:0 0 22px;margin:0 0 22px;border-bottom:1px solid var(--v4-line-soft)}
    .v4-note-item:last-child{border-bottom:none}
    .v4-note-date{font-family:var(--v4-mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--v4-dim)}
    .v4-note-title{font-size:22px;font-weight:600;letter-spacing:-.015em;margin:6px 0 6px}
    .v4-note-title a{color:var(--v4-fg);text-decoration:none}
    .v4-note-title a:hover{color:var(--v4-orange-text)}
    .v4-note-excerpt{color:var(--v4-muted);margin:0}
    .v4-foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:48px;padding-top:18px;border-top:1px solid var(--v4-line);font-family:var(--v4-mono);font-size:11px;color:var(--v4-dim)}
    .v4-foot a{color:inherit}
    @media (max-width:960px){.v4-root{padding:28px 32px 40px}.v4-article-title{font-size:36px}}
    @media (max-width:640px){.v4-root{padding:20px 18px 32px}.v4-bar{flex-direction:column;align-items:stretch;row-gap:10px;font-size:10px}.v4-bar-right{align-self:flex-end}.v4-article-title{font-size:30px}.v4-article-body{font-size:16px}}
`;

const THEME_SCRIPT = `(function(){var d=document.documentElement;var p=localStorage.getItem('theme-preference')||'auto';var t=p==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;d.setAttribute('data-theme',t);d.setAttribute('data-theme-preference',p);})();`;

const T = {
  ru: {
    skip: 'Перейти к основному содержимому',
    notes: 'Заметки',
    home: 'Главная',
    back: '← Все заметки',
    themeLabel: 'Сменить тему оформления',
    themes: ['Светлая', 'Тёмная', 'Авто', 'Высокий контраст'],
    privacy: 'Без Cookies, трекеров и аналитики',
    locale: 'ru_RU',
    altLocale: 'en_US',
  },
  en: {
    skip: 'Skip to main content',
    notes: 'Notes',
    home: 'Home',
    back: '← All notes',
    themeLabel: 'Change theme',
    themes: ['Light', 'Dark', 'Auto', 'High contrast'],
    privacy: 'No cookies, no trackers, no analytics',
    locale: 'en_US',
    altLocale: 'ru_RU',
  },
};

const STYLES_VER = 'v=4ce67545';
const SCRIPT_VER = 'v=81fe9712';

export function articleShell(lang) {
  const t = T[lang] || T.ru;
  const ruActive = lang === 'ru' ? ' is-active' : '';
  const enActive = lang === 'en' ? ' is-active' : '';
  const notesHref = lang === 'en' ? '/en/notes' : '/notes';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title data-cms-text="meta.title">${t.notes}</title>
  <meta name="description" data-cms-content="meta.description" content="" />
  <meta name="author" content="Semyon Morgunov" />
  <meta name="theme-color" content="#edeae5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#14130f" media="(prefers-color-scheme: dark)" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/images/favicon.svg" type="image/svg+xml" media="(prefers-color-scheme: light)" />
  <link rel="icon" href="/images/favicon-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="canonical" data-cms-href="_url" href="" />
  <link rel="alternate" hreflang="ru" data-cms-href="_urlRu" href="" />
  <link rel="alternate" hreflang="en" data-cms-href="_urlEn" href="" />
  <link rel="alternate" hreflang="x-default" data-cms-href="_urlRu" href="" />
  <meta property="og:type" content="article" />
  <meta property="og:title" data-cms-content="share.title" content="" />
  <meta property="og:description" data-cms-content="share.description" content="" />
  <meta property="og:url" data-cms-content="_url" content="" />
  <meta property="og:image" data-cms-abs="share.image" content="" />
  <meta property="og:image:alt" data-cms-content="share.imageAlt" content="" />
  <meta property="og:site_name" content="morgunov.tech" />
  <meta property="og:locale" content="${t.locale}" />
  <meta property="og:locale:alternate" content="${t.altLocale}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" data-cms-content="share.title" content="" />
  <meta name="twitter:description" data-cms-content="share.description" content="" />
  <meta name="twitter:image" data-cms-abs="share.image" content="" />
  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-friendly content" />
  <style>${CRITICAL_CSS}</style>
  <link rel="preload" as="font" type="font/woff2" href="/fonts/plex-sans-${lang === 'en' ? 'latin' : 'cyr'}-400.woff2" crossorigin />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/plex-sans-${lang === 'en' ? 'latin' : 'cyr'}-600.woff2" crossorigin />
  <link rel="preload" href="/styles.css?${STYLES_VER}" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="/styles.css?${STYLES_VER}" /></noscript>
  <script>${THEME_SCRIPT}</script>
  <script type="application/ld+json" data-cms-jsonld></script>
</head>
<body class="v4-page no-transition" data-lang="${lang}">
  <a href="#main" class="skip-link">${t.skip}</a>
  <div class="v4-root">
    <header class="v4-bar" id="top">
      <nav class="v4-bar-mid" aria-label="${t.notes}">
        <a href="${lang === 'en' ? '/en/' : '/'}">${t.home}</a>
        <a href="${notesHref}">${t.notes}</a>
      </nav>
      <div class="v4-bar-right">
        <div class="v4-lang" aria-label="Language">
          <a class="v4-lang-link${ruActive}" data-cms-href="_urlRu" href="/notes">RU</a>
          <span class="v4-lang-sep" aria-hidden="true">·</span>
          <a class="v4-lang-link${enActive}" data-cms-href="_urlEn" href="/en/notes">EN</a>
        </div>
        <div class="v4-theme">
          <button class="v4-icon-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu" aria-label="${t.themeLabel}">
            <svg class="v4-icon-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"></path></svg>
            <svg class="v4-icon-moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9A6 6 0 1 1 7 2.5a4.5 4.5 0 0 0 6.5 6.5z"></path></svg>
            <svg class="v4-icon-contrast" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M8 2v12a6 6 0 0 0 0-12z" fill="currentColor"></path></svg>
          </button>
          <div class="v4-theme-menu" id="theme-menu">
            <button class="v4-theme-btn" type="button" data-theme-value="light" aria-pressed="false">${t.themes[0]}</button>
            <button class="v4-theme-btn" type="button" data-theme-value="dark" aria-pressed="false">${t.themes[1]}</button>
            <button class="v4-theme-btn" type="button" data-theme-value="auto" aria-pressed="false">${t.themes[2]}</button>
            <button class="v4-theme-btn" type="button" data-theme-value="high-contrast" aria-pressed="false">${t.themes[3]}</button>
          </div>
        </div>
      </div>
    </header>
    <main id="main">
      <article class="v4-article">
        <header>
          <p class="v4-article-eyebrow"><a href="${notesHref}">${t.notes}</a></p>
          <h1 class="v4-article-title" data-cms-text="title"></h1>
          <p class="v4-article-byline">Semyon Morgunov · <time data-cms-text="_dateDisplay"></time></p>
          <figure class="v4-article-cover" data-cms-html="_coverHtml"></figure>
        </header>
        <div class="v4-article-body" data-cms-html="body"></div>
        <footer class="v4-article-foot">
          <a class="v4-btn" href="${notesHref}">${t.back}</a>
        </footer>
      </article>
    </main>
    <footer class="v4-foot">
      <span>morgunov.tech · 2026 · <a href="${notesHref}">${t.notes}</a></span>
      <span class="v4-foot-privacy">${t.privacy}</span>
    </footer>
  </div>
  <button class="v4-scroll-top" type="button" aria-label="↑">↑</button>
  <script defer src="/script.js?${SCRIPT_VER}"></script>
</body>
</html>`;
}

const ORIGIN = 'https://s.morgunov.tech';

// The /notes feed/index page. Server-built (no KV overlay): listHtml and jsonLd
// are assembled by render-notes.js. Reuses the same chrome as articleShell.
export function notesIndexHtml(lang, listHtml, jsonLd) {
  const t = T[lang] || T.ru;
  const ruActive = lang === 'ru' ? ' is-active' : '';
  const enActive = lang === 'en' ? ' is-active' : '';
  const self = ORIGIN + (lang === 'en' ? '/en' : '') + '/notes';
  const intro = lang === 'en'
    ? 'Notes and essays — also on my Telegram channel, here without the platform lock-in.'
    : 'Заметки и эссе — то же, что в Telegram-канале, но без привязки к платформе.';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t.notes} — Semyon Morgunov</title>
  <meta name="description" content="${intro}" />
  <meta name="author" content="Semyon Morgunov" />
  <meta name="theme-color" content="#edeae5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#14130f" media="(prefers-color-scheme: dark)" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/images/favicon.svg" type="image/svg+xml" media="(prefers-color-scheme: light)" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="canonical" href="${self}" />
  <link rel="alternate" hreflang="ru" href="${ORIGIN}/notes" />
  <link rel="alternate" hreflang="en" href="${ORIGIN}/en/notes" />
  <link rel="alternate" hreflang="x-default" href="${ORIGIN}/notes" />
  <link rel="alternate" type="application/rss+xml" title="${t.notes}" href="/notes/feed.xml" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${t.notes} — Semyon Morgunov" />
  <meta property="og:description" content="${intro}" />
  <meta property="og:url" content="${self}" />
  <meta property="og:site_name" content="morgunov.tech" />
  <meta property="og:locale" content="${t.locale}" />
  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-friendly content" />
  <style>${CRITICAL_CSS}</style>
  <link rel="preload" as="font" type="font/woff2" href="/fonts/plex-sans-${lang === 'en' ? 'latin' : 'cyr'}-400.woff2" crossorigin />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/plex-sans-${lang === 'en' ? 'latin' : 'cyr'}-600.woff2" crossorigin />
  <link rel="preload" href="/styles.css?${STYLES_VER}" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="/styles.css?${STYLES_VER}" /></noscript>
  <script>${THEME_SCRIPT}</script>
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body class="v4-page no-transition" data-lang="${lang}">
  <a href="#main" class="skip-link">${t.skip}</a>
  <div class="v4-root">
    <header class="v4-bar" id="top">
      <nav class="v4-bar-mid" aria-label="${t.notes}">
        <a href="${lang === 'en' ? '/en/' : '/'}">${t.home}</a>
        <a href="${lang === 'en' ? '/en/notes' : '/notes'}">${t.notes}</a>
      </nav>
      <div class="v4-bar-right">
        <div class="v4-lang" aria-label="Language">
          <a class="v4-lang-link${ruActive}" href="${ORIGIN}/notes">RU</a>
          <span class="v4-lang-sep" aria-hidden="true">·</span>
          <a class="v4-lang-link${enActive}" href="${ORIGIN}/en/notes">EN</a>
        </div>
        <div class="v4-theme">
          <button class="v4-icon-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu" aria-label="${t.themeLabel}">
            <svg class="v4-icon-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"></path></svg>
            <svg class="v4-icon-moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9A6 6 0 1 1 7 2.5a4.5 4.5 0 0 0 6.5 6.5z"></path></svg>
            <svg class="v4-icon-contrast" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M8 2v12a6 6 0 0 0 0-12z" fill="currentColor"></path></svg>
          </button>
          <div class="v4-theme-menu" id="theme-menu">
            <button class="v4-theme-btn" type="button" data-theme-value="light" aria-pressed="false">${t.themes[0]}</button>
            <button class="v4-theme-btn" type="button" data-theme-value="dark" aria-pressed="false">${t.themes[1]}</button>
            <button class="v4-theme-btn" type="button" data-theme-value="auto" aria-pressed="false">${t.themes[2]}</button>
            <button class="v4-theme-btn" type="button" data-theme-value="high-contrast" aria-pressed="false">${t.themes[3]}</button>
          </div>
        </div>
      </div>
    </header>
    <main id="main">
      <div class="v4-article">
        <h1 class="v4-notes-title">${t.notes}</h1>
        <p class="v4-notes-intro">${intro}</p>
        ${listHtml}
      </div>
    </main>
    <footer class="v4-foot">
      <span>morgunov.tech · 2026 · <a href="${lang === 'en' ? '/en/' : '/'}">${t.home}</a></span>
      <span class="v4-foot-privacy">${t.privacy}</span>
    </footer>
  </div>
  <button class="v4-scroll-top" type="button" aria-label="↑">↑</button>
  <script defer src="/script.js?${SCRIPT_VER}"></script>
</body>
</html>`;
}
