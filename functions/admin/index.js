// Editor shell. The data APIs (/admin/api/*) are session-gated; this page and
// the referenced /admin-app.* assets carry no secrets.
const SHELL = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Редактор — morgunov.tech</title>
<link rel="stylesheet" href="/admin-app.css?v=4" />
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
      <span id="status" class="ed-status">—</span>
      <button id="btn-translate-en" type="button">Перевести EN</button>
      <button id="btn-export" type="button">Экспорт</button>
      <label class="ed-import">Импорт<input id="file-import" type="file" accept="application/json,.json" hidden /></label>
      <button id="btn-save" class="primary" type="button">Сохранить</button>
      <a href="/admin/logout">Выйти</a>
    </div>
  </header>
  <main class="ed-main">
    <section class="ed-form-pane"><div id="form"></div></section>
    <section class="ed-preview-pane">
      <div class="ed-preview-bar">
        <div class="ed-seg" id="mode-seg" role="group" aria-label="Режим превью">
          <button type="button" data-mode="page" class="on">Страница</button>
          <button type="button" data-mode="card">Карточка</button>
        </div>
        <div class="ed-seg" id="lang-seg" role="group" aria-label="Язык превью">
          <button type="button" data-lang="ru" class="on">RU</button>
          <button type="button" data-lang="en">EN</button>
        </div>
        <div class="ed-seg" id="theme-seg" role="group" aria-label="Тема превью">
          <button type="button" data-theme="light" class="on">☀</button>
          <button type="button" data-theme="dark">☾</button>
        </div>
        <span id="en-empty" class="ed-badge" hidden></span>
      </div>
      <iframe id="preview" title="Живой превью"></iframe>
      <div id="share-card" class="ed-card" hidden></div>
    </section>
  </main>
  <script src="/admin-app.js?v=4"></script>
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
