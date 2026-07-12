import { getWidget } from './registry.js';

const CONFIG_KEY = 'mydash-config';

let currentConfig = null;

async function loadConfig() {
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    return JSON.parse(saved);
  }

  const response = await fetch('data/default-config.json');
  const text = await response.text();
  return JSON.parse(text);
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function applyThemeToCards(theme) {
  const cards = document.querySelectorAll('.widget-card');
  cards.forEach((card) => {
    card.classList.remove('theme-light', 'theme-dark');
    card.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  });
}

function renderWidgetGrid(widgetIds, config) {
  const grid = document.getElementById('widget-grid');
  grid.innerHTML = '';

  const theme = config.settings?.theme ?? 'light';

  for (const id of widgetIds) {
    const widget = getWidget(id);
    if (!widget) continue;

    const card = document.createElement('article');
    card.className = 'widget-card';
    card.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');

    const title = document.createElement('h2');
    title.className = 'widget-title';
    title.textContent = widget.title;

    const body = document.createElement('div');
    body.className = 'widget-body';

    card.appendChild(title);
    card.appendChild(body);
    grid.appendChild(card);

    widget.init(config);
    widget.render(body);
  }
}

function initThemeToggle(config) {
  const toggle = document.getElementById('theme-toggle');

  function updateButton(theme) {
    toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  updateButton(config.settings?.theme ?? 'light');

  toggle.addEventListener('click', () => {
    const current = config.settings?.theme ?? 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    config.settings = config.settings ?? {};
    config.settings.theme = next;
    saveConfig(config);
    applyThemeToCards(next);
    updateButton(next);
  });
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
    currentConfig = await loadConfig();
    renderWidgetGrid(currentConfig.widgets, currentConfig);
    initThemeToggle(currentConfig);
  } catch {
    showError('Не удалось загрузить конфиг. Проверьте data/default-config.json');
  }
}

main();
