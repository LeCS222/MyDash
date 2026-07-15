import { STORAGE_PREFIX, STORAGE_KEYS } from './storage-keys.js';
import { VALID_THEMES } from './themes.js';

const CONFIG_KEY = STORAGE_KEYS.config;

let theme = 'light';
try {
  const raw = localStorage.getItem(STORAGE_PREFIX + CONFIG_KEY);
  if (raw) {
    const config = JSON.parse(raw);
    const saved = config.settings && config.settings.theme;
    if (typeof saved === 'string' && VALID_THEMES.includes(saved)) {
      theme = saved;
    }
  }
} catch {
  theme = 'light';
}
document.documentElement.classList.add(`theme-${theme}`);
