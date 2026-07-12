import * as storage from '../storage.js';

let savedText = '';

export default {
  id: 'notes',
  title: 'Заметки',

  init() {
    savedText = storage.get('notes', '');
  },

  render(container) {
    const textarea = document.createElement('textarea');
    textarea.className = 'notes-textarea';
    textarea.placeholder = 'Ваши заметки…';
    textarea.value = savedText;

    let debounceTimer;
    textarea.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        storage.set('notes', textarea.value);
      }, 300);
    });

    container.appendChild(textarea);
  },
};
