# CLAUDE.md — about-me-page

Personal homepage for Semyon Morgunov, deployed on Cloudflare Pages.

## Stack

- **Pure static HTML/CSS/JS** — no framework, no build step, no npm
- **CSS Custom Properties** for theming (4 themes: light, dark, auto, high-contrast)
- **Vanilla JS** wrapped in an IIFE, ~320 lines: theme, one generic dropdown controller (mobile nav / language / theme), anchor smooth-scroll, the 404 page's client-side EN copy. No scroll listener: the side column, «↑» and the progress bar are gone (v0.31.1–v0.31.2)
- **Cloudflare Pages** for hosting with `_headers` and `_redirects` config files

## File Structure

```
about-me-page/
├── index.html          # Main page, Russian language (lang="ru") — a template: data-cms-* hooks, seed twin
├── consulting.html     # Consulting: formats and prices, strategic consulting, how I work (RU) — the former /collaborate (v2.0.0)
├── collaborate.html    # «Сотрудничество»: partnerships & media, a link to /consulting (RU)
├── uses.html           # «Стек и принципы» (RU): hardware & software, then «Как устроен этот сайт» (#principles, v4.0.0 — the former /about, rewritten in the owner's voice); in the menu as «Стек»
├── thanks.html         # «Сказать спасибо» (RU, static — no CMS hooks): help the dogs (Mehr), support me (GitHub Sponsors, Tribute), the free ways, report a mistake (Telegram)
├── privacy.html        # «Приватность» — own privacy tools + «Джентльменский набор» (RU); privacy.morgunov.tech redirects here
├── en/                 # English twins: index, consulting, collaborate, uses, privacy, thanks (lang="en")
├── content.seed.json   # Committed content fallback for every CMS page (KV wins when present)
├── CHANGELOG.md        # Release history (one entry per version); CLAUDE.md keeps conventions only
├── ds/v1/              # Shared design-system layer: fonts, tokens, base, components, chrome.js (+ USAGE.md)
├── styles.css          # Page-specific layout only (hero, stats, cards, /uses, /collaborate, notes)
├── script.js           # Theme, generic dropdown controller, anchor smooth-scroll
├── admin-app.js/.css   # /admin inline editor client (public, no secrets)
├── functions/          # Pages Functions: edge render, CMS API, notes, sitemap, llms.txt, /404
├── scripts/            # check.sh, check-sync.py, check-critical.py, render-static.mjs, build-chrome.mjs, version-stamp.py, sync-products.mjs, kv-push.mjs, hash-password.mjs
├── tests/              # node --test suites for the pure functions
├── llms.txt            # AI/LLM navigation file (llmstxt.org) — a template: {total}/{telegram}/… filled by functions/llms.txt.js
├── _headers            # Cloudflare: X-Robots-Tag, Cache-Control and Content-Type (LICENSE, NOTICE, fonts/OFL.txt → text/plain) for static assets
├── _routes.json        # Cloudflare: static paths excluded from Functions (CDN-cacheable, no invocations)
├── _redirects          # Cloudflare: real redirects only (none today — Pages handles clean URLs itself)
├── robots.txt          # Allows all crawlers, content signals, references sitemap
├── 404.html            # V4-styled 404 page (bilingual; functions/404.js serves it with a real 404 status, _middleware.js does the same for every unknown path)
├── yandex_c8faae431964bcca.html  # Yandex Search ownership verification
├── fonts/                         # Self-hosted IBM Plex woff2 (latin + cyrillic subsets)
│   ├── plex-sans-latin-{400,500,600}.woff2
│   ├── plex-sans-cyr-{400,500,600}.woff2
│   ├── plex-mono-latin-{400,500}.woff2
│   ├── plex-mono-cyr-{400,500}.woff2
│   └── OFL.txt                    # SIL OFL 1.1 for IBM Plex — ships with the fonts, as the OFL requires
└── images/
    ├── Hero_Photo.webp            # Main portrait 1600x1067 (LCP element; JSON-LD image)
    ├── Hero_Photo_{320,640,960,1200}.webp  # srcset variants (640w is the default src)
    ├── favicon.svg                # SVG favicon with initials "SM" (light scheme; also in site.webmanifest)
    ├── favicon-dark.svg           # Favicon for prefers-color-scheme: dark
    ├── icon-192.png, icon-512.png # PWA icons from site.webmanifest
    ├── og-card-ru.png, og-card-en.png  # Share cards (og:image / twitter:image), per language — renders of the design system's share-card template (cards site-ru, site-en), never drawn by hand
    ├── og-card-privacy-{ru,en}.png    # /privacy's own share cards — the same template, cards privacy-ru, privacy-en (v1.6.3)
    └── uses/                      # /uses hardware photos, one webp per card (14)
```

## Page map (v1.5.0)

**Site menu (v3.0.0)** — the same bar on every page (static templates, the notes shell's `siteNav()` in `article-template.js`): «Обо мне» `/` · «Публикации» `/notes` · «Приватность» `/privacy` · «Сотрудничество ⌄» — a `.v4-dropdown.v4-nav-group` with «Консалтинг» `/consulting` and «Партнёрства и медиа» `/collaborate` · «Стек» `/uses` (v4.0.0) (EN: About · Publications · Privacy · Work with me · Uses). Five items need about 750px in one line, so the menu folds into «Меню» up to 960px (v4.0.0; 640px before), where a wrapped second row would look broken. The family services (Fingerprint, Found You) keep their own «MORGUNOV.TECH / NAME» mark and no site menu — owner, 2026-11-25. The current page is `aria-current="page"` — the orange underline in the bar, the round selected-item mark inside the group and in the phone's «Меню» panel (where the group shows its items under a caption, no toggle); the group itself is underlined (`.is-current`) when one of its pages is. A page's own sections are no longer in the bar: they are the on-page line `nav.v4-onpage` right after the hero (home keeps the `data-cms-text` hooks there). `/thanks` marks no item. The footer's slot holds one link of its own, «сказать спасибо или сообщить об ошибке» → `/thanks` (`/en/thanks`, «say thanks or report a bug»); every note ends with «Если заметка пригодилась — вот как можно сказать спасибо» → `/thanks` (`.v4-article-thanks`). `tests/site-nav.test.mjs`.

- **`/`, `/en/`** — hero (eyebrow «Head of FinTech @ Yandex Uzbekistan», one «Написать в Telegram» button) → stats strip → `#about` → `#career` → `#projects` «Собственные проекты» (tier «Работает»: live product cards with the version synced from GitHub — TofsDevOps and Social Tracker Bot in one grid, then the `/privacy` link «Приватность: мои инструменты и джентльменский набор →» introducing Found You and Fingerprint in a grid of their own (v2.2.2: the products whose `repo` is a tool on `/privacy` — `privacyRepos()` of the privacy doc, attached as `_privacyRepos` by `_middleware.js`, the admin preview and `render-static.mjs`), then «Все проекты на GitHub ↗»; no GitHub Sponsors link on the pages since v2.2.2 (owner) — it stays in `llms.txt`; tier «До этого»: past ventures as rows) → `#notes` «Публикации» (the three newest feed entries, each «06.2025 · YouTube» + title, then «Все публикации →») → `#contact` «Связаться» (who writes → the one button «Написать в Telegram» with the reply time → «или на почту: `s@morgunov.tech`» as a line of text → «Форматы и цены консалтинга →»). Sections carry no numbers since v1.5.0. Menu items mirror the section titles (`data-cms-text`).
- **`/notes`, `/en/notes`** — «Публикации»: own notes (KV articles) and external materials (vc.ru, YouTube — the seed-only `notes` doc) in one feed, newest first, under the Telegram channel block and the topic line (v2.2.0): «Все» and every topic that has something, each → `/notes/topics/<key>` (`/en/notes/topics/<key>`) — a page per topic with its heading and intro from `notes.topics` and the same feed filtered by the topic, no channel block, 404 for an unknown or empty topic. A topic is navigation, never a chip in a feed row (composition rule 4): the line above the feed, the topic pages, a link after the date in a note's byline. RSS carries own notes only (a `<category>` per topic); the sitemap carries own notes and the topic pages.
- **`/consulting`** (v2.0.0; this content lived at `/collaborate` before) — about (v2.2.2: the clients line, then one proof line in the same style — where he spoke, mentored and judged, no dates and no links to his own posts) · consulting (the one consulting phrase `sections.consulting.prose` → two tiers, both buttons «Написать в Telegram →» → the reply time `sections.consulting.note` → who signs the contract, `sections.consulting.legal`: MOR TECH LLC, an IT Park resident, linked to the IT Park registry) · strategic consulting · `#work` «Как работаю / Чего не делаю» · contact. Sections carry no numbers since v1.5.0; the angel section (`#angel`) and its menu item were removed in v1.2.8.
- **`/collaborate`** (v2.0.0) — «Сотрудничество»: `#partnerships` «Партнёрства и медиа» (what the owner is open to outside paid consulting, the independence terms, one Telegram button; no prices, no audience numbers, no employer) → `#contact` «Нужен консалтинг?» with one button to `/consulting`. Old links `/collaborate#consulting` in the home KV doc were rewritten at read time until the /admin Save of 2026-11-25 (rev 34, v4.0.1) stored `/consulting#consulting`.
- **`/uses`** «Стек и принципы» (v4.0.0) — hardware groups + software cards (the referral links marked), then `#principles` «Как устроен этот сайт»: four short parts in the owner's voice — why the site exists, what matters (privacy, honesty, accessibility, nothing extra), where the look comes from (Rams/Braun, IBM Plex, orange as a signal), how it's built (plain HTML/CSS/JS on Cloudflare Pages, Claude Code, open source) — `uses.sections.principles.groups` rendered by `usesPrinciples`. Public again: in the menu, sitemap and `llms.txt`. `/about` and `/en/about` answer 301 → `/uses#principles` (`MOVED` in `_middleware.js`); the about templates, route, seed doc and admin code are gone (the KV doc `s.morgunov.tech:about` is an orphan the owner may delete). The bonus/promo-code post of the channel belongs here once the owner gives its link.
- **`/thanks`** (v3.0.0, static, no CMS doc) — «Сказать спасибо»: `#dogs` (the owner's text about Tofs; Mehr, Tashkent, the one shelter he vouches for — payment details on the shelter's Instagram, never copied here) → `#support` (GitHub Sponsors and Tribute, direct donations; the referral links belong on `/uses` — owner) → `#free` (one action a line, most important first: subscribe to the channel, forward a post, react or comment, boost, GitHub stars, LinkedIn) → `#bug` (one button, Telegram). Donation links go straight to where people pay, never through the channel (owner: least friction). In the sitemap and `llms.txt`; reached from the footer and the end of every note, not from the menu (owner).
- **`/privacy`** (v1.6.0) — «Приватность»: `#tools` «Мои инструменты» (Fingerprint and Found You — the homepage product cards, version and description synced from GitHub by `sync-products.mjs` — then Good Pass as a pale «Скоро» card: no link, no button, `soon: true`) → `#kit` «Джентльменский набор» (how the list is made, then cards in groups by task; a card gets in only with open source **and** a published independent audit — the one exception is the last group, `unaudited: true` with a note under its caption: an ad blocker, uBlock Origin, since none has a public audit (v1.6.2); its spec reads «Аудит: публичного нет» — its spec links the audit report(s) and the code, its one button is the official site labelled with the domain; no referral links; the date the list was checked) → `#articles` «Статьи» (v2.2.0: the published notes tagged with the topic in `sections.articles.topic` — `privacy` — newest first, as rows of the publications feed → `/notes/<slug>`, then «Все публикации →»; a doc without `topic` still lists the slugs of `sections.articles.items` in their order (v2.1.0); `_middleware.js` and the admin preview attach the published notes as `_articles`, the English page lists a note only once it has an English title, a note change purges `/privacy` too — `NOTES_PATHS`) → `#contact`. `privacy.morgunov.tech` is outside the repo (set 2026-11-25): a proxied A record `192.0.2.1` with the comment «Redirect only…», as for the apex and `www`, and the zone's Redirect Rule «privacy → s.morgunov.tech/privacy» (host equals `privacy.morgunov.tech` → 301 to `https://s.morgunov.tech/privacy`, query string kept).
- **`/404`** — one bilingual file.

## Deploy Process

**GitHub → Cloudflare Pages (automatic)**

1. Push to `main` branch on GitHub (`morgunovtech/about-me-page`)
2. Cloudflare Pages detects the push via GitHub integration and deploys automatically
3. No build command — files are served as-is
4. `_headers` and `_redirects` are processed by Cloudflare automatically

There is no build step and no deploy pipeline of our own — Cloudflare Pages deploys on push. GitHub Actions only check, never deploy: `ci.yml` runs on every PR and on every push to `main` (`scripts/check.sh`, the Functions build, gitleaks over the whole history); a separate workflow, `dependabot-automerge.yml`, auto-merges Dependabot minor/patch bumps once CI passes.

### Release flow

1. Work on a branch (worktrees under `.claude/worktrees/`); `main` is production.
2. `python3 scripts/version-stamp.py` when any stamped asset changed, then `scripts/check.sh` (full, with the Functions build).
3. Add the `CHANGELOG.md` entry (next version — see Versioning) in the same commit.
4. Push the branch → `gh pr create` → squash-merge. Every push also builds a Cloudflare **Preview** deployment for the branch.
5. Verify production, not just the merge: `npx wrangler pages deployment list --project-name about-me-page` shows the Production row for the commit; then check the live page (the `x-build` response header of a page is the deployed commit — the footer shows the version; Function-rendered HTML sits in the edge cache up to 300 s — look at `x-edge-cache`).
6. Read-only checks of real content: `npx wrangler kv key get --binding CONTENT "s.morgunov.tech:<page>" --remote` (KV wins over `content.seed.json`).
7. A content change made in the seed reaches the live page only through KV: after the merge the owner runs `node scripts/kv-push.mjs <page>` (dry run: every field that changes) and then `--yes` — agents cannot write production KV.

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

`scripts/check.sh` runs everything below in order: `node --check` on all JS, `node --test`, RU↔EN sync, critical-CSS drift, the `chrome.js` twin check, the static-twin check, and (unless `NO_BUILD=1`) `wrangler pages functions build`. Run it before every commit.

### RU↔EN sync check

`scripts/check-sync.py` verifies that the six RU and EN HTML pairs (`index.html`, `consulting.html`, `collaborate.html`, `uses.html`, `privacy.html`, `thanks.html` ↔ their `en/` twins) share the same DOM structure (tag tree + classes + ids). It ignores text, attribute values, and state classes (`is-active`).

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

- **Design system of record:** the Claude Design project «morgunov.tech Design System» (imported from this repo). Its rules bind here: `border-radius: 0` (the one round shape is the live dot with its two relatives, the busy mark of a button and the selected-item mark of a menu) and `box-shadow: none` everywhere, no gradients, no emoji, no content icons (the subscribers stat reads `TG · LI · YT`), no font-weight 700.
- **Tokens are colours + type only:** the `--v4-*` colour set per theme on `[data-theme]` (+ `auto` via `prefers-color-scheme` for consumers without the inline script), `--v4-sans`/`--v4-mono`, the `--v4-label-*` settings. Sizes, gaps and durations are literals in the CSS — do not add `--space-*`, `--radius-*` or `--shadow` twins.
- Shell max width 1280px; responsive breakpoints: 480px, 640px, 960px, 1100px
- **Caption scale** (tokens.css): every uppercase tracked label is 12px / 0.1em / `--v4-label-weight` (500). A page has two caption styles: sans caps for chrome and controls (nav, menus, footer, stat units, `.v4-h3`) and mono caps for labels of data (tags, the career role, card/pub heads, spec terms, hero and article eyebrows). `--v4-label-xs-*` holds the same values as `--v4-label-*` since v1.3.0 (they were 11px / 0.1em and 10px / 0.12em) — both names stay because the stylesheets and the `ds/v1` consumers read them. Data set in mono — a date, a period, a source, a count, the build mark — is plain 12px, never caps (`.v4-note-date`, `.v4-note-meta`, `.v4-feed-meta`, `.v4-stat-aside`, `.v4-build`). Nothing on a page is set under 12px. Buttons (`.v4-btn`, 12px / 0.08em) are not labels.
- **Phone type** (≤640px): 16px for anything read as a sentence (body, card copy, the contact note), 14px for a secondary line (venture arc, `.v4-terms`, the contact's e-mail line), 12px for captions and mono meta. The career row is one column there; `.v4-h1` and `.v4-notes-title` scale below 377px (`clamp(32px, 10.6vw, 40px)`).
- **Measure:** `.v4-prose p`, `.v4-list li` and card copy stop at 62ch.
- **Only controls answer the pointer:** `.v4-product` and `.v4-use` have no `:hover`. `.v4-btn` has a pressed look (`:active`), a disabled one (`:disabled` / `aria-disabled="true"`: dashed outline in `--v4-dim`) and a busy one (`.is-busy`: the pulsing dot before the label). Under `@media (hover: none)` hover paints nothing, so a tapped button does not stay inverted.
- **Service chrome:** a family service repeats this site's bar, language and theme menus and footer — the markup snippet and the rule are «Service chrome» in `ds/v1/USAGE.md` (`tests/chrome.test.mjs` keeps the snippet whole). `.v4-service` in `components.css` is the mark «MORGUNOV.TECH / NAME» that a service puts at the left of the bar; this site has none — it is the family.
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
- **`ds/v1/chrome.js` is a twin of `script.js`** for the services of the family: the same file without the regions between `/* site-only:start … */` and `/* site-only:end */` (the 404 page's EN copy, the console greeting). Never edit it by hand: change `script.js`, run `node scripts/build-chrome.mjs --write`; `check.sh` fails on drift (`--check`, `tests/chrome.test.mjs`). Code that only this site needs goes inside a site-only region; everything else ships to the services
- Theme preference stored in `localStorage` under key `theme-preference`
- On init, `script.js` only syncs `aria-checked` on the theme menu items (theme is already applied by inline script)
- No scroll listener today; if one comes back it uses `requestAnimationFrame` throttling
- **Dropdowns** (`.v4-dropdown` = toggle `[aria-controls]` + panel): one generic controller for the mobile nav (`.v4-nav`), the language menu (`.v4-lang`) and the theme menu (`.v4-theme`). State = `.is-open` on the container + `aria-expanded` on the toggle; only one open at a time; close on Escape, outside click, focus-out, a click inside, or when the viewport crosses 960px (the «Меню» fold since v4.0.0). Keyboard: Enter/Space opens and focuses the first item; ArrowUp/Down/Home/End move; menus (`role="menu"`) return focus to their toggle, the nav does not (its links focus the target section themselves) The site menu's «Сотрудничество» group (v3.0.0) is one more `.v4-dropdown` inside the nav: a disclosure of links (no `role="menu"`), shown open in place under a caption in the phone's panel; the anchor smooth-scroll handler covers `.v4-onpage` links.
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
- **CTA convention.** In any button row the primary button comes first. «←» is reserved for back-links to the parent page (always secondary, last); a trailing «→» marks actions that leave the site or start a flow (book, install, check, «узнать подробности»); plain contact buttons (Telegram, «На главную») carry no arrow. A contact labelled as the start of a process («Написать →», «Send a pitch →») is a flow and keeps its arrow. A «more» link (`.v4-more`) is not a button: its label names what is behind it («Все проекты на GitHub», never «Подробнее») and carries no glyph — `moreLink()` adds «→» for a page of this site and «↗» for a link that leaves it.
- **Telegram is the main contact, `s@morgunov.tech` the second** (owner's decision 2026-11-24, v1.2.7; v0.31.2–v1.2.6 had no e-mail at all). The address appears in exactly three places: the home «Связаться» block (a line of text under the Telegram button, never a second button — v1.5.0), the `llms.txt` Contact list and JSON-LD `Person.email` (`home.seo.email`). Everything else — the hero, `/collaborate`, «Сообщить об ошибке» on `/thanks` (the footer's link since v3.0.0), `security.txt` — stays Telegram-only (`tests/stage3.test.mjs`).
- **No calendar booking.** The owner does not use Morgen: no `book.morgen.so` link on a page, in `llms.txt` or in JSON-LD; the `/collaborate` tier buttons lead to Telegram (`tests/presence-audit.test.mjs`).
- **No angel investing or advisory anywhere** until there is an example to name (owner's decision 2026-11-24): v1.2.7 took them out of `llms.txt` and JSON-LD, v1.2.8 off the pages — the `/collaborate` `#angel` section and its menu item, the hero eyebrow and tagline, the meta and share descriptions, «advisory board» in `#strategy`, «ищете инвестора» in the home «Связаться» (`tests/presence-audit.test.mjs`). `collabGroups` still renders a `spec` group and `admin-app.js` still labels an `angel` section; neither has content.
- **Composition rules** (v1.5.0) are tests, `tests/composition.test.mjs`, and the list «Composition rules» in `ds/v1/USAGE.md`: one state — one sign; a number marks a sequence (no section numbers); a «more» link names what is behind it; a publication row says when and where (no free-text tag — `feedSource()` takes the platform from the address); one button in a block; the build mark; the only round shape is the live dot. A new block is checked against the list before it ships.
- **Articles use the site's idioms:** `h2` in a note renders like `.v4-section-head` (the rule under the title; no number since v1.5.0), `h3` like `.v4-h3` (small tracked caps).
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
- Pages never CDN-caches a URL with a query string, so a zone **Cache Rule** («s.morgunov.tech versioned assets (?v=) eligible for cache»: host `s.morgunov.tech`, path `/ds/*` or `/styles.css` `/script.js` `/admin-app.js` `/admin-app.css`) marks them eligible; the query string stays in the cache key, so a new `?v=` is a new object. A second Cache Rule, last in order («s.morgunov.tech unversioned /ds and share cards: never from the edge cache», 2026-11-25): host `s.morgunov.tech`, no `v=` in the query, path under `/ds/` or `/images/og-card-` → **Bypass cache**. `_headers` cannot see a query string, so these paths go out as `immutable` for a year with or without `?v=`, and the edge kept the plain address across releases: ten hours after v1.5.0 `/ds/v1/tokens.css` answered with the old bytes or the new depending on the edge node, and the share cards of v1.4.1 needed a manual purge. With the rule the plain address is always the current deployment (`cf-cache-status: DYNAMIC`). The response still carries the year-long `Cache-Control` — the rule's Browser TTL does not apply to a bypassed response (measured) — so a browser that opened the plain address keeps its copy; pages and services never do, they link with `?v=`. Function-rendered HTML always reports `cf-cache-status: DYNAMIC` — its cache is `x-edge-cache`, which zone analytics do not count. `_routes.json` excludes all static assets from Pages Functions — they serve from the CDN without a worker invocation. `/llms.txt` and `/404` are Functions (live counters / real 404 status) and therefore not excluded

## SEO / Meta

- **Canonical URL:** `https://s.morgunov.tech/` — use this domain consistently everywhere. The apex `morgunov.tech` and `www.morgunov.tech` 301 to it through a Cloudflare Redirect Rule in the zone (outside the repo); the Pages project's technical host `about-me-page-cr2.pages.dev` and its previews get `X-Robots-Tag: noindex` — from `_headers` for static files, from `noindexOnTechnicalHost()` (`_lib/http.js`, applied in `_middleware.js`) for everything Functions build
- OG/Twitter images and JSON-LD images must use **absolute URLs**
- **Share cards are renders of one template.** `images/og-card-{ru,en}.png` come from the design system's `templates/share-card` (cards `site-ru`, `site-en`; rules in its `guidelines/IMAGERY.md`), like the cards of every family service — a link to any morgunov.tech page looks the same in a feed. To change a card: edit its text in the template's `cards.js`, render there, copy the PNG here. The file keeps its name (KV docs point at it), so Telegram and LinkedIn show the new picture only after their own cache is refreshed (@WebpageBot, Post Inspector)
- `<meta name="theme-color">` set for both light and dark schemes
- JSON-LD Person schema: keep `description`, `knowsAbout`, `worksFor`, `sameAs` and `email` in sync
- `sitemap.xml` `lastmod` should be updated when content changes significantly
- Yandex verification: `yandex_c8faae431964bcca.html` — do not delete

## AI / Agentic Optimization

- `llms.txt` follows the [llmstxt.org](https://llmstxt.org) convention; the committed file is a template — `{total}`, `{telegram}`, `{linkedin}`, `{youtube}` are filled by `functions/llms.txt.js` from the same `counters()` the homepage uses, so the AI-facing numbers never drift from the page
- Available at `https://s.morgunov.tech/llms.txt`
- Keep it in sync with major content changes (roles, products, contact info)
- `robots.txt` allows all crawlers including AI (GPTBot, ClaudeBot, PerplexityBot) and carries `Content-Signal: search=yes, ai-input=yes, ai-train=yes` in every group (contentsignals.org) — the owner allowed AI training on 2026-11-24
- JSON-LD `description` and `knowsAbout` help AI search engines attribute content

## Content management (CMS) — `/admin`

The public pages are **edge-rendered from Cloudflare KV** via Pages Functions: the committed HTML files are templates carrying invisible `data-cms-*` hooks; `functions/_middleware.js` overlays content from KV (key `s.morgunov.tech:<page>`, fallback `content.seed.json`) with `HTMLRewriter`. Editing in `/admin` saves to KV → live **without a redeploy**. Wired for the page types `home` (`/`, `/en/`), `consulting` (`/consulting`), `collaborate` (`/collaborate`), `uses` (`/uses`), `privacy` (`/privacy`) — RU+EN (`about` until v4.0.0, now a section of `uses`). Route keys are the clean URLs Pages serves (it 308s `/foo.html` → `/foo`). `home` is fully granular (per-field); `uses`, `collaborate` and `privacy` are structured docs (cards, tiers, groups — v0.30; privacy v1.6.0); **Topics of notes** (v2.2.0): the seed-only `notes` doc names them in `topics` — `{key, name{ru,en}, intro{ru,en}}`, six today: management, productivity, career, tech-history, tools, privacy; a note (KV) and an external material carry `tags` — topic keys, lowercase slugs, at most five, cleaned by `cleanTags` on save, edited in /admin as «Темы (ключи через запятую)»; a note change purges its topic pages (`topicPaths`) and `/llms.txt`. Crawlers and assistants get them through the sitemap, RSS categories, JSON-LD `keywords` and the `{notes}` placeholder of `llms.txt` (notes grouped by topic, English where translated). The /notes feed's external materials live in the seed-only `notes` doc (read through `loadDoc`, so a KV doc would win; not in the /admin page list yet).

**`functions/` layout:**
- `_middleware.js` — edge-render for the 10 managed routes (per-page JSON-LD via `renderPageJsonLd`); blocks internal files (`BLOCKED`: `content.seed.json`, `CLAUDE.md`, `CHANGELOG.md`, `README.md`, `wrangler.toml`, `.gitignore`, `.sonarcloud.properties` and everything under `.github/`, `scripts/`, `tests/` → 404; `LICENSE`, `NOTICE` and `fonts/OFL.txt` are served on purpose — `_headers` types them `text/plain`); back-fills security headers on every method (route-specific CSPs — admin shell, login, `/assets` — win).
- **Edge cache** (`_lib/cache.js`): every Function-rendered GET (managed pages, `/llms.txt`, notes, feeds, sitemap) is stored in `caches.default` for `EDGE_TTL` (300 s) under `origin + pathname`; `purge()` runs on every KV write — `save.js` (the page's URLs via `PAGE_PATHS` / `articlePaths`), article create/delete/import, and the subscriber ingest (`/`, `/en/`, `/llms.txt`). Responses carry `x-edge-cache: HIT|MISS`. `cached(ctx, render)` is the wrapper; `getOrHead()` sits outside it.
- **Build mark:** the footer shows the release, `vX.Y.Z` — `VERSION` in `_lib/site.js`, stamped by `version-stamp.py` from the top entry of `CHANGELOG.md` into `site.js` and into the `<a class="v4-build">` of every page — as a link to `CHANGELOG.md` on GitHub (`CHANGELOG_URL`); the rule for the family is «Build mark» in `ds/v1/USAGE.md`. The deployed commit is no longer on the page: `buildOf(env)` reads `CF_PAGES_COMMIT_SHA` (fallback: the stamped `BUILD`) and `_middleware.js` sends it as the `X-Build` header of every managed page; the `{build}` prose placeholder still resolves from it. Add the CHANGELOG entry **before** running `version-stamp.py`, or the pages are stamped with the previous version (`tests/composition.test.mjs` fails). **The footer is one module** (`ds/v1/USAGE.md`, «Footer»): name · year · the build mark, then a slot of at most two links of the page's own (here one since v3.0.0: «сказать спасибо или сообщить об ошибке» → `/thanks`), the privacy line on the right, and nothing else — `tests/composition.test.mjs` counts the links on every page. A third link goes on the page, not in the footer.
- **Sessions** (`_lib/auth.js`): HMAC tokens carry `iat`; «Выйти» writes `session:not-before` to KV and `verifySession(secret, token, env)` rejects anything issued earlier — a captured token dies on logout.
- `_lib/` — `content` (KV→seed load, `loadSubscribers`), `migrations` (`fixStaleContent` — code-side string fixes for KV docs, the `STALE` table and `SEED_FILL` are empty since v4.0.1; no seed import so tests load it directly), `cache` (edge cache + purge), `tg/` (Telegram publish/import: `plan`, `source-post`, `tg-html`, `tg-import`, `targets/`), `i18n`, `markdown` (zero-dep subset), `notes-feed` (the /notes feed: own notes + external materials, and the topics — `topicsOf`, `liveTopics`, `topicNavHtml`, `notesList` for `llms.txt`; pure — Node-testable), `render` (component renderers, `counters()`/`fillCounters()`/`unitFor()` — the single source for every subscriber number incl. RU plural), `render-notes` (the /notes pages, feeds and `renderSitemap`), `render-article` (one note/article page), `articles` (KV articles: load, list, slugs), `article-template` (notes/article shells built from shared chrome helpers), `sanitize` (HTML sanitizer for verbatim blocks and article bodies), `overlay` (HTMLRewriter handlers), `jsonld` (home `@graph` + `renderPageJsonLd` for collaborate/about/uses), `site` (`ORIGIN`, `NAME` per language), `tg-adapter` (glue between the admin API and `tg/`), `auth`, `ai`, `http`.
- `llms.txt.js` — `/llms.txt` with live counters; `404.js` — `/404` with a real 404 status (`notFound()` sets noindex + Cache-Control itself — `_headers` never reaches Function responses). GET-only routes (sitemap, notes, feeds, `/assets/*`) are wrapped in `getOrHead()` from `_lib/http.js` so HEAD answers like GET.
- **No read-time migrations today.** On 2026-11-09 (v1.0.1) the `home` and `about` KV docs (about retired in v4.0.0) were saved with every earlier migration and copy fix applied (they carry `migration: 31`); `collaborate` and `uses` have no KV doc and render from the seed. A KV doc keeps winning over the seed, so: a **field the renderer starts reading** that an older KV doc lacks is filled from the seed at read time — `SEED_FILL` / `fillFromSeed` in `migrations.js` (v2.2.3 filled `home.sections.products.privacy`; empty since the home doc was saved again through /admin on 2026-11-25, rev 34, v4.0.1), only when missing, until an /admin Save stores it (a template element moved into a renderer is exactly this case — check the live KV doc before moving one); a **copy** fix to a KV doc goes into the `STALE` table of `migrations.js` (rules in its header) until the next `/admin` Save persists it, then the entry is removed; a **shape** change needs a gated read-time migration again (pattern: v0.31.1 `homeV2` in git history) or a Save of the new shape. `validateHome` in `admin/api/save.js` lists the sections a home doc must have.
- **Seed → KV:** `scripts/kv-push.mjs <page> [--yes] [--create]` writes the seed doc to KV the way an /admin Save does (rev + 1, `updatedAt`/`dateModified`, `:rev:<n>`, the `:revs` index of 20); dry run by default, refuses to race a concurrent Save, does not purge the edge cache (pages update within 300 s). It replaces the whole doc, so /admin edits missing from the seed are lost — the dry run lists them; the previous revision stays in /admin's history. The owner runs it.
- **Product cards ← GitHub:** `scripts/sync-products.mjs [--write]` updates `home.sections.products.items[]` and the /privacy tools (`privacy.sections.tools.items[]`) that carry a `repo` — a product on both pages reads the same: the version (highest of latest release, tags, `package.json`, `pyproject.toml`, the top `CHANGELOG.md` heading → `vMAJOR.MINOR`) and the description (EN = the repo description, RU = `README.ru.md` H1 tail + first paragraph; only when both exist). Order, names, tags and buttons stay hand-edited in the seed. A web product with an English page has a localized button `href` — `{ru: "https://<host>/", en: "https://<host>/en/"}` (Found You, Fingerprint since v1.2.5; Good Pass left the page in v1.2.9): their roots are Russian, so `/en/` and `llms.txt` link the `/en/` page. Then `render-static.mjs --write` and, after the merge, `kv-push.mjs home`.
- `{build}` inside `data-cms-html` prose resolves to `BUILD` from `_lib/site.js` (stamped by `version-stamp.py`) — never store a literal build hash as content.
- `admin/` — `_middleware.js` (session gate), `login`/`logout`, `index` (editor shell), `api/{content,save,preview,upload,translate,proofread,subscribers,history,articles,import,tg-preview,tg-publish,tg-archive-import}`.
- `assets/[[path]].js` — public read-only R2 delivery at `/assets/*` (no listing).
- `api/ingest/subscribers.js` — token-guarded SocialBot ingest → KV `stats:subscribers`.

**Hook vocabulary** (invisible, structural-sync-safe — `check-sync.py` ignores `data-*`): `data-cms-text`, `data-cms-md`, `data-cms-href` / `data-cms-content` / `data-cms-alt`, `data-cms-abs` (absolute og/twitter image), `data-cms-img` + `data-cms-preload` (swap hero portrait when set, else keep template `srcset`), `data-cms-list="<slot>"` (regenerate a list), `data-cms-jsonld`.

**Content model:** per-page JSON doc; localizable fields are `{ru,en}`; **every text leaf is the same markdown subset** (`**bold**`, `` `code` ``, `[text](url)`, literal NBSP; block prose adds paragraphs and `- ` lists) and goes through `renderInline`/`renderProse`, which escape — there is no raw-HTML leaf in the structured docs (v0.30 converted /uses and /collaborate; `hero.ctas` remain verbatim HTML blocks sanitized on save). One `card()` helper renders home products, /uses software and /collaborate tiers. Internal hrefs may be localized. `meta`/`share`/`seo` drive `<title>`, og/twitter, and JSON-LD — **single source of truth**, so one edit updates every SEO signal (ends manual-sync drift). The subscribers stat reads live KV (`stats:subscribers`) when `auto !== false`; its RU unit is declined from the live total («подписчик/подписчика/подписчиков»). **Counter placeholders:** the /notes channel block meta (`notes.channel.meta`) and `llms.txt` may contain `{telegram}`, `{linkedin}`, `{youtube}`, `{total}` — rendered from the same live/seed source as the stats strip (edit mode shows the raw placeholder; the AI prompts and Smart Save preserve it). **Product schema:** `products[].schema {type, category, os, license, free}` overrides the JSON-LD item (default `WebApplication` / `PrivacyApplication` / `Web`, free). **KV vs seed:** a KV doc wins over the seed; the seed is the fallback and the static twins' source (see «No read-time migrations today» above). Editor client: root-level public `admin-app.js` + `admin-app.css` (no secrets), vanilla, **inline edit-in-place** (Egea/Notion-style, v0.25) — the server-rendered live-preview iframe *is* the editor: click text to edit it on the page; markdown leaves get a floating Bold/Link bar; verbatim-HTML section blocks and images open popovers; lists show a hover ↑↓✕ toolbar + "+ добавить". Non-inline fields (`<title>`/meta, share card + preview, SEO/JSON-LD, subscribers `auto`) live in a slide-over **Settings drawer**. The in-memory doc is the single source of truth — text edits write straight back (caret survives); structural edits re-render from it. Per-field **AI** (RU→EN, Вычитать = proofread+typography, non-destructive) in the drawer and on the floating bar. As of **v0.26**: the toolbar floats by the focused field; the site's own header RU/EN + theme controls drive editing; **Save auto-syncs changed RU→EN** (hand-edited EN is protected); **undo/redo** (⌘Z) + **«Откатить»** + **version history** (restore a past revision from the drawer); `/uses` card images are click-to-upload.

**Privacy contract preserved on public pages:** no cookies, trackers, analytics, or AI calls. The session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/admin` — never sent on public pages. AI runs server-side only, key never on the client.

**Build/deploy:** still no build step or npm committed for the static site; Pages bundles Functions on push. `wrangler.toml` declares bindings `CONTENT` (KV) + `MEDIA` (R2). Secrets via `wrangler pages secret put`: `ADMIN_PASSWORD_HASH` (generate with `scripts/hash-password.mjs` — PBKDF2 at 100 000 iterations, the most Workers' Web Crypto accepts; a 600 000-iteration hash throws there and locked the owner out until v2.1.1; the secret reaches the site with the next deployment), `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `SOCIALBOT_INGEST_TOKEN`, and for publishing notes to the channel `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL`. Local: `npx wrangler pages dev` + gitignored `.dev.vars` (+ `AI_DEV_MOCK=1` to stub AI, `TG_DEV_MOCK=1` to stub Telegram publishing). `.wrangler/` and `.dev.vars` are gitignored.

## Changelog

Release history lives in [CHANGELOG.md](CHANGELOG.md) (one entry per version, newest first). Add an entry there for every release; keep this file to current conventions only.
