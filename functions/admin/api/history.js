import { json } from '../../_lib/http.js';

// Read-only version history (session-gated by /admin middleware). Without ?rev
// it returns the revisions index [{rev, updatedAt}, …]; with ?rev=N it returns
// that revision's full doc so the editor can load it for review.
const SITE = 's.morgunov.tech';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const page = u.searchParams.get('page') || 'home';
  const rev = u.searchParams.get('rev');
  if (!env || !env.CONTENT) return json({ revisions: [] });

  if (rev) {
    const doc = await env.CONTENT.get(`${SITE}:${page}:rev:${rev}`, 'json');
    if (!doc) return json({ error: 'revision not found' }, 404);
    return json({ doc });
  }
  const revisions = (await env.CONTENT.get(`${SITE}:${page}:revs`, 'json')) || [];
  return json({ revisions });
}
