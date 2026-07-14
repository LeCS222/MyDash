import { getWidget } from './registry.js';
import { applyTheme, initThemePicker, normalizeTheme } from './themes.js';
import { initLayoutDrag } from './layout.js';

const CONFIG_KEY = 'mydash-config';

let currentConfig = null;

async function fetchDefaultConfig() {
  const response = await fetch('data/default-config.json');
  const text = await response.text();
  return JSON.parse(text);
}

async function loadConfig(defaultConfig) {
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  return defaultConfig;
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function normalizeConfig(config, defaultConfig) {
  const before = JSON.stringify(config);

  config.settings = config.settings ?? {};
  config.settings.theme = normalizeTheme(config.settings.theme);
  config.widgets = (config.widgets ?? []).filter((id) => getWidget(id));

  for (const id of defaultConfig?.widgets ?? []) {
    if (getWidget(id) && !config.widgets.includes(id)) {
      config.widgets.push(id);
    }
  }

  return { config, changed: JSON.stringify(config) !== before };
}

function renderWidgetGrid(widgetIds, config) {
  const grid = document.getElementById('widget-grid');
  grid.innerHTML = '';

  for (const id of widgetIds) {
    const widget = getWidget(id);
    if (!widget) continue;

    const card = document.createElement('article');
    card.className = 'widget-card';
    card.dataset.widgetId = id;

    const header = document.createElement('header');
    header.className = 'widget-header';

    const title = document.createElement('h2');
    title.className = 'widget-title';
    title.textContent = widget.title;

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'widget-drag-handle';
    handle.setAttribute(
      'aria-label',
      'Перемещение виджета: стрелки вверх, вниз, влево и вправо',
    );
    handle.textContent = '⠿';

    header.appendChild(title);
    header.appendChild(handle);

    const body = document.createElement('div');
    body.className = 'widget-body';

    card.appendChild(header);
    card.appendChild(body);
    grid.appendChild(card);

    widget.init(config);
    widget.render(body);
  }
}

function showError(message) {
  const grid = document.getElementById('widget-grid');
  grid.innerHTML = '';
  const el = document.createElement('p');
  el.className = 'error-message';
  el.textContent = message;
  grid.appendChild(el);
}

async function main() {
  try {
    const defaultConfig = await fetchDefaultConfig();
    const loaded = await loadConfig(defaultConfig);
    const { config, changed } = normalizeConfig(loaded, defaultConfig);
    currentConfig = config;

    if (changed) {
      saveConfig(currentConfig);
    }

    applyTheme(currentConfig.settings.theme);
    renderWidgetGrid(currentConfig.widgets, currentConfig);
    initThemePicker(currentConfig, saveConfig);

    const grid = document.getElementById('widget-grid');
    initLayoutDrag(grid, () => currentConfig, saveConfig);
  } catch (err) {
    const detail = err instanceof Error ? err.message : '';
    showError(
      detail
        ? `Не удалось загрузить конфиг: ${detail}`
        : 'Не удалось загрузить конфиг. Проверьте data/default-config.json',
    );
  }
}

main();
