// Editor shell. The data APIs (/admin/api/*) are session-gated; this page and
// the referenced /admin-app.* assets carry no secrets. The page itself is the
// editor: the live preview fills the stage and content is edited inline.
const SHELL = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Редактор — morgunov.tech</title>
<link rel="stylesheet" href="/admin-app.css?v=30" />
</head>
<body>
  <header class="ed-bar">
    <div class="ed-bar-l">
      <strong>morgunov.tech</strong>
      <span class="sub">редактор</span>
      <select id="page-select" aria-label="Страница">
        <option value="home">home</option>
        <option value="collaborate">collaborate</option>
        <option value="about">about</option>
        <option value="uses">uses</option>
      </select>
      <span id="sync-note" class="ed-sync"></span>
    </div>
    <div class="ed-bar-r">
      <span id="en-empty" class="ed-badge" hidden></span>
      <span id="status" class="ed-status">—</span>
      <button id="btn-undo" type="button" title="Отменить (⌘Z)" disabled>↶</button>
      <button id="btn-redo" type="button" title="Вернуть (⌘⇧Z)" disabled>↷</button>
      <button id="btn-revert" type="button" title="Вернуться к последнему сохранению" disabled>Откатить</button>
      <button id="btn-settings" type="button">Настройки</button>
      <button id="btn-save" class="primary" type="button">Сохранить</button>
      <a href="/admin/logout">Выйти</a>
    </div>
  </header>
  <main class="ed-stage">
    <iframe id="preview" title="Страница — редактирование на месте"></iframe>
    <div id="ed-loading" class="ed-loading">Загрузка…</div>
  </main>
  <div class="ed-scrim" id="scrim" hidden></div>
  <aside class="ed-drawer" id="drawer" hidden aria-hidden="true" aria-label="Настройки страницы">
    <div class="ed-drawer-head">
      <strong>Настройки страницы</strong>
      <button id="drawer-close" type="button" aria-label="Закрыть">✕</button>
    </div>
    <div class="ed-drawer-body" id="settings"></div>
  </aside>
  <script src="/admin-app.js?v=30"></script>
</body>
</html>`;

export async function onRequestGet() {
  return new Response(SHELL, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
