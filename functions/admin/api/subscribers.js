import { json } from '../../_lib/http.js';
import { loadSubscribers } from '../../_lib/content.js';

// Read-only: lets the editor show the last SocialBot sync. Session-gated.
export async function onRequestGet({ env }) {
  return json({ subscribers: await loadSubscribers(env) });
}
