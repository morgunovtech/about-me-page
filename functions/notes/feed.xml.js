import { renderFeed } from '../_lib/render-notes.js';

export async function onRequestGet({ env }) {
  return renderFeed(env);
}
