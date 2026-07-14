import * as storage from '../storage.js';

let savedText = '';
let persistAbort = null;

export default {
  id: 'notes',
  title: 'Заметки',

  init() {
    savedText = storage.get('notes', '');
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
      savedText = textarea.value;
      storage.set('notes', savedText);
    }

    function schedulePersist() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        savedText = textarea.value;
        storage.set('notes', savedText);
      }, 300);
    }

    textarea.addEventListener('input', schedulePersist, { signal });
    textarea.addEventListener('blur', persist, { signal });
    window.addEventListener('pagehide', persist, { signal });
    window.addEventListener('beforeunload', persist, { signal });

    container.appendChild(textarea);
  },
};
