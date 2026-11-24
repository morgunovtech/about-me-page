# morgunov.tech design system — v1 — integration guide

A zero-build, framework-agnostic CSS layer. Any morgunov.tech service (static
HTML, Worker-served HTML, or a framework app) can adopt the shared look by
linking these files — no npm, no package install.

## What's in the layer

| File | What it gives you | Reusable? |
|------|-------------------|-----------|
| `tokens.css` | colour + type tokens (`--v4-*`) for 4 themes | **the brand source of truth** |
| `fonts.css` | `@font-face` for IBM Plex Sans + Mono | yes |
| `base.css` | reset, body/type defaults, `.sr-only`, `.skip-link` | yes |
| `components.css` | top bar, language switch, theme switcher, buttons (`.v4-btn`), section heads, lists, prose, footer, focus ring, `.v4-root` shell | yes |

**Not** in the layer (page-specific to s.morgunov.tech, do not expect them):
hero, stats strip, career/ventures tables, product/use cards, /collaborate
pricing, contact block. Build your own page layout on top of the tokens.

## Canonical origin

Served today from **`https://s.morgunov.tech/ds/v1/`** (CORS `*` is enabled on
`/ds/*` and `/fonts/*`, so cross-origin CSS **and** webfonts load fine).

> `s.morgunov.tech` is the only host that serves the layer: the apex
> `morgunov.tech` and `www` answer with a 301 to it (a Cloudflare Redirect
> Rule), so never point stylesheets at them. If the layer ever moves — to a
> dedicated `ds.morgunov.tech`, say — only the host below changes; the paths
> stay identical.

Cross-origin fonts work without absolute URLs: `@font-face` resolves its
`url("/fonts/…")` against the **stylesheet's** origin (s.morgunov.tech), not the
consuming page — and the woff2 responses now send `Access-Control-Allow-Origin`.

## Drop-in `<head>` snippet

Paste into any service's `<head>`. Load order matters:
**fonts → tokens → base → components → (your page CSS)**.

```html
<!-- morgunov.tech design system v1 — non-blocking preload-swap -->
<link rel="preload" href="https://s.morgunov.tech/ds/v1/fonts.css?v=64eea157" as="style" onload="this.onload=null;this.rel='stylesheet'" />
<link rel="preload" href="https://s.morgunov.tech/ds/v1/tokens.css?v=fa7fc139" as="style" onload="this.onload=null;this.rel='stylesheet'" />
<link rel="preload" href="https://s.morgunov.tech/ds/v1/base.css?v=0e404315" as="style" onload="this.onload=null;this.rel='stylesheet'" />
<link rel="preload" href="https://s.morgunov.tech/ds/v1/components.css?v=f7d07a70" as="style" onload="this.onload=null;this.rel='stylesheet'" />
<noscript>
  <link rel="stylesheet" href="https://s.morgunov.tech/ds/v1/fonts.css?v=64eea157" />
  <link rel="stylesheet" href="https://s.morgunov.tech/ds/v1/tokens.css?v=fa7fc139" />
  <link rel="stylesheet" href="https://s.morgunov.tech/ds/v1/base.css?v=0e404315" />
  <link rel="stylesheet" href="https://s.morgunov.tech/ds/v1/components.css?v=f7d07a70" />
</noscript>
```

The `?v=` values are content hashes; keep them current (the source repo bumps
them automatically via `scripts/version-stamp.py`). The `/ds/v1/` path is the
major version — breaking changes ship as `/ds/v2/`.

## Theme mechanism (required)

Tokens switch on a `data-theme` attribute on `<html>` (`dark` / `high-contrast`;
absence = light). Set it **before first paint** to avoid a flash. Inline this in
`<head>` (before the stylesheet links):

```html
<script>
  (function(){var d=document.documentElement;var p='auto';try{p=localStorage.getItem('theme-preference')||'auto'}catch(e){}var t=p==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;d.setAttribute('data-theme',t);d.setAttribute('data-theme-preference',p);})();
</script>
```

The `try/catch` matters: `localStorage` itself throws when storage is blocked
(Chrome «block all cookies», some webviews) and an unguarded read would leave
the page without a theme.

## Top bar (optional chrome)

`components.css` ships the header primitives the main site uses: a `.v4-bar`
with a `.v4-nav.v4-dropdown` (links inline on desktop, a «Menu» dropdown
≤640px) and two more dropdowns on the right — language (`.v4-lang`) and theme
(`.v4-theme`). Every dropdown is the same shape: a toggle button with
`aria-controls` + a `.v4-menu` panel of `.v4-menu-item`s. The site's
`script.js` drives them (one open at a time, Escape/outside click/focus-out,
arrow keys) and stamps `data-js` on `<html>`; without it a `:focus-within`
fallback still opens the panels, so nothing depends on JavaScript. Copy the
header markup from any page of the site, or skip it and keep just the tokens.

Then apply the page class on `<body>`:

```html
<body class="v4-page">
```

## Self-contained consumers (inline tokens)

A product that other people self-host — the TofsDevOps status page — must not
depend on this site for its colours and layout: copy the `:root` and theme
blocks of `tokens.css` into the page's own `<style>` (they are small), write the
page CSS against `--v4-*`, and take only the fonts from here, with absolute
URLs (`src: url("https://s.morgunov.tech/fonts/plex-sans-latin-400.woff2")`,
`/fonts/*` answers with `Access-Control-Allow-Origin: *`). With
`font-display: swap` the system stack of `--v4-sans` stands in until the files
arrive, or for good when the origin is unreachable. A copy drifts: diff it
against `tokens.css` when this file's `?v=` changes.

A PDF rendered from HTML (WeasyPrint and the like) is a consumer too: use the
`@media print` palette of `tokens.css` as its light theme and the same
`@font-face` rules with absolute URLs — the renderer fetches the woff2 files
itself.

## Status colours (not in the layer yet)

`tokens.css` has no semantic palette: no «ok / warning / down». Until it does,
the consumers that need one (Fingerprint, the TofsDevOps status page) share
these page-local values, checked for AA on `--v4-bg` and `--v4-paper` of each
theme — the candidate for `--v4-ok`, `--v4-warn`, `--v4-bad` if they ever move
into the layer:

| Theme | ok | warn | bad |
|-------|----|------|-----|
| light | `#27703f` | `#8a5a00` | `#b3261e` |
| dark | `#6cc08a` | `#e2a93b` | `#ff7a6e` |
| high-contrast | `#7dffb0` | `#ffe08a` | `#ff8a80` |

Colour the text, the line or a square mark — never a filled block (the only
filled surface in the system is the primary button).

## Consumer Content-Security-Policy

If your service sends a CSP, allow the DS origin for styles and fonts:

```
style-src 'self' 'unsafe-inline' https://s.morgunov.tech;
font-src  'self' https://s.morgunov.tech;
```

(`'unsafe-inline'` only if you inline the theme script above; otherwise move it
to a file and drop it.)

## Minimal example

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script>/* theme-init script from above */</script>
  <!-- DS snippet from above -->
</head>
<body class="v4-page">
  <div class="v4-root">
    <a class="v4-btn v4-btn-primary" href="#">Primary action</a>
  </div>
</body>
</html>
```

## Reduced motion

`components.css` ships its own `@media (prefers-reduced-motion: reduce)` block
(scroll-behavior reset + global animation/transition zeroing), so the DS layer
honours the preference even when a consumer loads no page stylesheet. A page
stylesheet may repeat the same block at its very end for cascade safety —
about-me-page's `styles.css` does.
