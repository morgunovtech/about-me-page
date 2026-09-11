import { renderNotesIndex } from '../../_lib/render-notes.js';
import { getOrHead } from '../../_lib/http.js';
import { cached } from '../../_lib/cache.js';

export const onRequest = getOrHead((ctx) => cached(ctx, () => renderNotesIndex(ctx.env, 'en')));
