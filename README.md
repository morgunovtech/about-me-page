# morgunov.tech

Personal homepage for Semyon Morgunov — Head of FinTech @ Yandex Uzbekistan.

Live at **[s.morgunov.tech](https://s.morgunov.tech)** · also reachable on the apex `morgunov.tech`.

## Stack

Pure static HTML/CSS/JS. **No build step, no npm, no framework.** Hosted on Cloudflare Pages.

- 9 HTML pages — home, collaborate, about, uses (RU + EN twins) and `404.html`; plus the `/notes` shells rendered by Pages Functions
- A versioned design-system layer `ds/v1/` (fonts, tokens for 4 themes, base, components) + `styles.css` for page layout
- One script — `script.js` (single IIFE, no dependencies, ≈ 370 lines)
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

See [CLAUDE.md](CLAUDE.md) — single source of truth on stack rules, theming model, performance
conventions, SEO/AI optimization, and the full project changelog.

## Tools

```sh
scripts/check.sh                           # everything below + node --check/--test + a Functions build
python3 scripts/check-sync.py              # RU↔EN structural parity
python3 scripts/check-critical.py          # inline critical CSS ↔ ds/v1 + styles.css
node scripts/render-static.mjs --check     # templates are the seed's twins (--write regenerates)
python3 scripts/version-stamp.py           # build SHA + content-hash ?v= cache busters
```

Run `check.sh` before any commit — it catches an extra section in RU that's missing in EN,
a stale inline critical rule, or a template that no longer matches the renderer.

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
```

Seeding KV is optional — when a key is missing, the render falls back to `content.seed.json`.

### Local dev

```sh
npx wrangler pages dev   # serves the site + Functions, simulates KV/R2
```

Add a gitignored `.dev.vars` with `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and optionally `AI_DEV_MOCK=1` (stubs AI without a key) + `SOCIALBOT_INGEST_TOKEN`.

### SocialBot (live subscriber numbers)

The site exposes `POST /api/ingest/subscribers` (header `Authorization: Bearer <SOCIALBOT_INGEST_TOKEN>`, body `{telegram, youtube, linkedin, updatedAt}`) → KV `stats:subscribers`. The bot (separate Railway repo) pushes on its own schedule; set the same token as a Railway env var. The site only reads; the bot only writes. No cron on the site.

## License

[MIT](LICENSE) for the code. Personal content (text, portrait photo, OG cards) is
© 2026 Semyon Morgunov, all rights reserved. The IBM Plex fonts in `fonts/` are
© IBM Corp. under the SIL Open Font License 1.1 — [fonts/OFL.txt](fonts/OFL.txt).
