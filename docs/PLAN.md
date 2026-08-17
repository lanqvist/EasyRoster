# EasyRoster — исследование и план реализации

> Статус (17.08.2026): фазы 0–5 реализованы, см. README.md. Не реализовано из опционального: Wowhead через headless-браузер, локальный SimulationCraft, упаковка в exe.

Инструмент менеджмента ростера рейдового статика WoW (retail, Midnight 12.1, Season 2 с 18–19 августа 2026): автосинк персонажей через Blizzard API, автоматические BiS-листы по каждому рейдеру, таблицы лута рейда/подземелий/других источников и подсказки «кому это апнет больше» прямо в окне голосования RCLootCouncil.

Дата исследования: 16–17 августа 2026. Все факты ниже проверены по первоисточникам (ссылки в конце), а локальный контекст — по вашей установке WoW.

---

## 0. Резюме (TL;DR)

**Реализуемо полностью, локально и без платных сервисов.** Архитектура — три части:

| Часть | Что делает | На чём |
|---|---|---|
| **Desktop/локальный сервер** `easyroster` | Синк гильдии и персонажей (Blizzard API), справочники предметов/лута (Raidbots static + Blizzard journal), движок BiS (3 источника + ручные правки), диф «текущий шмот vs BiS», веб-UI, генерация Lua-файла для аддона, чтение SavedVariables (история лута RCLC, ранги/заметки гильдии) | Node 22 + TypeScript, SQLite, React (Vite). Один процесс `npm start` → `http://localhost:4777` |
| **Аддон-плагин** `RCLootCouncil_EasyRoster` | Колонка «BiS» в Voting Frame RCLootCouncil (официальный Column API 3.23.0), подсветка в Loot Frame, рассылка данных совету по AceComm, экспорт ростера гильдии с именами рангов и заметками в SavedVariables | Lua, `## Dependencies: RCLootCouncil` |
| **Данные** | `Interface/AddOns/RCLootCouncil_EasyRoster/Data/db.lua` (генерируется инструментом → `/reload`) и `WTF/.../SavedVariables/RCLootCouncil.lua` + `RCLootCouncil_EasyRoster.lua` (читаются инструментом) | Lua-таблицы |

**Главные ограничения, найденные при исследовании (и обходы):**
1. Blizzard API отдаёт ранг гильдии **только числом**; имена рангов и заметки (guild/officer note) недоступны → берём из игры через свой аддон (как делает WowauditCompanion) или ручной маппинг «индекс → название» в UI.
2. Профиль персонажа обновляется **только при логауте**; давно не заходившие персонажи → 404/403 → держим в ростере как «нет данных».
3. Аддоны WoW не имеют сети/файлового ввода-вывода → единственный путь данных в игру: генерируемый Lua-файл в папке аддона + `/reload` (с 9.0.1 рестарт клиента не нужен, даже для новой папки аддона).
4. В Midnight аддон-сообщения **запрещены во время боссов** → данные и голосование появляются после энкаунтера (RCLC уже это учитывает).
5. Готовых «BiS-API» не существует. Источники: авторские гайды (Icy Veins парсится curl-ом, Wowhead — только через headless-браузер), эмпирика по логам (Warcraft Logs API v2 — официально, 3600 очков/час, отдаёт экипировку топ-игроков), и симы (Raidbots Droptimizer по ссылке / локальный SimulationCraft profilesets).

**Честная альтернатива:** сервис **wowaudit.com** уже делает ~80% этого (ростер по API, вишлисты из Droptimizer, плагин RCLC с процентами апгрейда, десктоп-клиент, публичный API). В вашем WTF есть `WowauditCompanion.lua` — статик им пользовался. Смысл своего инструмента: полностью локально/бесплатно, свои источники BiS (не только Droptimizer, который каждому рейдеру надо запускать вручную), автоматический BiS без действий рейдеров, любая логика приоритета/подсветки, русские реалмы и ранги. Ниже план именно своего инструмента, но wowaudit стоит держать как референс формата данных (его `db.lua` — проверенный формат, который можно поддержать 1-в-1 как режим совместимости).

---

## 1. Локальный контекст (что уже есть на машине)

- WoW retail: `C:\Program Files (x86)\World of Warcraft\_retail_` (Midnight, стоят BigWigs_TheVenomousAbyss и др.).
- Гильдия **«Стигма» — Гордунни (EU)**, персонажи в основном на Ревущем фьорде / Гордунни (связанные реалмы), рейды кросс-реалмовые (Silvermoon, Twisting Nether, Kazzak…). Ранги в RCLC-кэше: «Статик», «Рейдер».
- В `WTF/Account/*/SavedVariables/`:
  - `RCLootCouncil.lua` (~700 KB) — есть `RCLootCouncilLootDB.factionrealm[...]` с историей лута с марта 2026 (поля: `lootWon` (ссылка с bonusID), `response` («Бис»/…), `boss`, `instance`, `difficultyID`, `mapID`, `date`, `id`, `itemReplaced1/2`), плюс `playerCache` с `specID`, `ilvl`, `rank`, `guid`.
  - `WowauditCompanion.lua` — снимок ростера гильдии с `ranks`, `publicNote`, `officerNote`, `guid` (подтверждение, что нужные данные из игры достаются штатно).
- Аддоны RCLootCouncil и WowauditCompanion сейчас **не установлены** (папок нет, только SavedVariables) — их надо будет поставить обратно (RCLC 3.23.0 актуален для 12.1).
- Установлен аддон `Simulationcraft` (экспорт `/simc`).

---

## 2. Результаты исследования по направлениям

### 2.1 Blizzard Battle.net API

- Регистрация клиента: https://community.developer.battle.net/access/clients (Battle.net + 2FA). Client-credentials: `POST https://oauth.battle.net/token`, токен живёт 24 ч, передаётся **только** заголовком `Authorization: Bearer`.
- Хост EU: `https://eu.api.blizzard.com`, namespaces `profile-eu` / `static-eu` / `dynamic-eu`, `locale=ru_RU|en_US`. Лимиты: 36 000 запросов/час, ~100/сек. Поддерживаются `If-Modified-Since` → 304 — обязательно использовать.
- Гильдия: `GET /data/wow/guild/{realmSlug}/{nameSlug}/roster` → `members[]{character{name, id, realm{slug}, level, playable_class{id}}, rank:int}`. Слуг для «Гордунни» берём из `/data/wow/realm/index` (dynamic-eu). **Имён рангов и заметок нет** (подтверждено сотрудником Blizzard).
- Персонаж (`/profile/wow/character/{realm}/{name}` — имя в нижнем регистре, URL-encode кириллицы):
  - `/status` → `{id, is_valid}` (дёшево, ловит переименования/трансферы/удаления);
  - summary → `active_spec`, `equipped_item_level`, `average_item_level`, `last_login_timestamp`, `guild`;
  - `/equipment` → по слоту: `item.id`, `bonus_list[]`, `level.value` (реальный ilvl), `name_description` (название трека «Hero» и т.п.), `enchantments`, `sockets`, `set`, `stats`;
  - `/specializations` → активная спека, loadout-код талантов;
  - `/character-media` → аватар; `/encounters/raids` → last_kill_timestamp по боссам; `/mythic-keystone-profile/season/{id}`.
  - Ошибки: 404/403 для давно неактивных или «недогруженных» персонажей → «нет данных, повторить позже».
- Предметы/журнал (`static-eu`): `/data/wow/item/{id}` (класс/подкласс/inventory_type/preview_item со статами), `/data/wow/media/item/{id}` (иконка), `/journal-expansion/{id}` → рейды/подземелья, `/journal-instance/{id}` → энкаунтеры, `/journal-encounter/{id}` → `items[]` (лут-таблица босса по itemID). Спек-фильтр лута (какие спеки могут получить предмет) через API **не даётся** → берём из Raidbots `equippable-items.json` (`specs`, `allowableClasses`).
- Великий тайник, дельвы — эндпоинтов нет.
- Библиотеки: для TS — `blizzard.js` (benweier, поддерживается); но REST настолько прост, что тонкий свой клиент (токен-кэш, namespace, 429/304) — лучший вариант.

### 2.2 Справочные данные о предметах, треках, лут-таблицах

- **Raidbots static data** (публично, CORS `*`, кэшировать локально): `https://www.raidbots.com/static/data/live/`  
  `metadata.json` (текущий билд), `equippable-items.json` (53 MB: id, name, icon, quality, inventoryType, itemClass/SubClass, itemLevel, stats, **specs**, **allowableClasses**, itemSetId, **sources[{instanceId, encounterId}]**, socketInfo, uniqueEquipped), `encounter-items.json` (1.7 MB — только предметы из лут-таблиц, идеально), `instances.json` (Venomous Abyss = instanceId **1320**, S2-подземелья), `bonuses.json` (bonusID → ilvl/трек/уровень апгрейда/сезон), `item-conversions.json` (Катализатор), `item-sets.json`, `enchantments.json`, `gems.json`, `talents.json`, `weapon-specs.json`.
- **wago.tools DB2 CSV** как запасной/дополнительный источник: `https://wago.tools/db2/<Table>/csv?build=12.1.0.69283` (ItemSparse, ItemBonus, ItemBonusListGroupEntry, JournalEncounterItem, ItemSet, ItemConversion, ChrSpecialization…).
- **Треки Midnight** (по 6 рангов, крайние скрытые 7–9): S1 — Adventurer/Veteran/Champion/Hero/Myth (bonusID 12769–12808; ilvl Myth 272–289), S2 — те же названия, bonusID 12817–12856, ilvl: Adventurer 266–282, Veteran 279–295, Champion 292–308, Hero 305–321, **Myth 318–334** (r9 = 344 с последних боссов Mythic). Источники по трекам S2: Normal рейд/M0/+2-3 → Champion, Heroic/+4-8 → Hero, Mythic/+9 и выше → Myth. Таблицу S1 надо захардкодить (Raidbots уже убрал upgrade-блоки S1).
- Формат ссылки предмета: `|Hitem:itemID:enchant:gem1..4:suffix:unique:linkLevel:specID:modMask:itemContext:numBonus:bonus1..:numMods:...`; `itemContext` 3/4/5/6 = Normal/LFR/Heroic/Mythic рейд, 16–35 M+, 72/73 Тайник. Тир-сеты сравнивать по `itemSetId` (Катализатор превращает предмет слота в тир того же трека/ilvl; скрытый bonusID катализируемости S2 = 13662).
- Тултипы предметов без Blizzard-ключа: `https://nether.wowhead.com/tooltip/item/{id}?dataEnv=1&locale=0&bonus=…` (JSON, работает из curl). Иконки — Blizzard `/media/item/{id}` или Wowhead CDN.

### 2.3 Источники BiS (что реально можно взять программно)

| Источник | Что даёт | Доступ | Оценка |
|---|---|---|---|
| **Icy Veins** `https://www.icy-veins.com/wow/{spec}-{class}-pve-dps-gear-best-in-slot` | Авторский BiS по слотам (Overall/M+/Catalyst/тир), у каждого предмета атрибут `data-wowhead="item=ID&bonus=…"`, источник дропа текстом | HTTP 200 из curl, парсер HTML | **Основной «редакционный» источник для MVP** — уже опубликованы списки Season 2 |
| **Wowhead** `https://www.wowhead.com/guide/classes/{class}/{spec}/bis-gear` | Таблицы BiS (Slot/Item/Source), Best from Raid, Best from M+, тринкеты | CloudFront 403 для не-браузеров → только Playwright/Chromium; ToS «серая зона» | Опционально, второй авторский источник |
| **Warcraft Logs API v2** (GraphQL, OAuth client-credentials, 3600 очков/ч) | `characterRankings(includeCombatantInfo:true)` по спеке×боссу → экипировка топ-игроков (id, ilvl, bonusIDs) → популярность предметов по слотам | Официально, свой ключ | **Основной «эмпирический» источник**; данные S2 появятся через 1–2 недели после старта сезона |
| **Archon.gg** | Та же WCL-популярность + BiS-бейджи (импорт из Wowhead), в `__NEXT_DATA__` | Скрейпинг, без API/разрешения | Не основной; можно как ручную сверку |
| **Raidbots Droptimizer** (по ссылке от рейдера) | Персональный % апгрейда по каждому предмету рейда/подземелья/тайника | `https://www.raidbots.com/reports/{id}/data.json` (без авторизации, живёт ~30 дней; автосабмит запрещён ToU) | **Лучшее качество, но требует действия рейдера**; парсим сразу после вставки ссылки (как wowaudit) |
| **SimulationCraft локально** (nightly `simc-1210.*-win64`) | Полностью автоматический «droptimizer»: `armory=eu,реалм,имя` → профиль → `profileset.<name>=…` для каждого кандидата | CPU: ростер × ~110 предметов × треки — часы на десктопе; снижать `target_error`, только рейд+М+ текущего сезона | Фаза 2+, ночной прогон |
| **Bloodmallet** `https://bloodmallet.com/chart/get/trinkets/castingpatchwerk/{class}/{spec}` | JSON-рейтинг тринкетов/эмбеллишментов по ilvl (уже S2) | Открыто | Уточнение тринкетов |
| Murlok / U.GG / Subcreation | SPA/403/закрыт (Subcreation → Archon) | — | Не использовать |
| **wowaudit** | Ростер, вишлисты (Droptimizer/QE Live), плагин RCLC + десктоп-клиент, API `/v1/characters`, `/v1/wishlists` | По ключу команды | Референс формата `db.lua`; возможен режим импорта |

### 2.4 RCLootCouncil (актуально: 3.23.0, 11 авг 2026, `## Interface: 120100`)

- В 3.23.0 появился **официальный Column API** (`Modules/VotingFrame/ColumnAPI.lua`): `RCVotingFrame:AddColumn(spec, target, position)`, `RemoveColumn`, `UpdateColumn`, `RefreshColumnLayout`; spec = `{colName, name, width, align, sortnext, comparesort, DoCellUpdate}`. Старый способ (`tinsert(RCVotingFrame.scrollCols, …)`) пока работает — нужен fallback для RCLC < 3.23.
- Данные в ячейке: `data[realrow].name` («Имя-Реалм», реалм без пробелов), `RCVotingFrame:GetCurrentSession()`, `addon:GetLootTable()[session]` → `itemID, link, ilvl, equipLoc, token, classes`; `RCVotingFrame:GetCandidateData(session, name, "gear1"|"gear2"|"diff"|"specID"|"response"|"ilvl")` — **кандидаты присылают свои текущие предметы слота** и разницу ilvl вместе с ответом → в игре есть «что сейчас надето» без API.
- События/хуки: `RCSessionChangedPost`, `RCLootTableAdditionsReceived`, `RCMLAddItem`, `RCMLLootHistorySend`; `SecureHook(RCLootFrame.EntryManager, "GetEntry")` для подсветки в окне ролла у самого рейдера.
- Комм: `addon.Require "Services.Comms"` — свой префикс (`RCer`), `BulkSubscribe`, `SendGuaranteed`; в Midnight отправка запрещена в бою с боссом (RCLC ставит в очередь).
- История лута: `RCLootCouncilLootDB.factionrealm["Фракция - Реалм"]["Имя-Реалм"] = {…}` в SavedVariables; экспорт JSON/CSV встроен (`/rc history`). Рассылается всей группе → у любого члена совета полный лог.
- Референсные плагины (клонированы в scratchpad, можно скопировать в `reference/`): `RCLootCouncil_wowaudit` (`Data/db.lua`, `Modules/votingFrame.lua`, `Modules/shareData.lua`, `Modules/lootHistory.lua`), `RCLootCouncil_ExtraUtilities`, `RCLootCouncil_EPGP`.
- WeakAuras как альтернатива — хуже (нет файлового синка, только встраивание данных в строку WA); не рекомендую.

### 2.5 In-game API (12.x), полезное для аддона

- `GetInventoryItemLink("player", slot)`, `C_Item.GetItemInfoInstant(link)` (equipLoc, classID, subClassID без запроса к серверу), `C_Item.GetDetailedItemLevelInfo(link)` (ilvl с учётом bonusID), `C_Item.GetItemInfo(link)` (setID = 16-й результат), `C_Item.GetItemSpecInfo(link)` / `C_Item.DoesItemContainSpec(link, classID, specID)` (лут-элигибилити спек), `C_TooltipInfo.GetHyperlink(link)` (строка «Уровень улучшения: Герой 3/6»).
- Журнал можно дампить из игры: `EJ_SelectTier/EJ_SelectInstance/EJ_SetDifficulty/EJ_SelectEncounter` + `C_EncounterJournal.GetLootInfoByIndex(i)` → `itemID, encounterID, slot, armorType, link` (событие `EJ_LOOT_DATA_RECIEVED`).
- Ростер гильдии с рангами и заметками: `C_GuildInfo.GuildRoster()` + `GetGuildRosterInfo(i)` → name, rankName, rankIndex, level, class, publicNote, officerNote, guid → пишем в SavedVariables.
- SavedVariables пишутся только при `/reload`/логауте — инструмент читает файл по mtime; писать в SavedVariables снаружи нельзя (затрётся).
- Спеки: DK 250/251/252, DH 577/581/1480 (Devourer — новая), Druid 102–105, Evoker 1467/1468/1473, Hunter 253–255, Mage 62–64, Monk 268/270/269, Paladin 65/66/70, Priest 256–258, Rogue 259–261, Shaman 262–264, Warlock 265–267, Warrior 71–73.

---

## 3. Целевая архитектура

```
┌─────────────────────────────── easyroster (Node/TS, localhost) ───────────────────────────────┐
│  sync/blizzard   sync/wcl   sync/guides(IcyVeins,Wowhead*)   sync/raidbots(static, droptimizer) │
│         │            │              │                              │                            │
│         ▼            ▼              ▼                              ▼                            │
│  SQLite: characters, equipment, items, bonuses, loot_tables, bis_sources, bis_lists,           │
│          loot_history, guild_ranks, settings                                                   │
│         │                                                                                     │
│  engine/bis  (объединение источников → BiS по слоту на спеку → персональный лист)              │
│  engine/diff (BiS vs надето: obtained / lower track / missing; тир по itemSetId)               │
│         │                                                                                     │
│  web UI (React): Ростер · Персонаж · Лут-таблицы · Распределение лута · Настройки                       │
│  export/lua  → Interface/AddOns/RCLootCouncil_EasyRoster/Data/db.lua                          │
│  import/sv   ← WTF/Account/*/SavedVariables/{RCLootCouncil,RCLootCouncil_EasyRoster}.lua       │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                     ▲ файлы (генерация / чтение по mtime)                ▲ /reload
┌────────────────────────────── WoW: RCLootCouncil_EasyRoster (Lua) ─────────────────────────────┐
│  Data/db.lua (BiS-карта) · votingFrame.lua (колонка «BiS») · lootFrame.lua · shareData.lua     │
│  guildExport.lua (ранги/заметки → SavedVariables) · options (/rc er)                            │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Стек (рекомендация):** TypeScript везде (сервер + UI + генератор Lua), Node 22, Fastify, `better-sqlite3` (+ Drizzle ORM), React + Vite + TanStack Table, `luaparse` для чтения SavedVariables, `cheerio` для Icy Veins, `graphql-request` для WCL, опционально Playwright для Wowhead. Упаковка: `npm run start` (или позже Tauri/pkg в один exe). Альтернатива — Python (FastAPI + SQLite + slpp) — тоже подходит; TS выбран, чтобы один язык покрыл и веб-UI, и генерацию/парсинг Lua.

**Ключевые модели данных:**
- `Character{id, name, realmSlug, realmName, class, activeSpec, rankIndex, rankName, role(tank/heal/dps), isRaider, ilvlEquipped, lastLogin, lastSync, status(ok/nodata)}`
- `EquippedItem{characterId, slot, itemId, ilvl, bonusIds[], track, trackRank, setId, enchant, gems}`
- `Item{id, name, icon, invType, classId, subclassId, specs[], allowableClasses, setId, sources[{instanceId, encounterId}]}`
- `BisCandidate{spec, slot, itemId, source(icyveins|wowhead|wcl|droptimizer|simc|manual), score, meta}` → `BisEntry{characterId, slot, itemId, rank, reason, upgradePct?, obtained(status), obtainedTrack}`
- `LootHistory{id, characterKey, itemId, bonusIds, response, boss, difficultyId, date}`

**Правило объединения BiS (по умолчанию, настраивается):**
1. Если у персонажа есть свежий (≤ 14 дней) Droptimizer/SimC — ранжируем предметы слота по % апгрейда (это личный лист).
2. Иначе — редакционный список Icy Veins (Wowhead) даёт «BiS» и «альтернативы»; WCL-популярность подтверждает/переупорядочивает и добавляет предметы, которых нет в гайдах (порог, напр. ≥15% топ-парсов).
3. Ручные правки офицера/рейдера всегда сверху; изменения источников — с историей.
4. «Кому апнет больше» для конкретного дропа: сначала персональный % (сим), иначе ранг предмета в BiS-листе слота + разница треков/ilvl с надетым (`gear1/gear2` из RCLC в игре или equipment из API).

---

## 4. План работ по фазам

### Фаза 0 — каркас (1–2 дня)
- Монорепо `easyroster/`: `apps/server`, `apps/web`, `packages/core` (типы, парсеры), `addon/RCLootCouncil_EasyRoster`, `docs/`.
- Конфиг: `config.json` (регион, реалм, гильдия, индексы рангов «рейдер», Blizzard client id/secret, WCL client id/secret, путь к WoW).
- Мастер первого запуска в UI: ввести ключи, выбрать гильдию, отметить ранги.

### Фаза 1 — ростер и персонажи (3–5 дней)
- Blizzard-клиент: токен-кэш, `Battlenet-Namespace`, `If-Modified-Since`, ретраи 429, ограничение 50 rps.
- Синк: гильдия → фильтр по рангам → `/status` → summary + `/equipment` + `/specializations` (+ media). Планировщик: каждые N минут (по умолчанию 30) + кнопка «обновить сейчас». Инкремент по `Last-Modified`.
- Импорт названий рангов/заметок: (а) из SavedVariables `RCLootCouncil_EasyRoster.lua` (свой аддон), (б) fallback — из существующего `WowauditCompanion.lua`, (в) ручной маппинг.
- UI «Ростер»: таблица (имя, класс/спека, роль, ранг, ilvl, последний вход, статус синка), фильтры, ссылки на армори/WCL/Raider.IO.

### Фаза 2 — справочники и лут-таблицы (2–4 дня)
- Загрузчик Raidbots static (`metadata.json` → скачать/обновить `encounter-items.json`, `equippable-items.json`, `bonuses.json`, `instances.json`, `item-sets.json`, `item-conversions.json`) в SQLite; кэш иконок/тултипов.
- Таблица треков S1/S2 (bonusID → трек/ранг/ilvl) с хардкодом S1.
- Разбор `bonus_list` экипировки → трек/ранг/ilvl; определение тира по `itemSetId`.
- UI «Лут»: инстансы сезона → боссы → предметы; фильтр по классу/спеке/слоту; по предмету — «кому подходит и кому это BiS».

### Фаза 3 — движок BiS (5–8 дней)
- Парсер Icy Veins для всех 40 спек (по `data-wowhead`), нормализация в `BisCandidate` (слот, itemId, bonus, источник дропа, статус BiS/alt/catalyst).
- WCL v2: клиент, карта journalID → WCL encounterID, выборка `characterRankings(includeCombatantInfo)` для Mythic-боссов S2 (и Heroic пока Mythic мало), агрегация популярности по слотам (кэш, дозаполнение по расписанию, счётчик очков).
- Объединение → `BisEntry` по персонажу и спеке (основная + офф-спека, если включена).
- Diff с экипировкой: obtained (тот же itemId или тот же setId для тира), obtained-lower-track, missing; общий процент закрытия BiS.
- UI «Персонаж»: сетка слотов (надето vs BiS + альтернативы, треки, ссылки), редактор ручных правок, лог изменений. UI «Статик»: тепловая карта «персонаж × слот».

### Фаза 4 — аддон и лут-ночь (4–6 дней)
- `RCLootCouncil_EasyRoster`: `.toc` (`## Interface: 120100`, `## Dependencies: RCLootCouncil`, `## SavedVariables: EasyRosterDB`), `Data/db.lua`, `core.lua`, `Modules/votingFrame.lua` (Column API + fallback), `Modules/lootFrame.lua`, `Modules/shareData.lua` (свой префикс, рассылка по `RCMLAddItem`), `Modules/guildExport.lua` (ростер с рангами и заметками, экипировка группы → SavedVariables при `/reload`).
- Формат `db.lua` (компактно, только ID/числа):
  ```lua
  EasyRosterTimestamp = 1786235493
  EasyRosterData = {
    ["Акеприст-Ревущийфьорд"] = {
      [271874] = { r = 1, s = "b", p = 3.2, sl = "INVTYPE_HEAD", sp = 258 }, -- r=ранг в слоте, s=b(is)/a(lt)/c(atalyst), p=% апа (если есть)
    },
  }
  ```
  Тир-токены разворачиваются в itemID токена на стороне генератора; ключ — «Имя-Реалм» без пробелов, как в RCLC.
- Колонка «BiS» в Voting Frame: значение/сортировка/цвет (зелёный BiS, жёлтый альтернатива/апгрейд, серый нет, красный устаревшие данные), тултип с деталями (текущий предмет из `gear1`, трек, % апа, ранг в листе), опция сортировать кандидатов по колонке.
- Генератор Lua в инструменте + кнопка «Синк в игру» + автогенерация после каждого пересчёта; напоминание про `/reload`; чтение `EasyRosterTimestamp` аддоном → предупреждение «данные старше X дней».
- Чтение `RCLootCouncil.lua` (loot history) по mtime → отметка полученных предметов и трека (`lootWon` bonusID), учёт «Бис»-ответов; дедуп по `id`. Импорт вашей истории с марта 2026 сразу даёт статистику.
- UI «Распределение лута»: экран текущего рейда — по каждому предмету босса список персонажей, отсортированный по выгоде; параллельно дублирует то, что в игре видит совет.

### Фаза 5 — симы и качество (по желанию, 5–10 дней)
- Приём ссылок Raidbots Droptimizer (поле в карточке персонажа, вставляет рейдер или офицер) → парсинг `data.json` сразу, хранение результатов, пометка «устарел» через 14 дней; поддержка формата профильсетов (проверить порядок полей `name` на свежем отчёте).
- Локальный SimulationCraft: скачивание nightly, `armory=` → сохранение профиля → генерация profilesets по лут-таблицам рейда/M+ текущего сезона на нужном треке → ночной прогон с `target_error=0.5`, результаты как ещё один источник.
- Wowhead через Playwright (второй авторский источник) — опционально.
- Экспорт/импорт совместимого `db.lua` wowaudit (если часть совета пользуется их плагином).
- Упаковка в один exe (Tauri или `pkg`), автообновление статических данных, бэкапы SQLite.

---

## 5. Риски и решения

| Риск | Что делать |
|---|---|
| Blizzard 404/403 по части персонажей, задержка до логаута | Хранить последний успешный снимок, показывать возраст данных, ретраи; в игре брать `gear1/gear2` из RCLC |
| Ранги/заметки только из игры | Свой экспорт в SavedVariables + ручной маппинг; напоминание сделать `/reload` офицеру |
| Кириллица в именах/реалмах, связанные реалмы | Ключи «Имя-Реалм» нормализовать одинаково в инструменте и аддоне (title-case имя, реалм без пробелов, локализованное имя реалма как в `UnitFullName`); хранить и slug, и отображаемое имя |
| Изменение вёрстки Icy Veins/Wowhead | Парсер по стабильным `data-wowhead` атрибутам, тесты на сохранённых HTML, ручные правки не теряются |
| Ограничения ToS (Wowhead-скрейпинг, автосабмит Raidbots) | Wowhead только через браузер и с кэшем раз в неделю; Raidbots — только вставленные ссылки; WCL — свой ключ и лимит очков |
| WCL-данные S2 пусты в первые дни | Fallback на редакционные списки; показывать источник в UI |
| RCLC меняет API | Проверка версии (`addon:VersionCompare`), fallback на `scrollCols`, тест на текущей 3.23.0 |
| Комм в бою запрещён (Midnight) | Данные раздаются вне энкаунтера/при добавлении предметов; у всех членов совета лучше иметь `db.lua` (инструмент может писать в несколько установок/раздавать архив) |

---

## 6. Что нужно от вас, чтобы стартовать

1. Ключи: Blizzard client id/secret (community.developer.battle.net) и Warcraft Logs API client (warcraftlogs.com/api/clients) — вводятся в UI, наружу не уходят.
2. Подтвердить стек (TypeScript/Node + SQLite + React) или предпочесть Python.
3. Какие ранги считать рейдерами («Статик», «Рейдер»?), нужен ли учёт офф-спек и альтов.
4. Порядок фаз: предлагаю 0 → 1 → 2 → 3 → 4 (аддон) — к моменту, когда WCL накопит данные S2, будет готов и BiS-движок, и колонка в RCLC.

---

## 7. Источники

- Blizzard: https://community.developer.battle.net/documentation/guides/using-oauth/client-credentials-flow · https://community.developer.battle.net/documentation/guides/game-data-apis-wow-namespaces · ранги только числом: https://us.forums.blizzard.com/en/blizzard/t/how-to-pull-guild-rank-info/13191 · лимиты: https://us.forums.blizzard.com/en/blizzard/t/api-access-clients-rate-limits/5602 · неактивные персонажи: https://us.forums.blizzard.com/en/blizzard/t/new-api-old-characters-return-not-found/1831
- Raidbots: https://www.raidbots.com/developers · https://www.raidbots.com/static/data/live/metadata.json · https://support.raidbots.com/article/59-droptimizer-how-does-it-work
- wago.tools: https://wago.tools/api/builds · https://wago.tools/db2/ItemBonusListGroupEntry/csv
- Треки Midnight S2: https://www.method.gg/guides/all-midnight-season-2-upgrade-tracks-and-item-levels · https://www.icy-veins.com/wow/news/wow-midnight-gear-upgrading-made-easy/
- RCLootCouncil: https://github.com/evil-morfar/RCLootCouncil2 (Modules/VotingFrame/ColumnAPI.lua, core.lua, ml_core.lua) · https://github.com/wowaudit/RCLootCouncil_wowaudit · https://github.com/evil-morfar/RCLootCouncil_ExtraUtilities
- WCL API v2: https://www.warcraftlogs.com/api/docs · https://www.warcraftlogs.com/v2-api-docs/warcraft/encounter.doc.html
- Гайды: https://www.icy-veins.com/wow/arcane-mage-pve-dps-gear-best-in-slot · https://www.wowhead.com/guide/classes/mage/arcane/bis-gear · https://www.archon.gg/wow/builds/arcane/mage/raid/gear-and-tier-set/mythic/all-bosses · https://bloodmallet.com/
- wowaudit: https://wowaudit.com/api · https://wowaudit.com/desktop
- SimulationCraft: http://downloads.simulationcraft.org/nightly/ · https://github.com/simulationcraft/simc/wiki/BattleArmoryAPI
- WoW API/аддоны: https://warcraft.wiki.gg/wiki/ItemLink · https://warcraft.wiki.gg/wiki/API_C_Item.GetDetailedItemLevelInfo · https://warcraft.wiki.gg/wiki/AddOn_loading_process · https://warcraft.wiki.gg/wiki/Patch_12.1.0/API_changes · https://warcraft.wiki.gg/wiki/Saved_Variables
- Сезон: https://warcraft.wiki.gg/wiki/Patch_12.1.0 · https://blizzardwatch.com/2026/07/28/wow-12-1-release-date/
