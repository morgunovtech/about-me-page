// Allowlist sanitizer for article body HTML. Runs on import (untrusted t.me
// scrape) and on save (admin-edited contenteditable output). Uses HTMLRewriter
// — server-only, no dependencies. Anything not in ALLOWED is unwrapped (text
// kept); a few container/script tags are dropped wholesale (content discarded).
import { safeHref } from './markdown.js';

// tag → list of attributes that survive.
const ALLOWED = {
  p: [], br: [], h2: [], h3: [], blockquote: [],
  ul: [], ol: [], li: [],
  b: [], strong: [], i: [], em: [], u: [], s: [], code: [], pre: [], hr: [],
  a: ['href'], img: ['src', 'alt'], figure: [], figcaption: [],
};
// Tags whose content is unsafe/useless — drop element AND children.
const DROP = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math',
  'noscript', 'template', 'link', 'meta', 'base', 'head', 'form',
  'input', 'button', 'select', 'textarea', 'audio', 'video', 'canvas',
]);

export function sanitizeHtml(html) {
  if (html == null) return Promise.resolve('');
  const rw = new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) return el.remove();
      const allowedAttrs = ALLOWED[tag];
      if (!allowedAttrs) return el.removeAndKeepContent(); // unwrap div/span/font/…
      for (const [name] of [...el.attributes]) {
        if (!allowedAttrs.includes(name)) el.removeAttribute(name);
      }
      if (tag === 'a') {
        const href = safeHref(el.getAttribute('href'));
        if (!href || href === '#') el.removeAttribute('href');
        else {
          el.setAttribute('href', href);
          if (/^https?:/i.test(href)) {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        }
      } else if (tag === 'img') {
        const src = safeHref(el.getAttribute('src'));
        if (!src || src === '#') return el.remove();
        el.setAttribute('src', src);
        el.setAttribute('loading', 'lazy');
      }
    },
  });
  return rw.transform(new Response(html)).text();
}
