import * as storage from '../storage.js';
import { STORAGE_KEYS } from '../storage-keys.js';

const WMO_DESCRIPTIONS = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Изморозь',
  51: 'Слабая морось',
  53: 'Морось',
  55: 'Сильная морось',
  56: 'Ледяная морось',
  57: 'Сильная ледяная морось',
  61: 'Небольшой дождь',
  63: 'Дождь',
  65: 'Сильный дождь',
  66: 'Ледяной дождь',
  67: 'Сильный ледяной дождь',
  71: 'Небольшой снег',
  73: 'Снег',
  75: 'Сильный снег',
  77: 'Снежная крупа',
  80: 'Небольшой ливень',
  81: 'Ливень',
  82: 'Сильный ливень',
  85: 'Небольшой снегопад',
  86: 'Сильный снегопад',
  95: 'Гроза',
  96: 'Гроза с градом',
  99: 'Гроза с сильным градом',
};

const STORAGE_KEY = STORAGE_KEYS.weather;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CITY_MAX = 80;
const DEFAULT_CITY = 'Moscow';

const ERROR_MESSAGES = {
  network: 'Сеть недоступна. Проверьте подключение.',
  fetch: 'Не удалось загрузить погоду. Попробуйте позже.',
  notFound: 'Город не найден. Проверьте название.',
};

function describeWeather(code) {
  return WMO_DESCRIPTIONS[code] ?? 'Неизвестно';
}

let appConfig = null;
let city = DEFAULT_CITY;
let cachedData = null;
let activeRequest = 0;

class WeatherError extends Error {
  constructor(type) {
    super(type);
    this.type = type;
  }
}

function getErrorMessage(err) {
  if (err instanceof WeatherError && ERROR_MESSAGES[err.type]) {
    return ERROR_MESSAGES[err.type];
  }
  if (err instanceof TypeError) {
    return ERROR_MESSAGES.network;
  }
  return ERROR_MESSAGES.fetch;
}

function normalizeCity(value) {
  if (typeof value !== 'string') return DEFAULT_CITY;
  const trimmed = value.trim().slice(0, CITY_MAX);
  return trimmed || DEFAULT_CITY;
}

function isValidCache(data, currentCity) {
  if (
    !data
    || typeof data.city !== 'string'
    || data.city.toLowerCase() !== currentCity.toLowerCase()
    || typeof data.fetchedAt !== 'number'
    || typeof data.temperature !== 'number'
    || typeof data.weatherCode !== 'number'
    || typeof data.cityName !== 'string'
  ) {
    return false;
  }
  return true;
}

function isCacheFresh(data) {
  return Date.now() - data.fetchedAt < CACHE_TTL_MS;
}

function isCacheUsable(data, currentCity) {
  return isValidCache(data, currentCity) && isCacheFresh(data);
}

function saveCityToConfig(nextCity) {
  city = nextCity;
  if (!appConfig) return;
  appConfig.settings = appConfig.settings ?? {};
  appConfig.settings.city = city;
  storage.set(STORAGE_KEYS.config, appConfig);
}

function showWeather(els, data) {
  els.tempEl.textContent = `${Math.round(data.temperature)} °C`;
  els.descEl.textContent = describeWeather(data.weatherCode);
  els.cityEl.textContent = data.cityName;
  els.contentEl.hidden = false;
}

function setLoading(els, isLoading) {
  els.loadingEl.hidden = !isLoading;
  els.refreshBtn.disabled = isLoading;
  els.cityInput.disabled = isLoading;
  if (isLoading) {
    els.refreshBtn.setAttribute('aria-busy', 'true');
  } else {
    els.refreshBtn.removeAttribute('aria-busy');
  }
}

async function loadWeather(els, cityName, { force = false } = {}) {
  const normalizedCity = normalizeCity(cityName);

  if (!force && isCacheUsable(cachedData, normalizedCity)) {
    showWeather(els, cachedData);
    els.errorEl.hidden = true;
    return;
  }

  const requestId = ++activeRequest;
  setLoading(els, true);
  els.errorEl.hidden = true;

  if (!cachedData || !isValidCache(cachedData, normalizedCity)) {
    els.contentEl.hidden = true;
  }

  try {
    const data = await fetchWeather(normalizedCity);
    if (requestId !== activeRequest) return;

    cachedData = {
      city: normalizedCity,
      temperature: data.temperature,
      weatherCode: data.weatherCode,
      cityName: data.cityName,
      fetchedAt: Date.now(),
    };
    storage.set(STORAGE_KEY, cachedData);
    showWeather(els, cachedData);
    els.errorEl.hidden = true;
  } catch (err) {
    if (requestId !== activeRequest) return;

    els.errorEl.textContent = getErrorMessage(err);
    els.errorEl.hidden = false;

    if (isValidCache(cachedData, normalizedCity)) {
      showWeather(els, cachedData);
    } else {
      els.contentEl.hidden = true;
    }
  } finally {
    if (requestId === activeRequest) {
      setLoading(els, false);
    }
  }
}

export default {
  id: 'weather',
  title: 'Погода',

  init(config) {
    appConfig = config;
    city = normalizeCity(config?.settings?.city ?? DEFAULT_CITY);
    const stored = storage.get(STORAGE_KEY, null);
    cachedData = isValidCache(stored, city) ? stored : null;
  },

  render(container) {
    city = normalizeCity(appConfig?.settings?.city ?? city);
    container.replaceChildren();

    const form = document.createElement('form');
    form.className = 'weather-form';

    const cityLabel = document.createElement('label');
    cityLabel.className = 'weather-city-label';
    cityLabel.htmlFor = 'weather-city-input';
    cityLabel.textContent = 'Город';

    const cityInput = document.createElement('input');
    cityInput.type = 'text';
    cityInput.id = 'weather-city-input';
    cityInput.className = 'weather-city-input';
    cityInput.value = city;
    cityInput.maxLength = CITY_MAX;
    cityInput.setAttribute('aria-label', 'Город для прогноза погоды');

    form.appendChild(cityLabel);
    form.appendChild(cityInput);

    const contentEl = document.createElement('div');
    contentEl.className = 'weather-content';
    contentEl.hidden = true;

    const tempEl = document.createElement('div');
    tempEl.className = 'weather-temp';

    const descEl = document.createElement('div');
    descEl.className = 'weather-desc';

    const cityEl = document.createElement('div');
    cityEl.className = 'weather-city';

    contentEl.appendChild(tempEl);
    contentEl.appendChild(descEl);
    contentEl.appendChild(cityEl);

    const loadingEl = document.createElement('p');
    loadingEl.className = 'weather-status weather-loading';
    loadingEl.textContent = 'Загрузка…';
    loadingEl.setAttribute('aria-live', 'polite');
    loadingEl.hidden = true;

    const errorEl = document.createElement('p');
    errorEl.className = 'weather-status weather-error';
    errorEl.setAttribute('aria-live', 'assertive');
    errorEl.hidden = true;

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'weather-refresh';
    refreshBtn.textContent = 'Обновить';

    container.appendChild(form);
    container.appendChild(contentEl);
    container.appendChild(loadingEl);
    container.appendChild(errorEl);
    container.appendChild(refreshBtn);

    const els = {
      contentEl,
      tempEl,
      descEl,
      cityEl,
      loadingEl,
      errorEl,
      refreshBtn,
      cityInput,
    };

    const applyCity = () => {
      const nextCity = normalizeCity(cityInput.value);
      cityInput.value = nextCity;
      if (nextCity === city && isCacheUsable(cachedData, city)) {
        applyCachedView(els);
        return;
      }
      saveCityToConfig(nextCity);
      loadWeather(els, nextCity, { force: true });
    };

    function applyCachedView(localEls) {
      if (!isCacheUsable(cachedData, city)) return;
      showWeather(localEls, cachedData);
      localEls.errorEl.hidden = true;
    }

    if (isCacheUsable(cachedData, city)) {
      applyCachedView(els);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      applyCity();
    });

    refreshBtn.addEventListener('click', () => {
      loadWeather(els, city, { force: true });
    });

    if (!isCacheUsable(cachedData, city)) {
      loadWeather(els, city);
    }
  },
};

async function fetchWeather(cityName) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=ru&format=json`;

  let geoRes;
  try {
    geoRes = await fetch(geoUrl);
  } catch {
    throw new WeatherError('network');
  }

  if (!geoRes.ok) throw new WeatherError('fetch');

  let geoData;
  try {
    geoData = await geoRes.json();
  } catch {
    throw new WeatherError('fetch');
  }

  if (!geoData.results?.length) throw new WeatherError('notFound');

  const { latitude, longitude, name } = geoData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`;

  let weatherRes;
  try {
    weatherRes = await fetch(weatherUrl);
  } catch {
    throw new WeatherError('network');
  }

  if (!weatherRes.ok) throw new WeatherError('fetch');

  let weatherData;
  try {
    weatherData = await weatherRes.json();
  } catch {
    throw new WeatherError('fetch');
  }

  if (typeof weatherData?.current?.temperature_2m !== 'number') {
    throw new WeatherError('fetch');
  }

  return {
    temperature: weatherData.current.temperature_2m,
    weatherCode: weatherData.current.weather_code,
    cityName: name,
  };
}
