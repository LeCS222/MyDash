---
name: add-widget
description: Пошаговое добавление нового виджета в MyDash
---

# Добавление виджета в MyDash

## Когда использовать

Вызывай этот скилл, когда нужно добавить новый виджет на дашборд.

## Шаг 1: Создать файл виджета

Создай `js/widgets/{id}.js` по контракту:

```javascript
import * as storage from '../storage.js';

let state = null;

export default {
  id: '{id}',
  title: '{Заголовок}',

  init(config) {
    // Загрузи сохранённое состояние
    state = storage.get('{id}', /* fallback */);
  },

  render(container) {
    // Создай DOM-элементы и добавь в container
    // Сохраняй изменения через storage.set('{id}', value)
  },
};
```

## Шаг 2: Зарегистрировать в реестре

Открой `js/registry.js`:

1. Добавь импорт: `import {id} from './widgets/{id}.js';`
2. Добавь в Map: `[{id}.id, {id}]`

## Шаг 3: Добавить в конфиг

Открой `data/default-config.json` и добавь id в массив `widgets`:

```json
"widgets": ["clock", "weather", "notes", "{id}"]
```

## Шаг 4: Стили

Если виджету нужны особые стили, добавь CSS-классы в `styles/main.css`. Без inline-стилей.

## Шаг 5: Проверка

1. Запусти локальный сервер из папки `mydash`
2. Открой приложение в браузере
3. Убедись, что виджет отображается и сохраняет состояние после перезагрузки

## Чеклист

- [ ] Файл виджета экспортирует `id`, `title`, `init`, `render`
- [ ] Виджет зарегистрирован в `registry.js`
- [ ] Id добавлен в `default-config.json`
- [ ] Состояние сохраняется через `storage.js`
- [ ] Нет inline-стилей
