(() => {
  const root = document.documentElement;
  const body = document.body;

  /* For anyone who opens DevTools — no CTA, just a hello. */
  const greeting = root.lang === 'en'
    ? 'Hi. No analytics, no cookies, no trackers — feel free to look around.'
    : 'Привет. Тут нет аналитики, кук и трекеров — спокойно осмотрись.';
  console.log(
    '%c' + greeting,
    'font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif; color: #d9531e; padding: 8px 0;'
  );

  const themeButtons = Array.from(document.querySelectorAll('.v4-theme-btn'));
  const scrollTopButton = document.querySelector('.v4-scroll-top');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const themeDropdown = document.querySelector('.v4-theme');
  const themeToggle = themeDropdown?.querySelector('.v4-icon-btn');
  const themeMenu = themeDropdown?.querySelector('.v4-theme-menu');
  const THEME_PREFERENCE_KEY = 'theme-preference';

  /* localStorage access itself throws (SecurityError) when storage is
     blocked — Chrome/Firefox «block all cookies», some embedded webviews.
     The preference then simply doesn't persist; the page keeps working. */
  const storage = {
    get() {
      try { return localStorage.getItem(THEME_PREFERENCE_KEY); } catch (e) { return null; }
    },
    set(value) {
      try { localStorage.setItem(THEME_PREFERENCE_KEY, value); } catch (e) { /* not persisted */ }
    },
  };

  /* Safari ≤13 MediaQueryList implements addListener only — addEventListener
     throws there and would take the rest of the IIFE down with it. */
  const onMediaChange = (mql, handler) => {
    try { mql.addEventListener('change', handler); }
    catch (e) { if (mql.addListener) mql.addListener(handler); }
  };

  /* Browser-chrome colour follows the applied theme. The two static
     <meta name="theme-color"> tags cover `auto` via their media attributes;
     an explicit choice overrides both with the theme's background. */
  const THEME_COLORS = { light: '#edeae5', dark: '#14130f', 'high-contrast': '#000000' };
  const themeColorMetas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
  const syncThemeColorMeta = (preference, resolved) => {
    themeColorMetas.forEach((meta) => {
      const media = meta.getAttribute('media') || '';
      meta.setAttribute(
        'content',
        preference === 'auto'
          ? (media.indexOf('dark') !== -1 ? THEME_COLORS.dark : THEME_COLORS.light)
          : (THEME_COLORS[resolved] || THEME_COLORS.light)
      );
    });
  };

  /* Remove no-transition only after the async stylesheets have applied —
     they define the theme transitions, and enabling them earlier would
     animate every surface from its unstyled state on a cold cache. The
     guard rule itself is duplicated in the inline critical CSS, so it
     holds from the very first frame. */
  const enableTransitions = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        body.classList.remove('no-transition');
      });
    });
  };
  if (document.readyState === 'complete') {
    enableTransitions();
  } else {
    window.addEventListener('load', enableTransitions);
  }

  /* --- Theme --- */

  /* Menu items are role="menuitemradio" — the selected state is aria-checked
     (aria-pressed belongs to toggle buttons, not radio menu items). */
  const setThemeChecked = (value) => {
    themeButtons.forEach((btn) =>
      btn.setAttribute('aria-checked', btn.dataset.themeValue === value ? 'true' : 'false')
    );
  };

  const resolveTheme = (preference) => {
    if (preference === 'auto') return prefersDark.matches ? 'dark' : 'light';
    return preference;
  };

  const applyTheme = (preference) => {
    const resolved = resolveTheme(preference);
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-preference', preference);
    storage.set(preference);
    syncThemeColorMeta(preference, resolved);
    setThemeChecked(preference);
  };

  /* Inline script in <head> already applied the theme to <html>.
     Only sync aria-pressed state here, without redundant DOM/storage writes. */
  /* With storage blocked the explicit choice lives only in the DOM — the
     inline head script and applyTheme both stamp data-theme-preference on
     <html>, so it is the fallback source of truth after storage. */
  const currentPreference = () =>
    storage.get() || root.getAttribute('data-theme-preference') || 'auto';

  setThemeChecked(currentPreference());

  /* --- Theme dropdown wiring --- */

  const closeThemeMenu = () => {
    themeDropdown?.classList.remove('is-open');
    themeToggle?.setAttribute('aria-expanded', 'false');
  };

  if (themeToggle && themeMenu) {
    /* Safari/Firefox on macOS don't focus a <button> on mousedown — the
       press only BLURS the current focus, so the focusout handler below
       would close the menu before the click ever lands on the item.
       Suppressing the default mousedown focus transfer inside the dropdown
       keeps focus where it is; click still fires. */
    themeDropdown.addEventListener('mousedown', (event) => event.preventDefault());
    themeToggle.setAttribute('aria-expanded', 'false');
    themeToggle.addEventListener('click', (event) => {
      const isOpen = themeDropdown.classList.toggle('is-open');
      themeToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      /* Move focus to first item when opened via keyboard (Enter/Space).
         event.detail === 0 means a synthesised keyboard activation; pointer
         activation reports a positive click count. */
      if (isOpen && event.detail === 0) {
        themeMenu.querySelector('button, a')?.focus();
      }
    });
    themeMenu.addEventListener('click', (event) => {
      if (event.target.closest('a') || event.target.closest('button')) {
        closeThemeMenu();
        themeToggle.focus();
      }
    });
    /* Tab out of the open menu → close it. relatedTarget is the element
       receiving focus; null (e.g. focus left the document) also closes. */
    themeDropdown.addEventListener('focusout', (event) => {
      if (!themeDropdown.contains(event.relatedTarget)) {
        closeThemeMenu();
      }
    });
    themeMenu.addEventListener('keydown', (event) => {
      const items = Array.from(themeMenu.querySelectorAll('button, a'));
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(i + 1 + items.length) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(i - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.v4-theme')) {
      closeThemeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    /* Only restore focus to the toggle if focus was inside the menu — otherwise
       Escape on the page background shouldn't yank focus around. */
    const focusInsideMenu = themeDropdown && themeDropdown.contains(document.activeElement);
    closeThemeMenu();
    if (focusInsideMenu) themeToggle?.focus();
  });

  /* --- Theme buttons --- */

  themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.themeValue);
    });
  });

  /* Default preference is `auto` even when nothing is stored yet — a visitor
     who never touched the switcher must still follow OS theme changes. */
  onMediaChange(prefersDark, () => {
    if (currentPreference() === 'auto') {
      applyTheme('auto');
    }
  });

  /* Theme changed in another tab → storage event; page restored from
     bfcache → pageshow. Both re-apply so data-theme/aria stay fresh. */
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_PREFERENCE_KEY) applyTheme(event.newValue || 'auto');
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) applyTheme(currentPreference());
  });

  /* --- Anchor navigation (handles repeated clicks on same anchor) --- */

  const navLinks = Array.from(document.querySelectorAll('.v4-bar-mid a[href^="#"], .v4-section-nav a[href^="#"]'));

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        /* Native fragment navigation (suppressed by preventDefault) moves
           the sequential focus point to the target — replicate that so Tab
           continues from the section, not from the header link. Focus FIRST
           (preventScroll), then start the scroll: focusing after
           scrollIntoView cancels the smooth-scroll animation in Chrome. */
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        /* Read reduced-motion at click time — the preference can change
           mid-session (scroll-to-top below reads it the same way). */
        target.scrollIntoView({ behavior: prefersReducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
        /* Intentionally NOT writing the fragment to the URL: a hash sticks
           in the address bar and on next visit the browser auto-scrolls to
           that section. Anchor sharing still works for inbound links — the
           browser handles those on initial paint without our help. */
      }
    });
  });

  /* --- Scroll-to-top --- */

  const updateScrollTopVisibility = () => {
    if (!scrollTopButton) return;
    scrollTopButton.classList.toggle('is-visible', window.scrollY > 240);
  };

  scrollTopButton?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
  });

  /* --- Mobile scroll progress bar ---
     Hidden ≥961px via CSS — only paints on viewports where the sticky
     section-nav is gone. scaleX(ratio) stays on the compositor; a width
     write would force layout + paint on every scroll frame. */

  /* Gate on the INVERSE of the CSS hide query (min-width: 961px) so the two
     stay complementary at fractional widths (zoom/dPR can land between
     960 and 961px, where max-width: 960px would be false while the bar is
     still visible). */
  const scrollProgress = document.querySelector('.v4-scroll-progress');
  const progressHidden = window.matchMedia('(min-width: 961px)');

  const updateScrollProgress = () => {
    if (!scrollProgress || progressHidden.matches) return;
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const ratio = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
    scrollProgress.style.transform = 'scaleX(' + ratio + ')';
  };

  /* Repaint once when the viewport crosses into the mobile range —
     otherwise the bar would be stale until the next scroll. */
  onMediaChange(progressHidden, updateScrollProgress);

  /* --- Sticky section nav (right column, scroll-spy) --- */

  const sectionNav = document.querySelector('.v4-section-nav');
  const sectionNavLinks = Array.from(document.querySelectorAll('.v4-section-nav a[href^="#"]'));
  const sectionNavTargets = sectionNavLinks.map((link) => document.querySelector(link.getAttribute('href')));

  const updateSectionNav = () => {
    if (!sectionNav) return;
    const sy = window.scrollY;
    const visible = sy > 300;
    sectionNav.classList.toggle('is-visible', visible);
    /* Active = the last section whose top edge is above the trigger line.
       Using getBoundingClientRect() + scrollY works regardless of any
       positioned ancestor (offsetTop is relative to the offsetParent, which
       is fragile if .v4-root ever gets position: relative). */
    const trigger = sy + 200;
    let activeIdx = -1;
    for (let i = 0; i < sectionNavTargets.length; i++) {
      const t = sectionNavTargets[i];
      if (!t) continue;
      const top = t.getBoundingClientRect().top + sy;
      if (top <= trigger) activeIdx = i;
    }
    sectionNavLinks.forEach((link, i) => {
      link.classList.toggle('is-active', i === activeIdx);
      if (i === activeIdx) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        updateScrollTopVisibility();
        updateSectionNav();
        updateScrollProgress();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }, { passive: true });

  updateScrollTopVisibility();
  updateSectionNav();
  updateScrollProgress();
})();
