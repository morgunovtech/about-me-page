(() => {
  const body = document.body;
  const themeButtons = Array.from(document.querySelectorAll('.theme-button'));
  const scrollTopButton = document.querySelector('.scroll-top');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dropdowns = Array.from(document.querySelectorAll('.nav-dropdown, .theme-dropdown'));
  const changelogToggle = document.querySelector('.changelog-toggle');
  const changelogPanel = document.getElementById('changelog-panel');
  const THEME_PREFERENCE_KEY = 'theme-preference';
  const COLLAB_URL = 'https://morgunov.craft.me/collab';

  const closeDropdowns = (except) => {
    dropdowns.forEach((dropdown) => {
      if (dropdown !== except) {
        dropdown.classList.remove('is-open');
        const toggle = dropdown.querySelector('.dropdown-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
    });
  };

  const setThemePressed = (value) => {
    themeButtons.forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.themeValue === value ? 'true' : 'false'));
  };

  const resolveTheme = (preference) => {
    if (preference === 'auto') {
      return prefersDark.matches ? 'dark' : 'light';
    }
    return preference;
  };

  const applyTheme = (preference) => {
    const resolved = resolveTheme(preference);
    body.dataset.themePreference = preference;
    body.setAttribute('data-theme', resolved);
    localStorage.setItem(THEME_PREFERENCE_KEY, preference);
    setThemePressed(preference);
  };

  const savedTheme = localStorage.getItem(THEME_PREFERENCE_KEY) || 'auto';
  applyTheme(savedTheme);

  const normalizeLegacyCollabLinks = () => {
    const legacyCollabSelector = 'a[href*="start.morgunov.tech/collab"]';
    document.querySelectorAll(legacyCollabSelector).forEach((link) => {
      link.href = COLLAB_URL;
    });
  };

  normalizeLegacyCollabLinks();

  dropdowns.forEach((dropdown) => {
    const toggle = dropdown.querySelector('.dropdown-toggle');
    const menu = dropdown.querySelector('.dropdown-menu');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    toggle?.addEventListener('click', () => {
      const isOpen = dropdown.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) closeDropdowns(dropdown);
    });
    menu?.addEventListener('click', (event) => {
      if (event.target.closest('a') || event.target.closest('button')) {
        dropdown.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
      }
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.nav-dropdown') && !event.target.closest('.theme-dropdown')) {
      closeDropdowns();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDropdowns();
  });

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

  if (changelogToggle && changelogPanel) {
    changelogToggle.addEventListener('click', () => {
      const isOpen = !changelogPanel.hasAttribute('hidden');
      const nextState = !isOpen;
      changelogPanel.hidden = !nextState;
      changelogToggle.setAttribute('aria-expanded', nextState ? 'true' : 'false');
    });
  }

  const updateScrollTopVisibility = () => {
    if (window.scrollY > 240) {
      scrollTopButton.classList.add('is-visible');
    } else {
      scrollTopButton.classList.remove('is-visible');
    }
  };

  scrollTopButton?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
  });

  window.addEventListener('scroll', updateScrollTopVisibility, { passive: true });
  updateScrollTopVisibility();
})();
