# morgunov.tech

Source of Semyon Morgunov's personal site: zero-build static pages, an edge CMS on Cloudflare Pages, KV and R2, and the morgunov.tech design system that other projects reuse.

Live at **[s.morgunov.tech](https://s.morgunov.tech)** — the apex `morgunov.tech` and `www` 301 to it through a Cloudflare Redirect Rule · **License:** MIT (code)

## Stack

Pure static HTML/CSS/JS. **No build step, no npm, no framework.** Hosted on Cloudflare Pages.

- 11 HTML templates (RU + EN twins and a bilingual `404.html`) plus the `/notes` shells rendered by Pages Functions:
  - **home** — about, career, own projects (live products + past ventures), publications, contact (Telegram, e-mail as the second channel);
  - **`/notes`** — publications: own notes and articles/talks published elsewhere, one feed;
  - **`/collaborate`** — consulting, strategic consulting, how I work, partnerships & media;
  - **`/uses`** — hardware and software;
  - **`/privacy`** — my privacy tools and the essential kit: open-source apps with a published independent audit (`privacy.morgunov.tech` redirects here — a Redirect Rule in the zone);
  - **`/about`** — unlisted (`noindex`) until it is rewritten
- A versioned design-system layer `ds/v1/` (fonts, tokens for 4 themes, base, components) + `styles.css` for page layout. Other projects reuse it: [Fingerprint](https://github.com/morgunovtech/Fingerprint) loads `fonts`, `tokens` and `base` straight from `https://s.morgunov.tech/ds/v1/` (not `components.css`), [Found You](https://github.com/morgunovtech/FoundYou) vendors a copy in its `public/ds/v1/`, the [TofsDevOps](https://github.com/morgunovtech/Tofs_DevOps_bot) status page inlines the tokens and takes only the woff2 files from `/fonts/` (a bot other people self-host must not depend on this site), and the Lenses PDF report (private) uses the print palette with IBM Plex; see [`ds/v1/USAGE.md`](ds/v1/USAGE.md). Since v1.4.0 the layer also ships the behaviour of the bar (`ds/v1/chrome.js`, a checked twin of `script.js`) and a service must repeat the chrome — bar, language and theme menus, footer
- One script — `script.js` (single IIFE, no dependencies, ≈ 320 lines)
- Self-hosted IBM Plex Sans + Plex Mono (latin + cyrillic woff2 subsets, `font-display: swap`)
- Cloudflare config: [`_headers`](_headers), [`_routes.json`](_routes.json), [`_redirects`](_redirects)

## Privacy

No cookies, no trackers, no analytics on the **public** pages. Verifiable by reading the code — not just by trusting a footer line:

```sh
grep -RIE '(google-analytics|gtag|fbq|matomo|metrika|hotjar|mixpanel|amplitude|segment)' *.html en/*.html
# → no matches
```

The `/admin` editor sets one HMAC session cookie (`HttpOnly; Secure; SameSite=Strict; Path=/admin`) — scoped to that path, so it's never sent on public pages. All AI calls run server-side; the public site makes none.

## Local preview

```sh
npx wrangler pages dev   # serves the site + Functions, simulates KV/R2 — open http://localhost:8788
```

Clean URLs, `/notes`, `/llms.txt` and the CMS overlay need the Functions, so this is the dev loop (a plain `python3 -m http.server` shows the committed templates only). Still no `npm install` in the repo, no Docker, no Vite.

## Conventions, architecture, deploy

See [CLAUDE.md](CLAUDE.md) — single source of truth on stack rules, the page map, theming model,
performance conventions, SEO/AI optimization and the release flow.

## Releases

Versioned with [SemVer](https://semver.org): patch for fixes and copy, minor for features, major when the
page map or the public contract changes. The full history is in [CHANGELOG.md](CHANGELOG.md) (in Russian,
one entry per release). From **v1.0.0** (2026-11-09 — site v2: a hub instead of a landing page) every
release is tagged `vX.Y.Z`, and minor/major ones get a [GitHub Release](https://github.com/morgunovtech/about-me-page/releases).

## Tools

```sh
scripts/check.sh                           # everything below + node --check/--test + a Functions build
python3 scripts/check-sync.py              # RU↔EN structural parity
python3 scripts/check-critical.py          # inline critical CSS ↔ ds/v1 + styles.css
node scripts/render-static.mjs --check     # list containers and JSON-LD are the seed's twins (--write regenerates; prose leaves are edited by hand)
python3 scripts/version-stamp.py           # build SHA + content-hash ?v= cache busters
node scripts/sync-products.mjs --write     # product cards' versions + descriptions from their GitHub repos
node scripts/kv-push.mjs home --yes        # put the seed doc live in KV, like an /admin Save (dry run without --yes)
```

Run `check.sh` before any commit — it catches an extra section in RU that's missing in EN,
a stale inline critical rule, or a template that no longer matches the renderer. CI runs the
same checks, the Functions build and a gitleaks secret scan on every pull request.

## Admin / CMS

A minimal editor at `/admin` edits page content — text, dates, markdown, images, the share card — without touching code. Edits save to **Cloudflare KV** and go live **without a redeploy**. Built on Pages Functions (`functions/`), KV (content), and R2 (images); vanilla JS, no framework. The public pages are edge-rendered from KV (HTML files become templates with invisible `data-cms-*` hooks); `content.seed.json` is the committed fallback. Wired for all four page types (home, collaborate, about, uses — RU + EN) and the notes/articles.

### One-time setup (Cloudflare)

```sh
npx wrangler kv namespace create CONTENT      # content store
npx wrangler r2 bucket create morgunov-assets # image uploads
# put the KV id into wrangler.toml ([[kv_namespaces]].id), or bind both in the Pages dashboard

# secrets (Pages → Settings → Functions, or via wrangler):
node scripts/hash-password.mjs 'your-admin-password'   # prints ADMIN_PASSWORD_HASH
npx wrangler pages secret put ADMIN_PASSWORD_HASH
npx wrangler pages secret put SESSION_SECRET           # any long random string
npx wrangler pages secret put ANTHROPIC_API_KEY        # AI translate / proofread
npx wrangler pages secret put SOCIALBOT_INGEST_TOKEN   # live subscriber numbers
npx wrangler pages secret put TELEGRAM_BOT_TOKEN       # publishing notes to the channel
npx wrangler pages secret put TELEGRAM_CHANNEL         # the channel, e.g. @raschet7
```

Seeding KV is optional — when a key is missing, the render falls back to `content.seed.json`.

### Local dev

```sh
npx wrangler pages dev   # serves the site + Functions, simulates KV/R2
```

Add a gitignored `.dev.vars` with `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and optionally `AI_DEV_MOCK=1` (stubs AI without a key), `TG_DEV_MOCK=1` (stubs Telegram publishing) + `SOCIALBOT_INGEST_TOKEN`.

### SocialBot (live subscriber numbers)

The site exposes `POST /api/ingest/subscribers` (header `Authorization: Bearer <SOCIALBOT_INGEST_TOKEN>`, body `{telegram, youtube, linkedin, updatedAt}`) → KV `stats:subscribers`. The bot ([social-tracker-bot](https://github.com/morgunovtech/social-tracker-bot), on Railway) pushes on its own schedule; set the same token as a Railway env var. The site only reads; the bot only writes. No cron on the site.

## What it creates outside the repo

- A Cloudflare Pages project `about-me-page` (`wrangler.toml`), serving `main` on the custom domain s.morgunov.tech — a DNS record in the morgunov.tech zone; the technical host `about-me-page-cr2.pages.dev` answers with `noindex`. In the same zone: the Redirect Rule that sends the apex and `www` to `s.` with a 301, and a Cache Rule for the `?v=`-stamped assets. Delete the project and the two rules to tear down.
- The KV namespace `CONTENT` (id in `wrangler.toml`) — the live content, which wins over `content.seed.json`; export what `/admin` holds before deleting it — and the R2 bucket `morgunov-assets` (`MEDIA`, the uploaded images).
- The Pages environment secrets listed above; the SocialBot ingest token also lives on the bot's side (Railway).
- The Claude Design project «morgunov.tech Design System» — a mirror of `ds/v1`, synced by hand after every DS change.
- Search engines: the Google Search Console domain property for morgunov.tech plus an address property for this site, the Yandex Webmaster site (its verification file sits in the repo root) and the Bing Webmaster import; the owner's TofsDevOps bot watches the site — remove it there.
- An Anthropic API account and key (`ANTHROPIC_API_KEY`) — `/admin` calls `api.anthropic.com` for AI translate / proofread. Revoke the key in the Anthropic Console to tear down.
- A Telegram bot from @BotFather (`TELEGRAM_BOT_TOKEN`), an admin of the channel in `TELEGRAM_CHANNEL` — `/admin` publishes notes through `api.telegram.org`. Remove the bot from the channel's admins and delete it (or revoke its token) in BotFather.
- A SonarQube Cloud project for this repo, fed by the SonarQube Cloud GitHub App (automatic analysis, no config in the repo). Delete the project on sonarcloud.io and remove the repo from the app's access on GitHub.
- The public pages call nothing outside Cloudflare. Only `/admin` does: the Anthropic API and the Telegram Bot API above, plus keyless reads of public `t.me` post pages and Telegram's CDN when importing a channel post.

## Built with

Designed and built by Semyon Morgunov with Claude Code as pair programmer.

## License

[MIT](LICENSE) for the code. Personal content (text, portrait photo, OG cards) is
© 2026 Semyon Morgunov, all rights reserved. The IBM Plex fonts in `fonts/` are
© IBM Corp. under the SIL Open Font License 1.1 — [fonts/OFL.txt](fonts/OFL.txt).
The product images in `images/uses/` are manufacturers' press images: they belong
to their respective manufacturers, are used as illustrations on the /uses page
and are not covered by the MIT licence. All three notes are also in [NOTICE](NOTICE).
