export const THEMES = [
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
  { id: 'golden', label: 'Золотая' },
  { id: 'birch', label: 'Берёзовая' },
  { id: 'salad', label: 'Салатовая' },
];

export const VALID_THEMES = THEMES.map((t) => t.id);

export function normalizeTheme(theme) {
  return VALID_THEMES.includes(theme) ? theme : 'light';
}

export function applyTheme(themeId) {
  const root = document.documentElement;
  const theme = normalizeTheme(themeId);

  for (const id of VALID_THEMES) {
    root.classList.remove(`theme-${id}`);
  }
  root.classList.add(`theme-${theme}`);
}

export function initThemePicker(config, saveConfig) {
  const picker = document.querySelector('.theme-picker');
  if (!picker) return;

  picker.replaceChildren();
  for (const { id, label } of THEMES) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    picker.appendChild(option);
  }

  const current = normalizeTheme(config.settings?.theme ?? 'light');
  picker.value = current;

  picker.addEventListener('change', () => {
    config.settings = config.settings ?? {};
    config.settings.theme = normalizeTheme(picker.value);
    saveConfig(config);
    applyTheme(config.settings.theme);
  });
}
