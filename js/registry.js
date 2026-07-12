import clock from './widgets/clock.js';
import weather from './widgets/weather.js';
import currency from './widgets/currency.js';
import notes from './widgets/notes.js';
import todo from './widgets/todo.js';
import pomodoro from './widgets/pomodoro.js';
import quotes from './widgets/quotes.js';

const widgets = new Map([
  [clock.id, clock],
  [weather.id, weather],
  [currency.id, currency],
  [notes.id, notes],
  [todo.id, todo],
  [pomodoro.id, pomodoro],
  [quotes.id, quotes],
]);

export function getWidget(id) {
  return widgets.get(id);
}

export function getAllWidgets() {
  return [...widgets.values()];
}
