// Builds the HTMLRewriter that overlays content from the doc onto the static
// template. Hook vocabulary (invisible data-* attributes in the template):
//   data-cms-text="path"     → replace inner text (escaped)
//   data-cms-md="path"       → replace inner HTML with rendered block markdown
//   data-cms-href="path"     → set the href attribute
//   data-cms-content="path"  → set the content attribute (meta/og/twitter tags)
//   data-cms-list="slot"     → replace inner HTML via the named renderer

import { renderers, LIST_PATHS } from './render.js';
import { pick, resolvePath } from './i18n.js';
import { renderProse } from './markdown.js';
import { renderJsonLd } from './jsonld.js';

const ORIGIN = 'https://s.morgunov.tech';
const absolutize = (p) => (!p ? p : /^https?:\/\//i.test(p) ? p : ORIGIN + p);

export function overlay(response, doc, lang, edit = false, jsonld = renderJsonLd) {
  return new HTMLRewriter()
    .on('[data-cms-text]', {
      element(el) {
        const val = pick(resolvePath(doc, el.getAttribute('data-cms-text')), lang);
        if (val != null) el.setInnerContent(String(val), { html: false });
      },
    })
    .on('[data-cms-md]', {
      element(el) {
        const md = pick(resolvePath(doc, el.getAttribute('data-cms-md')), lang);
        if (md != null) el.setInnerContent(renderProse(md), { html: true });
      },
    })
    // Raw stored HTML fragment (verbatim) — for rich prose edited as one block.
    .on('[data-cms-html]', {
      element(el) {
        const html = pick(resolvePath(doc, el.getAttribute('data-cms-html')), lang);
        if (html != null) el.setInnerContent(String(html), { html: true });
      },
    })
    .on('[data-cms-href]', {
      element(el) {
        const val = pick(resolvePath(doc, el.getAttribute('data-cms-href')), lang);
        if (val != null) el.setAttribute('href', String(val));
      },
    })
    .on('[data-cms-content]', {
      element(el) {
        const val = pick(resolvePath(doc, el.getAttribute('data-cms-content')), lang);
        if (val != null) el.setAttribute('content', String(val));
      },
    })
    .on('[data-cms-list]', {
      element(el) {
        const slot = el.getAttribute('data-cms-list');
        const fn = renderers[slot];
        if (fn) el.setInnerContent(fn(doc, lang, edit), { html: true });
        // Mark the container so the editor knows where "+ add" appends.
        if (edit && LIST_PATHS[slot]) el.setAttribute('data-edit-list', LIST_PATHS[slot]);
      },
    })
    .on('[data-cms-jsonld]', {
      element(el) {
        el.setInnerContent(jsonld(doc, lang), { html: true });
      },
    })
    .on('[data-cms-alt]', {
      element(el) {
        const val = pick(resolvePath(doc, el.getAttribute('data-cms-alt')), lang);
        if (val != null) el.setAttribute('alt', String(val));
      },
    })
    // Absolute-URL attribute (og/twitter image must be absolute).
    .on('[data-cms-abs]', {
      element(el) {
        const v = pick(resolvePath(doc, el.getAttribute('data-cms-abs')), lang);
        if (v) el.setAttribute('content', absolutize(String(v)));
      },
    })
    // Swap an <img> to a single uploaded source; empty value keeps the template default.
    .on('[data-cms-img]', {
      element(el) {
        const v = pick(resolvePath(doc, el.getAttribute('data-cms-img')), lang);
        if (v) {
          el.setAttribute('src', String(v));
          el.removeAttribute('srcset');
        }
      },
    })
    // Keep the LCP preload aligned with a swapped image.
    .on('[data-cms-preload]', {
      element(el) {
        const v = pick(resolvePath(doc, el.getAttribute('data-cms-preload')), lang);
        if (v) {
          el.setAttribute('href', String(v));
          el.removeAttribute('imagesrcset');
          el.removeAttribute('imagesizes');
        }
      },
    })
    .transform(response);
}
