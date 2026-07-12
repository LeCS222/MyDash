import * as storage from '../storage.js';

let tasks = [];
let listEl = null;

function save() {
  storage.set('todo', tasks);
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createItem(task) {
  const item = document.createElement('li');
  item.className = 'todo-item';
  if (task.done) item.classList.add('todo-item--done');

  const label = document.createElement('label');
  label.className = 'todo-label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-checkbox';
  checkbox.checked = task.done;
  checkbox.addEventListener('change', () => {
    task.done = checkbox.checked;
    item.classList.toggle('todo-item--done', task.done);
    save();
  });

  const text = document.createElement('span');
  text.className = 'todo-text';
  text.textContent = task.text;

  label.appendChild(checkbox);
  label.appendChild(text);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'todo-delete';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Удалить задачу: ${task.text}`);
  remove.addEventListener('click', () => {
    tasks = tasks.filter((t) => t.id !== task.id);
    item.remove();
    save();
  });

  item.appendChild(label);
  item.appendChild(remove);
  return item;
}

export default {
  id: 'todo',
  title: 'Список дел',

  init() {
    const saved = storage.get('todo', []);
    tasks = Array.isArray(saved) ? saved : [];
  },

  render(container) {
    const form = document.createElement('form');
    form.className = 'todo-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-input';
    input.placeholder = 'Новая задача…';
    input.setAttribute('aria-label', 'Новая задача');

    const addButton = document.createElement('button');
    addButton.type = 'submit';
    addButton.className = 'todo-add';
    addButton.textContent = 'Добавить';

    form.appendChild(input);
    form.appendChild(addButton);

    listEl = document.createElement('ul');
    listEl.className = 'todo-list';

    for (const task of tasks) {
      listEl.appendChild(createItem(task));
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;

      const task = { id: createId(), text: value, done: false };
      tasks.push(task);
      listEl.appendChild(createItem(task));
      save();
      input.value = '';
      input.focus();
    });

    container.appendChild(form);
    container.appendChild(listEl);
  },
};
