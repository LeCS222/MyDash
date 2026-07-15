import * as storage from '../storage.js';
import { STORAGE_KEYS } from '../storage-keys.js';

const CACHE_KEY = STORAGE_KEYS.dailyPhotoCache;
const SETTINGS_KEY = STORAGE_KEYS.dailyPhotoSettings;
const DAY_CHECK_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const MOBILE_BREAKPOINT = 768;
const PICSUM_ATTRIBUTION = {
  author: 'Lorem Picsum',
  url: 'https://picsum.photos',
};

const DEFAULT_SETTINGS = {
  enabled: true,
  blur: 0,
  grayscale: false,
};

let cache = null;
let settings = null;
let bgHost = null;
let imgEl = null;
let previewEl = null;
let attributionEl = null;
let refreshBtn = null;
let statusEl = null;
let errorEl = null;
let cleanupFns = [];
let lastAppliedDimensions = null;

let isFetching = false;
let fetchGeneration = 0;
let swapGeneration = 0;

function getTodaySeed() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getImageDimensions() {
  const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
  return mobile
    ? { width: 960, height: 540 }
    : { width: 1920, height: 1080 };
}

function dimsEqual(a, b) {
  return a?.width === b?.width && a?.height === b?.height;
}

function normalizeBlur(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.blur;
  return Math.min(10, Math.max(0, Math.round(n)));
}

function buildImageUrl(date, currentSettings) {
  const { width, height } = getImageDimensions();
  const parts = [];
  if (currentSettings.blur > 0) parts.push(`blur=${currentSettings.blur}`);
  if (currentSettings.grayscale) parts.push('grayscale');
  const qs = parts.length ? `?${parts.join('&')}` : '';
  return `https://picsum.photos/seed/${encodeURIComponent(date)}/${width}/${height}${qs}`;
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const debouncedSyncBackground = debounce(() => {
  void syncBackground();
}, 250);

const debouncedPersistSettings = debounce(() => {
  storage.set(SETTINGS_KEY, settings);
}, 300);

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => resolve();
    probe.onerror = () => reject(new Error('image load failed'));
    probe.src = url;
  });
}

async function fetchPhotoInfo(date) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://picsum.photos/seed/${encodeURIComponent(date)}/info`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error('info fetch failed');
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('invalid info');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function setLoadingState(loading) {
  if (refreshBtn) refreshBtn.disabled = loading || isFetching;
  if (statusEl) {
    statusEl.hidden = !loading;
    statusEl.textContent = loading ? 'Загрузка…' : '';
  }
}

function showImageError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearImageError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function updateAttributionUI() {
  if (!attributionEl) return;

  const author = cache?.author ?? PICSUM_ATTRIBUTION.author;
  const url = cache?.authorUrl ?? PICSUM_ATTRIBUTION.url;

  attributionEl.replaceChildren();

  const text = document.createTextNode('Автор: ');
  const link = document.createElement('a');
  link.href = url;
  link.textContent = author;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  attributionEl.appendChild(text);
  attributionEl.appendChild(link);
}

function updatePreview(url) {
  if (!previewEl) return;
  previewEl.src = url;
  previewEl.hidden = false;
}

function hideBackground() {
  bgHost?.classList.add('page-background--hidden');
}

function showBackgroundHost() {
  bgHost?.classList.remove('page-background--hidden');
}

async function swapBackgroundImage(url) {
  if (!imgEl || !settings?.enabled) return;
  if (imgEl.dataset.currentSrc === url) return;

  const gen = ++swapGeneration;

  try {
    await preloadImage(url);
  } catch {
    if (gen === swapGeneration) {
      showImageError('Не удалось загрузить изображение');
    }
    return;
  }

  if (gen !== swapGeneration) return;
  if (!settings?.enabled || !imgEl) return;

  imgEl.src = url;
  imgEl.dataset.currentSrc = url;
  clearImageError();
  updatePreview(url);
}

async function fetchAndCacheInfo(today, { force = false } = {}) {
  if (!force && cache?.date === today) return;
  if (isFetching) return;

  isFetching = true;
  const generation = ++fetchGeneration;
  setLoadingState(true);

  try {
    const info = await fetchPhotoInfo(today);
    if (generation !== fetchGeneration) return;

    cache = {
      date: today,
      author: typeof info.author === 'string' ? info.author : PICSUM_ATTRIBUTION.author,
      authorUrl: typeof info.url === 'string' ? info.url : PICSUM_ATTRIBUTION.url,
    };
    storage.set(CACHE_KEY, cache);
    updateAttributionUI();
  } catch {
    if (generation !== fetchGeneration) return;

    if (cache?.date !== today) {
      cache = { date: today };
      storage.set(CACHE_KEY, cache);
    }
    updateAttributionUI();
    showImageError('Не удалось загрузить данные изображения. Используются значения по умолчанию.');
  } finally {
    if (generation === fetchGeneration) {
      isFetching = false;
      setLoadingState(false);
    }
  }
}

async function syncBackground({ forceInfo = false } = {}) {
  const today = getTodaySeed();

  if (settings?.enabled || forceInfo) {
    await fetchAndCacheInfo(today, { force: forceInfo });
  }

  if (!settings?.enabled) {
    hideBackground();
    return;
  }

  showBackgroundHost();
  await swapBackgroundImage(buildImageUrl(today, settings));
}

function teardown() {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];

  imgEl = null;
  bgHost = null;
  lastAppliedDimensions = null;

  isFetching = false;
  fetchGeneration += 1;
  swapGeneration += 1;
  setLoadingState(false);
}

function renderBackground(container) {
  teardown();
  container.replaceChildren();

  bgHost = container;

  imgEl = document.createElement('img');
  imgEl.className = 'daily-photo-image';
  imgEl.alt = '';
  imgEl.decoding = 'async';

  const overlay = document.createElement('div');
  overlay.className = 'daily-photo-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  container.appendChild(imgEl);
  container.appendChild(overlay);

  const onResize = debounce(() => {
    const dims = getImageDimensions();
    if (dimsEqual(dims, lastAppliedDimensions)) return;
    lastAppliedDimensions = dims;
    void syncBackground();
  }, 250);

  window.addEventListener('resize', onResize);
  cleanupFns.push(() => window.removeEventListener('resize', onResize));

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void syncBackground();
  };
  document.addEventListener('visibilitychange', onVisibility);
  cleanupFns.push(() => document.removeEventListener('visibilitychange', onVisibility));

  const intervalId = setInterval(() => {
    if (document.visibilityState === 'visible') void syncBackground();
  }, DAY_CHECK_MS);
  cleanupFns.push(() => clearInterval(intervalId));

  lastAppliedDimensions = getImageDimensions();

  if (!settings?.enabled) {
    hideBackground();
  }

  void syncBackground();
}

export default {
  id: 'daily-photo',
  title: 'Фото дня',
  layout: 'background',

  init() {
    const storedCache = storage.get(CACHE_KEY, null);
    cache = storedCache && typeof storedCache.date === 'string' ? storedCache : null;

    const storedSettings = storage.get(SETTINGS_KEY, null);
    settings = {
      enabled: storedSettings?.enabled ?? DEFAULT_SETTINGS.enabled,
      blur: normalizeBlur(storedSettings?.blur ?? DEFAULT_SETTINGS.blur),
      grayscale: storedSettings?.grayscale ?? DEFAULT_SETTINGS.grayscale,
    };
  },

  render(container) {
    container.replaceChildren();

    previewEl = document.createElement('img');
    previewEl.className = 'daily-photo-preview';
    previewEl.alt = 'Превью фото дня';
    previewEl.hidden = true;

    attributionEl = document.createElement('p');
    attributionEl.className = 'daily-photo-attribution';

    const controls = document.createElement('div');
    controls.className = 'daily-photo-controls';

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'daily-photo-toggle';

    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.checked = settings.enabled;

    const enabledText = document.createTextNode('Показывать фон');
    enabledLabel.appendChild(enabledCheckbox);
    enabledLabel.appendChild(enabledText);

    const blurLabel = document.createElement('label');
    blurLabel.className = 'daily-photo-blur-label';
    blurLabel.htmlFor = 'daily-photo-blur';

    const blurText = document.createTextNode('Размытие фона');
    blurLabel.appendChild(blurText);

    const blurInput = document.createElement('input');
    blurInput.type = 'range';
    blurInput.id = 'daily-photo-blur';
    blurInput.className = 'daily-photo-blur';
    blurInput.min = '0';
    blurInput.max = '10';
    blurInput.step = '1';
    blurInput.value = String(settings.blur);
    blurInput.setAttribute('aria-valuemin', '0');
    blurInput.setAttribute('aria-valuemax', '10');
    blurInput.setAttribute('aria-valuenow', String(settings.blur));
    blurInput.setAttribute('aria-label', 'Размытие фона, от 0 до 10');
    blurLabel.appendChild(blurInput);

    const grayscaleLabel = document.createElement('label');
    grayscaleLabel.className = 'daily-photo-grayscale';

    const grayscaleCheckbox = document.createElement('input');
    grayscaleCheckbox.type = 'checkbox';
    grayscaleCheckbox.checked = settings.grayscale;

    const grayscaleText = document.createTextNode('Чёрно-белый');
    grayscaleLabel.appendChild(grayscaleCheckbox);
    grayscaleLabel.appendChild(grayscaleText);

    controls.appendChild(enabledLabel);
    controls.appendChild(blurLabel);
    controls.appendChild(grayscaleLabel);

    statusEl = document.createElement('p');
    statusEl.className = 'daily-photo-status';
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.hidden = true;

    errorEl = document.createElement('p');
    errorEl.className = 'daily-photo-error';
    errorEl.setAttribute('aria-live', 'assertive');
    errorEl.hidden = true;

    refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'daily-photo-refresh';
    refreshBtn.textContent = 'Обновить данные';

    container.appendChild(previewEl);
    container.appendChild(attributionEl);
    container.appendChild(controls);
    container.appendChild(statusEl);
    container.appendChild(errorEl);
    container.appendChild(refreshBtn);

    updateAttributionUI();
    setLoadingState(isFetching);

    const today = getTodaySeed();
    if (settings.enabled && cache?.date === today) {
      const url = buildImageUrl(today, settings);
      updatePreview(url);
    }

    enabledCheckbox.addEventListener('change', () => {
      settings.enabled = enabledCheckbox.checked;
      storage.set(SETTINGS_KEY, settings);
      void syncBackground();
    });

    blurInput.addEventListener('input', () => {
      settings.blur = normalizeBlur(blurInput.value);
      blurInput.setAttribute('aria-valuenow', String(settings.blur));
      debouncedPersistSettings();
      debouncedSyncBackground();
    });

    grayscaleCheckbox.addEventListener('change', () => {
      settings.grayscale = grayscaleCheckbox.checked;
      storage.set(SETTINGS_KEY, settings);
      void syncBackground();
    });

    refreshBtn.addEventListener('click', () => {
      if (isFetching) {
        setLoadingState(true);
        return;
      }
      void syncBackground({ forceInfo: true });
    });
  },

  renderBackground,
  teardown,
};
