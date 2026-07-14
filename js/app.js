import { getWidget } from './registry.js';
import { applyTheme, initThemePicker, normalizeTheme } from './themes.js';
import { initLayoutDrag } from './layout.js';
import * as storage from './storage.js';
import embeddedDefaultConfig from '../data/default-config.json' with { type: 'json' };

const EMBEDDED_DEFAULT_CONFIG = embeddedDefaultConfig;

function isValidConfig(data) {
  return Boolean(data && typeof data === 'object' && Array.isArray(data.widgets));
}

function loadConfig(defaultConfig) {
  const saved = storage.get('config', null);
  if (isValidConfig(saved)) return saved;
  if (saved && typeof saved === 'object') {
    return {
      widgets: defaultConfig.widgets ?? [],
      settings: saved.settings ?? defaultConfig.settings ?? {},
    };
  }
  return defaultConfig;
}

let currentConfig = null;

async function fetchDefaultConfig() {
  try {
    const response = await fetch('data/default-config.json');
    if (!response.ok) {
      return structuredClone(EMBEDDED_DEFAULT_CONFIG);
    }
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed?.widgets)) {
        throw new Error('Некорректный формат default-config.json');
      }
      return parsed;
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        throw new Error('Некорректный JSON в default-config.json');
      }
      throw parseErr;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('default-config')) {
      throw err;
    }
    return structuredClone(EMBEDDED_DEFAULT_CONFIG);
  }
}

function saveConfig(config) {
  storage.set('config', config);
}

// Adds widgets from default-config.json that are missing in the saved layout.
// Users cannot permanently remove newly shipped widgets by editing localStorage;
// removed ids reappear on next load until default-config no longer lists them.
function mergeWidgetsFromDefault(currentWidgets, defaultWidgets) {
  const current = (currentWidgets ?? []).filter((id) => getWidget(id));
  const defaultIds = (defaultWidgets ?? []).filter((id) => getWidget(id));
  const result = [...current];

  for (const id of defaultIds) {
    if (result.includes(id)) continue;

    const defaultIndex = defaultIds.indexOf(id);
    let insertAt = result.length;
    let hasPredecessor = false;

    for (let i = defaultIndex - 1; i >= 0; i -= 1) {
      const predecessor = defaultIds[i];
      const predecessorIndex = result.indexOf(predecessor);
      if (predecessorIndex !== -1) {
        insertAt = predecessorIndex + 1;
        hasPredecessor = true;
        break;
      }
    }

    if (!hasPredecessor) {
      for (let i = defaultIndex + 1; i < defaultIds.length; i += 1) {
        const successor = defaultIds[i];
        const successorIndex = result.indexOf(successor);
        if (successorIndex !== -1) {
          insertAt = successorIndex;
          break;
        }
      }
    }

    result.splice(insertAt, 0, id);
  }

  return result;
}

function dedupeWidgetIds(widgetIds) {
  const seen = new Set();
  const result = [];
  for (const id of widgetIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizeConfig(config, defaultConfig) {
  const before = JSON.stringify(config);

  config.settings = config.settings ?? {};
  config.settings.theme = normalizeTheme(config.settings.theme);
  config.widgets = dedupeWidgetIds(
    mergeWidgetsFromDefault(config.widgets, defaultConfig?.widgets),
  );

  return { config, changed: JSON.stringify(config) !== before };
}

const corruptedKeys = new Set();
const writeFailedKeys = new Set();

function updateStorageBanner(kind) {
  const isWrite = kind === 'write';
  const keys = isWrite ? writeFailedKeys : corruptedKeys;
  const bannerId = isWrite ? 'storage-write-warning' : 'storage-warning';
  const message = isWrite
    ? `Не удалось сохранить данные (${[...keys].join(', ')}). Изменения могут не сохраниться.`
    : `Не удалось прочитать сохранённые данные (${[...keys].join(', ')}). Используются значения по умолчанию.`;

  let banner = document.getElementById(bannerId);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = bannerId;
    banner.className = 'storage-warning';
    banner.setAttribute('role', 'status');

    const text = document.createElement('p');
    text.className = 'storage-warning-text';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'storage-warning-dismiss';
    dismiss.textContent = 'Закрыть';
    dismiss.setAttribute('aria-label', 'Закрыть предупреждение');
    dismiss.addEventListener('click', () => {
      keys.clear();
      banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(dismiss);
    document.getElementById('app').prepend(banner);
  }

  const text = banner.querySelector('.storage-warning-text');
  if (text) text.textContent = message;
}

function showStorageWarning(key) {
  corruptedKeys.add(key);
  updateStorageBanner('read');
}

function showStorageWriteWarning(key) {
  writeFailedKeys.add(key);
  updateStorageBanner('write');
}

function renderWidgetGrid(widgetIds, config) {
  const grid = document.getElementById('widget-grid');
  grid.replaceChildren();

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
      'Переместить виджет стрелками',
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
  grid.replaceChildren();
  const el = document.createElement('p');
  el.className = 'error-message';
  el.textContent = message;
  grid.appendChild(el);
}

async function main() {
  document.addEventListener('mydash-storage-corrupted', (event) => {
    const key = event.detail?.key;
    if (typeof key === 'string') showStorageWarning(key);
  });

  document.addEventListener('mydash-storage-write-failed', (event) => {
    const key = event.detail?.key;
    if (typeof key === 'string') showStorageWriteWarning(key);
  });

  try {
    const defaultConfig = await fetchDefaultConfig();
    const loaded = loadConfig(defaultConfig);
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
