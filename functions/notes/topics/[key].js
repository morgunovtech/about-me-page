// /notes/topics/<key>: the publications of one topic (notes doc `topics`).
// An unknown topic, or one with nothing in this language, is a real 404.
import { renderNotesIndex } from '../../_lib/render-notes.js';
import { notFound } from '../../_lib/render-article.js';
import { getOrHead } from '../../_lib/http.js';
import { cached } from '../../_lib/cache.js';

export const onRequest = getOrHead((ctx) => cached(ctx, async () => {
  const { params, env, request } = ctx;
  const key = Array.isArray(params.key) ? params.key[0] : params.key;
  const res = await renderNotesIndex(env, 'ru', String(key || ''));
  return res || notFound(env, request);
}));
