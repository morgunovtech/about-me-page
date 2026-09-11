// SourcePost — the portable input every distribution target consumes. It carries
// no blog/Cloudflare coupling, so this whole `dist/` folder can be lifted into a
// standalone service: a host adapter maps its own storage into this shape.
//
// {
//   lang:    'ru' | 'en',
//   title:   string,
//   html:    string,   // sanitized body HTML (the source of truth)
//   excerpt: string,    // teaser text (plain)
//   url:     string,    // canonical public URL of the post
//   images:  string[],  // absolute image URLs, cover first
//   date:    string,    // YYYY-MM-DD
// }

export function makeSourcePost(p) {
  return {
    lang: p.lang === 'en' ? 'en' : 'ru',
    title: String(p.title || ''),
    html: String(p.html || ''),
    excerpt: String(p.excerpt || ''),
    url: String(p.url || ''),
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    date: String(p.date || ''),
  };
}
