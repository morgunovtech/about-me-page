import { renderFeed } from '../_lib/render-notes.js';
import { getOrHead } from '../_lib/http.js';

export const onRequest = getOrHead(({ env }) => renderFeed(env, 'ru'));
