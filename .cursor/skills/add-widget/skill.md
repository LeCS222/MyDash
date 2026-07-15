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
import { STORAGE_KEYS } from '../storage-keys.js';

let state = null;

export default {
  id: '{id}',
  title: '{Заголовок}',

  init(config) {
    // Загрузи сохранённое состояние
    state = storage.get(STORAGE_KEYS.{key}, /* fallback */);
  },

  render(container) {
    // Создай DOM-элементы и добавь в container
    // Сохраняй изменения через storage.set(STORAGE_KEYS.{key}, value)
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

## Шаг 4: Ключи storage

Если виджет сохраняет данные в localStorage, открой `js/storage-keys.js`:

1. Добавь ключ в `STORAGE_KEYS`
2. Добавь его в `USER_DATA_KEYS` (настройки/данные пользователя, входят в бэкап)
   или в `CACHE_KEYS` (временный API-кэш, очищается при импорте)
3. В виджете импортируй и используй `STORAGE_KEYS.{key}` — не хардкодь строку

## Шаг 5: Стили

Если виджету нужны особые стили, добавь CSS-классы в `styles/main.css`. Без inline-стилей.

## Шаг 6: Проверка

1. Запусти локальный сервер из папки `mydash`
2. Открой приложение в браузере
3. Убедись, что виджет отображается и сохраняет состояние после перезагрузки

## Чеклист

- [ ] Файл виджета экспортирует `id`, `title`, `init`, `render`
- [ ] Виджет зарегистрирован в `registry.js`
- [ ] Id добавлен в `default-config.json`
- [ ] Ключ storage добавлен в `storage-keys.js` (если нужен)
- [ ] Состояние сохраняется через `storage.js` и `STORAGE_KEYS`
- [ ] Нет inline-стилей
