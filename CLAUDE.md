# CLAUDE.md — about-me-page

Personal homepage for Semyon Morgunov, deployed on Cloudflare Pages.

## Stack

- **Pure static HTML/CSS/JS** — no framework, no build step, no npm
- **CSS Custom Properties** for theming (4 themes: light, dark, auto, high-contrast)
- **Vanilla JS** wrapped in an IIFE, ~370 lines: theme, one generic dropdown controller (mobile nav / language / theme), anchor smooth-scroll, scroll chrome, the 404 page's client-side EN copy
- **Cloudflare Pages** for hosting with `_headers` and `_redirects` config files

## File Structure

```
about-me-page/
├── index.html          # Main page, Russian language (lang="ru") — a template: data-cms-* hooks, seed twin
├── collaborate.html    # Collaboration page: consulting, advisory, angel investing (RU)
├── about.html          # «Принципы» — how/why the site is built (RU)
├── uses.html           # «Стек» — hardware & software (RU)
├── en/                 # English twins: index, collaborate, about, uses (lang="en")
├── content.seed.json   # Committed content fallback for every CMS page (KV wins when present)
├── CHANGELOG.md        # Release history (one entry per version); CLAUDE.md keeps conventions only
├── ds/v1/              # Shared design-system layer: fonts, tokens, base, components (+ USAGE.md)
├── styles.css          # Page-specific layout only (hero, stats, cards, /uses, /collaborate, notes)
├── script.js           # Theme, generic dropdown controller, anchor smooth-scroll, scroll chrome
├── admin-app.js/.css   # /admin inline editor client (public, no secrets)
├── functions/          # Pages Functions: edge render, CMS API, notes, sitemap, llms.txt, /404
├── scripts/            # check.sh, check-sync.py, check-critical.py, render-static.mjs, version-stamp.py
├── tests/              # node --test suites for the pure functions
├── llms.txt            # AI/LLM navigation file (llmstxt.org) — a template: {total}/{telegram}/… filled by functions/llms.txt.js
├── _headers            # Cloudflare: X-Robots-Tag + Cache-Control headers for static assets
├── _routes.json        # Cloudflare: static paths excluded from Functions (CDN-cacheable, no invocations)
├── _redirects          # Cloudflare: real redirects only (none today — Pages handles clean URLs itself)
├── robots.txt          # Allows all crawlers, references sitemap
├── 404.html            # V4-styled 404 page (bilingual; functions/404.js serves it with a real 404 status)
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

### One-command verification

`scripts/check.sh` runs everything below in order: `node --check` on all JS, `node --test`, RU↔EN sync, critical-CSS drift, the static-twin check, and (unless `NO_BUILD=1`) `wrangler pages functions build`. Run it before every commit.

### RU↔EN sync check

`scripts/check-sync.py` verifies that RU and EN HTML pairs (`index.html` ↔ `en/index.html`, `collaborate.html` ↔ `en/collaborate.html`) share the same DOM structure (tag tree + classes + ids). It ignores text, attribute values, and state classes (`is-active`).

Run before commit when touching layout:

```sh
python3 scripts/check-sync.py            # summary
python3 scripts/check-sync.py --verbose  # full mismatch list
```

Exit code 0 = sync, 1 = drift detected.

### Static twins (templates ≡ seed render)

Every `data-cms-list` container and `data-cms-jsonld` script in the committed HTML holds exactly what the edge renderer emits for `content.seed.json` — that twin is the fallback when KV is empty or an overlay handler throws, and it is what a plain static preview shows. `scripts/render-static.mjs --check` fails when a template drifted; `--write` regenerates the containers in place (NBSP is written as `&nbsp;`). After any change to `content.seed.json`, `functions/_lib/render.js` or `functions/_lib/jsonld.js`: run `--write`, then `check-sync`.

### Critical-CSS drift check

`scripts/check-critical.py` re-parses the inline `<style>` block of every page and
compares each declaration against the external layer (`ds/v1/*.css` + `styles.css`).
A declaration present on both sides with **different values** is an error (exit 1) —
that's the drift class that shipped visible bugs twice (v0.23, v0.28). Inline-only
declarations are warnings (`--verbose` to list, `--strict` to fail on them). Run it
together with check-sync before committing anything that touches CSS.

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
- `script.js` stamps `data-js` on `<html>`; `components.css` keeps a `:focus-within` fallback that opens the dropdown panels until it does (progressive enhancement — language switch and mobile nav work without JS)
- Inline `<script>` in `<head>` reads localStorage and sets `data-theme` on `<html>` before body is parsed — this prevents FOUC
- `<body>` starts with `class="no-transition"` to suppress the 300ms background/color transition on initial load; `script.js` removes this class after the first paint via double `requestAnimationFrame`
- `script.js` manages theme switching at runtime, writing `data-theme` to `document.documentElement`

## JavaScript Conventions

- All code is in a single IIFE in `script.js` — no modules, no imports
- Theme preference stored in `localStorage` under key `theme-preference`
- On init, `script.js` only syncs `aria-checked` on the theme menu items (theme is already applied by inline script)
- Scroll listener uses `requestAnimationFrame` throttling for performance
- **Dropdowns** (`.v4-dropdown` = toggle `[aria-controls]` + panel): one generic controller for the mobile nav (`.v4-nav`), the language menu (`.v4-lang`) and the theme menu (`.v4-theme`). State = `.is-open` on the container + `aria-expanded` on the toggle; only one open at a time; close on Escape, outside click, focus-out, a click inside, or when the viewport crosses 640px. Keyboard: Enter/Space opens and focuses the first item; ArrowUp/Down/Home/End move; menus (`role="menu"`) return focus to their toggle, the nav does not (its links focus the target section themselves)
- The `/admin` editor strips `script.js` from its preview and hooks `.v4-lang-btn` (direct RU↔EN toggle) and `.v4-icon-btn` (theme cycle) itself — keep those class names

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
- **`_redirects`** holds real redirects only (currently none): Pages serves clean URLs and 308s `/foo.html` itself, and a `/en/ → /en/index.html 200` rewrite is reported by wrangler as an infinite loop and ignored.
- **Inline `<style>` blocks in HTML** are limited to the critical above-the-fold subset that `scripts/check-critical.py` compares against `ds/v1/*.css` + `styles.css`; every rule must exist externally. The notes shell keeps its critical copy in `functions/_lib/article-template.js` (same check).
- **No inline scripts in `<body>`** — only the one in `<head>` for FOUC prevention. The 404 page's EN copy is driven by `data-i18n-*` attributes handled in `script.js`, not by an inline script.

## Performance Conventions

- `<meta charset>` must be the first element in `<head>` (within first 1024 bytes per spec)
- LCP image is preloaded via `<link rel="preload">` in `<head>`
- `.section` uses `content-visibility: auto` — below-fold sections skip layout/paint until scrolled into view
- Scroll handlers must use rAF throttling, never raw scroll events
- `_headers` defines `Cache-Control: immutable` (1 year) for images, fonts, `/ds/*`, `styles.css`, and `script.js` — the latter two are safe to cache forever because every reference carries a content-hash `?v=` minted by `scripts/version-stamp.py`
- `_routes.json` excludes all static assets from Pages Functions — they serve from the CDN without a worker invocation. `/llms.txt` and `/404` are Functions (live counters / real 404 status) and therefore not excluded

## SEO / Meta

- **Canonical URL:** `https://s.morgunov.tech/` — use this domain consistently everywhere
- OG/Twitter images and JSON-LD images must use **absolute URLs**
- `<meta name="theme-color">` set for both light and dark schemes
- JSON-LD Person schema: keep `description`, `knowsAbout`, `worksFor`, and `sameAs` in sync
- `sitemap.xml` `lastmod` should be updated when content changes significantly
- Yandex verification: `yandex_c8faae431964bcca.html` — do not delete

## AI / Agentic Optimization

- `llms.txt` follows the [llmstxt.org](https://llmstxt.org) convention; the committed file is a template — `{total}`, `{telegram}`, `{linkedin}`, `{youtube}` are filled by `functions/llms.txt.js` from the same `counters()` the homepage uses, so the AI-facing numbers never drift from the page
- Available at `https://s.morgunov.tech/llms.txt`
- Keep it in sync with major content changes (roles, products, contact info)
- `robots.txt` allows all crawlers including AI (GPTBot, ClaudeBot, PerplexityBot)
- JSON-LD `description` and `knowsAbout` help AI search engines attribute content

## Content management (CMS) — `/admin`

The public pages are **edge-rendered from Cloudflare KV** via Pages Functions: the committed HTML files are templates carrying invisible `data-cms-*` hooks; `functions/_middleware.js` overlays content from KV (key `s.morgunov.tech:<page>`, fallback `content.seed.json`) with `HTMLRewriter`. Editing in `/admin` saves to KV → live **without a redeploy**. Wired for all four page types: `home` (`/`, `/en/`), `collaborate` (`/collaborate`), `about` (`/about`), `uses` (`/uses`) — RU+EN. Route keys are the clean URLs Pages serves (it 308s `/foo.html` → `/foo`). `home` is fully granular (per-field); `about` hooks per-section title + body; `about`/`uses`/`collaborate` store each section as a **verbatim HTML block** (`data-cms-html`), edited as one block. Per-card image-upload widgets for `/uses` are an available enhancement.

**`functions/` layout:**
- `_middleware.js` — edge-render for the 8 managed routes (per-page JSON-LD via `renderPageJsonLd`); blocks internal files; back-fills security headers.
- `_lib/` — `content` (KV→seed load, `loadSubscribers`, **read-time migrations** `migrateHome`/`migrateAbout` for KV docs saved before a seed change), `i18n`, `markdown` (zero-dep subset), `render` (component renderers, `counters()`/`fillCounters()`/`unitFor()` — the single source for every subscriber number incl. RU plural), `overlay` (HTMLRewriter handlers), `jsonld` (home `@graph` + `renderPageJsonLd` for collaborate/about/uses), `site` (`ORIGIN`, `NAME` per language), `article-template` (notes/article shells built from shared chrome helpers), `auth`, `ai`, `http`.
- `llms.txt.js` — `/llms.txt` with live counters; `404.js` — `/404` with a real 404 status (`notFound()` sets noindex + Cache-Control itself — `_headers` never reaches Function responses). GET-only routes (sitemap, notes, feeds, `/assets/*`) are wrapped in `getOrHead()` from `_lib/http.js` so HEAD answers like GET.
- **Read-time migrations are gated** by `doc.migration` (currently 29, exported as `MIGRATION` from `content.js`): a doc at or above the marker is never touched again, so later renames/deletions in `/admin` stick. Bump the marker when adding a migration.
- `{build}` inside `data-cms-html` prose resolves to `BUILD` from `_lib/site.js` (stamped by `version-stamp.py`) — never store a literal build hash as content.
- `admin/` — `_middleware.js` (session gate), `login`/`logout`, `index` (editor shell), `api/{content,save,preview,upload,translate,proofread,subscribers}`.
- `assets/[[path]].js` — public read-only R2 delivery at `/assets/*` (no listing).
- `api/ingest/subscribers.js` — token-guarded SocialBot ingest → KV `stats:subscribers`.

**Hook vocabulary** (invisible, structural-sync-safe — `check-sync.py` ignores `data-*`): `data-cms-text`, `data-cms-md`, `data-cms-href` / `data-cms-content` / `data-cms-alt`, `data-cms-abs` (absolute og/twitter image), `data-cms-img` + `data-cms-preload` (swap hero portrait when set, else keep template `srcset`), `data-cms-list="<slot>"` (regenerate a list), `data-cms-jsonld`.

**Content model:** per-page JSON doc; localizable fields are `{ru,en}`; prose is markdown; internal hrefs may be localized. `meta`/`share`/`seo` drive `<title>`, og/twitter, and JSON-LD — **single source of truth**, so one edit updates every SEO signal (ends manual-sync drift). The subscribers stat reads live KV (`stats:subscribers`) when `auto !== false`; its RU unit is declined from the live total («подписчик/подписчика/подписчиков»). **Counter placeholders:** any `publications[].meta` (and `llms.txt`) may contain `{telegram}`, `{linkedin}`, `{youtube}`, `{total}` — rendered from the same live/seed source as the stats strip (edit mode shows the raw placeholder; the AI prompts and Smart Save preserve it). **Product schema:** `products[].schema {type, category, os, license, free}` overrides the JSON-LD item (default `WebApplication` / `PrivacyApplication` / `Web`, free). **KV migrations:** a KV doc saved before a seed change keeps winning over the seed, so `content.js` merges seed-only additions at read time (v0.29: the Tofs DevOps card, the `{telegram}` meta, the /about subscriber snapshot); the next admin Save persists them. Editor client: root-level public `admin-app.js` + `admin-app.css` (no secrets), vanilla, **inline edit-in-place** (Egea/Notion-style, v0.25) — the server-rendered live-preview iframe *is* the editor: click text to edit it on the page; markdown leaves get a floating Bold/Link bar; verbatim-HTML section blocks and images open popovers; lists show a hover ↑↓✕ toolbar + "+ добавить". Non-inline fields (`<title>`/meta, share card + preview, SEO/JSON-LD, subscribers `auto`) live in a slide-over **Settings drawer**. The in-memory doc is the single source of truth — text edits write straight back (caret survives); structural edits re-render from it. Per-field **AI** (RU→EN, Вычитать = proofread+typography, non-destructive) in the drawer and on the floating bar. As of **v0.26**: the toolbar floats by the focused field; the site's own header RU/EN + theme controls drive editing; **Save auto-syncs changed RU→EN** (hand-edited EN is protected); **undo/redo** (⌘Z) + **«Откатить»** + **version history** (restore a past revision from the drawer); help bullets / publication links edit inline; `/uses` card images are click-to-upload.

**Privacy contract preserved on public pages:** no cookies, trackers, analytics, or AI calls. The session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/admin` — never sent on public pages. AI runs server-side only, key never on the client.

**Build/deploy:** still no build step or npm committed for the static site; Pages bundles Functions on push. `wrangler.toml` declares bindings `CONTENT` (KV) + `MEDIA` (R2). Secrets via `wrangler pages secret put`: `ADMIN_PASSWORD_HASH` (generate with `scripts/hash-password.mjs`), `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `SOCIALBOT_INGEST_TOKEN`. Local: `npx wrangler pages dev` + gitignored `.dev.vars` (+ `AI_DEV_MOCK=1` to stub AI). `.wrangler/` and `.dev.vars` are gitignored.

## Changelog

Release history lives in [CHANGELOG.md](CHANGELOG.md) (one entry per version, newest first). Add an entry there for every release; keep this file to current conventions only.
