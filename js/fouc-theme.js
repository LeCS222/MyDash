(function () {
  // Keep in sync with js/storage-keys.js (STORAGE_PREFIX, STORAGE_KEYS.config).
  // Theme id is applied as-is for FOUC; js/themes.js normalizes invalid values after modules load.
  const PREFIX = 'mydash-';
  const CONFIG_KEY = 'config';

  let theme = 'light';
  try {
    const raw = localStorage.getItem(PREFIX + CONFIG_KEY);
    if (raw) {
      const config = JSON.parse(raw);
      const saved = config.settings && config.settings.theme;
      if (typeof saved === 'string' && /^[a-z0-9-]+$/i.test(saved)) {
        theme = saved;
      }
    }
  } catch {
    theme = 'light';
  }
  document.documentElement.classList.add('theme-' + theme);
})();
