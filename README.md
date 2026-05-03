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

No cookies. No trackers. No analytics scripts. Verifiable by reading the code — not just by trusting a footer line:

```sh
grep -RIE '(google-analytics|gtag|fbq|matomo|metrika|hotjar|mixpanel|amplitude|segment)' *.html en/*.html
# → no matches
```

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

## License

[MIT](LICENSE) for the code. Personal content (text, portrait photo, OG cards) is
© 2026 Semyon Morgunov, all rights reserved.
