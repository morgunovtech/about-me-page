import { renderSitemap } from './_lib/render-notes.js';

export async function onRequestGet({ env }) {
  return renderSitemap(env);
}
