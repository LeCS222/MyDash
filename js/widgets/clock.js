const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const WEEKDAYS = [
  'воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTime(date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatDate(date) {
  const weekday = WEEKDAYS[date.getUTCDay()];
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

export default {
  id: 'clock',
  title: 'Часы',

  init() {},

  render(container) {
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
    setInterval(tick, 1000);

    container.appendChild(timeEl);
    container.appendChild(dateEl);
  },
};
