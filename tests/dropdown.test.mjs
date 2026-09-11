// The dropdown controller in script.js, driven through a deliberately tiny
// DOM: enough for the selectors script.js uses (class, attribute, :scope >,
// descendant, comma lists) plus focus/bubbling. Zero dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class Ev { constructor(type, init = {}) { Object.assign(this, { type, bubbles: true, defaultPrevented: false, detail: 0 }, init); } preventDefault() { this.defaultPrevented = true; } stopPropagation() { this._stop = true; } }
class KeyboardEvent extends Ev {}
class El {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.children = children; this.parentNode = null; this.listeners = {}; this.textContent = attrs.text || '';
    this.dataset = new Proxy({}, { get: (_, k) => this.attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())], set: (_, k, v) => { this.attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] = v; return true; } });
    for (const c of children) c.parentNode = this;
    const self = this;
    this.classList = { add: (c) => self._cls().add(c) && self._setCls(), remove: (c) => { self._cls().delete(c); self._setCls(); }, contains: (c) => self._cls().has(c), toggle: (c, f) => { const s = self._cls(); const on = f == null ? !s.has(c) : f; on ? s.add(c) : s.delete(c); self._setCls(); return on; } };
    this.style = {};
  }
  _cls() { return new Set((this.attrs.class || '').split(/\s+/).filter(Boolean)); }
  _setCls(s) { /* classList mutates via _cls copies — persist */ }
  get id() { return this.attrs.id || ''; }
  get lang() { return this.attrs.lang; } set lang(v) { this.attrs.lang = v; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return n in this.attrs; }
  removeAttribute(n) { delete this.attrs[n]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  closest(sel) { for (let x = this; x; x = x.parentNode) if (x.matches && x.matches(sel)) return x; return null; }
  matches(sel) { return sel.split(',').some((s) => matchCompound(this, s.trim())); }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(sel) { const out = []; for (const s of sel.split(',')) out.push(...select(this, s.trim())); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() { doc.activeElement = this; }
  getBoundingClientRect() { return { top: 0, height: 0 }; }
  scrollIntoView() {}
  dispatchEvent(ev) { ev.target = ev.target || this; for (let x = this; x; x = x.parentNode) { for (const fn of x.listeners[ev.type] || []) fn(ev); if (ev._stop || !ev.bubbles) break; } for (const fn of doc.listeners[ev.type] || []) if (!ev._stop) fn(ev); return !ev.defaultPrevented; }
}
// classList persistence: keep class string in sync
for (const m of ['add', 'remove', 'toggle']) { const orig = El.prototype; void orig; }
El.prototype._cls = function () { if (!this._set) this._set = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean)); return this._set; };
El.prototype._setCls = function () { this.attrs.class = [...this._cls()].join(' '); };

function matchSimple(el, s) {
  // tag / .class / [attr] / [attr="v"] / [attr^="v"] — possibly several concatenated
  let rest = s, ok = true;
  while (rest && ok) {
    let m;
    if ((m = rest.match(/^\.([\w-]+)/))) ok = el.classList.contains(m[1]);
    else if ((m = rest.match(/^#([\w-]+)/))) ok = el.attrs.id === m[1];
    else if ((m = rest.match(/^\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/))) { const v = el.getAttribute(m[1]); ok = m[2] == null ? v != null : m[2] === '=' ? v === m[3] : v != null && v.startsWith(m[3]); }
    else if ((m = rest.match(/^([a-z]+)/))) ok = el.tagName === m[1].toUpperCase();
    else return false;
    rest = rest.slice(m[0].length);
  }
  return ok;
}
function matchCompound(el, sel) { // "a b" (descendant) or "a > b"
  const parts = sel.split(/\s+/); const last = parts.pop();
  if (!matchSimple(el, last)) return false;
  if (!parts.length) return true;
  const comb = parts[parts.length - 1] === '>' ? '>' : ' ';
  const rest = (comb === '>' ? parts.slice(0, -1) : parts).join(' ');
  if (comb === '>') return el.parentNode && matchCompound(el.parentNode, rest);
  for (let x = el.parentNode; x; x = x.parentNode) if (matchCompound(x, rest)) return true;
  return false;
}
function select(root, sel) {
  if (sel.startsWith(':scope >')) { const s = sel.slice(8).trim(); return root.children.filter((c) => matchSimple(c, s)); }
  return [...root.walk()].filter((el) => matchCompound(el, sel));
}

// --- build the page: header with nav / lang / theme dropdowns ---
const el = (tag, attrs, children) => new El(tag, attrs, children);
const navToggle = el('button', { class: 'v4-bar-btn v4-nav-toggle', 'aria-controls': 'site-nav' });
const navLinks = [el('a', { href: '#about' }), el('a', { href: '#career' })];
const navPanel = el('div', { class: 'v4-bar-mid', id: 'site-nav' }, navLinks);
const nav = el('nav', { class: 'v4-nav v4-dropdown' }, [navToggle, navPanel]);
const langToggle = el('button', { class: 'v4-bar-btn v4-lang-btn', 'aria-haspopup': 'menu', 'aria-controls': 'lang-menu' });
const langItems = [el('a', { class: 'v4-menu-item v4-lang-link', role: 'menuitemradio', href: '/' }), el('a', { class: 'v4-menu-item v4-lang-link', role: 'menuitemradio', href: '/en/' })];
const langMenu = el('div', { class: 'v4-menu', id: 'lang-menu', role: 'menu' }, langItems);
const lang = el('div', { class: 'v4-dropdown v4-lang' }, [langToggle, langMenu]);
const themeToggle = el('button', { class: 'v4-icon-btn', 'aria-haspopup': 'menu', 'aria-controls': 'theme-menu' });
const themeItems = ['light', 'dark', 'auto', 'high-contrast'].map((v) => el('button', { class: 'v4-menu-item v4-theme-btn', role: 'menuitemradio', 'data-theme-value': v }));
const themeMenu = el('div', { class: 'v4-menu v4-theme-menu', id: 'theme-menu', role: 'menu' }, themeItems);
const theme = el('div', { class: 'v4-dropdown v4-theme' }, [themeToggle, themeMenu]);
const about = el('section', { id: 'about' });
const body = el('body', { class: 'v4-page no-transition' }, [el('header', { class: 'v4-bar' }, [nav, el('div', { class: 'v4-bar-right' }, [lang, theme])]), el('main', {}, [about])]);
const html = el('html', { lang: 'ru' }, [body]);
const doc = { documentElement: html, body, activeElement: body, listeners: {}, readyState: 'complete', title: '',
  addEventListener: (t, fn) => (doc.listeners[t] ||= []).push(fn),
  querySelector: (s) => html.querySelector(s), querySelectorAll: (s) => html.querySelectorAll(s),
  getElementById: (id) => [...html.walk()].find((e) => e.attrs.id === id) || null };
const media = {};
const mql = (q) => (media[q] ||= { matches: false, listeners: [], addEventListener(t, fn) { this.listeners.push(fn); }, fire() { this.listeners.forEach((f) => f()); } });
Object.assign(globalThis, { document: doc, KeyboardEvent, window: { matchMedia: mql, addEventListener() {}, scrollY: 0, scrollTo() {} },
  localStorage: { getItem: () => null, setItem() {} }, requestAnimationFrame: (f) => f(), console: { ...console, log() {} } });
await import('../script.js');

const click = (n, detail = 1) => n.dispatchEvent(new Ev('click', { target: n, detail }));
const key = (n, k) => n.dispatchEvent(new KeyboardEvent('keydown', { target: n, key: k }));
const isOpen = (d) => d.classList.contains('is-open');

test('stamps data-js and starts with every dropdown closed', () => {
  assert.ok(html.hasAttribute('data-js'));
  assert.equal(navToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(isOpen(nav) || isOpen(lang) || isOpen(theme), false);
});

test('pointer click opens, parks focus on the toggle, second click closes', () => {
  click(themeToggle);
  assert.ok(isOpen(theme)); assert.equal(themeToggle.getAttribute('aria-expanded'), 'true'); assert.equal(doc.activeElement, themeToggle);
  click(themeToggle); assert.equal(isOpen(theme), false);
});

test('only one dropdown open at a time; outside click closes', () => {
  click(themeToggle); click(langToggle);
  assert.equal(isOpen(theme), false); assert.ok(isOpen(lang));
  about.dispatchEvent(new Ev('click', { target: about }));
  assert.equal(isOpen(lang), false);
});

test('keyboard open focuses the first item; arrows wrap; Escape returns focus to the toggle', () => {
  click(langToggle, 0);
  assert.ok(isOpen(lang)); assert.equal(doc.activeElement, langItems[0]);
  key(langItems[0], 'ArrowUp'); assert.equal(doc.activeElement, langItems[1]);
  key(langItems[1], 'ArrowDown'); assert.equal(doc.activeElement, langItems[0]);
  key(langItems[0], 'End'); assert.equal(doc.activeElement, langItems[1]);
  doc.dispatchEvent = undefined;
  for (const fn of doc.listeners.keydown) fn(new KeyboardEvent('keydown', { key: 'Escape', target: langItems[1] }));
  assert.equal(isOpen(lang), false); assert.equal(doc.activeElement, langToggle);
});

test('mobile nav: a link click closes the panel without stealing focus from the section', () => {
  click(navToggle);
  assert.ok(isOpen(nav));
  navLinks[0].dispatchEvent(new Ev('click', { target: navLinks[0] }));
  assert.equal(isOpen(nav), false);
  assert.equal(doc.activeElement, about); // anchor handler focused the target section
  assert.equal(about.getAttribute('tabindex'), '-1');
});

test('crossing the 640px breakpoint closes an open panel', () => {
  click(navToggle); assert.ok(isOpen(nav));
  mql('(max-width: 640px)').fire();
  assert.equal(isOpen(nav), false); assert.equal(navToggle.getAttribute('aria-expanded'), 'false');
});

test('theme item click applies the theme and closes the menu', () => {
  click(themeToggle); click(themeItems[1]);
  assert.equal(html.getAttribute('data-theme'), 'dark'); assert.equal(isOpen(theme), false);
  assert.equal(themeItems[1].getAttribute('aria-checked'), 'true');
});
