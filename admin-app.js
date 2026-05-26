// Editor client. The live preview (server-rendered with edit anchors) fills the
// stage; content is edited inline — click a text leaf and type. The in-memory
// doc is the single source of truth: text edits write straight back to it (no
// re-render, so the cursor survives), and the doc is saved to KV. Vanilla, no deps.
(() => {
  'use strict';
  const API = '/admin/api';
  const LANGS = ['ru', 'en'];
  const IMAGE_KEYS = new Set(['image', 'portrait']);

  let doc = null;
  let page = 'home';
  let lang = 'ru';
  let theme = 'light';
  let dirty = false;
  let frame = null;
  let fdoc = null;
  const enStale = new Set();  // localized objs whose RU changed → re-translate EN on save
  const enManual = new Set(); // localized objs whose EN was hand-edited → protected (sticky)
  const THEMES = ['light', 'dark', 'auto', 'high-contrast'];
  // Undo/redo + revert: full-doc snapshots (the doc is small; coarse but robust).
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let savedSnapshot = null; // last-saved (or last-loaded) doc, for «Откатить»
  let history = [];         // committed states; hIdx points at the current one
  let hIdx = -1;
  let histTimer = null;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };
  const isLoc = (v) =>
    v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).length && Object.keys(v).every((k) => k === 'ru' || k === 'en');

  // --- doc path access (mirrors functions/_lib/i18n.js, client-side) ---
  const resolve = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
  function parentOf(path) {
    const parts = path.split('.');
    const key = parts.pop();
    const parent = parts.reduce((o, k) => (o == null ? undefined : o[k]), doc);
    return [parent, key];
  }
  function setLeaf(path, text) {
    const [parent, key] = parentOf(path);
    if (parent == null) return;
    if (isLoc(parent[key])) parent[key][lang] = text;
    else parent[key] = text;
  }

  // --- status / dirty ---
  function setStatus(text, kind) {
    const s = $('#status');
    s.textContent = text;
    s.className = 'ed-status' + (kind ? ' is-' + kind : '');
  }
  function markDirty() {
    dirty = true;
    setStatus('Есть несохранённые изменения', 'dirty');
    updateUndoUi(); // enable undo/revert immediately (snapshot itself is debounced)
    clearTimeout(histTimer);
    histTimer = setTimeout(pushHistory, 400); // coalesce a burst of edits into one undo step
  }

  // --- undo / redo / revert (Phase C) ---
  function pushHistory() {
    clearTimeout(histTimer);
    if (!doc) return;
    const snap = clone(doc);
    if (hIdx >= 0 && JSON.stringify(history[hIdx]) === JSON.stringify(snap)) return;
    history = history.slice(0, hIdx + 1);
    history.push(snap);
    hIdx = history.length - 1;
    if (history.length > 60) { history.shift(); hIdx--; }
    updateUndoUi();
  }
  function resetHistory() { history = doc ? [clone(doc)] : []; hIdx = history.length - 1; updateUndoUi(); }
  function restoreState(state) {
    doc = clone(state);
    // The doc object tree is replaced, so reference-based EN tracking is now
    // stale — clear it (a later edit re-tracks; nothing auto-translates blindly).
    enStale.clear();
    enManual.clear();
    renderSettings();
    renderPreview();
    dirty = JSON.stringify(doc) !== JSON.stringify(savedSnapshot);
    setStatus(dirty ? 'Есть несохранённые изменения' : 'Без изменений', dirty ? 'dirty' : 'ok');
    updateUndoUi();
  }
  function undo() { flushPending(); pushHistory(); if (hIdx > 0) { hIdx--; restoreState(history[hIdx]); } }
  function redo() { if (hIdx < history.length - 1) { hIdx++; restoreState(history[hIdx]); } }
  function revertToSaved() {
    if (!savedSnapshot) return;
    if (dirty && !confirm('Отменить все несохранённые изменения и вернуться к сохранённому?')) return;
    doc = clone(savedSnapshot);
    enStale.clear(); enManual.clear();
    renderSettings();
    renderPreview();
    dirty = false;
    resetHistory();
    setStatus('Откачено к сохранённому', 'ok');
  }
  function updateUndoUi() {
    const u = $('#btn-undo'), r = $('#btn-redo'), rv = $('#btn-revert');
    if (u) u.disabled = hIdx <= 0 && !dirty; // dirty = an un-snapshotted edit to undo
    if (r) r.disabled = hIdx >= history.length - 1;
    if (rv) rv.disabled = !dirty;
  }

  // --- preview + inline instrumentation ---
  // Affordances injected INTO the iframe (it has the site's own stylesheet).
  const EDIT_CSS = `
    [data-cms-text]{cursor:text}
    .cms-edit{outline:1px dashed transparent;outline-offset:3px;border-radius:2px;transition:outline-color .12s,background-color .12s}
    .cms-edit:hover{outline-color:var(--v4-orange,#d9531e)}
    .cms-edit:focus,.cms-focus{outline:2px solid var(--v4-orange,#d9531e);outline-offset:3px;background:rgba(217,83,30,.07)}
    .cms-en-empty{outline:1px dashed var(--v4-orange,#d9531e);background:rgba(217,83,30,.10)}
    .section{content-visibility:visible !important}
    /* list controls */
    [data-edit-item]{position:relative}
    [data-edit-item]:hover{outline:1px dotted var(--v4-line,#c9c5bd);outline-offset:4px}
    .cms-tools{position:absolute;top:-12px;right:0;display:none;gap:1px;z-index:50;background:var(--v4-paper,#f5f2ed);border:1px solid var(--v4-line,#c9c5bd);padding:2px;border-radius:3px;box-shadow:0 1px 6px rgba(0,0,0,.18)}
    .cms-tools.show{display:flex}
    .cms-tool{font:inherit;font-size:11px;line-height:1;padding:4px 7px;border:1px solid transparent;background:transparent;color:var(--v4-fg,#14110d);cursor:pointer;border-radius:2px;-webkit-user-select:none;user-select:none}
    .cms-tool:hover{border-color:var(--v4-orange,#d9531e);color:var(--v4-orange,#d9531e)}
    .cms-tool.is-off{opacity:.3;pointer-events:none}
    .cms-tool.danger:hover{border-color:#c0392b;color:#c0392b}
    .cms-add{grid-column:1/-1;display:inline-flex;align-items:center;margin-top:10px;font:inherit;font-size:12px;padding:5px 11px;border:1px dashed var(--v4-line,#c9c5bd);background:transparent;color:var(--v4-dim,#6c6759);cursor:pointer;border-radius:2px}
    .cms-add:hover{border-color:var(--v4-orange,#d9531e);color:var(--v4-orange,#d9531e)}
    /* markdown leaves: WYSIWYG (reuse .cms-edit affordance) */
    [data-cms-md]{cursor:text}
    /* verbatim HTML blocks: click to edit source */
    [data-cms-html]{position:relative;cursor:pointer}
    [data-cms-html]:hover{outline:1px dashed var(--v4-orange,#d9531e);outline-offset:5px}
    [data-cms-html]:hover::after{content:"✎ HTML";position:absolute;top:-3px;right:0;font-size:10px;font-family:var(--v4-mono,ui-monospace,monospace);background:var(--v4-orange,#d9531e);color:#14110d;padding:2px 6px;z-index:40}
    /* image: click to upload/replace */
    [data-cms-img]{cursor:pointer;outline:2px solid transparent;outline-offset:3px;transition:outline-color .12s}
    [data-cms-img]:hover{outline-color:var(--v4-orange,#d9531e)}
    /* floating leaf toolbar: bold/link (markdown) + AI (localized leaves) */
    .cms-bar{position:absolute;display:none;gap:4px;z-index:9999;background:var(--v4-fg,#14110d);padding:4px;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,.28);align-items:center;width:max-content}
    .cms-bar.on{display:flex}
    .cms-bar.kind-text .cms-md-only{display:none}
    .cms-sep{width:1px;align-self:stretch;background:rgba(255,255,255,.22);margin:0 2px}
    .cms-bar.kind-text .cms-sep{display:none}
    .cms-mdbtn{font:inherit;font-size:12px;font-weight:600;color:#fff;background:transparent;border:1px solid rgba(255,255,255,.3);padding:5px 10px;border-radius:3px;cursor:pointer;-webkit-user-select:none;user-select:none}
    .cms-mdbtn:hover{background:var(--v4-orange,#d9531e);border-color:var(--v4-orange,#d9531e);color:#14110d}
    .cms-mdbtn.cms-ai{font-weight:500;font-size:11px}
    .cms-bar:not(.has-href) .cms-href-only{display:none}
    .cms-bar:not(.ml) .cms-ml-only{display:none}
    .cms-mdbtn.cms-em{font-style:italic;font-weight:400}
    .cms-bar.kind-body .cms-ai,.cms-bar.kind-body .cms-href-only{display:none}
    /* keep empty leaves clickable (e.g. a just-added list item) */
    [data-cms-text]:empty::before,[data-cms-md]:empty::before{content:"+ текст";color:var(--v4-dim,#6c6759);opacity:.55;cursor:text}
  `;

  let pendingEl = null, pendingPath = null, commitTimer = null;
  function flushPending() {
    if (pendingEl) commit(pendingEl, pendingPath);
  }

  async function renderPreview() {
    flushPending();
    // Remember scroll position + the focused field so a structural re-render or
    // language switch doesn't fling the page back to the top.
    const prevScroll = fdoc && fdoc.defaultView ? fdoc.defaultView.scrollY : 0;
    const prevFocusPath =
      fdoc && fdoc.activeElement
        ? fdoc.activeElement.getAttribute('data-cms-text') || fdoc.activeElement.getAttribute('data-cms-md')
        : null;
    $('#ed-loading').hidden = false;
    let html;
    try {
      const r = await fetch(API + '/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page, lang, doc }),
      });
      html = await r.text();
    } catch (e) {
      setStatus('Превью: ошибка сети', 'error');
      $('#ed-loading').hidden = true;
      return;
    }
    // Strip the site's interactive JS so its handlers (theme toggle, scroll-spy,
    // smooth-scroll anchors) don't fight inline editing. The inline FOUC <script>
    // in <head> stays; we set the theme explicitly after load.
    html = html.replace(/<script\b[^>]*\bsrc="[^"]*\/script\.js[^"]*"[^>]*><\/script>/gi, '');
    frame = $('#preview');
    await new Promise((res) => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      frame.onload = finish;
      setTimeout(finish, 5000); // fallback: never hang the editor on a stuck load
      frame.srcdoc = html;
    });
    fdoc = frame.contentDocument;
    instrument();
    // Restore scroll, then best-effort re-focus the field that was being edited.
    if (fdoc.defaultView) fdoc.defaultView.scrollTo(0, prevScroll);
    if (prevFocusPath) {
      const again = fdoc.querySelector(
        `[data-cms-text="${prevFocusPath}"],[data-cms-md="${prevFocusPath}"]`
      );
      if (again) again.focus();
    }
    $('#ed-loading').hidden = true;
  }

  function instrument() {
    fdoc.documentElement.setAttribute('data-theme', theme);
    let st = fdoc.getElementById('cms-edit-style');
    if (!st) {
      st = fdoc.createElement('style');
      st.id = 'cms-edit-style';
      fdoc.head.appendChild(st);
    }
    st.textContent = EDIT_CSS;
    // No navigation while editing (caret placement happens on mousedown, so
    // cancelling the click still lets you click into a link's text to edit it).
    fdoc.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) e.preventDefault();
    }, true);
    fdoc.addEventListener('keydown', handleHotkeys); // ⌘S / ⌘Z work inside the iframe too
    // Show the toolbar for the deepest item under the cursor (so nested sub-lists
    // don't surface both the row's and the parent list's toolbars at once).
    fdoc.addEventListener('mouseover', (e) => {
      const item = e.target.closest('[data-edit-item]');
      const want = item ? item.querySelector(':scope > .cms-tools') : null;
      fdoc.querySelectorAll('.cms-tools.show').forEach((t) => { if (t !== want) t.classList.remove('show'); });
      if (want) want.classList.add('show');
    });
    // Plaintext leaves (head hooks like <title>/meta are managed in the drawer).
    fdoc.body.querySelectorAll('[data-cms-text]').forEach(attachText);
    // Markdown leaves → inline WYSIWYG (bold/links/paragraphs).
    fdoc.body.querySelectorAll('[data-cms-md]').forEach(attachMd);
    // Verbatim HTML blocks → raw-source popover.
    fdoc.body.querySelectorAll('[data-cms-html]').forEach(attachHtmlBlock);
    // Images → click-to-upload popover.
    fdoc.body.querySelectorAll('[data-cms-img]').forEach(attachImage);
    // List editing: per-item reorder/delete handles + per-list "+ add".
    fdoc.body.querySelectorAll('[data-edit-item]').forEach(addItemTools);
    fdoc.body.querySelectorAll('[data-edit-list]').forEach(addListTools);
    // Reuse the site's own header controls (editor duplicates were removed):
    // the language switcher switches the editing language; the theme icon cycles themes.
    fdoc.querySelectorAll('.v4-lang-link').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const to = a.textContent.trim().toLowerCase().startsWith('en') ? 'en' : 'ru';
      if (to !== lang) { flushPending(); lang = to; renderSettings(); renderPreview(); }
    }));
    const themeBtn = fdoc.querySelector('.v4-icon-btn');
    if (themeBtn) themeBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      fdoc.documentElement.setAttribute('data-theme', theme);
    });
    updateEnEmpty();
  }

  function attachText(node) {
    const path = node.getAttribute('data-cms-text');
    node.classList.add('cms-edit');
    node.setAttribute('contenteditable', 'plaintext-only');
    if (node.contentEditable !== 'plaintext-only') node.setAttribute('contenteditable', 'true');
    node.addEventListener('focus', () => {
      node.classList.add('cms-focus');
      const [p, k] = parentOf(path);
      if (p && isLoc(p[k])) showBar(node, path, 'text'); // AI only for localized leaves
    });
    node.addEventListener('blur', () => {
      node.classList.remove('cms-focus');
      hideBar();
      commit(node, path);
    });
    node.addEventListener('input', () => {
      pendingEl = node;
      pendingPath = path;
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => commit(node, path), 250);
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
      else if (e.key === 'Escape') node.blur();
    });
    flagLeaf(node, path);
  }

  // A leaf's text minus any injected editor controls (a CTA is both an editable
  // label and a reorderable item, so its toolbar lives inside it).
  function leafText(node) {
    if (!node.querySelector('.cms-tools')) return node.textContent;
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.cms-tools').forEach((t) => t.remove());
    return clone.textContent;
  }

  function commit(node, path) {
    clearTimeout(commitTimer);
    if (pendingEl === node) { pendingEl = null; pendingPath = null; }
    // Single-line leaves: flatten any pasted newlines, keep NBSP/content intact.
    const next = leafText(node).replace(/\n+/g, ' ');
    const [parent, key] = parentOf(path);
    const prev = parent && isLoc(parent[key]) ? (parent[key][lang] ?? '') : parent ? (parent[key] ?? '') : '';
    if (String(prev) === next) return; // blur/focus without an actual edit must not dirty
    setLeaf(path, next);
    markEdited(parent[key], lang);
    markDirty();
    flagLeaf(node, path);
    updateEnEmpty();
  }

  function flagLeaf(node, path) {
    const [parent, key] = parentOf(path);
    const cur = parent ? parent[key] : null;
    const empty = isLoc(cur) && !String(cur.en || '').trim() && !!String(cur.ru || '').trim();
    node.classList.toggle('cms-en-empty', lang === 'en' && empty);
  }

  // EN-empty count across the whole doc (localized leaves: ru set, en empty).
  function countEmptyEn(node, key, acc) {
    if (IMAGE_KEYS.has(key)) return acc;
    if (isLoc(node)) {
      if (String(node.ru || '').trim() && !String(node.en || '').trim()) acc.n++;
      return acc;
    }
    if (Array.isArray(node)) node.forEach((n) => countEmptyEn(n, key, acc));
    else if (node && typeof node === 'object') for (const k in node) countEmptyEn(node[k], k, acc);
    return acc;
  }
  function updateEnEmpty() {
    const acc = countEmptyEn(doc, '', { n: 0 });
    const b = $('#en-empty');
    if (acc.n) { b.hidden = false; b.textContent = 'EN пусто: ' + acc.n; }
    else b.hidden = true;
  }

  // --- list editing (structural: reorder / add / delete) ---
  function arrAndIndex(itemPath) {
    const parts = itemPath.split('.');
    const idx = +parts.pop();
    return [parts.reduce((o, k) => (o == null ? undefined : o[k]), doc), idx];
  }
  // A blank item shaped like the template: localized leaves → {ru:'',en:''},
  // arrays → [], booleans → false, strings → '' — but keep type/kind so the
  // renderer still selects the right variant.
  function blankItem(t, key) {
    if (isLoc(t)) return { ru: '', en: '' };
    if (Array.isArray(t)) return [];
    if (t && typeof t === 'object') {
      const o = {};
      for (const k of Object.keys(t)) o[k] = blankItem(t[k], k);
      return o;
    }
    if (typeof t === 'boolean') return false;
    if (typeof t === 'number') return 0;
    return key === 'type' || key === 'kind' ? t : '';
  }
  function structuralChange() {
    flushPending();
    markDirty();
    renderPreview(); // re-render from the mutated doc, then re-instrument
  }
  function moveItem(arr, idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    structuralChange();
  }
  function removeItem(arr, idx) {
    arr.splice(idx, 1);
    structuralChange();
  }
  function addItem(arr) {
    arr.push(blankItem(arr.length ? arr[arr.length - 1] : ''));
    structuralChange();
  }
  function tool(label, title, off, fn, danger) {
    const b = fdoc.createElement('span');
    b.className = 'cms-tool' + (danger ? ' danger' : '') + (off ? ' is-off' : '');
    b.setAttribute('role', 'button');
    b.setAttribute('contenteditable', 'false');
    b.setAttribute('title', title);
    b.textContent = label;
    if (!off) b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    return b;
  }
  function addItemTools(item) {
    const [arr, idx] = arrAndIndex(item.getAttribute('data-edit-item'));
    if (!Array.isArray(arr)) return;
    const tools = fdoc.createElement('div');
    tools.className = 'cms-tools';
    tools.setAttribute('contenteditable', 'false');
    tools.append(
      tool('↑', 'Вверх', idx === 0, () => moveItem(arr, idx, -1)),
      tool('↓', 'Вниз', idx === arr.length - 1, () => moveItem(arr, idx, 1)),
      tool('✕', 'Удалить', false, () => removeItem(arr, idx), true)
    );
    item.appendChild(tools);
  }
  function addListTools(container) {
    const arr = resolve(container.getAttribute('data-edit-list'));
    if (!Array.isArray(arr)) return;
    const add = fdoc.createElement('button');
    add.type = 'button';
    add.className = 'cms-add';
    add.setAttribute('contenteditable', 'false');
    add.textContent = '+ добавить';
    add.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); addItem(arr); });
    const tag = container.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      const li = fdoc.createElement('li'); // valid markup inside a list
      li.className = 'cms-add-li';
      li.setAttribute('contenteditable', 'false');
      li.appendChild(add);
      container.appendChild(li);
    } else {
      container.appendChild(add);
    }
  }

  // --- markdown leaves: light WYSIWYG (bold / links / paragraphs / lists) ---
  // Serialize edited HTML back to the markdown subset the site renders. NBSP is
  // preserved (only ASCII whitespace is collapsed) — the copy is full of "10 000".
  // Injected editor controls that must never leak into serialized content.
  const isEditorNode = (n) =>
    n.nodeType === 1 && (n.classList.contains('cms-tools') || n.classList.contains('cms-add') || n.id === 'cms-bar');
  function serializeInline(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) {
        if (isEditorNode(n)) return;
        const tag = n.tagName.toLowerCase();
        if (tag === 'b' || tag === 'strong') out += '**' + serializeInline(n).replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '') + '**';
        else if (tag === 'a') out += '[' + serializeInline(n) + '](' + (n.getAttribute('href') || '') + ')';
        else if (tag === 'br') out += ' ';
        else out += serializeInline(n); // unwrap spans/fonts/etc.
      }
    });
    return out;
  }
  const collapseWs = (s) => s.replace(/[ \t\n\r]+/g, ' ').replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
  function htmlToMd(root, block) {
    if (!block) return collapseWs(serializeInline(root));
    const parts = [];
    root.childNodes.forEach((n) => {
      if (n.nodeType === 3) { const t = collapseWs(n.nodeValue); if (t) parts.push(t); }
      else if (n.nodeType === 1) {
        if (isEditorNode(n)) return;
        const tag = n.tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') {
          const items = [...n.children].filter((c) => c.tagName.toLowerCase() === 'li')
            .map((li) => '- ' + collapseWs(serializeInline(li))).filter((x) => x !== '- ');
          if (items.length) parts.push(items.join('\n'));
        } else { const t = collapseWs(serializeInline(n)); if (t) parts.push(t); }
      }
    });
    return parts.join('\n\n');
  }
  // Floating toolbar shared by all editable leaves: bold/link for markdown,
  // AI actions (RU→EN / Вычитать) for any localized leaf.
  let barLeaf = null, barPath = null, barKind = null;
  function ensureBar() {
    let bar = fdoc.getElementById('cms-bar');
    if (bar) return bar;
    bar = fdoc.createElement('div');
    bar.id = 'cms-bar';
    bar.className = 'cms-bar';
    bar.setAttribute('contenteditable', 'false');
    const mk = (label, title, fn, cls) => {
      const b = fdoc.createElement('span');
      b.className = 'cms-mdbtn' + (cls ? ' ' + cls : '');
      b.setAttribute('role', 'button');
      b.title = title;
      b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection/focus
      b.addEventListener('click', (e) => { e.preventDefault(); fn(); });
      return b;
    };
    const sep = fdoc.createElement('span');
    sep.className = 'cms-sep';
    bar.append(
      mk('B', 'Полужирный', () => fdoc.execCommand('bold'), 'cms-md-only'),
      mk('I', 'Курсив', () => fdoc.execCommand('italic'), 'cms-md-only cms-em'),
      mk('🔗', 'Ссылка в тексте (пусто — убрать)', () => {
        const u = prompt('URL ссылки (пусто — убрать):');
        if (u === null) return;
        if (u === '') fdoc.execCommand('unlink');
        else fdoc.execCommand('createLink', false, u);
      }, 'cms-md-only'),
      mk('• список', 'Маркированный список', () => fdoc.execCommand('insertUnorderedList'), 'cms-ml-only'),
      sep,
      mk('RU→EN', 'Перевести это поле', aiTranslateLeaf, 'cms-ai'),
      mk('Вычитать', 'Орфография, пунктуация и типографика', aiProofreadLeaf, 'cms-ai'),
      mk('🔗 ссылка', 'Изменить URL ссылки', editHrefLeaf, 'cms-href-only')
    );
    fdoc.body.appendChild(bar);
    try { fdoc.execCommand('styleWithCSS', false, false); fdoc.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }
    return bar;
  }
  // A label leaf (path ends in .label) usually has an .href sibling — that's how
  // we offer link-URL editing without a dedicated hook in the template.
  function hrefSiblingOf(path) {
    if (!path || !path.endsWith('.label')) return null;
    const hp = path.slice(0, -'.label'.length) + '.href';
    const [p, k] = parentOf(hp);
    return p != null && k in p ? hp : null;
  }
  function showBar(node, path, kind) {
    barLeaf = node; barPath = path; barKind = kind;
    const hasHref = !!hrefSiblingOf(path);
    const body = kind === 'htmlbody'; // article body: bold/italic/link/bullets, no AI/href
    const ml = body || (kind === 'md' && node.tagName === 'DIV'); // paragraphs + bullets
    const bar = ensureBar();
    bar.className = 'cms-bar on' + (kind === 'text' ? ' kind-text' : '') +
      (hasHref ? ' has-href' : '') + (ml ? ' ml' : '') + (body ? ' kind-body' : '');
    positionBar(node);
  }
  // Float the bar just above the focused field (below it if there's no room),
  // in document coords so it scrolls with the content.
  function positionBar(node) {
    const bar = fdoc.getElementById('cms-bar');
    if (!bar) return;
    // Synchronous: reading offsetHeight forces layout, so we measure the now-
    // visible bar. (rAF is throttled when the preview tab isn't foregrounded.)
    const r = node.getBoundingClientRect();
    const w = fdoc.defaultView;
    const bh = bar.offsetHeight || 36;
    const above = r.top - bh - 8;
    const top = (above > 4 ? above : r.bottom + 8) + w.scrollY;
    let left = r.left + w.scrollX;
    const maxLeft = w.scrollX + fdoc.documentElement.clientWidth - bar.offsetWidth - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    bar.style.top = top + 'px';
    bar.style.left = left + 'px';
  }
  function hideBar() { const bar = fdoc.getElementById('cms-bar'); if (bar) bar.classList.remove('on'); }
  function editHrefLeaf() {
    const hp = hrefSiblingOf(barPath);
    if (!hp) return;
    const [p, k] = parentOf(hp);
    const node = p && p[k];
    const cur = isLoc(node) ? (node[lang] || '') : (node || '');
    textPrompt({
      title: 'Ссылка (URL) · ' + lang.toUpperCase(),
      value: cur,
      onApply: (u) => {
        if (u === cur) return;
        setLeaf(hp, u); // localized href → current lang; scalar → set directly
        markDirty();
        renderPreview();
      },
    });
  }

  function attachMd(node) {
    const path = node.getAttribute('data-cms-md');
    const multiline = node.tagName === 'DIV'; // prose block (ctx, About prose) → paragraphs + lists
    node.classList.add('cms-edit');
    node.setAttribute('contenteditable', 'true');
    node.addEventListener('focus', () => { node.classList.add('cms-focus'); showBar(node, path, 'md'); });
    node.addEventListener('blur', () => { node.classList.remove('cms-focus'); hideBar(); commitMd(node, path, multiline); });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') node.blur();
      // single-line leaves: Enter commits. Prose blocks: Enter = new paragraph,
      // Shift+Enter = soft <br> (both handled natively).
      else if (e.key === 'Enter' && !multiline) { e.preventDefault(); node.blur(); }
    });
    flagLeaf(node, path);
  }
  function commitMd(node, path, block) {
    const next = htmlToMd(node, block);
    const [parent, key] = parentOf(path);
    const prev = parent && isLoc(parent[key]) ? (parent[key][lang] ?? '') : parent ? (parent[key] ?? '') : '';
    if (String(prev) === next) return;
    setLeaf(path, next);
    markEdited(parent[key], lang);
    markDirty();
    flagLeaf(node, path);
    updateEnEmpty();
  }

  // --- per-leaf AI (toolbar actions on the focused leaf) ---
  function applyToLeaf(leaf, kind, value) {
    if (kind === 'md') renderPreview(); // markdown → re-render from the updated doc
    else if (leaf) leaf.textContent = value;
  }
  async function aiTranslateLeaf() {
    const path = barPath, leaf = barLeaf, kind = barKind;
    if (!path) return;
    const [parent, key] = parentOf(path);
    const cur = parent && parent[key];
    if (!isLoc(cur)) return setStatus('Поле не локализовано', 'error');
    if (!String(cur.ru || '').trim()) return setStatus('RU пусто — нечего переводить', 'error');
    setStatus('Перевод…', 'saving');
    try {
      const r = await fetch(API + '/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: cur.ru }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || res.error) return setStatus('Перевод: ' + (res.error || r.status), 'error');
      const en = res.translation || '';
      openSuggestion('RU→EN', en, ['Запишется в EN'], () => {
        cur.en = en; enStale.delete(cur); markDirty(); updateEnEmpty();
        if (lang === 'en') applyToLeaf(leaf, kind, en);
        setStatus('EN обновлён', 'ok');
      });
    } catch (e) { setStatus('Перевод: ошибка сети', 'error'); }
  }
  // Вычитать = proofread (AI) then deterministic typography — one button does both.
  async function aiProofreadLeaf() {
    const path = barPath, leaf = barLeaf, kind = barKind;
    if (!path) return;
    const [parent, key] = parentOf(path);
    const cur = parent && parent[key];
    const val = isLoc(cur) ? (cur[lang] || '') : (cur || '');
    if (!val.trim()) return setStatus('Пусто', 'error');
    setStatus('Вычитка…', 'saving');
    try {
      const r = await fetch(API + '/proofread', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: val, lang }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || res.error) return setStatus('Вычитка: ' + (res.error || r.status), 'error');
      const fixed = typography(res.corrected != null ? res.corrected : val, lang);
      if (fixed === val) return setStatus('Без правок', 'ok');
      openSuggestion('Вычитать · ' + lang.toUpperCase(), fixed, res.notes && res.notes.length ? res.notes : null, () => {
        setLeaf(path, fixed); markEdited(cur, lang); markDirty(); applyToLeaf(leaf, kind, fixed); setStatus('Применено', 'ok');
      });
    } catch (e) { setStatus('Вычитка: ошибка сети', 'error'); }
  }
  function openSuggestion(title, suggested, notes, onApply) {
    closeModal();
    const scrim = el('div', 'ed-modal-scrim');
    scrim.id = 'ed-modal-scrim';
    const box = el('div', 'ed-modal');
    box.append(Object.assign(el('div', 'ed-modal-head'), { textContent: 'AI · ' + title }));
    const body = el('div', 'ed-sugg-body');
    body.append(Object.assign(el('div', 'ed-sugg-text'), { textContent: suggested }));
    if (notes && notes.length) {
      const ul = el('ul', 'ed-sugg-notes');
      notes.forEach((n) => ul.append(Object.assign(el('li'), { textContent: n })));
      body.append(ul);
    }
    box.append(body);
    const ctrls = el('div', 'ed-modal-ctrls');
    const apply = el('button', 'primary');
    apply.textContent = 'Применить';
    apply.addEventListener('click', () => { onApply(); closeModal(); });
    const cancel = el('button');
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', closeModal);
    ctrls.append(apply, cancel);
    box.append(ctrls);
    scrim.append(box);
    document.body.append(scrim);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  }

  // --- verbatim HTML blocks: raw-source popover ---
  function attachHtmlBlock(node) {
    const path = node.getAttribute('data-cms-html');
    // The article body edits inline (light edits); other verbatim blocks
    // (about/uses sections) keep the raw-source popover.
    if (path === 'body') return attachArticleBody(node);
    node.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSourceModal(path, 'html'); });
    attachHtmlImages(node, path); // embedded images become click-to-upload
  }
  // Article body: inline contenteditable with Bold/Italic/Link. innerHTML is
  // committed on blur and sanitized server-side on save, so messy DOM is fine.
  function cleanBodyHtml(node) {
    const c = node.cloneNode(true);
    c.querySelectorAll('.cms-tools,.cms-add,#cms-bar').forEach((n) => n.remove());
    return c.innerHTML.trim();
  }
  function commitBody(node) {
    const html = cleanBodyHtml(node);
    const cur = resolve('body');
    const prev = isLoc(cur) ? (cur[lang] ?? '') : (cur ?? '');
    if (String(prev) === html) return;
    setLeaf('body', html);
    markDirty();
  }
  function attachArticleBody(node) {
    node.classList.add('cms-edit');
    node.setAttribute('contenteditable', 'true');
    node.addEventListener('focus', () => { node.classList.add('cms-focus'); showBar(node, 'body', 'htmlbody'); });
    node.addEventListener('blur', () => { node.classList.remove('cms-focus'); hideBar(); commitBody(node); });
    node.addEventListener('keydown', (e) => { if (e.key === 'Escape') node.blur(); });
    attachHtmlImages(node, 'body'); // click an embedded image to replace it
  }
  function openSourceModal(path, kind) {
    const [parent, key] = parentOf(path);
    const cur = parent && isLoc(parent[key]) ? (parent[key][lang] ?? '') : parent ? (parent[key] ?? '') : '';
    openModal({
      title: (kind === 'html' ? 'HTML-блок' : 'Markdown') + ' · ' + lang.toUpperCase(),
      value: cur,
      onApply: (val) => { setLeaf(path, val); markDirty(); renderPreview(); },
    });
  }

  // --- generic source modal (in the editor document, not the iframe) ---
  function closeModal() { const m = $('#ed-modal-scrim'); if (m) m.remove(); }
  // Single-line text prompt (replaces window.prompt for in-editor URL editing).
  function textPrompt({ title, value, onApply }) {
    closeModal();
    const scrim = el('div', 'ed-modal-scrim');
    scrim.id = 'ed-modal-scrim';
    const box = el('div', 'ed-modal');
    box.append(Object.assign(el('div', 'ed-modal-head'), { textContent: title }));
    const inp = el('input', 'ed-input');
    inp.type = 'text';
    inp.value = value || '';
    box.append(inp);
    const ctrls = el('div', 'ed-modal-ctrls');
    const apply = el('button', 'primary');
    apply.textContent = 'Применить';
    const done = () => { onApply(inp.value.trim()); closeModal(); };
    apply.addEventListener('click', done);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') closeModal(); });
    const cancel = el('button');
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', closeModal);
    ctrls.append(apply, cancel);
    box.append(ctrls);
    scrim.append(box);
    document.body.append(scrim);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
    inp.focus();
    inp.select();
  }
  function openModal({ title, value, onApply }) {
    closeModal();
    const scrim = el('div', 'ed-modal-scrim');
    scrim.id = 'ed-modal-scrim';
    const box = el('div', 'ed-modal');
    box.append(Object.assign(el('div', 'ed-modal-head'), { textContent: title }));
    const ta = el('textarea', 'ed-modal-ta mono');
    ta.value = value;
    box.append(ta);
    const ctrls = el('div', 'ed-modal-ctrls');
    const apply = el('button', 'primary');
    apply.textContent = 'Применить';
    apply.addEventListener('click', () => { onApply(ta.value); closeModal(); });
    const cancel = el('button');
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', closeModal);
    ctrls.append(apply, cancel);
    box.append(ctrls);
    scrim.append(box);
    document.body.append(scrim);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
    ta.focus();
  }

  // --- images: click-to-upload popover ---
  async function doUpload(file, folder) {
    setStatus('Загрузка картинки…', 'saving');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    try {
      const r = await fetch(API + '/upload', { method: 'POST', body: fd });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) { setStatus('Картинка загружена', 'ok'); return res.path; }
      setStatus('Загрузка: ' + (res.error || r.status), 'error');
    } catch (e) {
      setStatus('Загрузка: ошибка сети', 'error');
    }
    return null;
  }
  // Generic image picker modal. opts: {title, current, folder, altNode?, onApply(path), onRemove?}
  function openImagePicker(opts) {
    closeModal();
    let chosen = opts.current || '';
    const scrim = el('div', 'ed-modal-scrim');
    scrim.id = 'ed-modal-scrim';
    const box = el('div', 'ed-modal');
    box.append(Object.assign(el('div', 'ed-modal-head'), { textContent: opts.title }));
    const body = el('div', 'ed-modal-imgbody');
    const img = el('img', 'ed-img-preview');
    const setPrev = (src) => { if (src) { img.src = src; img.hidden = false; } else img.hidden = true; };
    setPrev(chosen);
    const drop = el('div', 'ed-img-drop');
    drop.textContent = 'Перетащите картинку сюда или нажмите, чтобы выбрать';
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    const onFile = async (f) => { const p = await doUpload(f, opts.folder); if (p) { chosen = p; setPrev(p); } };
    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { if (file.files[0]) onFile(file.files[0]); file.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
    body.append(img, drop, file);
    if (opts.altNode && isLoc(opts.altNode)) {
      const wrap = el('div', 'ed-field');
      wrap.append(Object.assign(el('div', 'ed-field-label'), { textContent: 'Alt · ' + lang.toUpperCase() }));
      const inp = el('input', 'ed-input');
      inp.type = 'text';
      inp.value = opts.altNode[lang] || '';
      inp.addEventListener('input', () => { opts.altNode[lang] = inp.value; markDirty(); });
      wrap.append(inp);
      body.append(wrap);
    }
    box.append(body);
    const ctrls = el('div', 'ed-modal-ctrls');
    const apply = el('button', 'primary');
    apply.textContent = 'Применить';
    apply.addEventListener('click', () => { opts.onApply(chosen); closeModal(); });
    ctrls.append(apply);
    if (opts.onRemove) {
      const rm = el('button');
      rm.textContent = 'Убрать';
      rm.addEventListener('click', () => { opts.onRemove(); closeModal(); });
      ctrls.append(rm);
    }
    const cancel = el('button');
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', closeModal);
    ctrls.append(cancel);
    box.append(ctrls);
    scrim.append(box);
    document.body.append(scrim);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  }
  function attachImage(node) {
    const path = node.getAttribute('data-cms-img');
    node.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const [ap, ak] = parentOf(path === 'hero.portrait' ? 'hero.portraitAlt' : '');
      openImagePicker({
        title: 'Изображение · ' + path,
        current: resolve(path) || node.getAttribute('src') || '',
        folder: path === 'hero.portrait' ? 'avatar' : 'media',
        altNode: path === 'hero.portrait' ? ap && ap[ak] : null,
        onApply: (p) => { setLeaf(path, p); markDirty(); renderPreview(); },
        onRemove: () => { setLeaf(path, ''); markDirty(); renderPreview(); },
      });
    });
  }
  // Images inside verbatim-HTML blocks (e.g. /uses gear cards): click to upload,
  // swapping the src in the stored HTML string (targeted, format-preserving).
  function attachHtmlImages(block, htmlPath) {
    block.querySelectorAll('img').forEach((img) => {
      img.style.cursor = 'pointer';
      img.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const oldSrc = img.getAttribute('src') || '';
        openImagePicker({
          title: 'Картинка в блоке',
          current: oldSrc,
          folder: 'uses',
          onApply: (p) => {
            if (!p || p === oldSrc) return;
            const [parent, key] = parentOf(htmlPath);
            const swap = (s) => String(s).replace('src="' + oldSrc + '"', 'src="' + p + '"');
            if (parent && isLoc(parent[key])) parent[key][lang] = swap(parent[key][lang]);
            else if (parent) parent[key] = swap(parent[key]);
            img.src = p;
            markDirty();
          },
        });
      });
    });
  }

  // --- load / save ---
  async function load() {
    setStatus('Загрузка…');
    try {
      const r = await fetch(API + '/content?page=' + encodeURIComponent(page));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      doc = await r.json();
      dirty = false;
      enStale.clear();
      enManual.clear();
      savedSnapshot = clone(doc);
      resetHistory();
      renderSettings();
      await renderPreview();
      setStatus('Загружено', 'ok');
    } catch (e) {
      setStatus('Ошибка загрузки: ' + e.message, 'error');
    }
  }

  let saving = false;
  async function save() {
    if (!doc || saving) return; // guard against double-submit (rev bump + history write)
    saving = true;
    const saveBtn = $('#btn-save');
    if (saveBtn) saveBtn.disabled = true;
    flushPending();
    try {
      const synced = await syncStaleEn(); // re-translate changed RU → EN before persisting
      setStatus('Сохранение…', 'saving');
      const r = await fetch(API + '/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page, doc }),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        doc.rev = res.rev;
        doc.updatedAt = res.updatedAt;
        dirty = false;
        savedSnapshot = clone(doc);
        updateUndoUi();
        setStatus('Сохранено ✓ (rev ' + res.rev + ')' + (synced ? ' · EN +' + synced : ''), 'ok');
        renderSettings();
        if (isArticle()) populatePageSelect(); // title/status in the picker may have changed
        if (synced) renderPreview(); // surface the freshly-translated EN
      } else {
        setStatus('Ошибка: ' + (res.error || r.status), 'error');
      }
    } catch (e) {
      setStatus('Ошибка сети: ' + e.message, 'error');
    } finally {
      saving = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // --- settings drawer: generic form engine for the non-inline fields
  // (meta / share / seo / subscribers stat) + per-field AI helpers. ---
  const LABELS = {
    meta: 'Мета', share: 'Карточка шаринга', seo: 'SEO', title: 'Заголовок', description: 'Описание',
    image: 'Картинка', imageAlt: 'Alt картинки', jobTitle: 'Должность', alternateName: 'Альт. имя',
    personDescription: 'Описание (SEO)', knowsAbout: 'Знает о', sameAs: 'Профили', worksFor: 'Работает в',
    occupationStartDate: 'Дата начала', addressLocality: 'Город', name: 'Имя', url: 'URL', value: 'Значение',
    unit: 'Подпись', channels: 'Каналы', telegram: 'Telegram', linkedin: 'LinkedIn', youtube: 'YouTube', auto: 'Авто-обновление',
  };
  const MULTILINE = new Set(['description', 'personDescription', 'tagline', 'prose', 'desc', 'note']);
  const labelOf = (k) => LABELS[k] || k;

  function flagEmpty(row, value) {
    row.classList.toggle('is-empty', !String(value.en || '').trim() && !!String(value.ru || '').trim());
  }
  function ctrlBtn(txt, fn, cls) {
    const b = el('button', 'f-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button'; b.textContent = txt;
    b.addEventListener('click', fn);
    return b;
  }
  function aiBtn(txt, fn) {
    const b = el('button', 'f-ai-btn');
    b.type = 'button'; b.textContent = txt;
    b.addEventListener('click', () => fn(b));
    return b;
  }
  function applyVal(L, v, inputs, rows, value) {
    inputs[L].value = v; value[L] = v;
    flagEmpty(rows.en, value); markDirty(); updateEnEmpty();
  }
  // Non-destructive suggestion: shows the proposed text + Применить / Отмена.
  function suggestBox(anchorRow, suggested, onApply, notes) {
    anchorRow.parentNode.querySelectorAll('.f-suggest').forEach((n) => n.remove());
    const box = el('div', 'f-suggest');
    box.append(Object.assign(el('div', 'f-suggest-text'), { textContent: suggested }));
    if (notes && notes.length) {
      const ul = el('ul', 'f-suggest-notes');
      notes.forEach((x) => ul.append(Object.assign(el('li'), { textContent: x })));
      box.append(ul);
    }
    const ctrls = el('div', 'f-suggest-ctrls');
    ctrls.append(ctrlBtn('Применить', () => { onApply(suggested); box.remove(); }, 'add'), ctrlBtn('Отмена', () => box.remove()));
    box.append(ctrls);
    anchorRow.append(box);
  }
  async function translateField(value, inputs, rows) {
    const ru = value.ru || '';
    if (!ru.trim()) return setStatus('RU пусто — нечего переводить', 'error');
    setStatus('Перевод…', 'saving');
    try {
      const r = await fetch(API + '/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: ru }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || res.error) return setStatus('Перевод: ' + (res.error || r.status), 'error');
      const en = res.translation || '';
      if (!String(value.en || '').trim()) { applyVal('en', en, inputs, rows, value); enStale.delete(value); setStatus('Переведено', 'ok'); }
      else { suggestBox(rows.en, en, (v) => { applyVal('en', v, inputs, rows, value); enStale.delete(value); }, ['EN уже заполнен — заменить?']); setStatus('Перевод готов — подтвердите', 'dirty'); }
    } catch (e) { setStatus('Перевод: ошибка сети', 'error'); }
  }
  async function proofreadField(value, inputs, rows) {
    let did = false;
    for (const L of LANGS) {
      const cur = value[L] || '';
      if (!cur.trim()) continue;
      did = true;
      setStatus('Вычитка ' + L.toUpperCase() + '…', 'saving');
      try {
        const r = await fetch(API + '/proofread', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: cur, lang: L }) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok || res.error) { setStatus('Вычитка: ' + (res.error || r.status), 'error'); continue; }
        const fixed = typography(res.corrected != null ? res.corrected : cur, L); // proofread + typography
        if (fixed !== cur) { suggestBox(rows[L], fixed, (v) => { applyVal(L, v, inputs, rows, value); markEdited(value, L); }, res.notes && res.notes.length ? res.notes : ['Правки ' + L.toUpperCase()]); setStatus('Вычитка готова — проверьте', 'dirty'); }
        else setStatus('Вычитка ' + L.toUpperCase() + ': без правок', 'ok');
      } catch (e) { setStatus('Вычитка: ошибка сети', 'error'); }
    }
    if (!did) setStatus('Нет текста для вычитки', 'error');
  }
  // Typography (deterministic, markdown-safe; shown with confirm). The \uE000
  // sentinels shield md links/bold from the rules; \u00a0 is the RU NBSP.
  function typography(text, L) {
    const tokens = [];
    let s = String(text).replace(/\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/g, (m) => { tokens.push(m); return '\uE000' + (tokens.length - 1) + '\uE000'; });
    if (L === 'en') {
      s = s.replace(/(^|[\s(])"/g, '$1“').replace(/"/g, '”');
      s = s.replace(/(\w)'(\w)/g, '$1’$2');
      s = s.replace(/\.\.\./g, '…').replace(/ - /g, ' — ');
    } else {
      s = s.replace(/(^|[\s(])"/g, '$1«').replace(/"/g, '»');
      s = s.replace(/\.\.\./g, '…').replace(/ - /g, ' — ');
      s = s.replace(/(^|\s)(во|со|об|для|что|как|где|это|или|при|на|по|из|от|до|за|не|но|и|о|у|в|к|с|а|я)\s+/gi, (m, p1, p2) => p1 + p2 + '\u00a0');
    }
    return s.replace(/\uE000(\d+)\uE000/g, (m, i) => tokens[+i]);
  }
  function localizedInput(value, key) {
    const box = el('div', 'f-loc');
    const inputs = {}, rows = {};
    for (const L of LANGS) {
      const row = el('div', 'f-loc-row');
      row.append(Object.assign(el('span', 'f-lang'), { textContent: L.toUpperCase() }));
      const multi = MULTILINE.has(key) || String(value[L] || '').length > 60 || String(value[L] || '').includes('\n');
      const inp = multi ? el('textarea', 'f-input') : el('input', 'f-input');
      if (!multi) inp.type = 'text';
      inp.value = value[L] || '';
      inp.addEventListener('input', () => { value[L] = inp.value; markEdited(value, L); flagEmpty(rows.en, value); markDirty(); updateEnEmpty(); });
      row.append(inp); box.append(row);
      inputs[L] = inp; rows[L] = row;
      if (L === 'en') flagEmpty(row, value);
    }
    const tools = el('div', 'f-loc-tools');
    tools.append(aiBtn('RU→EN', () => translateField(value, inputs, rows)), aiBtn('Вычитать', () => proofreadField(value, inputs, rows)));
    box.append(tools);
    return box;
  }
  function scalarInput(obj, key) {
    const v = obj[key];
    if (typeof v === 'boolean') {
      const l = el('label', 'f-bool');
      const c = el('input'); c.type = 'checkbox'; c.checked = v;
      c.addEventListener('change', () => { obj[key] = c.checked; markDirty(); });
      l.append(c, document.createTextNode(' ' + labelOf(key)));
      return l;
    }
    const multi = MULTILINE.has(key) || String(v || '').length > 60;
    const inp = multi ? el('textarea', 'f-input') : el('input', 'f-input');
    if (!multi) inp.type = 'text';
    inp.value = v == null ? '' : v;
    inp.addEventListener('input', () => { obj[key] = inp.value; markDirty(); });
    return inp;
  }
  function imageWidget(get, set, folder) {
    const box = el('div', 'f-img');
    const preview = el('div', 'f-img-preview');
    const path = el('div', 'f-img-path');
    const refresh = () => {
      const p = get(); preview.textContent = '';
      if (p) { const img = el('img'); img.src = p; preview.append(img); }
      else preview.append(Object.assign(el('span', 'f-img-none'), { textContent: 'нет картинки' }));
      path.textContent = p || '';
    };
    refresh();
    const right = el('div');
    const ctrls = el('div', 'f-img-ctrls');
    const fileInp = el('input'); fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.hidden = true;
    const up = async (f) => { const p = await doUpload(f, folder); if (p) { set(p); refresh(); markDirty(); } };
    fileInp.addEventListener('change', async () => { if (fileInp.files[0]) await up(fileInp.files[0]); fileInp.value = ''; });
    ctrls.append(ctrlBtn('Загрузить…', () => fileInp.click()), ctrlBtn('✕', () => { set(''); refresh(); markDirty(); }, 'danger'), fileInp);
    right.append(ctrls, path);
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', async (e) => { e.preventDefault(); box.classList.remove('drag'); if (e.dataTransfer.files[0]) await up(e.dataTransfer.files[0]); });
    box.append(preview, right);
    return box;
  }
  function imageField(obj, key) {
    const v = obj[key];
    const folder = key === 'portrait' ? 'avatar' : key === 'image' ? 'og' : 'media';
    const wrap = el('div', 'f-field');
    wrap.append(Object.assign(el('div', 'f-label'), { textContent: labelOf(key) }));
    if (isLoc(v)) {
      const grp = el('div');
      for (const L of LANGS) {
        const row = el('div', 'f-loc-row');
        row.append(Object.assign(el('span', 'f-lang'), { textContent: L.toUpperCase() }));
        row.append(imageWidget(() => v[L] || '', (x) => { v[L] = x; }, folder));
        grp.append(row);
      }
      wrap.append(grp);
    } else wrap.append(imageWidget(() => obj[key] || '', (x) => { obj[key] = x; }, folder));
    return wrap;
  }
  function listEditor(arr) {
    const box = el('div', 'f-list');
    const render = () => {
      box.textContent = '';
      arr.forEach((item, i) => {
        const card = el('div', 'f-item');
        const head = el('div', 'f-item-head');
        head.append(Object.assign(el('span', 'f-item-n'), { textContent: '#' + (i + 1) }));
        const ctrls = el('div', 'f-item-ctrls');
        ctrls.append(
          ctrlBtn('↑', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); render(); } }),
          ctrlBtn('↓', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); render(); } }),
          ctrlBtn('✕', () => { arr.splice(i, 1); markDirty(); render(); updateEnEmpty(); }, 'danger')
        );
        head.append(ctrls); card.append(head);
        if (isLoc(item)) card.append(localizedInput(item, ''));
        else if (item && typeof item === 'object') for (const k of Object.keys(item)) card.append(fieldRow(item, k));
        else card.append(scalarInput(arr, i));
        box.append(card);
      });
      box.append(ctrlBtn('+ добавить', () => { arr.push(blankItem(arr.length ? arr[arr.length - 1] : '')); markDirty(); render(); }, 'add'));
    };
    render();
    return box;
  }
  function control(obj, key) {
    const v = obj[key];
    if (isLoc(v)) return localizedInput(v, key);
    if (Array.isArray(v)) return listEditor(v);
    if (v && typeof v === 'object') { const body = el('div'); for (const k of Object.keys(v)) body.append(fieldRow(v, k)); return body; }
    return scalarInput(obj, key);
  }
  function fieldRow(obj, key) {
    const v = obj[key];
    if (IMAGE_KEYS.has(key)) return imageField(obj, key);
    const collapsible = Array.isArray(v) || (v && typeof v === 'object' && !isLoc(v));
    if (collapsible) {
      const d = el('details', 'f-group');
      const s = el('summary'); s.textContent = labelOf(key);
      if (Array.isArray(v)) s.append(Object.assign(el('span', 'f-count'), { textContent: ' (' + v.length + ')' }));
      d.append(s);
      const body = el('div', 'f-group-body'); body.append(control(obj, key)); d.append(body);
      return d;
    }
    const wrap = el('div', 'f-field');
    if (typeof v !== 'boolean') wrap.append(Object.assign(el('div', 'f-label'), { textContent: labelOf(key) }));
    wrap.append(control(obj, key));
    return wrap;
  }
  function renderCardPreview() {
    const s = doc.share || {};
    const val = (o) => (o ? o[lang] || o.ru || '' : '');
    const wrap = el('div', 'ed-card-preview');
    wrap.append(Object.assign(el('div', 'ed-card-label'), { textContent: 'Превью карточки · ' + lang.toUpperCase() }));
    const card = el('div', 'sc');
    const img = val(s.image);
    if (img) { const im = el('img', 'sc-img'); im.src = img; card.append(im); }
    else card.append(Object.assign(el('div', 'sc-noimg'), { textContent: 'нет картинки' }));
    const body = el('div', 'sc-body');
    body.append(Object.assign(el('div', 'sc-domain'), { textContent: 's.morgunov.tech' }));
    body.append(Object.assign(el('div', 'sc-title'), { textContent: val(s.title) }));
    body.append(Object.assign(el('div', 'sc-desc'), { textContent: val(s.description) }));
    card.append(body); wrap.append(card);
    return wrap;
  }
  // --- articles ---
  const isArticle = () => page.startsWith('article:');
  const TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  async function populatePageSelect() {
    const sel = $('#page-select');
    let articles = [];
    try { articles = (await fetch(API + '/articles').then((r) => r.json())).articles || []; } catch { /* ignore */ }
    sel.textContent = '';
    for (const p of ['home', 'collaborate', 'about', 'uses']) {
      sel.append(Object.assign(el('option'), { value: p, textContent: p }));
    }
    if (articles.length) {
      const og = document.createElement('optgroup');
      og.label = 'Статьи';
      for (const a of articles) {
        const label = (a.status === 'draft' ? '• ' : '') + ((a.title && (a.title.ru || a.title.en)) || a.slug);
        og.append(Object.assign(el('option'), { value: 'article:' + a.slug, textContent: label }));
      }
      sel.append(og);
    }
    sel.append(Object.assign(el('option'), { value: '__new_article__', textContent: '＋ Новая статья…' }));
    sel.append(Object.assign(el('option'), { value: '__import_tme__', textContent: '＋ Импорт из t.me…' }));
    sel.value = page;
  }
  async function importArticle() {
    if (dirty && !confirm('Несохранённые изменения пропадут. Импортировать пост?')) return;
    const url = prompt('Ссылка на пост: https://t.me/<канал>/<id>');
    if (!url) return;
    setStatus('Импорт из t.me…', 'saving');
    try {
      const r = await fetch(API + '/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) return setStatus('Импорт: ' + (res.error || r.status), 'error');
      page = 'article:' + res.slug;
      await populatePageSelect();
      $('#page-select').value = page;
      load();
      setStatus('Импортировано — черновик создан', 'ok');
    } catch (e) { setStatus('Импорт: ошибка сети', 'error'); }
  }
  async function translateBody() {
    const cur = resolve('body');
    if (!isLoc(cur)) return setStatus('Тело не локализовано', 'error');
    if (!String(cur.ru || '').trim()) return setStatus('RU тело пусто', 'error');
    setStatus('Перевод тела…', 'saving');
    try {
      const r = await fetch(API + '/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: cur.ru }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || res.error) return setStatus('Перевод: ' + (res.error || r.status), 'error');
      cur.en = res.translation || '';
      markDirty();
      if (lang === 'en') renderPreview();
      setStatus('EN тело обновлено — проверьте', 'ok');
    } catch (e) { setStatus('Перевод: ошибка сети', 'error'); }
  }
  async function createArticle() {
    if (dirty && !confirm('Несохранённые изменения пропадут. Создать статью?')) return;
    const title = prompt('Заголовок новой статьи (RU):');
    if (title === null) return;
    const slug = slugify(title);
    if (!slug) return setStatus('Не удалось сделать slug из заголовка', 'error');
    setStatus('Создание статьи…', 'saving');
    try {
      const r = await fetch(API + '/articles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'create', slug, title }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) return setStatus('Создание: ' + (res.error || r.status), 'error');
      page = 'article:' + res.slug;
      await populatePageSelect();
      $('#page-select').value = page;
      load();
    } catch (e) { setStatus('Создание: ошибка сети', 'error'); }
  }
  async function deleteArticle() {
    if (!isArticle() || !doc) return;
    const slug = doc.slug;
    if (!confirm('Удалить статью «' + slug + '»? Это необратимо.')) return;
    setStatus('Удаление…', 'saving');
    try {
      const r = await fetch(API + '/articles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'delete', slug }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) return setStatus('Удаление: ' + (res.error || r.status), 'error');
      dirty = false; page = 'home';
      await populatePageSelect();
      $('#page-select').value = 'home';
      load();
      setStatus('Статья удалена', 'ok');
    } catch (e) { setStatus('Удаление: ошибка сети', 'error'); }
  }
  function articleStatusField() {
    const wrap = el('div', 'f-field');
    wrap.append(Object.assign(el('div', 'f-label'), { textContent: 'Статус' }));
    const sel = el('select', 'f-input');
    for (const [v, l] of [['draft', 'Черновик'], ['published', 'Опубликовано']]) {
      const o = Object.assign(el('option'), { value: v, textContent: l });
      if ((doc.status || 'draft') === v) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => { doc.status = sel.value; markDirty(); });
    wrap.append(sel);
    return wrap;
  }
  // --- cross-post to Telegram (Flow B) ---
  const TG_STRATS = [['auto', 'Авто'], ['teaser', 'Тизер + ссылка'], ['split', 'Серия (1/N)'], ['truncate', 'Обрезка + ссылка']];
  async function fetchTgPlan(slug, strategy) {
    try {
      const r = await fetch(API + '/tg-preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, strategy }) });
      return await r.json().catch(() => ({ error: 'preview failed' }));
    } catch (e) { return { error: 'сеть' }; }
  }
  function openTgPublish() {
    if (!isArticle() || !doc) return;
    if (dirty) return setStatus('Сначала сохраните изменения', 'error');
    const slug = doc.slug;
    let strategy = 'auto';
    let current = null;
    closeModal();
    const scrim = el('div', 'ed-modal-scrim'); scrim.id = 'ed-modal-scrim';
    const box = el('div', 'ed-modal ed-modal-wide');
    box.append(Object.assign(el('div', 'ed-modal-head'), { textContent: 'Публикация в Telegram' }));
    const ctlRow = el('div', 'ed-field');
    ctlRow.append(Object.assign(el('div', 'ed-field-label'), { textContent: 'Стратегия' }));
    const sel = el('select', 'ed-input');
    TG_STRATS.forEach(([v, l]) => sel.append(Object.assign(el('option'), { value: v, textContent: l })));
    ctlRow.append(sel); box.append(ctlRow);
    const note = el('div', 'ed-sugg-notes'); box.append(note);
    const msgsWrap = el('div', 'ed-tg-msgs'); box.append(msgsWrap);
    const ctrls = el('div', 'ed-modal-ctrls');
    const sendBtn = el('button', 'primary'); sendBtn.textContent = 'Отправить в канал';
    const cancel = el('button'); cancel.textContent = 'Отмена'; cancel.addEventListener('click', closeModal);
    ctrls.append(sendBtn, cancel); box.append(ctrls);
    scrim.append(box); document.body.append(scrim);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });

    const renderPlan = async () => {
      msgsWrap.textContent = 'Загрузка превью…'; note.textContent = '';
      const res = await fetchTgPlan(slug, strategy);
      if (res.error) { msgsWrap.textContent = 'Ошибка превью: ' + res.error; current = null; return; }
      current = res.plan;
      msgsWrap.textContent = '';
      if (res.already) note.append(Object.assign(el('div'), { textContent: '⚠ Уже отправлялось: ' + (res.already.url || res.already.postedAt || '') }));
      (current.warnings || []).forEach((w) => note.append(Object.assign(el('div'), { textContent: '⚠ ' + w })));
      current.messages.forEach((m, i) => {
        const card = el('div', 'ed-tg-msg');
        card.append(Object.assign(el('div', 'f-lang'), { textContent: `Сообщение ${i + 1} · ${m.kind}` }));
        if (m.kind === 'text' || m.kind === 'photo') {
          const ta = el('textarea', 'ed-modal-ta'); ta.value = m.kind === 'text' ? m.text : (m.caption || ''); ta.dataset.idx = i;
          card.append(ta);
        } else if (m.kind === 'album') {
          const ta = el('textarea', 'ed-modal-ta'); ta.value = (m.items[0] && m.items[0].caption) || ''; ta.dataset.idx = i;
          card.append(ta);
        }
        if (m.kind === 'photo') card.append(Object.assign(el('div', 'f-img-path'), { textContent: '🖼 ' + m.photoUrl }));
        if (m.kind === 'album') m.items.forEach((it) => card.append(Object.assign(el('div', 'f-img-path'), { textContent: '🖼 ' + it.photoUrl })));
        msgsWrap.append(card);
      });
    };
    sel.addEventListener('change', () => { strategy = sel.value; renderPlan(); });
    sendBtn.addEventListener('click', async () => {
      if (!current) return;
      if (!confirm('Отправить ' + current.messages.length + ' сообщ. в канал?')) return;
      const edited = current.messages.map((m, i) => {
        const ta = msgsWrap.querySelector('textarea[data-idx="' + i + '"]');
        if (m.kind === 'text') return { kind: 'text', text: ta ? ta.value : m.text };
        if (m.kind === 'photo') return { kind: 'photo', caption: ta ? ta.value : m.caption };
        if (m.kind === 'album') return { kind: 'album', items: [{ caption: ta ? ta.value : '' }] };
        return { kind: m.kind };
      });
      sendBtn.disabled = true; setStatus('Отправка в Telegram…', 'saving');
      try {
        const r = await fetch(API + '/tg-publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, strategy, messages: edited }) });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.ok) {
          setStatus('Отправлено в Telegram' + (res.mock ? ' (mock)' : '') + (res.url ? ' · ' + res.url : ''), 'ok');
          closeModal(); renderSettings();
        } else { sendBtn.disabled = false; setStatus('Telegram: ' + (res.error || r.status), 'error'); }
      } catch (e) { sendBtn.disabled = false; setStatus('Telegram: ошибка сети', 'error'); }
    });
    renderPlan();
  }

  function renderArticleHead(box) {
    const head = el('div', 'f-field');
    head.append(Object.assign(el('div', 'f-label'), { textContent: 'Статья · /notes/' + doc.slug }));
    head.append(ctrlBtn('Удалить статью', deleteArticle, 'danger'));
    box.append(head);
    if (doc.status === 'published') {
      const tg = el('div', 'f-field');
      tg.append(Object.assign(el('div', 'f-label'), { textContent: 'Telegram' }));
      const trow = el('div', 'f-item-ctrls');
      trow.append(ctrlBtn('Опубликовать в Telegram', openTgPublish));
      tg.append(trow);
      const dist = doc.distribution && doc.distribution.telegram;
      if (dist) tg.append(Object.assign(el('div', 'f-img-path'), { textContent: '✓ ' + (dist.url || dist.postedAt || '') + (dist.mock ? ' (mock)' : '') }));
      box.append(tg);
    }
    const tools = el('div', 'f-field');
    tools.append(Object.assign(el('div', 'f-label'), { textContent: 'Тело' }));
    const row = el('div', 'f-item-ctrls');
    row.append(ctrlBtn('Перевести RU→EN', translateBody), ctrlBtn('HTML-исходник', () => openSourceModal('body', 'html')));
    tools.append(row);
    box.append(tools);
    box.append(articleStatusField());
    const dwrap = el('div', 'f-field');
    dwrap.append(Object.assign(el('div', 'f-label'), { textContent: 'Дата (YYYY-MM-DD)' }));
    dwrap.append(scalarInput(doc, 'date'));
    box.append(dwrap);
    if (doc.excerpt) {
      const ew = el('div', 'f-field');
      ew.append(Object.assign(el('div', 'f-label'), { textContent: 'Анонс' }));
      ew.append(localizedInput(doc.excerpt, 'excerpt'));
      box.append(ew);
    }
    if (doc.cover) {
      const cw = el('div', 'f-field');
      cw.append(Object.assign(el('div', 'f-label'), { textContent: 'Обложка' }));
      cw.append(imageWidget(() => (typeof doc.cover.src === 'string' ? doc.cover.src : ''), (x) => { doc.cover.src = x; }, 'covers'));
      if (doc.cover.alt) {
        cw.append(Object.assign(el('div', 'f-label'), { textContent: 'Alt обложки' }));
        cw.append(localizedInput(doc.cover.alt, 'alt'));
      }
      box.append(cw);
    }
  }

  function renderSettings() {
    const box = $('#settings');
    box.textContent = '';
    if (!doc) return;
    if (isArticle()) renderArticleHead(box);
    if (doc.share) box.append(renderCardPreview());
    for (const k of ['meta', 'share', 'seo']) {
      if (!doc[k]) continue;
      const node = fieldRow(doc, k);
      if (node.tagName === 'DETAILS') node.open = k !== 'seo';
      box.append(node);
    }
    const sub = Array.isArray(doc.stats) && doc.stats.find((s) => s.kind === 'subscribers');
    if (sub) {
      const d = el('details', 'f-group');
      d.append(Object.assign(el('summary'), { textContent: 'Подписчики (SocialBot)' }));
      const body = el('div', 'f-group-body');
      for (const k of Object.keys(sub)) { if (k === 'kind' || k === 'unit') continue; body.append(fieldRow(sub, k)); }
      d.append(body); box.append(d);
    }
    box.append(Object.assign(el('p', 'ed-drawer-meta'), {
      textContent: 'rev ' + (doc.rev ?? '—') + (doc.updatedAt ? ' · ' + new Date(doc.updatedAt).toLocaleString('ru-RU') : ''),
    }));
    box.append(renderHistorySection());
    updateEnEmpty();
  }
  // Version history — lazy-loaded when the section is first expanded.
  function renderHistorySection() {
    const d = el('details', 'f-group');
    d.append(Object.assign(el('summary'), { textContent: 'История версий' }));
    const body = el('div', 'f-group-body');
    body.textContent = 'Загрузка…';
    d.append(body);
    let loaded = false;
    d.addEventListener('toggle', async () => {
      if (!d.open || loaded) return;
      loaded = true;
      try {
        const data = await fetch(API + '/history?page=' + encodeURIComponent(page)).then((r) => r.json());
        const revs = data.revisions || [];
        body.textContent = '';
        if (!revs.length) { body.textContent = 'Пока нет сохранённых версий.'; return; }
        revs.forEach((rv) => {
          const row = el('div', 'ed-rev-row');
          row.append(Object.assign(el('span', 'ed-rev-meta'), {
            textContent: 'rev ' + rv.rev + ' · ' + (rv.updatedAt ? new Date(rv.updatedAt).toLocaleString('ru-RU') : ''),
          }));
          row.append(ctrlBtn('Загрузить', () => loadRevision(rv.rev)));
          body.append(row);
        });
      } catch (e) {
        body.textContent = 'Ошибка загрузки истории';
      }
    });
    return d;
  }
  async function loadRevision(rev) {
    if (dirty && !confirm('Несохранённые изменения пропадут. Загрузить версию rev ' + rev + '?')) return;
    setStatus('Загрузка версии…', 'saving');
    try {
      const data = await fetch(API + '/history?page=' + encodeURIComponent(page) + '&rev=' + rev).then((r) => r.json());
      if (!data.doc) return setStatus('Версия не найдена', 'error');
      doc = data.doc;
      enStale.clear();
      enManual.clear();
      dirty = true; // loaded an old version; unsaved until the user saves it
      resetHistory();
      renderSettings();
      renderPreview();
      setStatus('Загружена версия rev ' + rev + ' — проверьте и сохраните', 'dirty');
    } catch (e) {
      setStatus('Ошибка загрузки версии', 'error');
    }
  }
  // --- Phase B: EN auto-sync on Save ---
  // A localized value-object enters `enStale` when its RU is edited, and
  // `enManual` when its EN is hand-edited (sticky → protected from auto-translate;
  // the per-field RU→EN button is the escape hatch). On Save, stale-and-not-manual
  // fields get re-translated RU→EN before persisting.
  function markEdited(obj, L) {
    if (!isLoc(obj)) return;
    if (L === 'ru') enStale.add(obj);
    else if (L === 'en') { enManual.add(obj); enStale.delete(obj); }
  }
  async function syncStaleEn() {
    const targets = [...enStale].filter((o) => isLoc(o) && !enManual.has(o) && String(o.ru || '').trim());
    enStale.clear();
    if (!targets.length) return 0;
    setStatus('Синхронизация EN (' + targets.length + ')…', 'saving');
    let done = 0;
    for (const o of targets) {
      try {
        const r = await fetch(API + '/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: o.ru }) });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.translation != null && !res.error) { o.en = res.translation; done++; }
      } catch (e) { /* keep saving even if a translate call fails */ }
    }
    return done;
  }
  function toggleDrawer(open) {
    const d = $('#drawer'), s = $('#scrim');
    const show = open == null ? d.hidden : open;
    d.hidden = !show;
    d.setAttribute('aria-hidden', String(!show));
    s.hidden = !show;
  }

  async function loadSyncNote() {
    const node = $('#sync-note');
    if (!node) return;
    try {
      const r = await fetch(API + '/subscribers');
      const data = await r.json();
      const s = data.subscribers;
      if (s) {
        const d = s.updatedAt ? new Date(s.updatedAt).toLocaleString('ru-RU') : '—';
        node.textContent = `SocialBot: TG ${s.telegram} · LI ${s.linkedin} · YT ${s.youtube} · ${d}`;
      } else {
        node.textContent = 'SocialBot: нет данных';
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Shared so the shortcuts work whether focus is in the editor chrome or the
  // iframe (each document fires keydown in its own context).
  function handleHotkeys(e) {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 's') { e.preventDefault(); save(); }
    else if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (e.key === 'Escape') { if ($('#ed-modal-scrim')) closeModal(); else if (!$('#drawer').hidden) toggleDrawer(false); }
  }

  // Keep Tab focus inside the topmost open chrome surface (modal > drawer).
  // The inline-edit iframe is a separate document, so this never traps editing.
  function focusables(root) {
    return [...root.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )].filter((e) => e.offsetParent !== null);
  }
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const surface = $('#ed-modal-scrim') || (!$('#drawer').hidden ? $('#drawer') : null);
    if (!surface) return;
    const f = focusables(surface);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!surface.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function init() {
    document.addEventListener('keydown', trapFocus, true);
    $('#btn-save').addEventListener('click', save);
    $('#btn-settings').addEventListener('click', () => toggleDrawer());
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);
    $('#btn-revert').addEventListener('click', revertToSaved);
    $('#drawer-close').addEventListener('click', () => toggleDrawer(false));
    $('#scrim').addEventListener('click', () => toggleDrawer(false));
    $('#page-select').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === '__new_article__') { e.target.value = page; return createArticle(); }
      if (val === '__import_tme__') { e.target.value = page; return importArticle(); }
      if (dirty && !confirm('Несохранённые изменения пропадут. Сменить страницу?')) {
        e.target.value = page;
        return;
      }
      page = val;
      load();
    });
    document.addEventListener('keydown', handleHotkeys);
    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    populatePageSelect().then(load);
    loadSyncNote();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
