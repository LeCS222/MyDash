import clock from './widgets/clock.js';
import weather from './widgets/weather.js';
import notes from './widgets/notes.js';

const widgets = new Map([
  [clock.id, clock],
  [weather.id, weather],
  [notes.id, notes],
]);

export function getWidget(id) {
  return widgets.get(id);
}

export function getAllWidgets() {
  return [...widgets.values()];
}
