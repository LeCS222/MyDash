import * as storage from '../storage.js';
import { STORAGE_KEYS } from '../storage-keys.js';

const OKSURF_API_URL = 'https://ok.surf/api/v1/cors/news-section';
const GOOGLE_NEWS_LOCALE = 'hl=ru&gl=RU&ceid=RU:ru';
const STORAGE_KEY = STORAGE_KEYS.newsCache;
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

const SECTION_TOPICS = {
  Business: 'BUSINESS',
  Technology: 'TECHNOLOGY',
  World: 'WORLD',
  Science: 'SCIENCE',
  Sports: 'SPORTS',
  Entertainment: 'ENTERTAINMENT',
  Health: 'HEALTH',
  US: 'NATION',
};

const SECTION_LABELS = {
  Business: 'Бизнес',
  Technology: 'Технологии',
  World: 'Мир',
  Science: 'Наука',
  Sports: 'Спорт',
  Entertainment: 'Развлечения',
  Health: 'Здоровье',
  US: 'США',
};

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
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

let appConfig = null;
let cachedData = null;
let newsSection = DEFAULT_SECTION;
let activeAbortController = null;

function normalizeSection(section) {
  if (typeof section === 'string' && NEWS_SECTIONS.includes(section)) {
    return section;
  }
  return DEFAULT_SECTION;
}

function saveSectionToConfig(section) {
  newsSection = section;
  if (!appConfig) return;
  appConfig.settings = appConfig.settings ?? {};
  appConfig.settings.newsSection = section;
  storage.set(STORAGE_KEYS.config, appConfig);
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

function parseHeadlinesFromJson(data, section) {
  const articles = data?.[section];
  if (!Array.isArray(articles)) {
    throw new NewsError('parse');
  }

  return articles
    .filter(isValidHeadline)
    .slice(0, HEADLINE_LIMIT)
    .map(({ title, link, source }) => ({ title, link, source }));
}

function parseHeadlinesFromRss(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new NewsError('parse');
  }

  const items = [...doc.querySelectorAll('item')];
  const headlines = [];

  for (const item of items) {
    const title = item.querySelector('title')?.textContent?.trim() ?? '';
    const link = item.querySelector('link')?.textContent?.trim() ?? '';
    const source = item.querySelector('source')?.textContent?.trim()
      ?? 'Google News';

    const parsed = { title, link, source };
    if (!isValidHeadline(parsed)) continue;
    headlines.push(parsed);
    if (headlines.length >= HEADLINE_LIMIT) break;
  }

  return headlines;
}

function buildGoogleNewsRssUrl(section) {
  const topic = SECTION_TOPICS[section] ?? SECTION_TOPICS[DEFAULT_SECTION];
  return `https://news.google.com/rss/headlines/section/topic/${topic}?${GOOGLE_NEWS_LOCALE}`;
}

async function fetchText(url, signal) {
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new NewsError('network');
  }

  if (!res.ok) throw new NewsError('fetch');
  return res.text();
}

async function fetchRssViaProxies(rssUrl, signal) {
  let lastError = new NewsError('fetch');

  for (const wrap of CORS_PROXIES) {
    try {
      const text = await fetchText(wrap(rssUrl), signal);
      if (text.trim()) return text;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
    }
  }

  throw lastError instanceof NewsError ? lastError : new NewsError('fetch');
}

async function fetchNewsFromRss(section, signal) {
  const rssUrl = buildGoogleNewsRssUrl(section);
  const xml = await fetchRssViaProxies(rssUrl, signal);
  return parseHeadlinesFromRss(xml);
}

async function fetchNewsFromOksurf(section, signal) {
  let res;
  try {
    res = await fetch(OKSURF_API_URL, {
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

  return parseHeadlinesFromJson(data, section);
}

async function fetchNews(section, signal) {
  try {
    return await fetchNewsFromRss(section, signal);
  } catch (rssErr) {
    if (rssErr.name === 'AbortError') throw rssErr;
    try {
      return await fetchNewsFromOksurf(section, signal);
    } catch (okErr) {
      if (okErr.name === 'AbortError') throw okErr;
      throw rssErr instanceof NewsError ? rssErr : okErr;
    }
  }
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
  els.sectionSelect.disabled = isLoading;
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
    appConfig = config;
    newsSection = normalizeSection(config?.settings?.newsSection);
    const stored = storage.get(STORAGE_KEY, null);
    cachedData = isValidCache(stored, newsSection) ? stored : null;
  },

  render(container) {
    newsSection = normalizeSection(appConfig?.settings?.newsSection ?? newsSection);
    container.replaceChildren();

    const controls = document.createElement('div');
    controls.className = 'news-controls';

    const sectionSelect = document.createElement('select');
    sectionSelect.className = 'news-section-select';
    sectionSelect.setAttribute('aria-label', 'Раздел новостей');

    for (const section of NEWS_SECTIONS) {
      const option = document.createElement('option');
      option.value = section;
      option.textContent = SECTION_LABELS[section] ?? section;
      sectionSelect.appendChild(option);
    }
    sectionSelect.value = newsSection;

    controls.appendChild(sectionSelect);

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

    container.appendChild(controls);
    container.appendChild(listEl);
    container.appendChild(statusEl);
    container.appendChild(refreshBtn);

    const els = { listEl, statusEl, refreshBtn, sectionSelect };

    if (isCacheUsable(cachedData, newsSection)) {
      applyCachedView(els, cachedData);
    }

    sectionSelect.addEventListener('change', () => {
      const nextSection = normalizeSection(sectionSelect.value);
      if (nextSection === newsSection) return;
      saveSectionToConfig(nextSection);
      loadHeadlines(els, newsSection, { force: true });
    });

    refreshBtn.addEventListener('click', () => {
      loadHeadlines(els, newsSection, { force: true });
    });

    if (!isCacheUsable(cachedData, newsSection)) {
      loadHeadlines(els, newsSection);
    }
  },
};
