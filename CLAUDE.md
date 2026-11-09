# CLAUDE.md — about-me-page

Personal homepage for Semyon Morgunov, deployed on Cloudflare Pages.

## Stack

- **Pure static HTML/CSS/JS** — no framework, no build step, no npm
- **CSS Custom Properties** for theming (4 themes: light, dark, auto, high-contrast)
- **Vanilla JS** wrapped in an IIFE, ~290 lines: theme, one generic dropdown controller (mobile nav / language / theme), anchor smooth-scroll, the 404 page's client-side EN copy. No scroll listener: the side column, «↑» and the progress bar are gone (v0.31.1–v0.31.2)
- **Cloudflare Pages** for hosting with `_headers` and `_redirects` config files

## File Structure

```
about-me-page/
├── index.html          # Main page, Russian language (lang="ru") — a template: data-cms-* hooks, seed twin
├── collaborate.html    # Collaboration page: consulting, advisory, angel investing (RU)
├── about.html          # «Принципы» — how/why the site is built (RU); hidden since v0.31.2: noindex, out of the sitemap/footer/llms.txt, until the owner rewrites it
├── uses.html           # «Стек» — hardware & software (RU)
├── en/                 # English twins: index, collaborate, about, uses (lang="en")
├── content.seed.json   # Committed content fallback for every CMS page (KV wins when present)
├── CHANGELOG.md        # Release history (one entry per version); CLAUDE.md keeps conventions only
├── ds/v1/              # Shared design-system layer: fonts, tokens, base, components (+ USAGE.md)
├── styles.css          # Page-specific layout only (hero, stats, cards, /uses, /collaborate, notes)
├── script.js           # Theme, generic dropdown controller, anchor smooth-scroll
├── admin-app.js/.css   # /admin inline editor client (public, no secrets)
├── functions/          # Pages Functions: edge render, CMS API, notes, sitemap, llms.txt, /404
├── scripts/            # check.sh, check-sync.py, check-critical.py, render-static.mjs, version-stamp.py
├── tests/              # node --test suites for the pure functions
├── llms.txt            # AI/LLM navigation file (llmstxt.org) — a template: {total}/{telegram}/… filled by functions/llms.txt.js
├── _headers            # Cloudflare: X-Robots-Tag + Cache-Control headers for static assets
├── _routes.json        # Cloudflare: static paths excluded from Functions (CDN-cacheable, no invocations)
├── _redirects          # Cloudflare: real redirects only (none today — Pages handles clean URLs itself)
├── robots.txt          # Allows all crawlers, references sitemap
├── 404.html            # V4-styled 404 page (bilingual; functions/404.js serves it with a real 404 status, _middleware.js does the same for every unknown path)
├── yandex_c8faae431964bcca.html  # Yandex Search ownership verification
├── fonts/                         # Self-hosted IBM Plex woff2 (latin + cyrillic subsets)
│   ├── plex-sans-latin-{400,500,600}.woff2
│   ├── plex-sans-cyr-{400,500,600}.woff2
│   ├── plex-mono-latin-{400,500}.woff2
│   ├── plex-mono-cyr-{400,500}.woff2
│   └── OFL.txt                    # SIL OFL 1.1 for IBM Plex — ships with the fonts, as the OFL requires
└── images/
    ├── Hero_Photo.webp            # Main portrait 1600x1067 (LCP element)
    ├── Hero_Photo_320.webp        # 320w variant for srcset
    ├── Hero_Photo_640.webp        # 640w variant for srcset (default src)
    ├── Hero_Photo_960.webp        # 960w variant for srcset
    └── favicon.svg                # SVG favicon with initials "SM"
```

## Page map (v1.0.0)

- **`/`, `/en/`** — hero (eyebrow «Head of FinTech @ Yandex Uzbekistan», one «Написать в Telegram» button) → stats strip → `01 #about` → `02 #career` → `03 #projects` «Собственные проекты» (tier «Работает»: live product cards with year · version; tier «До этого»: past ventures as rows) → `04 #notes` «Публикации» (the three newest feed entries + «Все публикации →») → `05 #contact` «Связаться» (Telegram only + two links to `/collaborate`). Menu items mirror the section titles (`data-cms-text`).
- **`/notes`, `/en/notes`** — «Публикации»: own notes (KV articles) and external materials (vc.ru, YouTube — the seed-only `notes` doc) in one feed, newest first, under the Telegram channel block. RSS and the sitemap carry own notes only.
- **`/collaborate`** — about · consulting tiers · strategic consulting · angel investing · `#work` «Как работаю / Чего не делаю» · contact.
- **`/uses`** — hardware groups + software cards.
- **`/about`** «Принципы» — hidden until the owner rewrites it: `noindex`, not in the footer, sitemap or `llms.txt`; still served and editable in `/admin`.
- **`/404`** — one bilingual file.

## Deploy Process

**GitHub → Cloudflare Pages (automatic)**

1. Push to `main` branch on GitHub (`morgunovtech/about-me-page`)
2. Cloudflare Pages detects the push via GitHub integration and deploys automatically
3. No build command — files are served as-is
4. `_headers` and `_redirects` are processed by Cloudflare automatically

There is no build step and no deploy pipeline of our own — Cloudflare Pages deploys on push. GitHub Actions only check PRs (`ci.yml`: `scripts/check.sh`, the Functions build, gitleaks over the whole history) and auto-merge Dependabot minor/patch bumps once CI passes.

### Release flow

1. Work on a branch (worktrees under `.claude/worktrees/`); `main` is production.
2. `python3 scripts/version-stamp.py` when any stamped asset changed, then `scripts/check.sh` (full, with the Functions build).
3. Add the `CHANGELOG.md` entry (next version — see Versioning) in the same commit.
4. Push the branch → `gh pr create` → squash-merge. Every push also builds a Cloudflare **Preview** deployment for the branch.
5. Verify production, not just the merge: `npx wrangler pages deployment list --project-name about-me-page` shows the Production row for the commit; then check the live page (the footer build hash is the deployed commit; Function-rendered HTML sits in the edge cache up to 300 s — look at `x-edge-cache`).
6. Read-only checks of real content: `npx wrangler kv key get --binding CONTENT "s.morgunov.tech:<page>" --remote` (KV wins over `content.seed.json`).

Accounts: `gh` (morgunovtech, `repo` scope) and `wrangler login` (OAuth, expires — re-run `npx wrangler login` when `whoami` says not logged in). Secrets are set by the owner with `wrangler pages secret put`, never by an agent.

### Versioning

SemVer on the `CHANGELOG.md` versions:
- **patch** — fixes, copy and content corrections, docs, config;
- **minor** — a new feature or section that leaves the page map intact;
- **major** — the page map or the public contract changes: sections, anchors or URLs removed or renamed, a contact channel dropped, a page hidden.

From v1.0.0 (2026-11-09, site v2) every release gets an annotated tag `vX.Y.Z` on its squash-merge commit; minor and major releases also get a GitHub Release with English notes (the CHANGELOG entry stays the detailed record). v0.1–v0.31.5 were untagged.

### Design system of record

Claude Design project «morgunov.tech Design System» (`fb2dcd4c-710d-43e3-8d7d-c9a0ce7e1bab`), imported from this repo. Read/write it with DesignSync (needs `/design-login` in an interactive `claude`); its `github.md` is the sync log — append an entry on every sync. Its `tokens/` + `css/{base,components,pages}.css` mirror `ds/v1` + `styles.css`: a change to either side is a sync item.

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

- **Design system of record:** the Claude Design project «morgunov.tech Design System» (imported from this repo). Its rules bind here: `border-radius: 0` and `box-shadow: none` everywhere, no gradients, no emoji, no content icons (the subscribers stat reads `TG · LI · YT`), no font-weight 700.
- **Tokens are colours + type only:** the `--v4-*` colour set per theme on `[data-theme]` (+ `auto` via `prefers-color-scheme` for consumers without the inline script), `--v4-sans`/`--v4-mono`, the `--v4-label-*` settings. Sizes, gaps and durations are literals in the CSS — do not add `--space-*`, `--radius-*` or `--shadow` twins.
- Shell max width 1280px; responsive breakpoints: 480px, 640px, 960px, 1100px
- **Micro-label scale** (tokens.css): every uppercase tracked label is `--v4-label-*` (11px / 0.1em: section numbers, eyebrows, nav, menus, `.v4-h3`, article eyebrow/date) or `--v4-label-xs-*` (10px / 0.12em: stat units, card/pub heads, tags, footer, spec terms), weight `--v4-label-weight`. Mono vs sans is a per-role choice (mono = numbers/meta, sans = UI labels). Buttons (`.v4-btn`, 12px / 0.08em) are not labels.
- **CSS delivery:** the five stylesheets (`ds/v1/{fonts,tokens,base,components}.css`, `styles.css`) are plain render-blocking `<link rel="stylesheet">` (immutable, content-hashed). The inline critical block is only tokens + body + skip-link. Fonts preload 400/500/600 sans (cyr+latin on RU pages, latin on EN) and mono 400 (+ mono 500 on every page but 404).
- **Hero rhythm:** `.v4-hero--simple` (subpages) shares the homepage's 4px top padding.
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
- No scroll listener today; if one comes back it uses `requestAnimationFrame` throttling
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
- **CTA convention.** In any button row the primary button comes first. «←» is reserved for back-links to the parent page (always secondary, last); a trailing «→» marks actions that leave the site or start a flow (book, install, check, «узнать подробности»); plain contact buttons (Telegram, «На главную») carry no arrow. A contact labelled as the start of a process («Написать →», «Send a pitch →») is a flow and keeps its arrow.
- **Telegram is the only contact.** No e-mail anywhere on the site since v0.31.2 (buttons, footer «нашли опечатку?», JSON-LD, `llms.txt`, `security.txt`) — the owner does not read it. Do not bring one back.
- **Articles use the site's idioms:** `h2` in a note renders like `.v4-section-head` (inline mono number, rule under the title), `h3` like `.v4-h3` (small tracked caps).
- **JSON-LD** scripts sit at the end of `<body>` (before `script.js`) — the parser reaches the content sooner; the overlay hook is attribute-based, so placement is free.
- **`_redirects`** holds real redirects only (currently none): Pages serves clean URLs and 308s `/foo.html` itself, and a `/en/ → /en/index.html 200` rewrite is reported by wrangler as an infinite loop and ignored.
- **Inline `<style>` blocks in HTML** are limited to the critical above-the-fold subset that `scripts/check-critical.py` compares against `ds/v1/*.css` + `styles.css`; every rule must exist externally. The notes shell keeps its critical copy in `functions/_lib/article-template.js` (same check).
- **No inline scripts in `<body>`** — only the one in `<head>` for FOUC prevention. The 404 page's EN copy is driven by `data-i18n-*` attributes handled in `script.js`, not by an inline script.
- **Every executable `<script>` carries `data-cfasync="false"`** (the FOUC script, `script.js`, `admin-app.js`, the notes shell). Cloudflare Rocket Loader rewrites script types and defers them — it delayed the theme script past first paint. Rocket Loader and Email Obfuscation are **off** for the `morgunov.tech` zone (Email Obfuscation rewrites every `mailto:` into `/cdn-cgi/l/email-protection` + a decode script); the attribute keeps the site correct if they are ever switched back on.

## Performance Conventions

- `<meta charset>` must be the first element in `<head>` (within first 1024 bytes per spec)
- LCP image is preloaded via `<link rel="preload">` in `<head>`
- `.section` uses `content-visibility: auto` — below-fold sections skip layout/paint until scrolled into view
- Scroll handlers must use rAF throttling, never raw scroll events
- `_headers` defines `Cache-Control: immutable` (1 year) for images, fonts, `/ds/*`, `styles.css`, and `script.js` — the latter two are safe to cache forever because every reference carries a content-hash `?v=` minted by `scripts/version-stamp.py`
- Pages never CDN-caches a URL with a query string, so a zone **Cache Rule** («s.morgunov.tech versioned assets (?v=) eligible for cache»: host `s.morgunov.tech`, path `/ds/*` or `/styles.css` `/script.js` `/admin-app.js` `/admin-app.css`) marks them eligible; the query string stays in the cache key, so a new `?v=` is a new object. Function-rendered HTML always reports `cf-cache-status: DYNAMIC` — its cache is `x-edge-cache`, which zone analytics do not count. `_routes.json` excludes all static assets from Pages Functions — they serve from the CDN without a worker invocation. `/llms.txt` and `/404` are Functions (live counters / real 404 status) and therefore not excluded

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

The public pages are **edge-rendered from Cloudflare KV** via Pages Functions: the committed HTML files are templates carrying invisible `data-cms-*` hooks; `functions/_middleware.js` overlays content from KV (key `s.morgunov.tech:<page>`, fallback `content.seed.json`) with `HTMLRewriter`. Editing in `/admin` saves to KV → live **without a redeploy**. Wired for all four page types: `home` (`/`, `/en/`), `collaborate` (`/collaborate`), `about` (`/about`), `uses` (`/uses`) — RU+EN. Route keys are the clean URLs Pages serves (it 308s `/foo.html` → `/foo`). `home` is fully granular (per-field); `uses` and `collaborate` are structured docs (cards, tiers, groups — v0.30); `about` stores each section as a **verbatim HTML block** (`data-cms-html`), edited as one block. The /notes feed's external materials live in the seed-only `notes` doc (read through `loadDoc`, so a KV doc would win; not in the /admin page list yet).

**`functions/` layout:**
- `_middleware.js` — edge-render for the 8 managed routes (per-page JSON-LD via `renderPageJsonLd`); blocks internal files; back-fills security headers on every method (route-specific CSPs — admin shell, login, `/assets` — win).
- **Edge cache** (`_lib/cache.js`): every Function-rendered GET (managed pages, `/llms.txt`, notes, feeds, sitemap) is stored in `caches.default` for `EDGE_TTL` (300 s) under `origin + pathname`; `purge()` runs on every KV write — `save.js` (the page's URLs via `PAGE_PATHS` / `articlePaths`), article create/delete/import, and the subscriber ingest (`/`, `/en/`, `/llms.txt`). Responses carry `x-edge-cache: HIT|MISS`. `cached(ctx, render)` is the wrapper; `getOrHead()` sits outside it.
- **Build hash:** `buildOf(env)` (`_lib/site.js`) reads `CF_PAGES_COMMIT_SHA` and falls back to the stamped `BUILD`; the footer `<code data-cms-text="_build">` and the `{build}` prose placeholder both resolve from it, so the footer shows the commit actually deployed. The hash is plain text, not a link (unlinked in v0.30.4 while the repo was private; it is public now).
- **Sessions** (`_lib/auth.js`): HMAC tokens carry `iat`; «Выйти» writes `session:not-before` to KV and `verifySession(secret, token, env)` rejects anything issued earlier — a captured token dies on logout.
- `_lib/` — `content` (KV→seed load, `loadSubscribers`), `migrations` (`fixStaleContent` — code-side string fixes for KV docs, the `STALE` table is empty since v1.0.1; no seed import so tests load it directly), `cache` (edge cache + purge), `tg/` (Telegram publish/import: `plan`, `source-post`, `tg-html`, `tg-import`, `targets/`), `i18n`, `markdown` (zero-dep subset), `notes-feed` (the /notes feed: own notes + external materials, pure — Node-testable), `render` (component renderers, `counters()`/`fillCounters()`/`unitFor()` — the single source for every subscriber number incl. RU plural), `overlay` (HTMLRewriter handlers), `jsonld` (home `@graph` + `renderPageJsonLd` for collaborate/about/uses), `site` (`ORIGIN`, `NAME` per language), `article-template` (notes/article shells built from shared chrome helpers), `auth`, `ai`, `http`.
- `llms.txt.js` — `/llms.txt` with live counters; `404.js` — `/404` with a real 404 status (`notFound()` sets noindex + Cache-Control itself — `_headers` never reaches Function responses). GET-only routes (sitemap, notes, feeds, `/assets/*`) are wrapped in `getOrHead()` from `_lib/http.js` so HEAD answers like GET.
- **No read-time migrations today.** On 2026-11-09 (v1.0.1) the `home` and `about` KV docs were saved with every earlier migration and copy fix applied (they carry `migration: 31`); `collaborate` and `uses` have no KV doc and render from the seed. A KV doc keeps winning over the seed, so: a **copy** fix to a KV doc goes into the `STALE` table of `migrations.js` (rules in its header) until the next `/admin` Save persists it, then the entry is removed; a **shape** change needs a gated read-time migration again (pattern: v0.31.1 `homeV2` in git history) or a Save of the new shape. `validateHome` in `admin/api/save.js` lists the sections a home doc must have.
- `{build}` inside `data-cms-html` prose resolves to `BUILD` from `_lib/site.js` (stamped by `version-stamp.py`) — never store a literal build hash as content.
- `admin/` — `_middleware.js` (session gate), `login`/`logout`, `index` (editor shell), `api/{content,save,preview,upload,translate,proofread,subscribers}`.
- `assets/[[path]].js` — public read-only R2 delivery at `/assets/*` (no listing).
- `api/ingest/subscribers.js` — token-guarded SocialBot ingest → KV `stats:subscribers`.

**Hook vocabulary** (invisible, structural-sync-safe — `check-sync.py` ignores `data-*`): `data-cms-text`, `data-cms-md`, `data-cms-href` / `data-cms-content` / `data-cms-alt`, `data-cms-abs` (absolute og/twitter image), `data-cms-img` + `data-cms-preload` (swap hero portrait when set, else keep template `srcset`), `data-cms-list="<slot>"` (regenerate a list), `data-cms-jsonld`.

**Content model:** per-page JSON doc; localizable fields are `{ru,en}`; **every text leaf is the same markdown subset** (`**bold**`, `` `code` ``, `[text](url)`, literal NBSP; block prose adds paragraphs and `- ` lists) and goes through `renderInline`/`renderProse`, which escape — there is no raw-HTML leaf in the structured docs (v0.30 converted /uses and /collaborate; `about` sections and `hero.ctas` remain verbatim HTML blocks sanitized on save). One `card()` helper renders home products, /uses software and /collaborate tiers. Internal hrefs may be localized. `meta`/`share`/`seo` drive `<title>`, og/twitter, and JSON-LD — **single source of truth**, so one edit updates every SEO signal (ends manual-sync drift). The subscribers stat reads live KV (`stats:subscribers`) when `auto !== false`; its RU unit is declined from the live total («подписчик/подписчика/подписчиков»). **Counter placeholders:** the /notes channel block meta (`notes.channel.meta`) and `llms.txt` may contain `{telegram}`, `{linkedin}`, `{youtube}`, `{total}` — rendered from the same live/seed source as the stats strip (edit mode shows the raw placeholder; the AI prompts and Smart Save preserve it). **Product schema:** `products[].schema {type, category, os, license, free}` overrides the JSON-LD item (default `WebApplication` / `PrivacyApplication` / `Web`, free). **KV vs seed:** a KV doc wins over the seed; the seed is the fallback and the static twins' source (see «No read-time migrations today» above). Editor client: root-level public `admin-app.js` + `admin-app.css` (no secrets), vanilla, **inline edit-in-place** (Egea/Notion-style, v0.25) — the server-rendered live-preview iframe *is* the editor: click text to edit it on the page; markdown leaves get a floating Bold/Link bar; verbatim-HTML section blocks and images open popovers; lists show a hover ↑↓✕ toolbar + "+ добавить". Non-inline fields (`<title>`/meta, share card + preview, SEO/JSON-LD, subscribers `auto`) live in a slide-over **Settings drawer**. The in-memory doc is the single source of truth — text edits write straight back (caret survives); structural edits re-render from it. Per-field **AI** (RU→EN, Вычитать = proofread+typography, non-destructive) in the drawer and on the floating bar. As of **v0.26**: the toolbar floats by the focused field; the site's own header RU/EN + theme controls drive editing; **Save auto-syncs changed RU→EN** (hand-edited EN is protected); **undo/redo** (⌘Z) + **«Откатить»** + **version history** (restore a past revision from the drawer); `/uses` card images are click-to-upload.

**Privacy contract preserved on public pages:** no cookies, trackers, analytics, or AI calls. The session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/admin` — never sent on public pages. AI runs server-side only, key never on the client.

**Build/deploy:** still no build step or npm committed for the static site; Pages bundles Functions on push. `wrangler.toml` declares bindings `CONTENT` (KV) + `MEDIA` (R2). Secrets via `wrangler pages secret put`: `ADMIN_PASSWORD_HASH` (generate with `scripts/hash-password.mjs`), `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `SOCIALBOT_INGEST_TOKEN`, and for publishing notes to the channel `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL`. Local: `npx wrangler pages dev` + gitignored `.dev.vars` (+ `AI_DEV_MOCK=1` to stub AI, `TG_DEV_MOCK=1` to stub Telegram publishing). `.wrangler/` and `.dev.vars` are gitignored.

## Changelog

Release history lives in [CHANGELOG.md](CHANGELOG.md) (one entry per version, newest first). Add an entry there for every release; keep this file to current conventions only.
