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
let visibilityHandler = null;
let lastOffsetMinute = -1;
let listEl = null;
let selectEl = null;
let addButton = null;
let rowRefs = [];

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone }).format(new Date());
    return true;
  } catch (err) {
    if (err instanceof RangeError) return false;
    throw err;
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

function getPartValue(parts, type) {
  return parts.find((part) => part.type === type)?.value ?? '00';
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

function toIsoInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return `${getPartValue(parts, 'year')}-${getPartValue(parts, 'month')}-${getPartValue(parts, 'day')}T${getPartValue(parts, 'hour')}:${getPartValue(parts, 'minute')}:${getPartValue(parts, 'second')}`;
}

function getTimeZoneNamePart(date, timeZone, timeZoneName) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    timeZoneName,
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName');
}

function formatOffsetFromParts(date, timeZone) {
  for (const style of ['shortOffset', 'longOffset', 'short']) {
    const part = getTimeZoneNamePart(date, timeZone, style);
    if (part?.value) return part.value.replace(/^GMT/, 'UTC');
  }
  return '';
}

function getWallClockParts(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
}

function wallClockToUtcMs(parts) {
  return Date.UTC(
    Number(getPartValue(parts, 'year')),
    Number(getPartValue(parts, 'month')) - 1,
    Number(getPartValue(parts, 'day')),
    Number(getPartValue(parts, 'hour')),
    Number(getPartValue(parts, 'minute')),
    Number(getPartValue(parts, 'second')),
  );
}

function formatOffsetMinutes(diffMin) {
  const sign = diffMin >= 0 ? '+' : '-';
  const abs = Math.abs(diffMin);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

function computeUtcOffsetLabel(date, timeZone) {
  const fromIntl = formatOffsetFromParts(date, timeZone);
  if (fromIntl) return fromIntl;

  const utcParts = getWallClockParts(date, 'UTC');
  const zoneParts = getWallClockParts(date, timeZone);
  let diffMin = (wallClockToUtcMs(zoneParts) - wallClockToUtcMs(utcParts)) / 60000;

  if (diffMin > 720) diffMin -= 1440;
  if (diffMin < -720) diffMin += 1440;

  return formatOffsetMinutes(diffMin);
}

function formatOffset(date, timeZone) {
  try {
    const shortOffset = getTimeZoneNamePart(date, timeZone, 'shortOffset');
    if (shortOffset?.value) return shortOffset.value.replace(/^GMT/, 'UTC');
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
  }

  return computeUtcOffsetLabel(date, timeZone);
}

function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

function startTimer(tick) {
  stopTimer();
  intervalId = setInterval(tick, 1000);
  visibilityHandler = () => {
    if (document.hidden) {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }
    if (intervalId === null) {
      tick();
      intervalId = setInterval(tick, 1000);
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

function tickTimes(now) {
  for (const row of rowRefs) {
    row.timeEl.textContent = formatTimeInZone(now, row.timeZone);
    row.timeEl.dateTime = toIsoInZone(now, row.timeZone);
  }
}

function tickOffsets(now) {
  const minuteKey = Math.floor(now.getTime() / 60000);
  if (minuteKey === lastOffsetMinute) return;
  lastOffsetMinute = minuteKey;
  for (const row of rowRefs) {
    row.offsetEl.textContent = formatOffset(now, row.timeZone);
  }
}

function refreshOffsets(now = new Date()) {
  lastOffsetMinute = -1;
  tickOffsets(now);
}

function tick() {
  const now = new Date();
  tickTimes(now);
  tickOffsets(now);
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

  const timeEl = document.createElement('time');
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

  init(_config) {
    const saved = storage.get(STORAGE_KEY, null);
    const normalized = normalizeState(saved);
    zones = normalized.zones;

    if (JSON.stringify(saved) !== JSON.stringify({ zones })) {
      save();
    }
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
      refreshOffsets();
      refreshSelect();
    });

    controls.appendChild(selectEl);
    controls.appendChild(addButton);

    root.appendChild(listEl);
    root.appendChild(controls);
    container.appendChild(root);

    renderList();
    refreshSelect();
    lastOffsetMinute = -1;
    tick();
    startTimer(tick);
  },
};
