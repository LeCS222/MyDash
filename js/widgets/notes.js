import * as storage from '../storage.js';
import { STORAGE_KEYS } from '../storage-keys.js';

let savedText = '';
let persistAbort = null;

export default {
  id: 'notes',
  title: 'Заметки',

  init() {
    savedText = storage.get(STORAGE_KEYS.notes, '');
  },

  render(container) {
    persistAbort?.abort();
    persistAbort = new AbortController();
    const { signal } = persistAbort;

    container.replaceChildren();

    const textarea = document.createElement('textarea');
    textarea.className = 'notes-textarea';
    textarea.placeholder = 'Ваши заметки…';
    textarea.setAttribute('aria-label', 'Заметки');
    textarea.value = savedText;

    let debounceTimer = null;

    function persist() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (textarea.value === savedText) return;
      savedText = textarea.value;
      storage.set(STORAGE_KEYS.notes, savedText);
    }

    function schedulePersist() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        persist();
      }, 300);
    }

    function persistOnUnload() {
      persist();
    }

    textarea.addEventListener('input', schedulePersist, { signal });
    textarea.addEventListener('blur', persist, { signal });
    window.addEventListener('pagehide', persistOnUnload, { signal });
    window.addEventListener('beforeunload', persistOnUnload, { signal });

    container.appendChild(textarea);
  },
};
