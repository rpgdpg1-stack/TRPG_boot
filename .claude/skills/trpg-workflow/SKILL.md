---
name: trpg-workflow
description: "Входной скил для ЛЮБОГО запроса по проекту TRPG (Telegram Mini App, фитнес-RPG на Vite+React+Supabase): правки кода, баги, обсуждение задач, добавление программ, ревью. Отсюда маршрутизация в trpg-ui (визуал/стили) и trpg-supabase (БД/SQL)."
---

# TRPG Workflow

Проект **TRPG** — геймифицированный фитнес-трекер, Telegram Mini App.
Пользователь (Дмитрий) — нон-программист. Конвенции базы данных — в скиле «trpg-supabase»,
дизайн-система — в скиле «trpg-ui».

## Маршрутизация скилов (как сам выбираю)

Любой запрос по TRPG начинается с **этого** скила. Дальше по теме задачи подцепить нужный
(можно несколько сразу) — Дмитрию явно говорить не нужно, определяю сам:
- визуал, экран, стили, компонент, анимация, цвет, отступ, хаптика → **trpg-ui**;
- целостность/архитектура дизайн-системы, токены, «не сломать ДС» при правке интерфейса →
  **design-system-review** (страж: сначала существующее, новое — с обоснованием; звать ПЕРЕД правкой UI);
- рисование/перенос/синк в Figma (мост TalkToFigma, портфолио) → **trpg-figma**;
- БД, SQL, RPC, RLS, миграция, Edge Function, стрики на стороне БД → **trpg-supabase**;
- процесс, баг в логике, новая программа, чистота кода, коммиты → остаюсь в **trpg-workflow**.

**Правило качества:** любая правка интерфейса сверяется с **design-system-review** и приводит код
(и, если синкаем, Figma) к единому виду ДС — не плодить частные случаи. Не переделываем весь проект
разом: приводим к идеалу то, что трогаем, и закрываем пробелы по ходу.

## Контекст

- **Стек:** Vite + React 18 + React Router 6 + Supabase + Telegram WebApp SDK.
  Деплой на Vercel. Медиа на Selectel S3, бакет `trpg`. Стили — CSS (НЕ Tailwind).
- **Supabase Ref:** `jybwxbqmnommazjfucbq`. Бот: `@TrainingRPGbot`.
- **Прогресс (ЛИЧНЫЙ, без соревновательности):** мускулы 💪 (валюта прогресса), недельные стрики,
  ежедневные активности/квесты, история тренировок, любимые упражнения, друзья+профиль на личном
  прогрессе (приватность). **Отказ (удалено из кода):** лиги, XP-как-система, сезоны, лидерборды/рейтинг,
  ранги/рамки-награды, подстраховка. Не возвращать без явной просьбы. См. память «соц-архитектура».
- **Программы:** `split` (A/B/C силовой) и `swim` («Заплыв 45», дистанция). Плюс пользовательские:
  своя (`source: 'custom'`) и от друга (`source: 'shared'`) — грузятся в реестр в рантайме.
  Упражнения — в Supabase.

## Старт задачи (в Claude Code)

Файлы читаю **сам** из репозитория — не прошу Дмитрия их прикладывать. Перед правкой:
прочитать актуальные файлы по теме (Read/Grep), понять текущую логику, и только потом менять.
Не править по памяти — память не хранит код, без свежего файла правки → баги.

**Точечно, а не весь репозиторий.** Брать только файлы, относящиеся к задаче, + их прямые
связи (импорты, общие утилиты/компоненты). Дерево проекта (внизу скила) — карта, чтобы найти
нужное, а не повод читать всё. Пример: «поменять главный экран» → `pages/Home.jsx` и то, что
он рендерит/импортирует (напр. `PlayerCard`), а не все 80+ файлов. Сканировать широко (Grep по
всему `src`) — только когда правда нужно найти все места использования паттерна.

## Формат правок (в Claude Code)

- Правки вношу **напрямую** инструментами (Edit/Write) — без формата «Было/Стало» (он был нужен
  для ручной вставки в чате, тут не нужен).
- Точечные правки делать минимальными и адресными, по стилю окружающего кода.
- Целый файл писать только если он новый.
- «Дай полный код файла» — показать полностью без споров.

## Подача

- Если задача из нескольких шагов — нумеровать («Шаг 1 из 5», SQL-блоки тоже считаются),
  чтобы Дмитрий видел прогресс.
- SQL/миграции: если утверждено — применять сам через Supabase-коннектор
  (правила и защита от деструктива — в скиле «trpg-supabase»).

## Коммиты + пуш (разрешено самому, без спроса)

Дмитрий разрешил коммитить **и пушить** правки самому, без отдельного спроса. Порядок:
- После правки прогнать `npm run lint` (или eslint по изменённым файлам) и `npm run build`.
  **Коммитить только если оба прошли.**
- Коммит прямо в `main`, сообщение на русском в стиле conventional commits
  (`fix(...)`, `feat(...)`, `refactor(...)`).
- Сразу после коммита — `git push`. Дмитрий проверяет на сайте GitHub; если что-то не так,
  скажет откатить (или откатит сам через сайт). НЕ ждать ручного нажатия в GitHub Desktop.
- Нашлась ошибка позже — поправить новым коммитом (или amend, если ещё не запушено) и снова
  запушить.
- Только чисто markdown-правки (скилы, доки) — билд гонять не обязательно, но пушить так же.

## Обновление скилов (по итогу правок)

Скилы живут в репозитории: `.claude/skills/{trpg-workflow,trpg-supabase,trpg-ui}/SKILL.md`.
Когда правки за сессию вскрыли что-то для дизайн-системы/конвенций (новый паттерн, класс,
переиспользуемое правило, устаревшая инфа) — **сам отредактировать нужный SKILL.md**
(вплести новое в существующую структуру, удалить устаревшее) и закоммитить+запушить вместе с кодом.
Спрашивать разрешения не нужно — это часть работы.

**Триггеры обновления:** новый файл (→ обновить «Дерево проекта») · новый переиспользуемый
паттерн/класс/токен (→ trpg-ui) · новая конвенция БД/RPC (→ trpg-supabase) · новая «грабля»
или изменение процесса (→ trpg-workflow) · что-то стало неверным/устарело.

**Формат уведомления — коротко, в самом конце ответа,** одной-двумя строками. Пример:
> 🛠 Обновил скил **trpg-ui**: добавил 2 пункта — токен `--radius-pill` и правило для сегмент-контролов.

Не расписывать подробно, не молчать.

## Чеклист перед коммитом

Импорты целы и нет ссылок на удалённое · новые файлы внесены в дерево (обновить этот скил) ·
нет мёртвого кода от правки · при изменении БД — RPC протестирован · `lint` + `build` зелёные.

## Именование

`api_*` — RPC · PascalCase `.jsx` — компоненты · нижний регистр — слаги программ ·
camelCase — утилиты (`getTodayKey`).

## Известные грабли (не наступать)

- Клавиатура iOS → высота через `visualViewport`.
- Telegram-кеш WebView отдаёт СТАРЫЙ `index.html`/бандл (древняя итерация зависает, «Назад» мёртвая).
  Три слоя защиты:
  (1) `vercel.json`: `no-store` на ВСЕ документные пути `/((?!assets/).*)` — не только `/`, ведь WebView
  восстанавливает свёрнутую страницу по её реальному URL (`/workout/...`), который через rewrite тоже
  отдаёт index.html; `immutable` на `/assets/*` (хешированы).
  (2) Загрузочный «сторож» в `index.html`: если за 15с не встал `window.__APP_BOOTED__` (ставит
  `App.jsx` после загрузчика) — показывает `#boot-fallback` с кнопкой «Перезапустить» (жёсткая
  перезагрузка: сброс `caches` + `location.replace(pathname + '?r=' + Date.now())`) и «Закрыть
  приложение» (`tg.close()`). Та же жёсткая перезагрузка — в `ErrorBoundary`. НЕ возвращать
  `window.location.reload()` — он тянет тот же битый бандл из кеша.
  (3) Вахтёр версии `lib/version-check.js` (старт в App): iOS-Telegram восстанавливает замороженный
  WebView со старым бандлом БЕЗ сетевых запросов — заголовки/сторож бессильны. В бандл вшит
  `__BUILD_ID__` (define в `vite.config.js`, рядом генерится `dist/version.json` с тем же id);
  на пробуждении после ≥60с в фоне фетчим `/version.json` (no-store), id не совпал → hardReload.
  Кулдаун 2 мин в sessionStorage от зацикливания; ошибки сети молча глотаются (оффлайн не трогаем).
- Скролл в модалках → `data-scrollable` + `onTouchMove`.
- Inline SVG с `currentColor` → `import.meta.glob` с `?raw` + `dangerouslySetInnerHTML`.
- Завершение квеста → `pointerUp` с порогом `TAP_THRESHOLD_PX = 8`.
- Стрики кэпнуты на 7 структурой БД (one-per-day), `LEAST()` не нужен.
- Стрик: начальный `useState` гнать через `resolveWeeklyStreak(streak, week)` (utils/dates),
  а не показывать сырое `weekly_streak` — иначе вспышка прошлого значения при смене недели.
- Имя программы в истории: кастомную (`source: 'custom'`) показывать как ввёл юзер (его регистр),
  встроенную — через `titleCase`. Не гнать всё через `titleCase` (`describeWorkout` в utils/history).
- Завершение тренировки: модалка завершения сохраняет СНАЧАЛА (`runFinish`), вид определяется
  результатом — награда `+150` / лимит (`already_completed_today` → поздравление без баллов + серая
  заметка про «1 тренировка в день») / оффлайн / ошибка. Не показывать `+150` до подтверждения сервера.
  Эталон-поток одинаков в `WorkoutDay` и `SwimWorkout`. Лимит держит сервер (`api_finish_workout`,
  Москва-сутки), фронт его НЕ дублирует.
- История хранится ПОЛНОСТЬЮ: таблица `workouts` — запись на каждую завершённую тренировку (id, user_id,
  program_id, day, started_at, finished_at, muscles_earned, distance_m), ничего не удаляется.
  Фильтры Неделя/Месяц/Год/Всё — клиентский `summarizeWorkouts`/`periodRange` по
  выборке (`HISTORY_FETCH_LIMIT=5000`, `utils/history.js`). Год-окна/ретенции НЕТ (убрали `MAX_MONTHS_BACK`).
- Длительность в истории — из `started_at`/`finished_at` (клиентский расчёт `workoutMinutes` в
  `utils/history.js`), отдельной колонки нет. У силовой `started_at` = старт сессии. У заплыва сессии нет:
  `SwimWorkout` передаёт в `finishWorkout(...)` 6-м аргументом **синтетический `startedAtOverride`** =
  `now − swimMinutesForMeters(meters)`, чтобы длительность записалась (та же, что «≈N мин» в шапке).
  Старые заплывы без старта → время просто не показывается.
- Свап (замена упражнения) привязан к `order_num`. После правки/перестановки программы в
  конструкторе order_num смещаются → старый свап попадал бы в чужой слот (упражнение другой
  группы, напр. гиперэкстензия-спина, в шею). `getWorkoutDay` применяет свап ТОЛЬКО если
  `swapEx.sub_group === slot.sub_group && swapEx.type === slot.type`, иначе — `default` из
  конструктора. Упражнения живут строго по группе/подгруппе/типу.
- Активная тренировка — одна на приложение (`lib/active-workout.js`, localStorage
  `active-workout` = `{programId,day,place,startedAt}`). День «тренируется» только после тапа
  «НАЧАТЬ ТРЕНИРОВКУ»: до старта таймера НЕТ вовсе (вместо него часы + оценка `≈ N мин`), галочки
  не ставятся (только заметки по long-press). После старта таймер = `now−startedAt` (переживает
  уход/возврат/смену дня), цвет до 1ч — зелёный (наш акцент), 1ч→оранж, 1ч30→красный. Кнопка →
  «ЗАВЕРШИТЬ · N/M» (прогресс-заливка там же; верхнего прогресс-бара нет). Завершение чистит сессию. На других
  днях/программах «Начать» заблокирована (одна за раз). Смена статуса — событие `onActiveWorkoutChange`
  (карточки `ProgramCard`/`FavCardBody` показывают статус-строку `N/M · полоска · время` + бейдж
  «▶ Продолжить» и ведут в активный день). Время форматируем `formatWorkoutMin`. Заплыв (`SwimWorkout`)
  в эту модель НЕ входит — там мгновенное «Завершить» без таймера/сессии.
- Подсветка дня едина на карточках и в шапке дня: «фокусный» день = активная сессия программы, иначе
  рекомендованный по циклу (`getActiveDaySync`/`nextDayInCycle`). См. trpg-ui «Шапка дня» (буква/DayPicker).
- Оффлайн-сейв не должен висеть: `finishWorkout` гонит RPC с `FINISH_TIMEOUT_MS` (7с) через
  `Promise.race`; таймаут или сетевой throw → в оффлайн-очередь (как `!isOnline()`) + фоновый
  `checkNow()`. Нужно из-за «мёртвого Wi-Fi» в зале (navigator.onLine врёт). Оффлайн-тексты — без
  обещания «+150» (лимит оффлайн не проверить).

## Кросс-девайс настройки (НЕ Supabase)

UI-предпочтения, которые должны быть одинаковы на телефоне и ПК (свёрнутость секций главной,
последний закреп, активные дни программ) — хранить через `lib/cloud-storage.js`
(`cloudGet`/`cloudSet`): это Telegram CloudStorage + localStorage-кеш, привязка к аккаунту,
синк между всеми устройствами. **Отдельную таблицу/RPC в Supabase для таких настроек не заводить** —
Дмитрий называет это «в супабазе сохранить», но правильный инструмент здесь — CloudStorage.
Паттерн: старт из `localGet` (мгновенно) → `useEffect` догоняет из `cloudGet`; при изменении пишем
в оба (`localSet` + `cloudSet`).

## Стоп-лист (НЕ делаем)

A/B/C-гибрид · Google Sheets (миграция сделана) · кнопку «disable legacy keys» до миграции ключей.

## Новая программа тренировок

Уточнить: название, дни, упражнения по дням. Затем пакетом одним коммитом:
`src/data/programs/<slug>.js` → запись в `registry.js` → INSERT в Supabase →
универсализация мест с захардкоженным `'split'`. (Следующая — Full Body.)

## Чистота кода

После правок чистить: неиспользуемые файлы, мёртвый код, старые импорты.
Перед удалением проверить, кто использует; при сомнении — оставить и предупредить.

## ENV (только имена, без значений; см. .env.example в репо)

Фронт (Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`.
Серверные (Supabase secrets): `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, Selectel S3 creds.

## Дерево проекта

Актуально на 2026-06-16. **При создании нового файла — внести его сюда** (я редактирую этот скил
сам и коммичу). Регенерация:
`find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | sort`

```
Корень: .env.example · .env.local · .gitignore · README.md · CLAUDE.md · eslint.config.js
        index.html · package.json · vercel.json · vite.config.js
        .github/workflows/keepalive.yml
        .claude/skills/{trpg-workflow,trpg-supabase,trpg-ui}/SKILL.md

src/
├── App.jsx · main.jsx (Sentry PROD)
├── index.css (только @import 4 модулей) → styles/{tokens,base,keyframes,utilities}.css
│                   (tokens.css = :root все дизайн-токены; base = reset/каркас; keyframes; utilities = классы)
├── assets/ui/      SVG-иконки: cardio change check cloud_done cloud_sync friends info invite-friend
│                   leaderboard muscles muscles-line network_off notes place-gym place-home place-street
│                   power profile rewards settings stretching swimming
├── components/     ActionButton AnchorMenu CategoryList CategorySwiper ChevronIcon ClockIcon DailyQuests
│                   ExerciseActionMenu ExerciseCard ExerciseHeaderCard ExercisePicker ExerciseVideo FavCardBody
│                   FavoritesBlock FinishConfirmModal FriendRow HeartButton HeartIcon HistoryCalendar HistoryStats
│                   ModalButton MuscleIcon OfflineBanner PencilIcon PinIcon PixelCheckbox PlaceSwitcher
│                   PlayerProfileModal PoolTag ProfileHeader ProgramCard ProgramEmblem SaveFriendProgramModal
│                   ScreenTitle SectionCarousel SectionPicker StreakFlame TabBar UiIcon WaterChrome
│                   WeightProgressModal WeightRaiseFlash WorkoutFinishedModal
│   └── layout/     ErrorBoundary · Loader
├── data/programs/  split.js · swim.js
├── features/exercises/  api.js · weight-format.js
├── features/programs/   api.js · categories.js · colors.js · customProgram.js · labels.js · registry.js
├── lib/            accent active-workout activities auth cache cloud-storage events favorite-exercises friends
│                   friends-list history-view network-status notes offline-queue persistent-cache privacy
│                   profile-cache program-place storage supabase sync-engine telegram use-outside-close
│                   version-check weight-editing-state
├── pages/          Activities Category DailyBoost ExerciseInfo FavoriteExercises Friends History Home Privacy
│                   Profile ProgramConstructor Recovery Settings SwapExercise SwimWorkout WorkoutDay
│                   (Активности: /daily-boost = Activities.jsx-виджет, /daily-boost/edit = DailyBoost.jsx-конструктор)
└── utils/          dates history plural storage workout-progress

supabase/
├── config.toml
├── migrations/     weight_history.sql (история рабочего веса: таблица + триггер + RPC)
└── functions/telegram-auth/  index.ts · deno.json · .npmrc
```

## Коммуникация

Неформальный русский, короткие сообщения, термины вперемешку с разговорным.

**Английские термины — с русским в скобках.** Дмитрий учит английский: любой
англоязычный термин (Figma/дизайн/код) при первом упоминании в ответе давать как
`English (русский смысл)` — не тупой перевод, а смысл. Касается и имён переменных,
и названий фреймов/Auto Layout, если они на английском. Примеры: `Frame (фрейм/рамка)`,
`Auto Layout (авто-раскладка)`, `Hug (по содержимому)`, `Variant (вариант/состояние)`,
`surface/dim (поверхность, приглушённая)`. Когда скажет «выучил» — пометки убрать.
