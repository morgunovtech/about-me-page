// Builds the HTMLRewriter that overlays content from the doc onto the static
// template. Hook vocabulary (invisible data-* attributes in the template):
//   data-cms-text="path"     → replace inner text (escaped)
//   data-cms-md="path"       → replace inner HTML with rendered block markdown
//   data-cms-href="path"     → set the href attribute
//   data-cms-content="path"  → set the content attribute (meta/og/twitter tags)
//   data-cms-list="slot"     → replace inner HTML via the named renderer

import { renderers, LIST_PATHS } from './render.js';
import { pick, resolvePath } from './i18n.js';
import { renderProse, safeHref } from './markdown.js';
import { renderJsonLd } from './jsonld.js';
import { ORIGIN, BUILD } from './site.js';
const absolutize = (p) => (!p ? p : /^https?:\/\//i.test(p) ? p : ORIGIN + p);

// A handler that throws mid-stream aborts the response AFTER the 200 status
// and part of the body have been sent — the visitor gets truncated HTML.
// Guard every handler: on error the element keeps its template content,
// which is always a valid fallback (the committed HTML is the seed's twin).
const guard = (fn) => ({
  element(el) {
    try {
      fn(el);
    } catch (e) {
      /* keep template content for this element */
    }
  },
});

export function overlay(response, doc, lang, edit = false, jsonld = renderJsonLd) {
  return new HTMLRewriter()
    .on('[data-cms-text]', guard((el) => {
      const val = pick(resolvePath(doc, el.getAttribute('data-cms-text')), lang);
      if (val != null) el.setInnerContent(String(val), { html: false });
    }))
    .on('[data-cms-md]', guard((el) => {
      const md = pick(resolvePath(doc, el.getAttribute('data-cms-md')), lang);
      if (md != null) el.setInnerContent(renderProse(md), { html: true });
    }))
    // Raw stored HTML fragment (verbatim) — for rich prose edited as one block.
    // `{build}` inside prose resolves to the deployed short SHA, so the text
    // never carries a hash that a redeploy would leave stale.
    .on('[data-cms-html]', guard((el) => {
      const html = pick(resolvePath(doc, el.getAttribute('data-cms-html')), lang);
      if (html != null) el.setInnerContent(String(html).replace(/\{build\}/g, BUILD), { html: true });
    }))
    .on('[data-cms-href]', guard((el) => {
      const val = pick(resolvePath(doc, el.getAttribute('data-cms-href')), lang);
      if (val != null) el.setAttribute('href', safeHref(String(val)));
    }))
    .on('[data-cms-content]', guard((el) => {
      const val = pick(resolvePath(doc, el.getAttribute('data-cms-content')), lang);
      if (val != null) el.setAttribute('content', String(val));
    }))
    .on('[data-cms-list]', guard((el) => {
      const slot = el.getAttribute('data-cms-list');
      const fn = renderers[slot];
      if (fn) el.setInnerContent(fn(doc, lang, edit), { html: true });
      // Mark the container so the editor knows where "+ add" appends.
      if (edit && LIST_PATHS[slot]) el.setAttribute('data-edit-list', LIST_PATHS[slot]);
    }))
    // Remove the element entirely when the doc flag at the path is truthy
    // (e.g. a hidden about section + its nav links).
    .on('[data-cms-omit]', guard((el) => {
      if (resolvePath(doc, el.getAttribute('data-cms-omit'))) el.remove();
    }))
    .on('[data-cms-jsonld]', guard((el) => {
      el.setInnerContent(jsonld(doc, lang), { html: true });
    }))
    .on('[data-cms-alt]', guard((el) => {
      const val = pick(resolvePath(doc, el.getAttribute('data-cms-alt')), lang);
      if (val != null) el.setAttribute('alt', String(val));
    }))
    // Absolute-URL attribute (og/twitter image must be absolute).
    .on('[data-cms-abs]', guard((el) => {
      const v = pick(resolvePath(doc, el.getAttribute('data-cms-abs')), lang);
      if (v) el.setAttribute('content', absolutize(String(v)));
    }))
    // Swap an <img> to a single uploaded source; empty value keeps the template default.
    .on('[data-cms-img]', guard((el) => {
      const v = pick(resolvePath(doc, el.getAttribute('data-cms-img')), lang);
      if (v) {
        el.setAttribute('src', String(v));
        el.removeAttribute('srcset');
      }
    }))
    // Keep the LCP preload aligned with a swapped image.
    .on('[data-cms-preload]', guard((el) => {
      const v = pick(resolvePath(doc, el.getAttribute('data-cms-preload')), lang);
      if (v) {
        el.setAttribute('href', String(v));
        el.removeAttribute('imagesrcset');
        el.removeAttribute('imagesizes');
      }
    }))
    .transform(response);
}
