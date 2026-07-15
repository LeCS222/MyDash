import * as storage from '../storage.js';
import { STORAGE_KEYS } from '../storage-keys.js';
import { WORK_SECONDS, BREAK_SECONDS } from '../widget-limits.js';

const PHASE_LABELS = {
  work: 'Работа',
  break: 'Отдых',
};

let state = { phase: 'work', remaining: WORK_SECONDS, completed: 0 };
let intervalId = null;
let visibilityHandler = null;
let endsAt = null;
let isRunning = false;

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
  storage.set(STORAGE_KEYS.pomodoro, state);
}

function remainingFromWallClock() {
  if (endsAt === null) return state.remaining;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function stopIntervalOnly() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function detachVisibility() {
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

function stopTimer() {
  stopIntervalOnly();
  detachVisibility();
  endsAt = null;
  isRunning = false;
}

function startInterval(tick) {
  stopIntervalOnly();
  intervalId = setInterval(tick, 1000);
}

function attachVisibility(tick) {
  detachVisibility();
  visibilityHandler = () => {
    if (document.hidden) {
      stopIntervalOnly();
      return;
    }
    if (!isRunning) return;
    tick();
    startInterval(tick);
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

export default {
  id: 'pomodoro',
  title: 'Таймер Pomodoro',

  init() {
    const saved = storage.get(STORAGE_KEYS.pomodoro, null);
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
    endsAt = null;
    isRunning = false;
  },

  render(container) {
    stopTimer();
    container.replaceChildren();

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
      const label = PHASE_LABELS[state.phase];
      const midPhase = state.remaining !== phaseDuration(state.phase);
      phaseEl.textContent =
        !isRunning && midPhase ? `${label} · пауза` : label;
      countEl.textContent = `Завершено циклов: ${state.completed}`;
      startButton.disabled = isRunning;
      pauseButton.disabled = !isRunning;
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
      if (!isRunning) return;

      state.remaining = remainingFromWallClock();

      if (state.remaining === 0) {
        advancePhase();
        endsAt = Date.now() + state.remaining * 1000;
      }

      save();
      updateDisplay();
    }

    function start() {
      if (isRunning) return;
      isRunning = true;
      endsAt = Date.now() + state.remaining * 1000;
      attachVisibility(tick);
      startInterval(tick);
      updateDisplay();
    }

    function pause() {
      if (!isRunning) return;
      state.remaining = remainingFromWallClock();
      stopTimer();
      save();
      updateDisplay();
    }

    function reset() {
      stopTimer();
      state.phase = 'work';
      state.remaining = WORK_SECONDS;
      state.completed = 0;
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
