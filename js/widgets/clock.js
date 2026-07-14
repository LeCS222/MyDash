const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const WEEKDAYS = [
  'воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота',
];

let intervalId = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(date) {
  const weekday = WEEKDAYS[date.getDay()];
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export default {
  id: 'clock',
  title: 'Часы',

  init() {},

  render(container) {
    stopTimer();
    container.replaceChildren();

    const timeEl = document.createElement('div');
    timeEl.className = 'clock-time';

    const dateEl = document.createElement('div');
    dateEl.className = 'clock-date';

    function tick() {
      const now = new Date();
      timeEl.textContent = formatTime(now);
      dateEl.textContent = formatDate(now);
    }

    tick();
    intervalId = setInterval(tick, 1000);

    container.appendChild(timeEl);
    container.appendChild(dateEl);
  },
};
