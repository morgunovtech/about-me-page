// Public, read-only delivery of R2 objects. No listing — only direct key GETs.
export async function onRequestGet({ params, env }) {
  const key = Array.isArray(params.path) ? params.path.join('/') : params.path;
  if (!key) return new Response('Not Found', { status: 404 });

  const obj = await env.MEDIA.get(key);
  if (!obj || !obj.body) return new Response('Not Found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (obj.httpEtag) headers.set('etag', obj.httpEtag);
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  // Defang user-uploaded assets: don't let a content-type be sniffed, and run
  // them in a locked-down context so e.g. an uploaded SVG can't execute inline
  // scripts on this origin when opened directly.
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return new Response(obj.body, { headers });
}
