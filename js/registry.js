import clock from './widgets/clock.js';
import weather from './widgets/weather.js';
import notes from './widgets/notes.js';
import todo from './widgets/todo.js';
import pomodoro from './widgets/pomodoro.js';

const widgets = new Map([
  [clock.id, clock],
  [weather.id, weather],
  [notes.id, notes],
  [todo.id, todo],
  [pomodoro.id, pomodoro],
]);

export function getWidget(id) {
  return widgets.get(id);
}

export function getAllWidgets() {
  return [...widgets.values()];
}
