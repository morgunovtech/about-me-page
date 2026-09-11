import { renderNotesIndex } from '../../_lib/render-notes.js';
import { getOrHead } from '../../_lib/http.js';

export const onRequest = getOrHead(({ env }) => renderNotesIndex(env, 'en'));
