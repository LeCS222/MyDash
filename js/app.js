import { getWidget, getAllWidgets } from './registry.js';
import { applyTheme, initThemePicker, normalizeTheme } from './themes.js';
import { initLayoutDrag } from './layout.js';
import { initBackupControls } from './backup.js';
import { isValidConfig } from './config-utils.js';
import { showMessageBanner } from './banner.js';
import * as storage from './storage.js';
import { STORAGE_KEYS } from './storage-keys.js';
import embeddedDefaultConfig from '../data/default-config.json' with { type: 'json' };

const EMBEDDED_DEFAULT_CONFIG = embeddedDefaultConfig;

function loadConfig(defaultConfig) {
  const saved = storage.get(STORAGE_KEYS.config, null);
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
  storage.set(STORAGE_KEYS.config, config);
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

  showMessageBanner({
    id: bannerId,
    message,
    role: 'status',
    onDismiss: () => keys.clear(),
  });
}

function showStorageWarning(key) {
  corruptedKeys.add(key);
  updateStorageBanner('read');
}

function showStorageWriteWarning(key) {
  writeFailedKeys.add(key);
  updateStorageBanner('write');
}

function clearBackgroundLayer() {
  for (const widget of getAllWidgets()) {
    if (widget.layout === 'background' && typeof widget.teardown === 'function') {
      widget.teardown();
    }
  }
  const bgHost = document.getElementById('page-background');
  if (bgHost) bgHost.replaceChildren();
}

/** Один слой #page-background — монтируется первый background-виджет из списка. */
function findBackgroundWidgetId(widgetIds) {
  return widgetIds.find((id) => {
    const widget = getWidget(id);
    return widget?.layout === 'background'
      && typeof widget.renderBackground === 'function';
  }) ?? null;
}

function mountBackgroundWidget(widgetIds, config) {
  const bgId = findBackgroundWidgetId(widgetIds);
  if (!bgId) return;

  const widget = getWidget(bgId);
  const bgHost = document.getElementById('page-background');
  if (!widget || !bgHost) return;

  widget.init(config);
  widget.renderBackground(bgHost);
}

function renderWidgetGrid(widgetIds, config) {
  const grid = document.getElementById('widget-grid');
  grid.replaceChildren();

  clearBackgroundLayer();
  mountBackgroundWidget(widgetIds, config);

  const backgroundWidgetId = findBackgroundWidgetId(widgetIds);

  for (const id of widgetIds) {
    const widget = getWidget(id);
    if (!widget) continue;

    if (id !== backgroundWidgetId) {
      widget.init(config);
    }

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

  initBackupControls(document.querySelector('.app-controls'));

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
