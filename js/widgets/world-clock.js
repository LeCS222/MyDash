import * as storage from '../storage.js';

const LOCALE = 'ru-RU';
const MOSCOW_ID = 'moscow';
const MAX_ZONES = 6;
const STORAGE_KEY = 'world-clock';

const PRESET_ZONES = [
  { id: 'moscow', label: 'Москва', timeZone: 'Europe/Moscow' },
  { id: 'london', label: 'Лондон', timeZone: 'Europe/London' },
  { id: 'berlin', label: 'Берлин', timeZone: 'Europe/Berlin' },
  { id: 'dubai', label: 'Дубай', timeZone: 'Asia/Dubai' },
  { id: 'tokyo', label: 'Токио', timeZone: 'Asia/Tokyo' },
  { id: 'new-york', label: 'Нью-Йорк', timeZone: 'America/New_York' },
  { id: 'los-angeles', label: 'Лос-Анджелес', timeZone: 'America/Los_Angeles' },
  { id: 'sydney', label: 'Сидней', timeZone: 'Australia/Sydney' },
];

const DEFAULT_ZONES = PRESET_ZONES.filter((zone) =>
  ['moscow', 'london', 'new-york'].includes(zone.id),
);

let zones = [];
let intervalId = null;
let listEl = null;
let selectEl = null;
let addButton = null;
let rowRefs = [];

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function normalizeZone(entry) {
  if (!entry?.id || !entry?.label || !isValidTimeZone(entry.timeZone)) {
    return null;
  }
  return {
    id: String(entry.id),
    label: String(entry.label),
    timeZone: entry.timeZone,
  };
}

function dedupeZones(currentZones) {
  const seen = new Set();
  const unique = [];
  for (const zone of currentZones) {
    if (seen.has(zone.id)) continue;
    seen.add(zone.id);
    unique.push(zone);
  }
  return unique;
}

function ensureMoscow(currentZones) {
  const trimmed = currentZones.slice(0, MAX_ZONES);
  if (trimmed.some((zone) => zone.id === MOSCOW_ID)) {
    return trimmed;
  }
  const moscow = PRESET_ZONES.find((zone) => zone.id === MOSCOW_ID);
  return [moscow, ...trimmed.slice(0, MAX_ZONES - 1)];
}

function normalizeState(raw) {
  const source = Array.isArray(raw?.zones) ? raw.zones : DEFAULT_ZONES;
  const valid = dedupeZones(source.map(normalizeZone).filter(Boolean));

  if (valid.length === 0) {
    return { zones: ensureMoscow([...DEFAULT_ZONES]) };
  }

  return { zones: ensureMoscow(valid) };
}

function save() {
  storage.set(STORAGE_KEY, { zones });
}

function getAvailablePresets(currentZones) {
  const used = new Set(currentZones.map((zone) => zone.id));
  return PRESET_ZONES.filter((preset) => !used.has(preset.id));
}

function formatTimeInZone(date, timeZone) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function getTimeZoneNamePart(date, timeZone, timeZoneName) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    timeZoneName,
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName');
}

function computeUtcOffsetLabel(date, timeZone) {
  const longOffset = getTimeZoneNamePart(date, timeZone, 'longOffset');
  if (longOffset?.value) {
    return longOffset.value.replace(/^GMT/, 'UTC');
  }

  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const localDate = new Date(date.toLocaleString('en-US', { timeZone }));
  const diffMin = (localDate - utcDate) / 60000;
  const sign = diffMin >= 0 ? '+' : '-';
  const abs = Math.abs(diffMin);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

function formatOffset(date, timeZone) {
  try {
    const shortOffset = getTimeZoneNamePart(date, timeZone, 'shortOffset');
    if (shortOffset?.value) return shortOffset.value;
  } catch {
    return computeUtcOffsetLabel(date, timeZone);
  }

  return computeUtcOffsetLabel(date, timeZone);
}

function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startTimer(tick) {
  stopTimer();
  intervalId = setInterval(tick, 1000);
}

function tick() {
  const now = new Date();
  for (const row of rowRefs) {
    row.timeEl.textContent = formatTimeInZone(now, row.timeZone);
    row.offsetEl.textContent = formatOffset(now, row.timeZone);
  }
}

function refreshSelect() {
  const available = getAvailablePresets(zones);
  selectEl.innerHTML = '';

  if (available.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Все города добавлены';
    selectEl.appendChild(option);
    selectEl.disabled = true;
    addButton.disabled = true;
    return;
  }

  const atLimit = zones.length >= MAX_ZONES;
  selectEl.disabled = atLimit;
  addButton.disabled = atLimit;

  if (atLimit) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Достигнут лимит городов';
    selectEl.appendChild(option);
    return;
  }

  for (const preset of available) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    selectEl.appendChild(option);
  }
}

function createRow(zone) {
  const row = document.createElement('li');
  row.className = 'world-clock-row';
  row.dataset.zoneId = zone.id;

  const cityEl = document.createElement('span');
  cityEl.className = 'world-clock-city';
  cityEl.textContent = zone.label;

  const timeWrap = document.createElement('span');
  timeWrap.className = 'world-clock-time-wrap';

  const timeEl = document.createElement('span');
  timeEl.className = 'world-clock-time';
  timeEl.setAttribute('aria-live', 'off');

  const offsetEl = document.createElement('span');
  offsetEl.className = 'world-clock-offset';

  timeWrap.appendChild(timeEl);
  timeWrap.appendChild(offsetEl);

  row.appendChild(cityEl);
  row.appendChild(timeWrap);

  if (zone.id !== MOSCOW_ID) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'world-clock-remove';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', `Удалить ${zone.label}`);
    removeButton.addEventListener('click', () => {
      zones = zones.filter((item) => item.id !== zone.id);
      rowRefs = rowRefs.filter((item) => item.id !== zone.id);
      row.remove();
      save();
      refreshSelect();
    });
    row.appendChild(removeButton);
  }

  rowRefs.push({ id: zone.id, timeZone: zone.timeZone, timeEl, offsetEl });
  return row;
}

function renderList() {
  listEl.innerHTML = '';
  rowRefs = [];
  for (const zone of zones) {
    listEl.appendChild(createRow(zone));
  }
}

export default {
  id: 'world-clock',
  title: 'Мировые часы',

  init() {
    const saved = storage.get(STORAGE_KEY, null);
    ({ zones } = normalizeState(saved));
  },

  render(container) {
    stopTimer();
    container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'world-clock';

    listEl = document.createElement('ul');
    listEl.className = 'world-clock-list';

    const controls = document.createElement('div');
    controls.className = 'world-clock-controls';

    selectEl = document.createElement('select');
    selectEl.className = 'world-clock-select';
    selectEl.setAttribute('aria-label', 'Выберите город');

    addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'world-clock-add';
    addButton.textContent = 'Добавить';
    addButton.addEventListener('click', () => {
      if (zones.length >= MAX_ZONES) return;

      const preset = PRESET_ZONES.find((item) => item.id === selectEl.value);
      if (!preset || zones.some((zone) => zone.id === preset.id)) return;

      zones.push({ ...preset });
      listEl.appendChild(createRow(preset));
      save();
      tick();
      refreshSelect();
    });

    controls.appendChild(selectEl);
    controls.appendChild(addButton);

    root.appendChild(listEl);
    root.appendChild(controls);
    container.appendChild(root);

    renderList();
    refreshSelect();
    tick();
    startTimer(tick);
  },
};
