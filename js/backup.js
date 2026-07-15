import * as storage from './storage.js';
import { USER_DATA_KEYS, CACHE_KEYS, STORAGE_KEYS } from './storage-keys.js';
import { isValidConfig } from './config-utils.js';
import { showMessageBanner } from './banner.js';
import {
  ISO_DATE_RE,
  WORK_SECONDS,
  BREAK_SECONDS,
  MAX_WORLD_CLOCK_ZONES,
} from './widget-limits.js';
import embeddedDefaultConfig from '../data/default-config.json' with { type: 'json' };

const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const MISSING = Symbol('missing');
const USER_DATA_KEY_SET = new Set(USER_DATA_KEYS);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidTodoEntry(item) {
  if (!isPlainObject(item)) return false;
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (!text) return false;
  if (typeof item.id !== 'string' || !item.id.length) return false;
  return typeof item.done === 'boolean';
}

function isValidTodoList(value) {
  return Array.isArray(value) && value.every(isValidTodoEntry);
}

function isValidHabitEntry(item) {
  if (!isPlainObject(item)) return false;
  if (typeof item.name !== 'string' || !item.name.trim()) return false;
  if (typeof item.id !== 'string' || !item.id.length) return false;
  if (!Array.isArray(item.dates)) return false;
  if (!item.dates.every((d) => typeof d === 'string' && ISO_DATE_RE.test(d))) {
    return false;
  }
  if (
    item.createdAt !== undefined
    && (typeof item.createdAt !== 'string' || !ISO_DATE_RE.test(item.createdAt))
  ) {
    return false;
  }
  return true;
}

function isValidHabitsList(value) {
  return Array.isArray(value) && value.every(isValidHabitEntry);
}

function isValidPomodoroState(value) {
  if (!isPlainObject(value)) return false;
  if (value.phase !== 'work' && value.phase !== 'break') return false;
  const max = value.phase === 'work' ? WORK_SECONDS : BREAK_SECONDS;
  if (!Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > max) {
    return false;
  }
  return Number.isInteger(value.completed) && value.completed >= 0;
}

function isValidDailyPhotoSettings(value) {
  if (!isPlainObject(value)) return false;
  if (typeof value.enabled !== 'boolean') return false;
  if (typeof value.grayscale !== 'boolean') return false;
  const blur = Number(value.blur);
  return Number.isFinite(blur) && blur >= 0 && blur <= 10;
}

function isValidWorldClockZone(zone) {
  if (!isPlainObject(zone)) return false;
  if (typeof zone.id !== 'string' || !zone.id.length) return false;
  if (typeof zone.label !== 'string' || !zone.label.length) return false;
  return typeof zone.timeZone === 'string' && zone.timeZone.length > 0;
}

function isValidWorldClockState(value) {
  if (!isPlainObject(value)) return false;
  if (!Array.isArray(value.zones) || value.zones.length === 0) return false;
  if (value.zones.length > MAX_WORLD_CLOCK_ZONES) return false;
  return value.zones.every(isValidWorldClockZone);
}

function isValidUserDataEntry(key, value) {
  switch (key) {
    case STORAGE_KEYS.config:
      return isValidConfig(value);
    case STORAGE_KEYS.notes:
      return typeof value === 'string';
    case STORAGE_KEYS.todo:
      return isValidTodoList(value);
    case STORAGE_KEYS.habits:
      return isValidHabitsList(value);
    case STORAGE_KEYS.pomodoro:
      return isValidPomodoroState(value);
    case STORAGE_KEYS.dailyPhotoSettings:
      return isValidDailyPhotoSettings(value);
    case STORAGE_KEYS.worldClock:
      return isValidWorldClockState(value);
    default:
      return false;
  }
}

function formatBackupFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `mydash-backup-${y}-${m}-${d}.json`;
}

export function buildBackup() {
  const data = {};
  for (const key of USER_DATA_KEYS) {
    const value = storage.get(key, null);
    if (value !== null) {
      data[key] = value;
    }
  }

  data[STORAGE_KEYS.config] = isValidConfig(data[STORAGE_KEYS.config])
    ? data[STORAGE_KEYS.config]
    : embeddedDefaultConfig;

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function downloadBackup() {
  try {
    const backup = buildBackup();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = formatBackupFilename();
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Upgrade backup payloads from older format versions to BACKUP_VERSION.
 * Add migration steps here when BACKUP_VERSION is bumped.
 * @param {object} parsed
 * @returns {{ ok: true, backup: object } | { ok: false, error: string }}
 */
function migrateBackup(parsed) {
  if (typeof parsed.version !== 'number' || !Number.isInteger(parsed.version) || parsed.version < 1) {
    return { ok: false, error: 'Некорректный файл бэкапа' };
  }

  if (parsed.version > BACKUP_VERSION) {
    return { ok: false, error: 'Файл бэкапа создан в более новой версии MyDash' };
  }

  const backup = {
    ...parsed,
    data: isPlainObject(parsed.data) ? { ...parsed.data } : parsed.data,
  };

  if (backup.version !== BACKUP_VERSION) {
    return { ok: false, error: 'Некорректный файл бэкапа' };
  }

  return { ok: true, backup };
}

/**
 * @param {string} text
 * @returns {{ ok: true, backup: object } | { ok: false, error: string }}
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Некорректный файл бэкапа' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Некорректный файл бэкапа' };
  }

  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return { ok: false, error: 'Некорректный файл бэкапа' };
  }

  const migrated = migrateBackup(parsed);
  if (!migrated.ok) return migrated;

  const { backup } = migrated;

  if (!Object.prototype.hasOwnProperty.call(backup.data, STORAGE_KEYS.config)) {
    return { ok: false, error: 'Некорректный файл бэкапа' };
  }

  if (!isValidConfig(backup.data[STORAGE_KEYS.config])) {
    return { ok: false, error: 'Некорректный файл бэкапа' };
  }

  for (const key of Object.keys(backup.data)) {
    if (!USER_DATA_KEY_SET.has(key)) {
      return { ok: false, error: 'Некорректный файл бэкапа' };
    }
  }

  for (const key of USER_DATA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(backup.data, key)) continue;
    if (!isValidUserDataEntry(key, backup.data[key])) {
      return { ok: false, error: 'Некорректный файл бэкапа' };
    }
  }

  return { ok: true, backup };
}

function snapshotKeys(keys) {
  const snapshot = {};
  for (const key of keys) {
    const value = storage.get(key, MISSING);
    snapshot[key] = value === MISSING
      ? { exists: false }
      : { exists: true, value };
  }
  return snapshot;
}

function restoreSnapshot(snapshot) {
  let ok = true;
  for (const key of Object.keys(snapshot)) {
    const entry = snapshot[key];
    if (entry.exists) {
      if (!storage.set(key, entry.value)) ok = false;
    } else if (!storage.remove(key)) {
      ok = false;
    }
  }
  return ok;
}

function clearCacheKeys() {
  let ok = true;
  for (const key of CACHE_KEYS) {
    if (!storage.remove(key)) ok = false;
  }
  return ok;
}

/**
 * Merge import: updates only keys present in backup.data; absent keys are left unchanged.
 * Unknown keys in data are rejected by parseBackup.
 * Writes are rolled back to a pre-import snapshot (user data + caches) if any step fails.
 * Clears API cache keys after a successful user-data write.
 * @returns {boolean} false if write or rollback left storage inconsistent
 */
export function applyBackup(backup) {
  const data = backup?.data ?? {};
  const keysToWrite = Object.keys(data).filter((key) => USER_DATA_KEY_SET.has(key));
  const userSnapshot = snapshotKeys(keysToWrite);
  const cacheSnapshot = snapshotKeys(CACHE_KEYS);
  let ok = true;

  for (const key of keysToWrite) {
    if (!storage.set(key, data[key])) {
      ok = false;
      break;
    }
  }

  if (ok && !clearCacheKeys()) {
    ok = false;
  }

  if (!ok) {
    restoreSnapshot(userSnapshot);
    restoreSnapshot(cacheSnapshot);
    return false;
  }

  return true;
}

function showBackupError(message) {
  showMessageBanner({
    id: 'backup-error-banner',
    message,
    role: 'alert',
  });
}

function showBackupStatus(message) {
  showMessageBanner({
    id: 'backup-status-banner',
    message,
    role: 'status',
  });
}

/**
 * @returns {Promise<boolean>}
 */
function confirmImport() {
  return new Promise((resolve) => {
    const existing = document.getElementById('backup-confirm-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'backup-confirm-dialog';
    dialog.className = 'backup-confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'backup-confirm-title');
    dialog.setAttribute('aria-describedby', 'backup-confirm-message');

    const title = document.createElement('h2');
    title.id = 'backup-confirm-title';
    title.className = 'backup-confirm-title';
    title.textContent = 'Импорт настроек';

    const message = document.createElement('p');
    message.id = 'backup-confirm-message';
    message.className = 'backup-confirm-message';
    message.textContent = 'Импорт обновит настройки и данные из файла. Ключи, которых нет в бэкапе, не изменятся. Продолжить?';

    const actions = document.createElement('div');
    actions.className = 'backup-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'backup-confirm-cancel';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', () => {
      dialog.close('cancel');
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'backup-confirm-ok';
    confirmBtn.textContent = 'Импортировать';
    confirmBtn.addEventListener('click', () => {
      dialog.close('confirm');
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);

    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(confirmed);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    cancelBtn.focus();
  });
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsText(file);
  });
}

export function initBackupControls(root) {
  if (!root) return;

  const exportBtn = root.querySelector('.backup-export');
  const importBtn = root.querySelector('.backup-import');
  const fileInput = root.querySelector('.backup-file-input');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (downloadBackup()) {
        showBackupStatus('Настройки экспортированы');
      } else {
        showBackupError('Не удалось экспортировать настройки');
      }
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;

      if (file.size > MAX_BACKUP_BYTES) {
        showBackupError('Файл бэкапа слишком большой');
        return;
      }

      let text;
      try {
        text = await readFileAsText(file);
      } catch {
        showBackupError('Некорректный файл бэкапа');
        return;
      }

      const result = parseBackup(text);
      if (!result.ok) {
        showBackupError(result.error);
        return;
      }

      const confirmed = await confirmImport();
      if (!confirmed) return;

      const written = applyBackup(result.backup);
      if (!written) {
        showBackupError('Не удалось сохранить данные бэкапа');
        return;
      }

      location.reload();
    });
  }
}
