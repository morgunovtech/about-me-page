# FEATURE: cross-posting (blog → distribution channels)

The blog (`/notes`) is the **source of truth**. Telegram (and later LinkedIn) are
**distribution channels**. Two separate one-way flows, never a 2-way sync:

- **Flow B — blog → Telegram** (built): one-click publish of a *published* article
  to the channel, with an editable per-message preview. After sending we store a
  `distribution.telegram` mark on the post — metadata, not sync.
- **Flow A — Telegram → blog** (Phase 3, pending): batch import of a channel
  archive into the `needs-review` draft queue.

## Architecture & the extraction seam

The portable core lives in **`functions/_lib/dist/`** and imports **nothing** from
the blog (no KV, no content schema, no Cloudflare APIs). It can be lifted into a
standalone Worker/npm package as-is; only the host adapter is rewritten.

```
functions/_lib/dist/
  source-post.js     SourcePost shape — the portable input
  tg-html.js         blog HTML → Telegram HTML (pure stack parser, no HTMLRewriter)
  plan.js            SourcePost → message plan (length + image strategy)
  targets/
    telegram.js      render(post,opts) + publish(plan,cfg)  [config injected]
    linkedin.js      interface stub
    index.js         TARGETS registry

functions/_lib/tg-adapter.js     blog article doc → SourcePost  (the ONLY seam)
functions/admin/api/tg-preview.js   render plan (no send), session-gated
functions/admin/api/tg-publish.js   render + publish + store metadata
```

`SourcePost` = `{ lang, title, html, excerpt, url, images[], date }`.

**Target interface** (so a new channel is one file + a registry entry):
```js
render(post, { strategy }) -> Plan          // pure, drives preview AND publish
publish(plan, { token, channel, fetch, sleep, mock }) -> { ok, refs[], error? }
// Plan.messages[]: {kind:'text',text,linkPreview} | {kind:'photo',photoUrl,caption}
//                  | {kind:'album',items:[{photoUrl,caption?}]}   (all parseMode:'HTML')
```

## Formatting map (blog HTML → Telegram, parse_mode=HTML)

`parse_mode=HTML` chosen over MarkdownV2: only `& < >` need escaping in text (vs
~18 metacharacters everywhere), and it maps 1:1 from the stored body HTML.

| Blog | Telegram | Degradation |
|---|---|---|
| b/strong, i/em, u/ins, s/strike/del, code, pre, a[href] | same tags | — |
| blockquote | `<blockquote>` | — |
| h2/h3 | `<b>line</b>` | heading → bold standalone line |
| ul/li | `• item` | manual bullet markers |
| ol/li | `1. item` | manual numbering |
| hr | `···` | separator line |
| p | text + blank line | — |
| figure/figcaption | image collected; caption → `<i>…</i>` | — |
| img | (collected, never inline) | goes to photo/album per image rules |
| tables / iframes / embeds | — | stripped at the blog sanitizer; never reach the renderer |

Text nodes are already entity-escaped by the blog sanitizer, so they pass through
(Telegram decodes the same `&amp;/&lt;/&gt;`). Length is counted on the *plain*
text (markup doesn't count toward the limit).

## Length strategy (4096 text / 1024 caption; safety margins 4000 / 1000)
- **Short (≤ 4000): one message** (native render).
- **Long (> 4000): teaser + link (default).** Teaser = `excerpt` (fallback: first
  paragraph) + the canonical `/notes/<slug>` URL; the article's `og:image` drives
  the link preview.
- Overrides selectable in the preview: **split** (numbered series on paragraph
  boundaries, `(k/N)`), **truncate** (cut at a sentence/paragraph boundary + link).

## Image rules (no inline images in Telegram)
- **teaser + link:** no photo — rely on the link-preview `og:image`.
- **native, 0 images:** `sendMessage`.
- **native, 1 image, text ≤ 1000:** `sendPhoto` + caption.
- **native, 1 image, text > 1000:** text message (image stays in the blog).
- **native, 2–10 images:** `sendMediaGroup`, caption on the first item (if it
  fits, else a separate follow-up text message).
- **> 10 images:** first 10, the rest flagged in the preview warnings.
Images already live in R2 (`/assets/*`); absolute HTTPS URLs are passed to
Telegram (no re-upload). The adapter absolutizes site-relative `src`/`href`.

## Publish: safety & limits
- Token only in the `TELEGRAM_BOT_TOKEN` env binding; channel in `TELEGRAM_CHANNEL`
  (`@handle`). All Bot API calls are server-side. **Never** in the client bundle.
- `/tg-publish` is session-gated + same-origin, **gated to `status==='published'`**,
  and the UI requires an explicit confirm.
- The server re-renders the authoritative plan and applies only the admin's
  **text/caption** edits — image URLs stay server-controlled.
- 429 handling: honors `parameters.retry_after` (capped retries) + a gentle delay
  between messages.
- `TG_DEV_MOCK=1` stubs all sends (returns fake refs) for local dev without a token.
- Imported Telegram content is **sanitized** before storage/render (XSS boundary).

## How to add a new target (e.g. LinkedIn)
1. Implement `functions/_lib/dist/targets/<name>.js` with `render(post,opts)` and
   `publish(plan,cfg)` (its own plan rules — LinkedIn: plain text, line breaks,
   emoji, hashtags, hook in line 1).
2. Register it in `targets/index.js` `TARGETS`.
3. Add an endpoint pair (preview/publish) mirroring `tg-*.js`, plus a button in
   the editor drawer. The transform core and adapter are reused unchanged.

## Schema additions (back-compatible; old docs unaffected)
- `status`: adds `'needs-review'` (non-public, for Flow A import). Public render
  still shows only `published`.
- `distribution.telegram = { chatId, messageId, url, count, postedAt, mock }` — set
  after a successful send; never changes blog status.
- `source = { kind:'native'|'imported', tg:{ channel, messageId } }` — Flow A
  dedups by `tg.messageId` (planned).
