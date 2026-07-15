import clock from './widgets/clock.js';
import weather from './widgets/weather.js';
import currency from './widgets/currency.js';
import notes from './widgets/notes.js';
import todo from './widgets/todo.js';
import pomodoro from './widgets/pomodoro.js';
import quotes from './widgets/quotes.js';
import habits from './widgets/habits.js';
import worldClock from './widgets/world-clock.js';
import news from './widgets/news.js';
import dailyPhoto from './widgets/daily-photo.js';

const widgets = new Map([
  [clock.id, clock],
  [weather.id, weather],
  [currency.id, currency],
  [notes.id, notes],
  [todo.id, todo],
  [pomodoro.id, pomodoro],
  [quotes.id, quotes],
  [habits.id, habits],
  [worldClock.id, worldClock],
  [news.id, news],
  [dailyPhoto.id, dailyPhoto],
]);

export function getWidget(id) {
  return widgets.get(id);
}

export function getAllWidgets() {
  return [...widgets.values()];
}
