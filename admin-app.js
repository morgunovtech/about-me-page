// Editor client. Renders an editable form from the content doc (no per-page
// schema — types are inferred), drives a live server-rendered preview, and
// saves to KV. Vanilla, no deps.
(() => {
  const API = '/admin/api';
  const LANGS = ['ru', 'en'];
  const HIDE_TOP = new Set(['site', 'page', 'rev', 'updatedAt', 'dateModified']);
  const MULTILINE = new Set([
    'prose', 'ctx', 'desc', 'note', 'personDescription', 'tagline', 'description', 'arc',
  ]);
  const LABELS = {
    meta: 'Мета', share: 'Карточка шаринга', seo: 'SEO', hero: 'Шапка', stats: 'Цифры', sections: 'Секции',
    title: 'Заголовок', description: 'Описание', eyebrow: 'Надзаголовок', name: 'Имя', tagline: 'Подзаголовок',
    portraitAlt: 'Alt портрета', ctas: 'Кнопки', label: 'Текст', href: 'Ссылка', primary: 'Основная кнопка',
    value: 'Значение', unit: 'Подпись', aside: 'Доп. строка', channels: 'Каналы',
    telegram: 'Telegram', linkedin: 'LinkedIn', youtube: 'YouTube', prose: 'Текст', items: 'Элементы',
    more: 'Ссылка «ещё»', period: 'Период', company: 'Компания', role: 'Роль', ctx: 'Контекст', current: 'Текущая роль',
    blocks: 'Блоки', cta: 'Кнопка', text: 'Текст', year: 'Год', arc: 'История', tag: 'Тег', version: 'Версия',
    live: 'Live', desc: 'Описание', kind: 'Тип', links: 'Ссылки', note: 'Заметка', num: '№', jobTitle: 'Должность',
    alternateName: 'Альт. имя', personDescription: 'Описание (SEO)', knowsAbout: 'Знает о', sameAs: 'Профили',
    worksFor: 'Работает в', occupationStartDate: 'Дата начала', addressLocality: 'Город', image: 'Картинка',
    imageAlt: 'Alt картинки', url: 'URL',
  };

  const IMAGE_KEYS = new Set(['image', 'portrait']);
  let doc = null;
  let page = 'home';
  let previewLang = 'ru';
  let previewMode = 'page';
  let dirty = false;
  let previewTimer = null;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };
  const labelOf = (k) => LABELS[k] || k;
  const isLoc = (v) =>
    v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).length && Object.keys(v).every((k) => k === 'ru' || k === 'en');

  function setStatus(text, kind) {
    const s = $('#status');
    s.textContent = text;
    s.className = 'ed-status' + (kind ? ' is-' + kind : '');
  }
  function markDirty() {
    dirty = true;
    setStatus('Есть несохранённые изменения', 'dirty');
    schedulePreview();
  }

  // --- controls ---
  function localizedInput(value, key) {
    const box = el('div', 'f-loc');
    const inputs = {};
    const rows = {};
    for (const lang of LANGS) {
      const row = el('div', 'f-loc-row');
      const tag = el('span', 'f-lang');
      tag.textContent = lang.toUpperCase();
      const multi = MULTILINE.has(key) || String(value[lang] || '').length > 60 || String(value[lang] || '').includes('\n');
      const inp = multi ? el('textarea', 'f-input') : el('input', 'f-input');
      if (!multi) inp.type = 'text';
      inp.value = value[lang] || '';
      inp.addEventListener('input', () => {
        value[lang] = inp.value;
        flagEmpty(rows.en, value);
        markDirty();
      });
      row.append(tag, inp);
      box.append(row);
      inputs[lang] = inp;
      rows[lang] = row;
      if (lang === 'en') flagEmpty(row, value);
    }
    const tools = el('div', 'f-loc-tools');
    tools.append(
      aiBtn('RU→EN', () => translateField(value, inputs, rows)),
      aiBtn('Причесать', () => tidyField(value, inputs, rows)),
      aiBtn('Вычитать', () => proofreadField(value, inputs, rows))
    );
    box.append(tools);
    return box;
  }

  function aiBtn(txt, fn) {
    const b = el('button', 'f-ai-btn');
    b.type = 'button';
    b.textContent = txt;
    b.addEventListener('click', fn);
    return b;
  }

  function applyVal(lang, v, inputs, rows, value) {
    inputs[lang].value = v;
    value[lang] = v;
    flagEmpty(rows.en, value);
    markDirty();
  }

  // Non-destructive suggestion: shows the proposed text + Применить/Отмена.
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
    ctrls.append(
      ctrlBtn('Применить', () => { onApply(suggested); box.remove(); }, 'add'),
      ctrlBtn('Отмена', () => box.remove())
    );
    box.append(ctrls);
    anchorRow.append(box);
  }

  async function translateField(value, inputs, rows) {
    const ru = value.ru || '';
    if (!ru.trim()) return setStatus('RU пусто — нечего переводить', 'error');
    setStatus('Перевод…', 'saving');
    try {
      const r = await fetch(API + '/translate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: ru }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || res.error) return setStatus('Перевод: ' + (res.error || r.status), 'error');
      const en = res.translation || '';
      if (!String(value.en || '').trim()) {
        applyVal('en', en, inputs, rows, value);
        setStatus('Переведено', 'ok');
      } else {
        suggestBox(rows.en, en, (v) => applyVal('en', v, inputs, rows, value), ['EN уже заполнен — заменить переводом?']);
        setStatus('Перевод готов — подтвердите замену', 'dirty');
      }
    } catch (e) {
      setStatus('Перевод: ошибка сети', 'error');
    }
  }

  function tidyField(value, inputs, rows) {
    let any = false;
    for (const lang of LANGS) {
      const cur = value[lang] || '';
      if (!cur.trim()) continue;
      const tidied = typography(cur, lang);
      if (tidied !== cur) {
        any = true;
        suggestBox(rows[lang], tidied, (v) => applyVal(lang, v, inputs, rows, value), ['Типографика ' + lang.toUpperCase()]);
      }
    }
    setStatus(any ? 'Проверьте типографику' : 'Уже причёсано', any ? 'dirty' : 'ok');
  }

  async function proofreadField(value, inputs, rows) {
    let did = false;
    for (const lang of LANGS) {
      const cur = value[lang] || '';
      if (!cur.trim()) continue;
      did = true;
      setStatus('Вычитка ' + lang.toUpperCase() + '…', 'saving');
      try {
        const r = await fetch(API + '/proofread', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: cur, lang }),
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok || res.error) { setStatus('Вычитка: ' + (res.error || r.status), 'error'); continue; }
        if ((res.corrected || '') !== cur) {
          suggestBox(rows[lang], res.corrected, (v) => applyVal(lang, v, inputs, rows, value), res.notes && res.notes.length ? res.notes : ['Правки ' + lang.toUpperCase()]);
          setStatus('Вычитка готова — проверьте', 'dirty');
        } else {
          setStatus('Вычитка ' + lang.toUpperCase() + ': без правок', 'ok');
        }
      } catch (e) {
        setStatus('Вычитка: ошибка сети', 'error');
      }
    }
    if (!did) setStatus('Нет текста для вычитки', 'error');
  }

  // Markdown-safe typography (deterministic; shown with confirm).
  function typography(text, lang) {
    const tokens = [];
    // protect markdown links/bold so rules never touch URLs or syntax
    let s = String(text).replace(/\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/g, (m) => {
      tokens.push(m);
      return '' + (tokens.length - 1) + '';
    });
    if (lang === 'en') {
      s = s.replace(/(^|[\s(])"/g, '$1“').replace(/"/g, '”');
      s = s.replace(/(\w)'(\w)/g, '$1’$2');
      s = s.replace(/\.\.\./g, '…');
      s = s.replace(/ - /g, ' — ');
    } else {
      s = s.replace(/(^|[\s(])"/g, '$1«').replace(/"/g, '»');
      s = s.replace(/\.\.\./g, '…');
      s = s.replace(/ - /g, ' — ');
      s = s.replace(/ — /g, ' — ');
      s = s.replace(/(^|\s)(во|со|об|для|что|как|где|это|или|при|на|по|из|от|до|за|не|но|и|о|у|в|к|с|а|я)\s+/gi, function (m, p1, p2) { return p1 + p2 + ' '; });
    }
    return s.replace(/(\d+)/g, function (m, i) { return tokens[+i]; });
  }

  function collectEmptyEn(node, acc, key) {
    if (IMAGE_KEYS.has(key)) return;
    if (isLoc(node)) {
      if (String(node.ru || '').trim() && !String(node.en || '').trim()) acc.push(node);
      return;
    }
    if (Array.isArray(node)) node.forEach((n) => collectEmptyEn(n, acc, key));
    else if (node && typeof node === 'object') for (const k in node) collectEmptyEn(node[k], acc, k);
  }

  async function translateAllEmptyEn() {
    const acc = [];
    collectEmptyEn(doc, acc, '');
    if (!acc.length) return setStatus('Пустых EN нет', 'ok');
    setStatus('Перевод ' + acc.length + ' полей…', 'saving');
    let done = 0;
    for (const node of acc) {
      try {
        const r = await fetch(API + '/translate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: node.ru }),
        });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.translation != null && !res.error) { node.en = res.translation; done++; }
      } catch (e) {
        /* continue */
      }
    }
    renderForm();
    markDirty();
    updatePreview();
    setStatus('Переведено полей: ' + done + '/' + acc.length, done ? 'ok' : 'error');
  }
  function flagEmpty(row, value) {
    const empty = !String(value.en || '').trim() && !!String(value.ru || '').trim();
    row.classList.toggle('is-empty', empty);
  }

  function scalarInput(obj, key) {
    const v = obj[key];
    if (typeof v === 'boolean') {
      const l = el('label', 'f-bool');
      const c = el('input');
      c.type = 'checkbox';
      c.checked = v;
      c.addEventListener('change', () => {
        obj[key] = c.checked;
        markDirty();
      });
      l.append(c, document.createTextNode(' ' + labelOf(key)));
      return l;
    }
    const multi = MULTILINE.has(key) || String(v || '').length > 60;
    const inp = multi ? el('textarea', 'f-input') : el('input', 'f-input');
    if (!multi) inp.type = 'text';
    inp.value = v == null ? '' : v;
    inp.addEventListener('input', () => {
      obj[key] = inp.value;
      markDirty();
    });
    return inp;
  }

  function blankLike(t) {
    if (t == null || typeof t === 'string') return '';
    if (typeof t === 'boolean') return false;
    if (typeof t === 'number') return 0;
    if (Array.isArray(t)) return [];
    const o = {};
    for (const k of Object.keys(t)) o[k] = blankLike(t[k]);
    return o;
  }

  function ctrlBtn(txt, fn, cls) {
    const b = el('button', 'f-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.textContent = txt;
    b.addEventListener('click', fn);
    return b;
  }

  // --- image upload widget ---
  async function doUpload(file, folder, set, refresh) {
    setStatus('Загрузка картинки…', 'saving');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    try {
      const r = await fetch(API + '/upload', { method: 'POST', body: fd });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        set(res.path);
        refresh();
        markDirty();
        setStatus('Картинка загружена', 'ok');
      } else {
        setStatus('Загрузка: ' + (res.error || r.status), 'error');
      }
    } catch (e) {
      setStatus('Загрузка: ошибка сети', 'error');
    }
  }

  function imageWidget(get, set, folder) {
    const box = el('div', 'f-img');
    const preview = el('div', 'f-img-preview');
    const path = el('div', 'f-img-path');
    const refresh = () => {
      const p = get();
      preview.textContent = '';
      if (p) {
        const img = el('img');
        img.src = p;
        preview.append(img);
      } else {
        preview.append(Object.assign(el('span', 'f-img-none'), { textContent: 'нет картинки' }));
      }
      path.textContent = p || '';
    };
    refresh();
    const right = el('div');
    const ctrls = el('div', 'f-img-ctrls');
    const fileInp = el('input');
    fileInp.type = 'file';
    fileInp.accept = 'image/*';
    fileInp.hidden = true;
    fileInp.addEventListener('change', async () => {
      if (fileInp.files[0]) await doUpload(fileInp.files[0], folder, set, refresh);
      fileInp.value = '';
    });
    ctrls.append(ctrlBtn('Загрузить…', () => fileInp.click()), ctrlBtn('✕', () => { set(''); refresh(); markDirty(); }, 'danger'), fileInp);
    right.append(ctrls, path);
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', async (e) => {
      e.preventDefault();
      box.classList.remove('drag');
      if (e.dataTransfer.files[0]) await doUpload(e.dataTransfer.files[0], folder, set, refresh);
    });
    box.append(preview, right);
    return box;
  }

  function imageField(obj, key) {
    const v = obj[key];
    const folder = key === 'portrait' ? 'avatar' : key === 'image' ? 'og' : 'media';
    const wrap = el('div', 'f-field');
    wrap.append(Object.assign(el('div', 'f-label'), { textContent: labelOf(key) }));
    if (isLoc(v)) {
      const box = el('div', 'f-loc');
      for (const lang of LANGS) {
        const row = el('div', 'f-loc-row');
        const tag = el('span', 'f-lang');
        tag.textContent = lang.toUpperCase();
        row.append(tag, imageWidget(() => v[lang] || '', (x) => { v[lang] = x; }, folder));
        box.append(row);
      }
      wrap.append(box);
    } else {
      wrap.append(imageWidget(() => obj[key] || '', (x) => { obj[key] = x; }, folder));
    }
    return wrap;
  }

  function listEditor(arr) {
    const box = el('div', 'f-list');
    const render = () => {
      box.textContent = '';
      arr.forEach((item, i) => {
        const card = el('div', 'f-item');
        const head = el('div', 'f-item-head');
        const n = el('span', 'f-item-n');
        n.textContent = '#' + (i + 1);
        const ctrls = el('div', 'f-item-ctrls');
        ctrls.append(
          ctrlBtn('↑', () => {
            if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); render(); }
          }),
          ctrlBtn('↓', () => {
            if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); render(); }
          }),
          ctrlBtn('✕', () => { arr.splice(i, 1); markDirty(); render(); updateEnEmpty(); }, 'danger')
        );
        head.append(n, ctrls);
        card.append(head);
        if (isLoc(item)) card.append(localizedInput(item));
        else if (item && typeof item === 'object') for (const k of Object.keys(item)) card.append(fieldRow(item, k));
        else card.append(scalarInput(arr, i));
        box.append(card);
      });
      box.append(ctrlBtn('+ добавить', () => {
        arr.push(blankLike(arr.length ? arr[arr.length - 1] : ''));
        markDirty();
        render();
      }, 'add'));
    };
    render();
    return box;
  }

  // control element for obj[key]
  function control(obj, key) {
    const v = obj[key];
    if (isLoc(v)) return localizedInput(v, key);
    if (Array.isArray(v)) return listEditor(v);
    if (v && typeof v === 'object') {
      const body = el('div', 'f-group-body');
      for (const k of Object.keys(v)) body.append(fieldRow(v, k));
      return body;
    }
    return scalarInput(obj, key);
  }

  // a labelled field; nested object/array → collapsible <details>
  function fieldRow(obj, key) {
    const v = obj[key];
    if (IMAGE_KEYS.has(key)) return imageField(obj, key);
    const collapsible = Array.isArray(v) || (v && typeof v === 'object' && !isLoc(v));
    if (collapsible) {
      const d = el('details', 'f-group');
      const s = el('summary');
      s.textContent = labelOf(key);
      if (Array.isArray(v)) {
        const c = el('span', 'f-count');
        c.textContent = ' (' + v.length + ')';
        s.append(c);
      }
      d.append(s);
      const body = el('div', 'f-group-body');
      body.append(control(obj, key));
      d.append(body);
      return d;
    }
    const wrap = el('div', 'f-field');
    if (typeof v !== 'boolean') wrap.append(Object.assign(el('div', 'f-label'), { textContent: labelOf(key) }));
    wrap.append(control(obj, key));
    return wrap;
  }

  function renderForm() {
    const root = $('#form');
    root.textContent = '';
    for (const k of Object.keys(doc)) {
      if (HIDE_TOP.has(k)) continue;
      const node = fieldRow(doc, k);
      if (node.tagName === 'DETAILS') node.open = true;
      root.append(node);
    }
    updateEnEmpty();
  }

  function updateEnEmpty() {
    // re-flag every localized row, then count
    $('#form').querySelectorAll('.f-loc').forEach(() => {});
    const count = $('#form').querySelectorAll('.f-loc-row.is-empty').length;
    const b = $('#en-empty');
    if (count) { b.hidden = false; b.textContent = 'EN пусто: ' + count; }
    else b.hidden = true;
  }

  // --- preview ---
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 400);
    updateEnEmpty();
  }
  function renderPreview() {
    if (previewMode === 'card') renderCard();
    else updatePreview();
  }
  function renderCard() {
    const c = $('#share-card');
    const s = doc && doc.share ? doc.share : {};
    const val = (o) => (o ? o[previewLang] || o.ru || '' : '');
    const img = val(s.image);
    c.textContent = '';
    const card = el('div', 'sc');
    if (img) {
      const im = el('img', 'sc-img');
      im.src = img;
      card.append(im);
    } else {
      card.append(Object.assign(el('div', 'sc-noimg'), { textContent: 'нет картинки' }));
    }
    const body = el('div', 'sc-body');
    body.append(Object.assign(el('div', 'sc-domain'), { textContent: 's.morgunov.tech' }));
    body.append(Object.assign(el('div', 'sc-title'), { textContent: val(s.title) }));
    body.append(Object.assign(el('div', 'sc-desc'), { textContent: val(s.description) }));
    card.append(body);
    c.append(card);
  }
  async function updatePreview() {
    try {
      const r = await fetch(API + '/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page, lang: previewLang, doc }),
      });
      $('#preview').srcdoc = await r.text();
    } catch (e) {
      /* preview is best-effort */
    }
  }

  // --- load / save ---
  async function load() {
    setStatus('Загрузка…');
    try {
      const r = await fetch(API + '/content?page=' + encodeURIComponent(page));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      doc = await r.json();
      renderForm();
      dirty = false;
      setStatus('Загружено');
      updatePreview();
    } catch (e) {
      setStatus('Ошибка загрузки: ' + e.message, 'error');
    }
  }
  async function loadSyncNote() {
    const el = $('#sync-note');
    if (!el) return;
    try {
      const r = await fetch(API + '/subscribers');
      const data = await r.json();
      const s = data.subscribers;
      if (s) {
        const d = s.updatedAt ? new Date(s.updatedAt).toLocaleString('ru-RU') : '—';
        el.textContent = `SocialBot: TG ${s.telegram} · LI ${s.linkedin} · YT ${s.youtube} · ${d}`;
      } else {
        el.textContent = 'SocialBot: нет данных';
      }
    } catch (e) {
      /* ignore */
    }
  }
  async function save() {
    if (!doc) return;
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
        renderForm();
        markDirty();
        updatePreview();
        setStatus('Импортировано (не сохранено)', 'dirty');
      } catch (e) {
        setStatus('Импорт: неверный JSON', 'error');
      }
    };
    fr.readAsText(file);
  }

  function init() {
    $('#btn-save').addEventListener('click', save);
    $('#btn-export').addEventListener('click', exportJson);
    $('#btn-translate-en').addEventListener('click', translateAllEmptyEn);
    $('#file-import').addEventListener('change', (e) => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
    $('#page-select').addEventListener('change', (e) => { page = e.target.value; load(); });
    $('#lang-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      previewLang = b.dataset.lang;
      [...e.currentTarget.children].forEach((c) => c.classList.toggle('on', c === b));
      renderPreview();
    });
    $('#mode-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      previewMode = b.dataset.mode;
      [...e.currentTarget.children].forEach((c) => c.classList.toggle('on', c === b));
      $('#preview').hidden = previewMode === 'card';
      $('#share-card').hidden = previewMode !== 'card';
      renderPreview();
    });
    $('#theme-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      localStorage.setItem('theme-preference', b.dataset.theme);
      [...e.currentTarget.children].forEach((c) => c.classList.toggle('on', c === b));
      updatePreview();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
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
