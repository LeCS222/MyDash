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

function describeWeather(code) {
  return WMO_DESCRIPTIONS[code] ?? 'Неизвестно';
}

let city = 'Moscow';
let activeRequest = 0;

function showLoading(container) {
  container.replaceChildren();
  const loadingEl = document.createElement('p');
  loadingEl.className = 'weather-loading';
  loadingEl.textContent = 'Загрузка…';
  container.appendChild(loadingEl);
}

function showWeather(container, data) {
  container.replaceChildren();

  const tempEl = document.createElement('div');
  tempEl.className = 'weather-temp';
  tempEl.textContent = `${Math.round(data.temperature)} °C`;

  const descEl = document.createElement('div');
  descEl.className = 'weather-desc';
  descEl.textContent = describeWeather(data.weatherCode);

  const cityEl = document.createElement('div');
  cityEl.className = 'weather-city';
  cityEl.textContent = data.cityName;

  container.appendChild(tempEl);
  container.appendChild(descEl);
  container.appendChild(cityEl);
}

function showError(container) {
  container.replaceChildren();
  const errorEl = document.createElement('p');
  errorEl.className = 'weather-error';
  errorEl.textContent = 'Не удалось загрузить погоду';
  container.appendChild(errorEl);
}

async function loadWeather(container, cityName, requestId) {
  try {
    const data = await fetchWeather(cityName);
    if (requestId !== activeRequest) return;
    showWeather(container, data);
  } catch {
    if (requestId !== activeRequest) return;
    showError(container);
  }
}

export default {
  id: 'weather',
  title: 'Погода',

  init(config) {
    city = config?.settings?.city ?? 'Moscow';
  },

  render(container) {
    const requestId = ++activeRequest;
    showLoading(container);
    loadWeather(container, city, requestId);
  },
};

async function fetchWeather(cityName) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=ru&format=json`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) throw new Error('Geocoding failed');

  const geoData = await geoRes.json();
  if (!geoData.results?.length) throw new Error('City not found');

  const { latitude, longitude, name } = geoData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`;
  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) throw new Error('Weather fetch failed');

  const weatherData = await weatherRes.json();

  return {
    temperature: weatherData.current.temperature_2m,
    weatherCode: weatherData.current.weather_code,
    cityName: name,
  };
}
