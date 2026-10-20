// Loaded in <head> so the saved theme applies before the popup first paints.
// The choice lives in localStorage because it is synchronous; chrome.storage
// would let the dark theme flash before a light choice arrived.
(() => {
  const KEY = 'theme';
  const systemLight = matchMedia('(prefers-color-scheme: light)');
  const saved = () => { const value = localStorage.getItem(KEY); return value === 'light' || value === 'dark' ? value : null; };
  const current = () => saved() || (systemLight.matches ? 'light' : 'dark');

  function apply() {
    const theme = current();
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      const active = button.dataset.themeChoice === theme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  apply();
  // Until the user picks a theme, follow the system setting.
  systemLight.addEventListener('change', () => { if (!saved()) apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => {
      localStorage.setItem(KEY, button.dataset.themeChoice);
      apply();
    }));
    apply();
  });
})();
