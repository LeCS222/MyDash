import * as storage from '../storage.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const NAME_MAX = 80;

let habits = [];
let viewYear = 0;
let viewMonth = 0;
let listEl = null;
let calendarEl = null;
let emptyEl = null;
let monthLabelEl = null;
let nextButton = null;

function save() {
  storage.set('habits', habits);
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getMonthMatrix(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const mondayFirst = (firstDow + 6) % 7;
  const daysInMonth = getDaysInMonth(year, month);
  const cells = [];

  for (let i = 0; i < mondayFirst; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function isFuture(dateKey) {
  return dateKey > getTodayKey();
}

function isDone(habit, dateKey) {
  return habit.dates.includes(dateKey);
}

function toggleDay(habitId, dateKey) {
  if (isFuture(dateKey)) return false;

  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return false;

  const idx = habit.dates.indexOf(dateKey);
  if (idx === -1) habit.dates.push(dateKey);
  else habit.dates.splice(idx, 1);

  save();
  return true;
}

function formatDayLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function formatMonthLabel(year, month) {
  const date = new Date(year, month, 1);
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function findHabitRow(habitId) {
  return listEl.querySelector(`[data-habit-id="${CSS.escape(habitId)}"]`);
}

function updateNavButtons() {
  const now = new Date();
  const atCurrent =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();
  nextButton.disabled = atCurrent;
}

function updateMonthLabel() {
  monthLabelEl.textContent = formatMonthLabel(viewYear, viewMonth);
}

function showEmptyState() {
  emptyEl.hidden = habits.length > 0;
  calendarEl.hidden = habits.length === 0;
}

function createEmptyCell() {
  const span = document.createElement('span');
  span.className = 'habits-day habits-day--empty';
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function createDayButton(habit, day, dateKey) {
  const done = isDone(habit, dateKey);
  const future = isFuture(dateKey);
  const today = dateKey === getTodayKey();

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'habits-day';
  button.textContent = String(day);
  button.dataset.dateKey = dateKey;

  if (done) button.classList.add('habits-day--done');
  if (today) button.classList.add('habits-day--today');
  if (future) {
    button.classList.add('habits-day--future');
    button.disabled = true;
  }

  button.setAttribute('aria-pressed', String(done));
  button.setAttribute('aria-label', `${habit.name}, ${formatDayLabel(dateKey)}`);

  button.addEventListener('click', () => {
    const changed = toggleDay(habit.id, dateKey);
    if (!changed) return;

    const isDoneNow = isDone(habit, dateKey);
    button.classList.toggle('habits-day--done', isDoneNow);
    button.setAttribute('aria-pressed', String(isDoneNow));
  });

  return button;
}

function renderMonthGridForRow(rowEl, habit) {
  const gridEl = rowEl.querySelector('.habits-grid');
  gridEl.replaceChildren();

  const matrix = getMonthMatrix(viewYear, viewMonth);
  for (const cell of matrix) {
    if (cell === null) {
      gridEl.appendChild(createEmptyCell());
    } else {
      const dateKey = formatDateKey(new Date(viewYear, viewMonth, cell));
      gridEl.appendChild(createDayButton(habit, cell, dateKey));
    }
  }
}

function renderMonthGrid() {
  const rows = listEl.querySelectorAll('.habits-row[data-habit-id]');
  for (const row of rows) {
    const habitId = row.dataset.habitId;
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) continue;
    renderMonthGridForRow(row, habit);
  }
  updateMonthLabel();
  updateNavButtons();
}

function deleteHabit(habitId) {
  habits = habits.filter((h) => h.id !== habitId);
  save();
  const row = findHabitRow(habitId);
  row?.remove();
  showEmptyState();
}

function createHabitRow(habit) {
  const row = document.createElement('li');
  row.className = 'habits-row';
  row.dataset.habitId = habit.id;

  const header = document.createElement('div');
  header.className = 'habits-row-header';

  const name = document.createElement('span');
  name.className = 'habits-name';
  name.textContent = habit.name;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'habits-delete';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Удалить привычку: ${habit.name}`);
  remove.addEventListener('click', () => deleteHabit(habit.id));

  header.appendChild(name);
  header.appendChild(remove);

  const grid = document.createElement('div');
  grid.className = 'habits-grid';

  row.appendChild(header);
  row.appendChild(grid);

  renderMonthGridForRow(row, habit);
  return row;
}

export default {
  id: 'habits',
  title: 'Привычки',

  init() {
    const saved = storage.get('habits', []);
    const todayKey = getTodayKey();
    let sanitized = false;

    habits = Array.isArray(saved)
      ? saved
          .filter((h) => {
            const keep = h && typeof h.name === 'string' && h.name.trim();
            if (!keep) sanitized = true;
            return keep;
          })
          .map((h) => {
            const rawDates = Array.isArray(h.dates) ? h.dates : [];
            const dates = [];
            for (const d of rawDates) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayKey) {
                dates.push(d);
              } else {
                sanitized = true;
              }
            }

            let id;
            if (typeof h.id === 'string' && h.id.length > 0) {
              id = h.id;
            } else {
              sanitized = true;
              id = createId();
            }

            return {
              id,
              name: h.name.trim().slice(0, NAME_MAX),
              dates,
              createdAt:
                typeof h.createdAt === 'string' &&
                /^\d{4}-\d{2}-\d{2}$/.test(h.createdAt)
                  ? h.createdAt
                  : todayKey,
            };
          })
      : [];

    if (sanitized) save();

    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  },

  render(container) {
    const form = document.createElement('form');
    form.className = 'habits-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'habits-input';
    input.placeholder = 'Новая привычка…';
    input.setAttribute('aria-label', 'Новая привычка');
    input.maxLength = NAME_MAX;

    const addButton = document.createElement('button');
    addButton.type = 'submit';
    addButton.className = 'habits-add';
    addButton.textContent = 'Добавить';

    form.appendChild(input);
    form.appendChild(addButton);

    const nav = document.createElement('div');
    nav.className = 'habits-nav';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'habits-prev';
    prevButton.textContent = '◀';
    prevButton.setAttribute('aria-label', 'Предыдущий месяц');

    monthLabelEl = document.createElement('span');
    monthLabelEl.className = 'habits-month';

    nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'habits-next';
    nextButton.textContent = '▶';
    nextButton.setAttribute('aria-label', 'Следующий месяц');

    nav.appendChild(prevButton);
    nav.appendChild(monthLabelEl);
    nav.appendChild(nextButton);

    emptyEl = document.createElement('p');
    emptyEl.className = 'habits-empty';
    emptyEl.textContent = 'Добавьте первую привычку';
    emptyEl.hidden = habits.length > 0;

    calendarEl = document.createElement('div');
    calendarEl.className = 'habits-calendar';
    calendarEl.hidden = habits.length === 0;

    const calendarTrack = document.createElement('div');
    calendarTrack.className = 'habits-calendar-track';

    const weekdays = document.createElement('div');
    weekdays.className = 'habits-weekdays';
    for (const label of WEEKDAYS) {
      const span = document.createElement('span');
      span.className = 'habits-weekday';
      span.textContent = label;
      weekdays.appendChild(span);
    }

    listEl = document.createElement('ul');
    listEl.className = 'habits-list';

    for (const habit of habits) {
      listEl.appendChild(createHabitRow(habit));
    }

    calendarTrack.appendChild(weekdays);
    calendarTrack.appendChild(listEl);
    calendarEl.appendChild(calendarTrack);

    prevButton.addEventListener('click', () => {
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
      renderMonthGrid();
    });

    nextButton.addEventListener('click', () => {
      const now = new Date();
      if (viewYear === now.getFullYear() && viewMonth >= now.getMonth()) {
        return;
      }

      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
      renderMonthGrid();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;

      const habit = {
        id: createId(),
        name: value.slice(0, NAME_MAX),
        dates: [],
        createdAt: getTodayKey(),
      };
      habits.push(habit);
      save();

      const wasEmpty = calendarEl.hidden;
      listEl.appendChild(createHabitRow(habit));
      if (wasEmpty) showEmptyState();

      input.value = '';
      input.focus();
    });

    updateMonthLabel();
    updateNavButtons();

    container.appendChild(form);
    container.appendChild(nav);
    container.appendChild(emptyEl);
    container.appendChild(calendarEl);
  },
};
