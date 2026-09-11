import { renderArticlePage, notFound } from '../../_lib/render-article.js';
import { getOrHead } from '../../_lib/http.js';
import { cached } from '../../_lib/cache.js';

export const onRequest = getOrHead((ctx) => cached(ctx, async () => {
  const { params, env, request } = ctx;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const res = await renderArticlePage(env, slug, 'en', request);
  return res || notFound(env, request);
}));
