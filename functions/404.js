// /404 is the clean URL Pages gives the static template — and it answers 200
// (a soft 404). Serve the same template with a real 404 status instead.
import { notFound } from './_lib/render-article.js';

export async function onRequest({ env, request }) {
  return notFound(env, request);
}
