/**
 * Single registry of localStorage logical keys (without the `mydash-` prefix).
 * When a widget adds a new storage key, register it here and classify it as
 * user data (backup export/import) or cache (cleared on import).
 */
export const STORAGE_PREFIX = 'mydash-';

export const STORAGE_KEYS = Object.freeze({
  config: 'config',
  notes: 'notes',
  todo: 'todo',
  pomodoro: 'pomodoro',
  habits: 'habits',
  worldClock: 'world-clock',
  dailyPhotoSettings: 'daily-photo-settings',
  dailyPhotoCache: 'daily-photo-cache',
  newsCache: 'news-cache',
  currency: 'currency',
  quotesRu: 'quotes-ru',
});

/** User settings/data included in backup export/import. */
export const USER_DATA_KEYS = Object.freeze([
  STORAGE_KEYS.config,
  STORAGE_KEYS.notes,
  STORAGE_KEYS.todo,
  STORAGE_KEYS.pomodoro,
  STORAGE_KEYS.habits,
  STORAGE_KEYS.worldClock,
  STORAGE_KEYS.dailyPhotoSettings,
]);

/** Transient API caches cleared after a successful import. */
export const CACHE_KEYS = Object.freeze([
  STORAGE_KEYS.dailyPhotoCache,
  STORAGE_KEYS.newsCache,
  STORAGE_KEYS.currency,
  STORAGE_KEYS.quotesRu,
]);
