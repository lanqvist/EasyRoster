# EasyRoster

Локальный инструмент менеджмента ростера рейдового статика WoW: синк персонажей через Blizzard API, автоматические BiS-листы, лут-таблицы сезона и подсказки в RCLootCouncil.

План и результаты исследования: [docs/PLAN.md](docs/PLAN.md).

## Структура

```
apps/server     Fastify + node:sqlite — API, синк, генерация db.lua      (TypeScript)
apps/web        React + Vite — веб-интерфейс на http://localhost:4777    (TypeScript)
packages/core   общие типы, схема конфига (zod), справочники WoW
addon/RCLootCouncil_EasyRoster   плагин RCLootCouncil (колонка BiS)     (Lua)
reference/      исходники RCLootCouncil и референсных плагинов (только для чтения)
data/           config.json, easyroster.sqlite, кэши (не в git)
```

## Запуск

Требуется Node.js ≥ 22.13 (используется встроенный `node:sqlite`).

```bash
npm install
```

Разработка (сервер на 4777 + Vite на 5173 с прокси `/api`):

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Продакшн-режим (один процесс, UI отдаётся сервером):

```bash
npm run build && npm start
```

Откройте http://localhost:4777 — при первом запуске откроется мастер: ключи Blizzard → гильдия → ранги рейдеров (цифрами) → путь к WoW.

## Тесты

```bash
npm test
```

Интеграционный тест синка поднимает mock Blizzard API (без ключей).

## Статус

- [x] Фаза 0 — каркас, конфиг, мастер первого запуска, проверка ключей и гильдии
- [x] Фаза 1 — синк ростера и персонажей (Blizzard API, автосинк, страница «Ростер», карточка персонажа с экипировкой)
- [ ] Фаза 2 — справочники предметов и лут-таблицы
- [ ] Фаза 3 — движок BiS
- [ ] Фаза 4 — аддон RCLootCouncil и «лут-ночь»
- [ ] Фаза 5 — симы, упаковка
