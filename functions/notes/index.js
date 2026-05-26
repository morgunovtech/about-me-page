import { renderNotesIndex } from '../_lib/render-notes.js';

export async function onRequestGet({ env }) {
  return renderNotesIndex(env, 'ru');
}
