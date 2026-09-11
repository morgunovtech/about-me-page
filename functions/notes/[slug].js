import { renderArticlePage, notFound } from '../_lib/render-article.js';
import { getOrHead } from '../_lib/http.js';

export const onRequest = getOrHead(async ({ params, env, request }) => {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const res = await renderArticlePage(env, slug, 'ru', request);
  return res || notFound(env, request);
});
