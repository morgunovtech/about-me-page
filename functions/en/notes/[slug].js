import { renderArticlePage, notFound } from '../../_lib/render-article.js';

export async function onRequestGet({ params, env, request }) {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const res = await renderArticlePage(env, slug, 'en', request);
  return res || notFound(env, request);
}
