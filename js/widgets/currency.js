import * as storage from '../storage.js';

const PAIRS = [
  { base: 'EUR', label: 'Евро' },
  { base: 'USD', label: 'Доллар' },
  { base: 'CNY', label: 'Юань' },
];
const QUOTE = 'RUB';
const API_BASE = 'https://api.frankfurter.dev/v2/rate';
const STORAGE_KEY = 'currency';
const CACHE_TTL_MS = 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ERROR_MESSAGES = {
  network: 'Сеть недоступна. Проверьте подключение.',
  fetch: 'Не удалось загрузить курсы. Попробуйте позже.',
};

let cachedData = null;

function isIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function formatRate(rate) {
  const decimals = rate >= 10 ? 2 : 4;
  return `${rate.toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ₽`;
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isValidCache(data) {
  if (
    !data
    || typeof data.date !== 'string'
    || !isIsoDate(data.date)
    || typeof data.fetchedAt !== 'number'
    || !Array.isArray(data.rates)
    || data.rates.length !== PAIRS.length
  ) {
    return false;
  }

  return PAIRS.every(({ base, label }) => data.rates.some(
    (item) => item.base === base
      && item.label === label
      && typeof item.rate === 'number',
  ));
}

function isCacheFresh(data) {
  return Date.now() - data.fetchedAt < CACHE_TTL_MS;
}

class CurrencyError extends Error {
  constructor(type) {
    super(type);
    this.type = type;
  }
}

function getErrorMessage(err) {
  if (err instanceof CurrencyError && ERROR_MESSAGES[err.type]) {
    return ERROR_MESSAGES[err.type];
  }
  if (err instanceof TypeError) {
    return ERROR_MESSAGES.network;
  }
  return ERROR_MESSAGES.fetch;
}

async function fetchPair(base, quote) {
  let res;
  try {
    res = await fetch(`${API_BASE}/${base}/${quote}`);
  } catch {
    throw new CurrencyError('network');
  }

  if (!res.ok) throw new CurrencyError('fetch');

  const data = await res.json();
  if (typeof data?.rate !== 'number' || !isIsoDate(data?.date)) {
    throw new CurrencyError('fetch');
  }

  return data;
}

async function fetchCurrencyRates() {
  const results = await Promise.all(
    PAIRS.map(({ base, label }) => fetchPair(base, QUOTE).then((data) => ({
      base,
      label,
      rate: data.rate,
      date: data.date,
    }))),
  );

  const dates = new Set(results.map((item) => item.date));
  if (dates.size !== 1) throw new CurrencyError('fetch');

  return {
    date: results[0].date,
    rates: results.map(({ base, label, rate }) => ({ base, label, rate })),
    fetchedAt: Date.now(),
  };
}

function showRates(els, data) {
  els.listEl.replaceChildren();

  for (const { label, rate } of data.rates) {
    const item = document.createElement('li');
    item.className = 'currency-item';

    const labelEl = document.createElement('span');
    labelEl.className = 'currency-label';
    labelEl.textContent = label;

    const rateEl = document.createElement('span');
    rateEl.className = 'currency-rate';
    rateEl.textContent = formatRate(rate);

    item.appendChild(labelEl);
    item.appendChild(rateEl);
    els.listEl.appendChild(item);
  }

  els.dateEl.textContent = `На ${formatDate(data.date)}`;
  els.listEl.hidden = false;
  els.dateEl.hidden = false;
}

async function loadRates(els) {
  els.loadingEl.hidden = false;
  els.errorEl.hidden = true;
  els.refreshBtn.disabled = true;

  if (!cachedData) {
    els.listEl.hidden = true;
    els.dateEl.hidden = true;
  }

  try {
    const data = await fetchCurrencyRates();
    cachedData = data;
    storage.set(STORAGE_KEY, data);
    showRates(els, data);
    els.errorEl.hidden = true;
  } catch (err) {
    els.errorEl.textContent = getErrorMessage(err);
    els.errorEl.hidden = false;
    if (!cachedData) {
      els.listEl.hidden = true;
      els.dateEl.hidden = true;
    }
  } finally {
    els.loadingEl.hidden = true;
    els.refreshBtn.disabled = false;
  }
}

export default {
  id: 'currency',
  title: 'Курсы валют',

  init() {
    const stored = storage.get(STORAGE_KEY, null);
    cachedData = isValidCache(stored) ? stored : null;
  },

  render(container) {
    const listEl = document.createElement('ul');
    listEl.className = 'currency-list';
    listEl.hidden = true;

    const dateEl = document.createElement('p');
    dateEl.className = 'currency-date';
    dateEl.hidden = true;

    const loadingEl = document.createElement('p');
    loadingEl.className = 'currency-status currency-loading';
    loadingEl.textContent = 'Загрузка…';
    loadingEl.setAttribute('aria-live', 'polite');
    loadingEl.hidden = true;

    const errorEl = document.createElement('p');
    errorEl.className = 'currency-status currency-error';
    errorEl.setAttribute('aria-live', 'assertive');
    errorEl.hidden = true;

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'currency-refresh';
    refreshBtn.textContent = 'Обновить';

    container.appendChild(listEl);
    container.appendChild(dateEl);
    container.appendChild(loadingEl);
    container.appendChild(errorEl);
    container.appendChild(refreshBtn);

    const els = { listEl, dateEl, loadingEl, errorEl, refreshBtn };

    if (cachedData) {
      showRates(els, cachedData);
    }

    refreshBtn.addEventListener('click', () => {
      loadRates(els);
    });

    if (!cachedData || !isCacheFresh(cachedData)) {
      loadRates(els);
    }
  },
};
