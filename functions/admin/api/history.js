import { json } from '../../_lib/http.js';
import { PAGES } from '../../_lib/content.js';

// Read-only version history (session-gated by /admin middleware). Without ?rev
// it returns the revisions index [{rev, updatedAt}, …]; with ?rev=N it returns
// that revision's full doc so the editor can load it for review.
const SITE = 's.morgunov.tech';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const page = u.searchParams.get('page') || 'home';
  const rev = u.searchParams.get('rev');
  if (!PAGES.has(page)) return json({ error: 'unknown page' }, 404);
  if (!env || !env.CONTENT) return json({ revisions: [] });

  if (rev) {
    if (!/^\d+$/.test(rev)) return json({ error: 'bad rev' }, 400);
    const doc = await env.CONTENT.get(`${SITE}:${page}:rev:${rev}`, 'json');
    if (!doc) return json({ error: 'revision not found' }, 404);
    return json({ doc });
  }
  const revisions = (await env.CONTENT.get(`${SITE}:${page}:revs`, 'json')) || [];
  return json({ revisions });
}
