# CLAUDE.md — about-me-page

Personal homepage for Semyon Morgunov, deployed on Cloudflare Pages.

## Stack

- **Pure static HTML/CSS/JS** — no framework, no build step, no npm
- **CSS Custom Properties** for theming (4 themes: light, dark, auto, high-contrast)
- **Vanilla JS** wrapped in an IIFE, ~130 lines
- **Cloudflare Pages** for hosting with `_headers` and `_redirects` config files

## File Structure

```
about-me-page/
├── index.html          # Main page, Russian language (lang="ru")
├── collaborate.html    # Collaboration page: consulting, advisory, angel investing (RU)
├── en/
│   ├── index.html      # English version (lang="en")
│   └── collaborate.html # Collaboration page (EN)
├── styles.css          # All styles, token-based CSS variables
├── script.js           # Theme dropdown, anchor smooth-scroll, scroll-to-top
├── llms.txt            # AI/LLM navigation file (llmstxt.org convention), bilingual
├── _headers            # Cloudflare: X-Robots-Tag + Cache-Control headers
├── _redirects          # Cloudflare: 200 rewrites for static assets
├── robots.txt          # Allows all crawlers, references sitemap
├── sitemap.xml         # Four-entry sitemap with hreflang alternates
├── 404.html            # V4-styled 404 page with i18n auto-detect
├── yandex_c8faae431964bcca.html  # Yandex Search ownership verification
├── fonts/                         # Self-hosted IBM Plex woff2 (latin + cyrillic subsets)
│   ├── plex-sans-latin-{400,500,600}.woff2
│   ├── plex-sans-cyr-{400,500,600}.woff2
│   ├── plex-mono-latin-{400,500}.woff2
│   └── plex-mono-cyr-{400,500}.woff2
└── images/
    ├── Hero_Photo.webp            # Main portrait 1600x1067 (LCP element)
    ├── Hero_Photo_320.webp        # 320w variant for srcset
    ├── Hero_Photo_640.webp        # 640w variant for srcset (default src)
    ├── Hero_Photo_960.webp        # 960w variant for srcset
    └── favicon.svg                # SVG favicon with initials "SM"
```

## Deploy Process

**GitHub → Cloudflare Pages (automatic)**

1. Push to `main` branch on GitHub (`morgunovtech/about-me-page`)
2. Cloudflare Pages detects the push via GitHub integration and deploys automatically
3. No build command — files are served as-is
4. `_headers` and `_redirects` are processed by Cloudflare automatically

There is no CI/CD pipeline, no GitHub Actions, no build scripts.

### RU↔EN sync check

`scripts/check-sync.py` verifies that RU and EN HTML pairs (`index.html` ↔ `en/index.html`, `collaborate.html` ↔ `en/collaborate.html`) share the same DOM structure (tag tree + classes + ids). It ignores text, attribute values, and state classes (`is-active`).

Run before commit when touching layout:

```sh
python3 scripts/check-sync.py            # summary
python3 scripts/check-sync.py --verbose  # full mismatch list
```

Exit code 0 = sync, 1 = drift detected.

## CSS Architecture

- All colors, spacing, radii, and shadows are CSS variables defined per theme on `[data-theme]`
- Two shadow levels: `--shadow` (default) and `--shadow-hover` (interactive lift)
- Spacing scale: `--space-2` (4px) → `--space-8` (28px)
- Border radii: `--radius-lg` (16px), `--radius-md` (12px), `--radius-sm` (8px)
- Max width: `--max-width: 1120px`
- Responsive breakpoints: 640px, 768px, 1024px, 1100px
- `font-size` and `line-height` are set on `:root` (not body) so theme overrides work correctly
- `@media (prefers-reduced-motion)` block is intentionally placed **at the end** of `styles.css`
- `content-visibility: auto` on `.section` defers rendering of below-fold sections

## Theme System

- Theme is set via `data-theme` attribute on `<html>` (NOT body)
- Inline `<script>` in `<head>` reads localStorage and sets `data-theme` on `<html>` before body is parsed — this prevents FOUC
- `<body>` starts with `class="no-transition"` to suppress the 300ms background/color transition on initial load; `script.js` removes this class after the first paint via double `requestAnimationFrame`
- `script.js` manages theme switching at runtime, writing `data-theme` to `document.documentElement`

## JavaScript Conventions

- All code is in a single IIFE in `script.js` — no modules, no imports
- Theme preference stored in `localStorage` under key `theme-preference`
- On init, `script.js` only syncs `aria-pressed` state (theme is already applied by inline script)
- Scroll listener uses `requestAnimationFrame` throttling for performance
- Dropdowns managed via `.is-open` class; only one can be open at a time
- Dropdowns close on: Escape key, outside click, or clicking a link/button inside

## Important Rules

- **No build tools.** Do not add npm, webpack, Vite, or any bundler. Keep it zero-dependency.
- **No frameworks.** Do not introduce React, Vue, Alpine, or any JS framework.
- **Accessibility first.** Every interactive element must have proper ARIA attributes. Maintain `focus-visible` styles. Respect `prefers-reduced-motion`.
- **Theme compatibility.** Any new UI element must work correctly in all 4 themes (light, dark, auto, high-contrast). Use CSS variables — never hardcode colors or shadows.
- **External links** must always have `rel="noopener noreferrer"` and `target="_blank"`.
- **Hero image** uses `loading="eager" fetchpriority="high"` and is preloaded in `<head>` — it is the LCP element and must not be lazy-loaded. All other images should use `loading="lazy"`.
- **Privacy.** No cookies, no trackers, no analytics scripts. The footer explicitly states this — don't break that contract.
- **Bilingual.** Russian is primary (`/`), English is at `/en/`. Both pages share the same `styles.css` and `script.js`. Keep content parity between them.
- **Semantic HTML.** Use `<article>`, `<section>`, `<nav>`, `<main>`, `<footer>` appropriately. Maintain heading hierarchy.
- **`_redirects` entries** are 200 rewrites (passthrough), not actual redirects. Add new static files here.
- **Inline `<style>` blocks in HTML are forbidden** — all CSS lives in `styles.css`.
- **No inline scripts in `<body>`** — only the one in `<head>` for FOUC prevention.

## Performance Conventions

- `<meta charset>` must be the first element in `<head>` (within first 1024 bytes per spec)
- LCP image is preloaded via `<link rel="preload">` in `<head>`
- `.section` uses `content-visibility: auto` — below-fold sections skip layout/paint until scrolled into view
- Scroll handlers must use rAF throttling, never raw scroll events
- `_headers` defines `Cache-Control: immutable` for images, 24h for CSS/JS

## SEO / Meta

- **Canonical URL:** `https://s.morgunov.tech/` — use this domain consistently everywhere
- OG/Twitter images and JSON-LD images must use **absolute URLs**
- `<meta name="theme-color">` set for both light and dark schemes
- JSON-LD Person schema: keep `description`, `knowsAbout`, `worksFor`, and `sameAs` in sync
- `sitemap.xml` `lastmod` should be updated when content changes significantly
- Yandex verification: `yandex_c8faae431964bcca.html` — do not delete

## AI / Agentic Optimization

- `llms.txt` follows the [llmstxt.org](https://llmstxt.org) convention
- Available at `https://s.morgunov.tech/llms.txt`
- Keep it in sync with major content changes (roles, products, contact info)
- `robots.txt` allows all crawlers including AI (GPTBot, ClaudeBot, PerplexityBot)
- JSON-LD `description` and `knowsAbout` help AI search engines attribute content

## Changelog

- v0.11 — Audit P3 backlog (2026-05-03). **Favicon stack rebuilt:** [images/favicon.svg](images/favicon.svg) recoloured to brand `#d9531e` (was `#ba6255`); new [images/favicon-dark.svg](images/favicon-dark.svg) for `prefers-color-scheme: dark` (dark bg + orange outline + orange "SM"); all PNG variants regenerated via `rsvg-convert` — apple-touch 26 KB → **6 KB**, icon-512 170 KB → **18 KB**. **Layout polish:** products grid blog card now spans full row at ≤1100 px (kills the 2+1 asymmetry on iPad-landscape widths); `.v4-icon-btn` 36 → **44 px on mobile** (Apple HIG tap target); `.v4-career-row .ctx` got `max-width: 60ch`. **FAQ section** added as #07 on both homepages (Contact bumped to #08): 4 questions answering "who am I", "what's a consultation", "investment industries", "how to reach". Backed by `FAQPage` Schema.org in JSON-LD `@graph` — 4 `Question` + `Answer` pairs each language, mirroring visible text per Google rich results requirements. **Theme menu keyboard:** `script.js` adds `ArrowUp`/`ArrowDown`/`Home`/`End` navigation inside the open dropdown; opening via Enter/Space also moves focus to the first item (mouse click flow unchanged). **Headers (`_headers`) hardened:** `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`; CSP gained `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `font-src 'self'`, and dropped the unused `static.cloudflareinsights.com` allowlist; explicit `Cache-Control` for `/*.html` (5-min max-age + 1-day swr), `/fonts/*` (1-year immutable), `/favicon.ico`, `/apple-touch-icon.png`, `/site.webmanifest`. **Cache buster:** `?v=23 → ?v=24` (CSS) and `?v=15 → ?v=16` (JS) across all 5 HTML files. Sync check still green: 626 RU/EN structural events on homepage, 368 on collaborate.
- v0.10 — Audit fixes round (2026-05-03). **Contrast (WCAG AA):** `--v4-on-accent` flipped from white to dark (`#14110d` light / `#14130f` dark) — primary CTA «Telegram →» now reads dark-on-orange (5.2:1 light, 8.8:1 dark, was 4.03/2.86); brand `--v4-orange` kept exact. `--v4-dim` darkened in light (`#807a6e → #6c6759`, ~5:1) and lightened in dark (`#6a6459 → #8a8378`, ~4.6:1) so `.v4-stat-aside` mono captions pass AA. `.v4-more a` («→ Другие проекты на GitHub») moved off pure orange — now `--v4-fg` text with orange underline accent. **Visual baselines:** `.v4-prose a` (links in About: «Посетил 48 стран», «Семён расправил плечи») got an explicit rule using `--v4-fg` + orange hover, replacing browser-default `#0000EE`. **SEO/GEO:** title shortened to ≤55 chars, description to ≤155, dropping `| morgunov.tech` suffix; `dateModified: 2026-05-03` added to JSON-LD `WebPage`; visible `<time datetime="2026-05-03">` in footer; sitemap `lastmod` bumped. **OG/Twitter:** new branded 1200×630 cards `og-card-ru.png` / `og-card-en.png` (Braun aesthetic, IBM Plex typography), `og:image:alt` / `twitter:image:alt` added, `og:image:type` declared. **Favicon stack:** added `favicon.ico` (16/32/48), `apple-touch-icon-180.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` with `theme_color` / `background_color` / `name` / `short_name`; `<head>` references all of them. **JS:** `script.js` removes legacy v3 selectors (`.nav-dropdown`, `.theme-dropdown`, `.theme-button`, `.scroll-top`, `.site-nav`, `.dropdown-toggle`, `.dropdown-menu`); theme dropdown now restores focus to toggle after selection (keyboard-friendly). **Tooling:** `scripts/check-sync.py` — Python stdlib structural diff between RU and EN HTML pairs; flags drift in tag/class structure. **Cache buster:** unified to `?v=23` (CSS) and `?v=15` (JS) across all 5 HTML files.
- v0.9 — Type & content consistency pass. Full IBM Plex unification: self-hosted IBM Plex Sans + Plex Mono in `/fonts/` (10 woff2 files, latin + cyrillic via `unicode-range`, `font-display: swap`); Inter and JetBrains Mono removed from fallbacks; cyrillic 400/600 preloaded on RU pages, latin on EN. Mono usage tightened to numeric/technical labels only — `.v4-status`, `.v4-foot`, `.v4-stat-unit`, `.v4-h3` (collaborate sub-headings) moved to sans with tracking; `.role-tag` removed. Stats reframed: `10 yrs in tech / 3 countries / 5,772 readers / 4× co-founder`, with new `.v4-stat-aside` for the country breakdown `RU · UZ · KG` (always-visible mobile-friendly line, no hover dependency). About chips replaced with inline text + `·` separators (`.v4-skill-list`); orange `.v4-chip-accent` on Teaching removed. Apple Russia "по контракту" / "contractor" moved inline next to company name as small muted note (`.company-aside`). Portrait `<figcaption>` ("Семён Моргунов / 2026") removed — was duplicating the H1. Section #05 renamed `Собственные продукты → Продукты`. JSON-LD `description` updated to "10 years across Russia, Uzbekistan, Kyrgyzstan"; `knowsAbout` extended with "Central Asia markets", "CIS markets", "Cross-cultural product management"; `ItemList` name "Продукты Семёна Моргунова". `llms.txt` synced. Cache buster bumped `v=15 → v=16` across all 5 HTML files.
- v0.8 — V4 Braun/Dieter Rams redesign across all pages (RU + EN): homepage with hero/portrait, 4-column stats strip, 7 numbered sections, monospace accents; collaborate page redesigned with 5 numbered sections (about, consulting tiers, strategy, angel investing, contact); 404 migrated to V4. Performance: inline critical CSS in `<head>` with non-blocking `<link rel="preload">` swap, `srcset` for hero (320/640/960/1600w variants generated), `content-visibility:auto` on below-fold sections. SEO/AI: expanded JSON-LD with `@graph` (`WebSite`, `WebPage`, `Person`, `ItemList`, `Service`), `knowsLanguage`, `hasOccupation`, `alumniOf`, sitemap `lastmod` updated. A11y: 4 themes work everywhere, tap targets ≥36px, semantic `<main>`/`<header>`/`<section>` landmarks, `.sr-only` utility, mobile nav as second row in top bar. CSP updated to `style-src 'self' 'unsafe-inline'` for inline critical CSS. Legacy CSS removed (styles.css 57KB → 23KB).
- v0.7 — Collaboration page (`/collaborate.html` + `/en/collaborate.html`) with consulting, advisory, and angel investing details; replaced external Craft link on homepage
- v0.6 — English version at `/en/`, language switcher (RU/EN), hreflang tags, bilingual llms.txt, sitemap with hreflang alternates
- v0.5 — Performance optimization (preload LCP, content-visibility, rAF scroll, FOUC elimination), layout fixes (hover shadows, hero border-radius, media-grid), SEO (canonical, favicon, theme-color, JSON-LD), AI optimization (llms.txt)
- v0.4 — Motion preference and link hygiene tweaks
- v0.3 — Layout and accessibility improvements
- v0.2 — Added theme controls and calm CTA styling
- v0.1 — Initial launch of the personal site
