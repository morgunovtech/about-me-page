(() => {
  const root = document.documentElement;
  const body = document.body;

  /* Browser scroll restoration default is 'auto' — it remembers scroll
     position across reloads and back/forward. Combined with anchor links
     that pushState a fragment, returning to the page would jump to the last
     visited section. We manage scroll explicitly instead. */
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

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

  /* Remove no-transition class after first paint to enable CSS transitions */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      body.classList.remove('no-transition');
    });
  });

  /* --- Theme --- */

  const setThemePressed = (value) => {
    themeButtons.forEach((btn) =>
      btn.setAttribute('aria-pressed', btn.dataset.themeValue === value ? 'true' : 'false')
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
    localStorage.setItem(THEME_PREFERENCE_KEY, preference);
    setThemePressed(preference);
  };

  /* Inline script in <head> already applied the theme to <html>.
     Only sync aria-pressed state here, without redundant DOM/storage writes. */
  const savedTheme = localStorage.getItem(THEME_PREFERENCE_KEY) || 'auto';
  setThemePressed(savedTheme);

  /* --- Theme dropdown wiring --- */

  const closeThemeMenu = () => {
    themeDropdown?.classList.remove('is-open');
    themeToggle?.setAttribute('aria-expanded', 'false');
  };

  if (themeToggle && themeMenu) {
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

  prefersDark.addEventListener('change', () => {
    if (localStorage.getItem(THEME_PREFERENCE_KEY) === 'auto') {
      applyTheme('auto');
    }
  });

  /* --- Anchor navigation (handles repeated clicks on same anchor) --- */

  const navLinks = Array.from(document.querySelectorAll('.v4-bar-mid a[href^="#"], .v4-section-nav a[href^="#"]'));
  const scrollBehavior = prefersReducedMotion.matches ? 'auto' : 'smooth';

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
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
     section-nav is gone. Width is scrollY / scrollable-height as a %. */

  const scrollProgress = document.querySelector('.v4-scroll-progress');

  const updateScrollProgress = () => {
    if (!scrollProgress) return;
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const ratio = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
    scrollProgress.style.width = (ratio * 100) + '%';
  };

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
