# CLAUDE.md — about-me-page

Personal homepage for Semyon Morgunov, deployed on Cloudflare Pages.

## Stack

- **Pure static HTML/CSS/JS** — no framework, no build step, no npm
- **CSS Custom Properties** for theming (4 themes: light, dark, auto, high-contrast)
- **Vanilla JS** wrapped in an IIFE, ~120 lines
- **Cloudflare Pages** for hosting with `_headers` and `_redirects` config files

## File Structure

```
about-me-page/
├── index.html          # Main page, Russian language (lang="ru")
├── styles.css          # All styles, token-based CSS variables
├── script.js           # Theme, dropdowns, scroll-to-top, changelog toggle
├── llms.txt            # AI/LLM navigation file (llmstxt.org convention)
├── _headers            # Cloudflare: X-Robots-Tag header for root path
├── _redirects          # Cloudflare: 200 rewrites for static assets
├── robots.txt          # Allows all crawlers, references sitemap
├── sitemap.xml         # Single-entry sitemap (https://semyon.morgunov.tech/)
├── yandex_c8faae431964bcca.html  # Yandex Search ownership verification
└── images/
    ├── Hero_Photo.webp            # Main portrait (WebP, eager-loaded — LCP element)
    ├── og-cover.svg               # Open Graph social preview image
    └── portrait-placeholder.svg  # Fallback while image loads
```

## Deploy Process

**GitHub → Cloudflare Pages (automatic)**

1. Push to `main` branch on GitHub (`morgunovtech/about-me-page`)
2. Cloudflare Pages detects the push via GitHub integration and deploys automatically
3. No build command — files are served as-is
4. `_headers` and `_redirects` are processed by Cloudflare automatically

There is no CI/CD pipeline, no GitHub Actions, no build scripts.

## CSS Architecture

- All colors, spacing, radii, and shadows are CSS variables defined per theme on `[data-theme]`
- Spacing scale: `--space-2` (4px) → `--space-8` (28px)
- Border radii: `--radius-lg` (16px), `--radius-md` (12px), `--radius-sm` (8px)
- Max width: `--max-width: 1120px`
- Responsive breakpoints: 640px, 768px, 1024px, 1100px
- Theme is set via `data-theme` attribute on `<body>`, managed by `script.js` and persisted in `localStorage`
- `@media (prefers-reduced-motion)` block is intentionally placed **at the end** of `styles.css` to ensure it overrides all other motion rules

## JavaScript Conventions

- All code is in a single IIFE in `script.js` — no modules, no imports
- `COLLAB_URL` constant is defined at the top of the IIFE — update it if the collab URL changes
- Theme preference stored in `localStorage` under key `theme-preference`
- Dropdowns managed via `.is-open` class; only one can be open at a time
- Dropdowns close on: Escape key, outside click, or clicking a link/button inside
- `prefers-reduced-motion` is respected for scroll behavior

## FOUC Prevention

A tiny inline `<script>` at the top of `<body>` reads `localStorage` and immediately sets `data-theme` on `document.body` **before** the deferred `script.js` loads. This prevents a flash of the default light theme on users who prefer dark/high-contrast.

## Important Rules

- **No build tools.** Do not add npm, webpack, Vite, or any bundler. Keep it zero-dependency.
- **No frameworks.** Do not introduce React, Vue, Alpine, or any JS framework.
- **Accessibility first.** Every interactive element must have proper ARIA attributes. Maintain `focus-visible` styles. Respect `prefers-reduced-motion`.
- **Theme compatibility.** Any new UI element must work correctly in all 4 themes (light, dark, auto, high-contrast). Use CSS variables — never hardcode colors.
- **External links** must always have `rel="noopener noreferrer"` and `target="_blank"`.
- **Hero image** uses `loading="eager" fetchpriority="high"` — it is the LCP element and must not be lazy-loaded. All other images should use `loading="lazy"`.
- **Privacy.** No cookies, no trackers, no analytics scripts. The footer explicitly states this — don't break that contract.
- **Russian primary.** Content is in Russian. An English version is planned but not yet built — do not add untranslated English content sections.
- **Semantic HTML.** Use `<article>`, `<section>`, `<nav>`, `<main>`, `<footer>` appropriately. Maintain heading hierarchy.
- **`_redirects` entries** are 200 rewrites (passthrough), not actual redirects. Don't confuse them with 301/302. Add new static files here.
- **Inline `<style>` blocks in HTML are forbidden** — all CSS lives in `styles.css`.

## SEO / Meta

- **Canonical URL:** `https://semyon.morgunov.tech/` — use this domain consistently in all meta tags, JSON-LD, and sitemap
- OG images and JSON-LD images must use **absolute URLs** (e.g. `https://semyon.morgunov.tech/images/...`)
- JSON-LD Person schema in `<head>` — keep `description`, `knowsAbout`, `worksFor`, and `sameAs` in sync with actual content
- `sitemap.xml` `lastmod` should be updated when content changes significantly
- Yandex verification: `yandex_c8faae431964bcca.html` — do not delete

## AI / Agentic Optimization

- `llms.txt` at the repo root follows the [llmstxt.org](https://llmstxt.org) convention — a structured plain-text summary for LLMs and AI agents
- Available at `https://semyon.morgunov.tech/llms.txt`
- Keep it in sync with major content changes (roles, products, contact info)
- `robots.txt` explicitly allows all crawlers (`User-agent: * / Allow: /`), including AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.)
- JSON-LD `description` and `knowsAbout` fields help AI search engines (Perplexity, ChatGPT) attribute content correctly

## Changelog (update footer in index.html when shipping)

- v0.4 — Motion preference and link hygiene tweaks
- v0.3 — Layout and accessibility improvements
- v0.2 — Added theme controls and calm CTA styling
- v0.1 — Initial launch of the personal site
