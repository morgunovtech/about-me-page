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
    [data-edit-item]:hover>.cms-tools{display:flex}
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
    .cms-bar{position:fixed;top:8px;left:50%;transform:translateX(-50%);display:none;gap:4px;z-index:9999;background:var(--v4-fg,#14110d);padding:4px;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,.28);align-items:center;flex-wrap:wrap;max-width:94vw}
    .cms-bar.on{display:flex}
    .cms-bar.kind-text .cms-md-only{display:none}
    .cms-sep{width:1px;align-self:stretch;background:rgba(255,255,255,.22);margin:0 2px}
    .cms-bar.kind-text .cms-sep{display:none}
    .cms-mdbtn{font:inherit;font-size:12px;font-weight:600;color:#fff;background:transparent;border:1px solid rgba(255,255,255,.3);padding:5px 11px;border-radius:3px;cursor:pointer;-webkit-user-select:none;user-select:none}
    .cms-mdbtn:hover{background:var(--v4-orange,#d9531e);border-color:var(--v4-orange,#d9531e);color:#14110d}
    .cms-mdbtn.cms-ai{font-weight:500;font-size:11px}
  `;

  let pendingEl = null, pendingPath = null, commitTimer = null;
  function flushPending() {
    if (pendingEl) commit(pendingEl, pendingPath);
  }

  async function renderPreview() {
    flushPending();
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
      frame.onload = () => res();
      frame.srcdoc = html;
    });
    fdoc = frame.contentDocument;
    instrument();
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
    container.appendChild(add);
  }

  // --- markdown leaves: light WYSIWYG (bold / links / paragraphs / lists) ---
  // Serialize edited HTML back to the markdown subset the site renders. NBSP is
  // preserved (only ASCII whitespace is collapsed) — the copy is full of "10 000".
  function serializeInline(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) {
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
  // AI actions (RU→EN / Причесать / Вычитать) for any localized leaf.
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
      mk('↗', 'Ссылка (пусто — убрать)', () => {
        const u = prompt('URL ссылки (пусто — убрать):');
        if (u === null) return;
        if (u === '') fdoc.execCommand('unlink');
        else fdoc.execCommand('createLink', false, u);
      }, 'cms-md-only'),
      sep,
      mk('RU→EN', 'Перевести это поле', aiTranslateLeaf, 'cms-ai'),
      mk('Причесать', 'Типографика', aiTidyLeaf, 'cms-ai'),
      mk('Вычитать', 'Проверить орфографию/пунктуацию', aiProofreadLeaf, 'cms-ai')
    );
    fdoc.body.appendChild(bar);
    try { fdoc.execCommand('styleWithCSS', false, false); } catch (e) { /* ignore */ }
    return bar;
  }
  function showBar(node, path, kind) {
    barLeaf = node; barPath = path; barKind = kind;
    ensureBar().className = 'cms-bar on' + (kind === 'text' ? ' kind-text' : '');
  }
  function hideBar() { const bar = fdoc.getElementById('cms-bar'); if (bar) bar.classList.remove('on'); }

  function attachMd(node) {
    const path = node.getAttribute('data-cms-md');
    const block = !!node.querySelector('p, ul, ol');
    node.classList.add('cms-edit');
    node.setAttribute('contenteditable', 'true');
    node.addEventListener('focus', () => { node.classList.add('cms-focus'); showBar(node, path, 'md'); });
    node.addEventListener('blur', () => { node.classList.remove('cms-focus'); hideBar(); commitMd(node, path, block); });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') node.blur();
      else if (e.key === 'Enter' && !block) { e.preventDefault(); node.blur(); }
    });
    flagLeaf(node, path);
  }
  function commitMd(node, path, block) {
    const next = htmlToMd(node, block);
    const [parent, key] = parentOf(path);
    const prev = parent && isLoc(parent[key]) ? (parent[key][lang] ?? '') : parent ? (parent[key] ?? '') : '';
    if (String(prev) === next) return;
    setLeaf(path, next);
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
        cur.en = en; markDirty(); updateEnEmpty();
        if (lang === 'en') applyToLeaf(leaf, kind, en);
        setStatus('EN обновлён', 'ok');
      });
    } catch (e) { setStatus('Перевод: ошибка сети', 'error'); }
  }
  function aiTidyLeaf() {
    const path = barPath, leaf = barLeaf, kind = barKind;
    if (!path) return;
    const [parent, key] = parentOf(path);
    const cur = parent && parent[key];
    const val = isLoc(cur) ? (cur[lang] || '') : (cur || '');
    if (!val.trim()) return setStatus('Пусто', 'error');
    const tidied = typography(val, lang);
    if (tidied === val) return setStatus('Уже причёсано', 'ok');
    openSuggestion('Причесать · ' + lang.toUpperCase(), tidied, null, () => {
      setLeaf(path, tidied); markDirty(); applyToLeaf(leaf, kind, tidied); setStatus('Применено', 'ok');
    });
  }
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
      if ((res.corrected || '') === val) return setStatus('Без правок', 'ok');
      openSuggestion('Вычитать · ' + lang.toUpperCase(), res.corrected, res.notes && res.notes.length ? res.notes : null, () => {
        setLeaf(path, res.corrected); markDirty(); applyToLeaf(leaf, kind, res.corrected); setStatus('Применено', 'ok');
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
    node.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSourceModal(path, 'html'); });
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
  function attachImage(node) {
    node.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openImageEditor(node); });
  }
  function openImageEditor(node) {
    const path = node.getAttribute('data-cms-img');
    const folder = path === 'hero.portrait' ? 'avatar' : 'media';
    let chosen = resolve(path) || '';
    closeModal();
    const scrim = el('div', 'ed-modal-scrim');
    scrim.id = 'ed-modal-scrim';
    const box = el('div', 'ed-modal');
    box.append(Object.assign(el('div', 'ed-modal-head'), { textContent: 'Изображение · ' + path }));
    const body = el('div', 'ed-modal-imgbody');
    const img = el('img', 'ed-img-preview');
    const setPrev = (src) => { if (src) { img.src = src; img.hidden = false; } else img.hidden = true; };
    setPrev(chosen || node.getAttribute('src') || '');
    const drop = el('div', 'ed-img-drop');
    drop.textContent = 'Перетащите картинку сюда или нажмите, чтобы выбрать';
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    const onFile = async (f) => { const p = await doUpload(f, folder); if (p) { chosen = p; setPrev(p); } };
    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { if (file.files[0]) onFile(file.files[0]); file.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
    body.append(img, drop, file);
    box.append(body);
    const ctrls = el('div', 'ed-modal-ctrls');
    const apply = el('button', 'primary');
    apply.textContent = 'Применить';
    apply.addEventListener('click', () => { setLeaf(path, chosen); markDirty(); closeModal(); renderPreview(); });
    const remove = el('button');
    remove.textContent = 'Убрать';
    remove.addEventListener('click', () => { setLeaf(path, ''); markDirty(); closeModal(); renderPreview(); });
    const cancel = el('button');
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', closeModal);
    ctrls.append(apply, remove, cancel);
    box.append(ctrls);
    scrim.append(box);
    document.body.append(scrim);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  }

  // --- load / save ---
  async function load() {
    setStatus('Загрузка…');
    try {
      const r = await fetch(API + '/content?page=' + encodeURIComponent(page));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      doc = await r.json();
      dirty = false;
      renderSettings();
      await renderPreview();
      setStatus('Загружено', 'ok');
    } catch (e) {
      setStatus('Ошибка загрузки: ' + e.message, 'error');
    }
  }

  async function save() {
    if (!doc) return;
    flushPending();
    setStatus('Сохранение…', 'saving');
    try {
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
        setStatus('Сохранено ✓ (rev ' + res.rev + ')', 'ok');
        renderSettings();
      } else {
        setStatus('Ошибка: ' + (res.error || r.status), 'error');
      }
    } catch (e) {
      setStatus('Ошибка сети: ' + e.message, 'error');
    }
  }

  // --- export / import ---
  function exportJson() {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = page + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importJson(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        doc = JSON.parse(fr.result);
        renderSettings();
        renderPreview();
        markDirty();
        setStatus('Импортировано (не сохранено)', 'dirty');
      } catch (e) {
        setStatus('Импорт: неверный JSON', 'error');
      }
    };
    fr.readAsText(file);
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
      if (!String(value.en || '').trim()) { applyVal('en', en, inputs, rows, value); setStatus('Переведено', 'ok'); }
      else { suggestBox(rows.en, en, (v) => applyVal('en', v, inputs, rows, value), ['EN уже заполнен — заменить?']); setStatus('Перевод готов — подтвердите', 'dirty'); }
    } catch (e) { setStatus('Перевод: ошибка сети', 'error'); }
  }
  function tidyField(value, inputs, rows) {
    let any = false;
    for (const L of LANGS) {
      const cur = value[L] || '';
      if (!cur.trim()) continue;
      const tidied = typography(cur, L);
      if (tidied !== cur) { any = true; suggestBox(rows[L], tidied, (v) => applyVal(L, v, inputs, rows, value), ['Типографика ' + L.toUpperCase()]); }
    }
    setStatus(any ? 'Проверьте типографику' : 'Уже причёсано', any ? 'dirty' : 'ok');
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
        if ((res.corrected || '') !== cur) { suggestBox(rows[L], res.corrected, (v) => applyVal(L, v, inputs, rows, value), res.notes && res.notes.length ? res.notes : ['Правки ' + L.toUpperCase()]); setStatus('Вычитка готова — проверьте', 'dirty'); }
        else setStatus('Вычитка ' + L.toUpperCase() + ': без правок', 'ok');
      } catch (e) { setStatus('Вычитка: ошибка сети', 'error'); }
    }
    if (!did) setStatus('Нет текста для вычитки', 'error');
  }
  // Markdown-safe deterministic typography (shown with confirm). NBSP via  .
  function typography(text, L) {
    const tokens = [];
    let s = String(text).replace(/\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/g, (m) => { tokens.push(m); return '' + (tokens.length - 1) + ''; });
    if (L === 'en') {
      s = s.replace(/(^|[\s(])"/g, '$1“').replace(/"/g, '”');
      s = s.replace(/(\w)'(\w)/g, '$1’$2');
      s = s.replace(/\.\.\./g, '…').replace(/ - /g, ' — ');
    } else {
      s = s.replace(/(^|[\s(])"/g, '$1«').replace(/"/g, '»');
      s = s.replace(/\.\.\./g, '…').replace(/ - /g, ' — ');
      s = s.replace(/(^|\s)(во|со|об|для|что|как|где|это|или|при|на|по|из|от|до|за|не|но|и|о|у|в|к|с|а|я)\s+/gi, (m, p1, p2) => p1 + p2 + ' ');
    }
    return s.replace(/(\d+)/g, (m, i) => tokens[+i]);
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
      inp.addEventListener('input', () => { value[L] = inp.value; flagEmpty(rows.en, value); markDirty(); updateEnEmpty(); });
      row.append(inp); box.append(row);
      inputs[L] = inp; rows[L] = row;
      if (L === 'en') flagEmpty(row, value);
    }
    const tools = el('div', 'f-loc-tools');
    tools.append(aiBtn('RU→EN', () => translateField(value, inputs, rows)), aiBtn('Причесать', () => tidyField(value, inputs, rows)), aiBtn('Вычитать', () => proofreadField(value, inputs, rows)));
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
  function blankLike(t) {
    if (t == null || typeof t === 'string') return '';
    if (typeof t === 'boolean') return false;
    if (typeof t === 'number') return 0;
    if (Array.isArray(t)) return [];
    const o = {}; for (const k of Object.keys(t)) o[k] = blankLike(t[k]); return o;
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
      box.append(ctrlBtn('+ добавить', () => { arr.push(blankLike(arr.length ? arr[arr.length - 1] : '')); markDirty(); render(); }, 'add'));
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
  function renderSettings() {
    const box = $('#settings');
    box.textContent = '';
    if (!doc) return;
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
    updateEnEmpty();
  }
  // Translate every empty-EN localized field (skips images).
  function collectEmptyEn(node, acc, key) {
    if (IMAGE_KEYS.has(key)) return;
    if (isLoc(node)) { if (String(node.ru || '').trim() && !String(node.en || '').trim()) acc.push(node); return; }
    if (Array.isArray(node)) node.forEach((n) => collectEmptyEn(n, acc, key));
    else if (node && typeof node === 'object') for (const k in node) collectEmptyEn(node[k], acc, k);
  }
  async function translateAllEmptyEn() {
    const acc = []; collectEmptyEn(doc, acc, '');
    if (!acc.length) return setStatus('Пустых EN нет', 'ok');
    setStatus('Перевод ' + acc.length + ' полей…', 'saving');
    let done = 0;
    for (const node of acc) {
      try {
        const r = await fetch(API + '/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: node.ru }) });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.translation != null && !res.error) { node.en = res.translation; done++; }
      } catch (e) { /* continue */ }
    }
    renderSettings(); markDirty(); renderPreview();
    setStatus('Переведено полей: ' + done + '/' + acc.length, done ? 'ok' : 'error');
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

  function setSeg(segId, key, val) {
    [...$('#' + segId).children].forEach((c) => c.classList.toggle('on', c.dataset[key] === val));
  }

  function init() {
    $('#btn-save').addEventListener('click', save);
    $('#btn-export').addEventListener('click', exportJson);
    $('#file-import').addEventListener('change', (e) => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
    $('#btn-settings').addEventListener('click', () => toggleDrawer());
    $('#drawer-close').addEventListener('click', () => toggleDrawer(false));
    $('#scrim').addEventListener('click', () => toggleDrawer(false));
    $('#btn-translate-en').addEventListener('click', translateAllEmptyEn);
    $('#page-select').addEventListener('change', (e) => {
      if (dirty && !confirm('Несохранённые изменения пропадут. Сменить страницу?')) {
        e.target.value = page;
        return;
      }
      page = e.target.value;
      load();
    });
    $('#lang-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      flushPending();
      lang = b.dataset.lang;
      setSeg('lang-seg', 'lang', lang);
      renderSettings();
      renderPreview();
    });
    $('#theme-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      theme = b.dataset.theme;
      setSeg('theme-seg', 'theme', theme);
      if (fdoc) fdoc.documentElement.setAttribute('data-theme', theme);
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        if ($('#ed-modal-scrim')) closeModal();
        else if (!$('#drawer').hidden) toggleDrawer(false);
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    load();
    loadSyncNote();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
