import * as storage from '../storage.js';

const API_URL = 'https://ok.surf/api/v1/cors/news-section';
const STORAGE_KEY = 'news-cache';
const HEADLINE_LIMIT = 6;
const CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_SECTION = 'Technology';

const NEWS_SECTIONS = [
  'Business',
  'Technology',
  'World',
  'Science',
  'Sports',
  'Entertainment',
  'Health',
  'US',
];

const ERROR_MESSAGES = {
  network: 'Сеть недоступна. Проверьте подключение.',
  fetch: 'Не удалось загрузить новости. Попробуйте позже.',
  parse: 'Не удалось обработать ответ сервера.',
};

const STATUS_TEXT = {
  loading: 'Загрузка…',
  empty: 'Нет новостей в этом разделе',
};

let cachedData = null;
let newsSection = DEFAULT_SECTION;
let activeAbortController = null;

function normalizeSection(section) {
  if (typeof section === 'string' && NEWS_SECTIONS.includes(section)) {
    return section;
  }
  return DEFAULT_SECTION;
}

function isValidCache(data, currentSection) {
  return Boolean(
    data
    && typeof data.section === 'string'
    && data.section === currentSection
    && typeof data.fetchedAt === 'number'
    && Array.isArray(data.items),
  );
}

function isCacheFresh(data) {
  return Date.now() - data.fetchedAt < CACHE_TTL_MS;
}

function isCacheUsable(data, currentSection) {
  return isValidCache(data, currentSection) && isCacheFresh(data);
}

function isValidHeadline(item) {
  if (
    !item
    || typeof item.title !== 'string'
    || !item.title.trim()
    || typeof item.link !== 'string'
    || !item.link.trim()
    || typeof item.source !== 'string'
    || !item.source.trim()
  ) {
    return false;
  }

  try {
    const url = new URL(item.link);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

class NewsError extends Error {
  constructor(type) {
    super(type);
    this.type = type;
  }
}

function getErrorMessage(err) {
  if (err instanceof NewsError && ERROR_MESSAGES[err.type]) {
    return ERROR_MESSAGES[err.type];
  }
  if (err instanceof TypeError) {
    return ERROR_MESSAGES.network;
  }
  return ERROR_MESSAGES.fetch;
}

function parseHeadlines(data, section) {
  const articles = data?.[section];
  if (!Array.isArray(articles)) {
    throw new NewsError('parse');
  }

  return articles
    .filter(isValidHeadline)
    .slice(0, HEADLINE_LIMIT)
    .map(({ title, link, source }) => ({ title, link, source }));
}

async function fetchNews(section, signal) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: [section] }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new NewsError('network');
  }

  if (!res.ok) throw new NewsError('fetch');

  let data;
  try {
    data = await res.json();
  } catch {
    throw new NewsError('fetch');
  }

  return parseHeadlines(data, section);
}

function setStatus(els, mode, text = '') {
  const { statusEl } = els;
  statusEl.className = 'news-status';

  if (mode === 'hidden') {
    statusEl.textContent = '';
    statusEl.hidden = true;
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.removeAttribute('role');
    return;
  }

  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.classList.add(`news-status--${mode}`);

  if (mode === 'error') {
    statusEl.setAttribute('aria-live', 'assertive');
    statusEl.setAttribute('role', 'alert');
  } else {
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.removeAttribute('role');
  }
}

function setLoading(els, isLoading) {
  els.refreshBtn.disabled = isLoading;
  if (isLoading) {
    els.refreshBtn.setAttribute('aria-busy', 'true');
  } else {
    els.refreshBtn.removeAttribute('aria-busy');
  }
}

function showHeadlines(els, items) {
  els.listEl.replaceChildren();

  for (const { title, link, source } of items) {
    const item = document.createElement('li');
    item.className = 'news-item';

    const linkEl = document.createElement('a');
    linkEl.className = 'news-link';
    linkEl.href = link;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.textContent = title;

    const sourceEl = document.createElement('span');
    sourceEl.className = 'news-source';
    sourceEl.textContent = source;

    item.appendChild(linkEl);
    item.appendChild(sourceEl);
    els.listEl.appendChild(item);
  }

  els.listEl.hidden = false;
}

function showEmpty(els) {
  els.listEl.replaceChildren();
  els.listEl.hidden = true;
  setStatus(els, 'empty', STATUS_TEXT.empty);
}

function applyCachedView(els, data) {
  if (data.items.length === 0) {
    showEmpty(els);
    return;
  }

  showHeadlines(els, data.items);
  setStatus(els, 'hidden');
}

async function loadHeadlines(els, section, { force = false } = {}) {
  if (!force && isCacheUsable(cachedData, section)) {
    applyCachedView(els, cachedData);
    return;
  }

  activeAbortController?.abort();
  activeAbortController = new AbortController();
  const { signal } = activeAbortController;

  setLoading(els, true);
  setStatus(els, 'loading', STATUS_TEXT.loading);

  if (!cachedData?.items?.length) {
    els.listEl.hidden = true;
  }

  try {
    const items = await fetchNews(section, signal);
    if (signal.aborted) return;

    cachedData = { section, fetchedAt: Date.now(), items };
    storage.set(STORAGE_KEY, cachedData);

    if (items.length === 0) {
      showEmpty(els);
      return;
    }

    showHeadlines(els, items);
    setStatus(els, 'hidden');
  } catch (err) {
    if (err.name === 'AbortError' || signal.aborted) return;

    setStatus(els, 'error', getErrorMessage(err));

    if (cachedData?.items?.length && cachedData.section === section) {
      showHeadlines(els, cachedData.items);
    } else {
      els.listEl.hidden = true;
    }
  } finally {
    if (!signal.aborted) {
      setLoading(els, false);
    }
  }
}

export default {
  id: 'news',
  title: 'Новости',

  init(config) {
    newsSection = normalizeSection(config?.settings?.newsSection);
    const stored = storage.get(STORAGE_KEY, null);
    cachedData = isValidCache(stored, newsSection) ? stored : null;
  },

  render(container) {
    container.replaceChildren();

    const listEl = document.createElement('ul');
    listEl.className = 'news-list';
    listEl.setAttribute('aria-label', 'Заголовки новостей');
    listEl.hidden = true;

    const statusEl = document.createElement('p');
    statusEl.className = 'news-status';
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.hidden = true;

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'news-refresh';
    refreshBtn.textContent = 'Обновить';

    container.appendChild(listEl);
    container.appendChild(statusEl);
    container.appendChild(refreshBtn);

    const els = { listEl, statusEl, refreshBtn };

    if (isCacheUsable(cachedData, newsSection)) {
      applyCachedView(els, cachedData);
    }

    refreshBtn.addEventListener('click', () => {
      loadHeadlines(els, newsSection, { force: true });
    });

    if (!isCacheUsable(cachedData, newsSection)) {
      loadHeadlines(els, newsSection);
    }
  },
};
