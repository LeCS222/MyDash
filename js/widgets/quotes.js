import * as storage from '../storage.js';

const API_URL = 'https://dummyjson.com/quotes/random';
const TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
const STORAGE_KEY = 'quotes-ru';
const MAX_TRANSLATE_CHUNK = 450;

const ERROR_MESSAGES = {
  network: 'Сеть недоступна. Проверьте подключение.',
  fetch: 'Не удалось загрузить цитату. Попробуйте позже.',
  translate: 'Не удалось перевести цитату. Попробуйте позже.',
};

let cachedQuote = null;

export default {
  id: 'quotes',
  title: 'Цитаты',

  init() {
    const stored = storage.get(STORAGE_KEY, null);
    cachedQuote = isValidQuote(stored) ? stored : null;
  },

  render(container) {
    const quoteEl = document.createElement('blockquote');
    quoteEl.className = 'quotes-text';
    quoteEl.hidden = true;

    const quoteBodyEl = document.createElement('p');
    quoteBodyEl.className = 'quotes-body';

    const authorEl = document.createElement('cite');
    authorEl.className = 'quotes-author';

    quoteEl.appendChild(quoteBodyEl);
    quoteEl.appendChild(authorEl);

    const loadingEl = document.createElement('p');
    loadingEl.className = 'quotes-status quotes-loading';
    loadingEl.textContent = 'Загрузка…';
    loadingEl.setAttribute('aria-live', 'polite');
    loadingEl.hidden = true;

    const errorEl = document.createElement('p');
    errorEl.className = 'quotes-status quotes-error';
    errorEl.setAttribute('aria-live', 'polite');
    errorEl.hidden = true;

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'quotes-refresh';
    refreshBtn.textContent = 'Новая цитата';

    container.appendChild(quoteEl);
    container.appendChild(loadingEl);
    container.appendChild(errorEl);
    container.appendChild(refreshBtn);

    const els = { quoteEl, quoteBodyEl, authorEl, loadingEl, errorEl, refreshBtn };

    if (cachedQuote) {
      showQuote(els, cachedQuote);
    }

    refreshBtn.addEventListener('click', () => {
      loadQuote(els);
    });

    if (!cachedQuote) {
      loadQuote(els);
    }
  },
};

function isValidQuote(data) {
  return Boolean(
    data
    && typeof data.quote === 'string'
    && data.quote.trim()
    && typeof data.author === 'string'
    && data.author.trim(),
  );
}

class QuoteError extends Error {
  constructor(type) {
    super(type);
    this.type = type;
  }
}

function getErrorMessage(err) {
  if (err instanceof QuoteError && ERROR_MESSAGES[err.type]) {
    return ERROR_MESSAGES[err.type];
  }
  if (err instanceof TypeError) {
    return ERROR_MESSAGES.network;
  }
  return ERROR_MESSAGES.fetch;
}

async function fetchQuote() {
  let res;
  try {
    res = await fetch(API_URL);
  } catch {
    throw new QuoteError('network');
  }

  if (!res.ok) throw new QuoteError('fetch');

  const data = await res.json();
  if (!data?.quote || !data?.author) throw new QuoteError('fetch');

  const [quote, author] = await Promise.all([
    translateToRussian(data.quote),
    translateToRussian(data.author),
  ]);

  return { quote, author };
}

async function translateToRussian(text) {
  if (text.length <= MAX_TRANSLATE_CHUNK) {
    return translateChunk(text);
  }

  const chunks = splitIntoChunks(text, MAX_TRANSLATE_CHUNK);
  const translated = await Promise.all(chunks.map(translateChunk));
  return translated.join('');
}

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('. ', maxLen);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    else splitAt += 1;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function translateChunk(text) {
  let res;
  try {
    const url = `${TRANSLATE_URL}?q=${encodeURIComponent(text)}&langpair=en|ru`;
    res = await fetch(url);
  } catch {
    throw new QuoteError('network');
  }

  if (!res.ok) throw new QuoteError('translate');

  const data = await res.json();
  if (data.responseStatus !== 200 || data.quotaFinished) {
    throw new QuoteError('translate');
  }

  const translated = data.responseData?.translatedText;
  if (!translated || translated.includes('MYMEMORY WARNING')) {
    throw new QuoteError('translate');
  }

  return translated;
}

async function loadQuote(els) {
  els.loadingEl.hidden = false;
  els.errorEl.hidden = true;
  els.refreshBtn.disabled = true;

  if (!cachedQuote) {
    els.quoteEl.hidden = true;
  }

  try {
    const quote = await fetchQuote();
    cachedQuote = quote;
    storage.set(STORAGE_KEY, quote);
    showQuote(els, quote);
    els.errorEl.hidden = true;
  } catch (err) {
    els.errorEl.textContent = getErrorMessage(err);
    els.errorEl.hidden = false;
    if (!cachedQuote) {
      els.quoteEl.hidden = true;
    }
  } finally {
    els.loadingEl.hidden = true;
    els.refreshBtn.disabled = false;
  }
}

function showQuote(els, { quote, author }) {
  els.quoteBodyEl.textContent = quote;
  els.authorEl.textContent = `— ${author}`;
  els.quoteEl.hidden = false;
}
