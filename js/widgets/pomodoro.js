import * as storage from '../storage.js';

const WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

const PHASE_LABELS = {
  work: 'Работа',
  break: 'Отдых',
};

let state = { phase: 'work', remaining: WORK_SECONDS, completed: 0 };
let intervalId = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${pad(minutes)}:${pad(secs)}`;
}

function phaseDuration(phase) {
  return phase === 'work' ? WORK_SECONDS : BREAK_SECONDS;
}

function save() {
  storage.set('pomodoro', state);
}

export default {
  id: 'pomodoro',
  title: 'Таймер Pomodoro',

  init() {
    const saved = storage.get('pomodoro', null);
    const phase = saved?.phase === 'break' ? 'break' : 'work';
    const remaining =
      Number.isInteger(saved?.remaining) &&
      saved.remaining >= 0 &&
      saved.remaining <= phaseDuration(phase)
        ? saved.remaining
        : phaseDuration(phase);
    const completed =
      Number.isInteger(saved?.completed) && saved.completed >= 0
        ? saved.completed
        : 0;
    state = { phase, remaining, completed };
  },

  render(container) {
    const timeEl = document.createElement('div');
    timeEl.className = 'pomodoro-time';

    const phaseEl = document.createElement('div');
    phaseEl.className = 'pomodoro-phase';

    const controls = document.createElement('div');
    controls.className = 'pomodoro-controls';

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className = 'pomodoro-start';
    startButton.textContent = 'Старт';

    const pauseButton = document.createElement('button');
    pauseButton.type = 'button';
    pauseButton.className = 'pomodoro-pause';
    pauseButton.textContent = 'Пауза';

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'pomodoro-reset';
    resetButton.textContent = 'Сброс';

    controls.appendChild(startButton);
    controls.appendChild(pauseButton);
    controls.appendChild(resetButton);

    const countEl = document.createElement('div');
    countEl.className = 'pomodoro-count';

    function updateDisplay() {
      timeEl.textContent = formatTime(state.remaining);
      phaseEl.textContent = PHASE_LABELS[state.phase];
      countEl.textContent = `Завершено циклов: ${state.completed}`;
    }

    function advancePhase() {
      if (state.phase === 'work') {
        state.completed += 1;
        state.phase = 'break';
      } else {
        state.phase = 'work';
      }
      state.remaining = phaseDuration(state.phase);
    }

    function tick() {
      if (state.remaining > 0) {
        state.remaining -= 1;
      }
      if (state.remaining === 0) {
        advancePhase();
      }
      save();
      updateDisplay();
    }

    function start() {
      if (intervalId !== null) return;
      intervalId = setInterval(tick, 1000);
    }

    function pause() {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function reset() {
      pause();
      state.phase = 'work';
      state.remaining = WORK_SECONDS;
      save();
      updateDisplay();
    }

    startButton.addEventListener('click', start);
    pauseButton.addEventListener('click', pause);
    resetButton.addEventListener('click', reset);

    updateDisplay();

    container.appendChild(phaseEl);
    container.appendChild(timeEl);
    container.appendChild(controls);
    container.appendChild(countEl);
  },
};
