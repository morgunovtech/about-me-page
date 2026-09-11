import {
  verifyPassword,
  createSession,
  sessionCookie,
  loginRateLimit,
  clearRateLimit,
  clientIp,
  getCookie,
  SESSION_COOKIE,
  verifySession,
  clearCookie,
} from '../_lib/auth.js';

function loginPage(error) {
  const err = error
    ? `<p class="err" role="alert">${error}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Вход — morgunov.tech</title>
<style>
  :root{--bg:#edeae5;--paper:#f5f2ed;--fg:#14110d;--muted:#5a554c;--line:#c9c5bd;--orange:#d9531e}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,-apple-system,"Segoe UI",sans-serif;font-size:14px;letter-spacing:-0.005em}
  .card{background:var(--paper);border:1px solid var(--line);padding:32px;width:100%;max-width:360px;margin:20px}
  h1{font-size:20px;font-weight:600;margin:0 0 4px}
  p.sub{color:var(--muted);margin:0 0 24px;font-size:13px}
  label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px}
  input{width:100%;padding:11px 12px;font:inherit;border:1px solid var(--line);background:#fff;color:var(--fg)}
  input:focus{outline:2px solid var(--orange);outline-offset:-1px;border-color:var(--orange)}
  button{width:100%;margin-top:16px;padding:12px;font:inherit;font-weight:500;text-transform:uppercase;letter-spacing:.08em;font-size:12px;border:1px solid var(--orange);background:var(--orange);color:#14110d;cursor:pointer}
  button:hover{filter:brightness(1.05)}
  .err{color:#b03e10;font-size:13px;margin:0 0 16px}
</style>
</head>
<body>
  <form class="card" method="post" action="/admin/login">
    <h1>morgunov.tech</h1>
    <p class="sub">Вход в редактор</p>
    ${err}
    <label for="pw">Пароль</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required />
    <button type="submit">Войти</button>
  </form>
</body>
</html>`;
}

const htmlHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  // The page is self-contained (one inline <style>, no scripts) — it can
  // afford the strictest CSP on the site. The rest of the security set is
  // back-filled by the root middleware; CSP is per-route in /admin.
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, SESSION_COOKIE);
  // Same check as the gate (incl. the logout not-before), otherwise a revoked
  // cookie would bounce /admin ⇄ /admin/login forever. A dead cookie is cleared
  // here so the browser stops sending it.
  if (token && (await verifySession(env.SESSION_SECRET, token, env))) {
    return Response.redirect(new URL(request.url).origin + '/admin', 302);
  }
  return new Response(loginPage(null), {
    headers: token ? { ...htmlHeaders, 'Set-Cookie': clearCookie() } : htmlHeaders,
  });
}

export async function onRequestPost({ request, env }) {
  const ip = clientIp(request);
  if (!(await loginRateLimit(env, ip))) {
    return new Response(loginPage('Слишком много попыток. Подождите 10 минут.'), {
      status: 429,
      headers: htmlHeaders,
    });
  }

  const form = await request.formData();
  const password = String(form.get('password') || '');
  const ok = env.ADMIN_PASSWORD_HASH && (await verifyPassword(password, env.ADMIN_PASSWORD_HASH));

  if (!ok) {
    // The KV rate-limit counter is read-then-write and eventually consistent
    // across PoPs, so parallel attempts can slip past it. A flat server-side
    // delay caps the practical guess rate regardless of counter races.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return new Response(loginPage('Неверный пароль.'), { status: 401, headers: htmlHeaders });
  }

  await clearRateLimit(env, ip);
  const token = await createSession(env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(request.url).origin + '/admin', 'Set-Cookie': sessionCookie(token) },
  });
}
