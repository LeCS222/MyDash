import { STORAGE_PREFIX } from './storage-keys.js';

function notifyCorrupted(key) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent('mydash-storage-corrupted', { detail: { key } }),
  );
}

function notifyWriteFailed(key) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent('mydash-storage-write-failed', { detail: { key } }),
  );
}

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    notifyCorrupted(key);
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    notifyWriteFailed(key);
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    return true;
  } catch {
    notifyWriteFailed(key);
    return false;
  }
}
