# morgunov.tech

Personal homepage for Semyon Morgunov — Head of FinTech @ Yandex Uzbekistan.

Live at **[s.morgunov.tech](https://s.morgunov.tech)** · also reachable on the apex `morgunov.tech`.

## Stack

Pure static HTML/CSS/JS. **No build step, no npm, no framework.** Hosted on Cloudflare Pages.

- 5 HTML pages — `index.html`, `en/index.html`, `collaborate.html`, `en/collaborate.html`, `404.html`
- One stylesheet — `styles.css` (CSS-variable tokens, 4 themes: light, dark, auto, high-contrast)
- One script — `script.js` (single IIFE, no dependencies, ≈ 200 lines)
- Self-hosted IBM Plex Sans + Plex Mono (latin + cyrillic woff2 subsets, `font-display: swap`)
- Cloudflare config: [`_headers`](_headers), [`_redirects`](_redirects)

## Privacy

No cookies, no trackers, no analytics on the **public** pages. Verifiable by reading the code — not just by trusting a footer line:

```sh
grep -RIE '(google-analytics|gtag|fbq|matomo|metrika|hotjar|mixpanel|amplitude|segment)' *.html en/*.html
# → no matches
```

The `/admin` editor sets one HMAC session cookie (`HttpOnly; Secure; SameSite=Strict; Path=/admin`) — scoped to that path, so it's never sent on public pages. All AI calls run server-side; the public site makes none.

## Local preview

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

That's the entire dev loop. No `npm install`, no Docker, no Vite.

## Conventions, architecture, deploy

See [CLAUDE.md](CLAUDE.md) — single source of truth on stack rules, theming model, performance
conventions, SEO/AI optimization, and the full project changelog.

## Tools

```sh
python3 scripts/check-sync.py            # verify RU↔EN structural parity
python3 scripts/check-sync.py --verbose  # full mismatch list
```

Run it before any commit that touches layout — catches drift like an extra section in RU
that's missing in EN, renamed classes, etc.

## Admin / CMS

A minimal editor at `/admin` edits page content — text, dates, markdown, images, the share card — without touching code. Edits save to **Cloudflare KV** and go live **without a redeploy**. Built on Pages Functions (`functions/`), KV (content), and R2 (images); vanilla JS, no framework. The public pages are edge-rendered from KV (HTML files become templates with invisible `data-cms-*` hooks); `content.seed.json` is the committed fallback. Currently wired for the home page.

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
© 2026 Semyon Morgunov, all rights reserved.
