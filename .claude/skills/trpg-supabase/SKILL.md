---
name: trpg-supabase
description: Конвенции базы данных проекта TRPG (Supabase Postgres). Применять при написании SQL, RPC, RLS-политик, миграций и Edge Functions для проекта TRPG.
---

# TRPG Supabase

Правила работы с базой данных проекта **TRPG**. Project Ref: `jybwxbqmnommazjfucbq`.

## Схема базы: ОДИН актуальный файл

`supabase/schema.sql` — полная структура базы (таблицы, ключи, индексы, функции,
триггеры, RLS, права). `supabase/seed.sql` — справочники: каталог упражнений
и встроенные программы. Вдвоём поднимают базу с нуля.

**Правило (пока нет живых пользователей):** после любой правки базы `schema.sql`
пересобирается заново и перезаписывается. В гите всегда одна версия, а не слои
патчей; история — в `git log -p supabase/schema.sql`. Папка `migrations/` пустая
и ждёт своего часа.

Как пересобрать: слепок снимается запросами к каталогу Postgres
(`pg_get_functiondef`, `pg_get_constraintdef`, `pg_indexes.indexdef`,
`pg_get_triggerdef`, `pg_policy`), потому что `supabase db dump` требует Docker,
а его на машине нет. Порядок секций в файле обязателен: расширения →
последовательности → таблицы → ключи → индексы → функции → триггеры → RLS →
права. Политики ссылаются на `current_user_id()`, триггер — на
`record_weight_point()`, поэтому функции обязаны идти раньше.

**Когда появятся живые пользователи** правило меняется: `schema.sql` пересоздаёт
объекты и накатить его на работающую базу будет нельзя. Тогда каждая правка —
отдельный файл в `migrations/` с меткой времени `20260819143000_имя.sql` (формат
обязателен: CLI ищет именно его и по нему понимает порядок), а `schema.sql`
остаётся слепком для разворачивания с нуля.

## Применение правок к проду

Через MCP-коннектор Supabase: `apply_migration` для DDL (создание/правка функций,
таблиц, политик), `execute_sql` для проверок и разовых запросов. Каждая правка —
отдельный вызов с осмысленным именем в snake_case, оно попадает в историю
миграций проекта.

После правки — **обязательно пересобрать `supabase/schema.sql`**, иначе слепок
разойдётся с базой, и развернуть проект с нуля станет невозможно. Это и есть
единственный настоящий риск: схема, которая существует только в облаке.

Проверять результат сразу же: `execute_sql` со счётчиками строк по затронутым
таблицам. Данные пользователей терять нельзя даже на пустом проекте — привычка
проверять важнее, чем цена конкретных данных.

## Правила для RPC-функций

- Все RPC с `SECURITY DEFINER` + `SET search_path TO 'public'` + явные `GRANT`/`REVOKE`.
- `CREATE OR REPLACE FUNCTION` везде.
- **Перед написанием новой функции** проверять существующую логику:
  `SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'имя_функции';`
- Тестировать сразу после миграции: `SELECT * FROM public.api_get_friends_list(2);`
- Для нескольких тестовых user ID — `UNION ALL` с алиасами:
  ```sql
  SELECT 'me(2)'  as who, * FROM public.api_get_my_league_place(2)
  UNION ALL
  SELECT 'fr(10)' as who, * FROM public.api_get_my_league_place(10);
  ```

### Шаблон RPC

```sql
CREATE OR REPLACE FUNCTION public.api_example(p_user_id bigint)
RETURNS TABLE (...)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ...
  WHERE user_id = current_user_id();   -- защита от чужого user_id
$$;

REVOKE ALL ON FUNCTION public.api_example(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_example(bigint) TO authenticated;
```

## Именование (SQL)

- Публичные RPC для фронта: префикс `api_*` (`api_get_friends_list`, `api_toggle_pin_friend`).
- Параметры функций: префикс `p_*` (`p_user_id`).
- Таблицы и колонки: snake_case.
- DEFINER-операции пользователя над собой: `api_*_my_*` (`api_reset_my_progress`).

## RLS

- Флаги приватности профиля: `show_last_workout` (true), `show_stats` (false),
  `show_favorites` (false), `show_weights` (true, только про любимые), `show_records` (true).
  Пишет `api_update_privacy(...)`. **Новый параметр туда добавлять с `DEFAULT NULL`**: старый
  бандл в кеше Telegram шлёт прежний набор аргументов, и без дефолта его вызов перестанет
  находиться (а `COALESCE` в теле и так оставит прежнее значение).
- Все таблицы защищены реальными политиками через `auth.uid()`.
- Хелпер `current_user_id()` мапит `auth.uid()` → внутренний `users.id`.
- DEFINER-функция `api_reset_my_progress()` для сброса прогресса.
- Тестовые внутренние user ID: 2 (Дмитрий), 10, 11, 12 (друзья).

## Аутентификация

- Edge Function `telegram-auth`: HMAC-SHA256 верификация Telegram initData.
- `auth_id` в таблице `users`; вход через `supabase.auth.verifyOtp`.

### Второй вход — почта (браузерная версия)

`users.email` + `email_verified_at`; **`telegram_id` больше НЕ NOT NULL** —
аккаунт может родиться в браузере. Взамен CHECK `users_has_login_method`:
хотя бы один способ входа обязан остаться. Правило живёт в базе намеренно —
ошибка в коде отвязки не должна запирать человека снаружи аккаунта.

Коды — таблица `email_codes`, хранится **отпечаток** кода (SHA-256 с секретной
солью `EMAIL_CODE_SALT`), не сам код. Политик у таблицы нет: работает только
сервер под service_role. Лимиты в базе: 60 с между письмами, 5 писем в час,
5 попыток на код.

**Префикс `srv_` вместо `api_` — не вкусовщина.** Блок прав в конце `schema.sql`
выдаёт EXECUTE роли anon ВСЕМ функциям `api_*`. Под тем именем `srv_email_attach`
позволила бы привязать свою почту к чужому аккаунту, то есть войти в него.
Серверные: `srv_email_issue_code`, `srv_email_verify_code`, `srv_email_attach`,
`srv_email_login_user` (+ `account_is_empty`) — только service_role.
Клиентские: `api_unlink_my_email`, `api_unlink_my_telegram` — authenticated,
личность берут из `current_user_id()`.

**Конфликт аккаунтов — НЕ сливаем.** Правило симметричное: переносим СПОСОБ
ВХОДА с пустого аккаунта на тот, где есть данные (`srv_email_attach`). Покрывает
оба направления — и «сначала Telegram, потом почта», и обратное. Пустой аккаунт
удаляется: терять в нём нечего (`account_is_empty` проверяет тренировки,
программы, свои упражнения, веса, любимые, заметки, друзей). Данные с обеих
сторон → `both_have_data`, решает человек. При переносе функция отдаёт
`final_user_id` (может ОТЛИЧАТЬСЯ от исходного) и `freed_auth_id` — Edge Function
выдаёт сессию на первый и удаляет осиротевшую запись входа.

**Грабля порядка:** сначала DELETE пустой записи, потом перенос `telegram_id`.
Наоборот нельзя — номер уникален, и на миг принадлежал бы двум записям; обнулить
его заранее не даёт CHECK. На этом функция падала при первом же тесте.

**ГРАБЛЯ ПИСЬМА: тема с кириллицей должна быть КОРОТКОЙ.** Кириллица в
заголовке кодируется втрое длиннее себя, стандарт ограничивает такую строку
75 символами, а denomailer длинные не разбивает. Postbox на это отвечает
`500: invalid mail data` — фразой, из которой тема не следует никак; полдня
можно искать в ключах, портах и отправителе. «123456 — код для входа в TRPG»
не проходила, `Код 123456` проходит. Имя отправителя (`TRPG <адрес>`) и html
при этом ни при чём — проверено по отдельности.

Edge Functions: `email-request-code` (выпуск + письмо), `email-verify-code`
(проверка + привязка/вход). Обе `verify_jwt=false`, защита своя: подпись
Telegram для привязки, лимиты для входа. Секреты: `SMTP_HOST/PORT/USER/PASS`,
`MAIL_FROM`, `EMAIL_CODE_SALT`. Почта — Yandex Cloud Postbox (2000 писем/мес
бесплатно), домен подтверждён DKIM+SPF+DMARC на trpg1.ru.

## Сезонная система

- Сброс раз в квартал через `pg_cron` + фронтенд-фолбэк.
- ISO-неделя: формат `IYYY-IW` (НЕ `YYYY-WW`) — для совместимости с `to_char`.
- Стрики кэпнуты на 7 естественно структурой БД (one-workout-per-day), `LEAST()` не нужен.

## Рекорды (раздел назывался «Лучшие результаты»)

**Один сборщик на всех — `srv_user_records(p_user_id, p_with_weights)`** →
`{ best_month: {month,count,minutes}, strength: {exercise_id,name,preview_url,muscle_group,sub_group,weight_kg}, swim: {distance_m,finished_at} }`.
Его зовут обе точки входа, чтобы «лучшее» не считалось по разным правилам в двух местах:
- `api_get_personal_records()` — свои (личность из `current_user_id()`);
- `api_get_user_public_profile()` — рекорды друга, полем `records`, под СВОИМ флагом
  `users.show_records` (дефолт true). Выключен — в ответе `records: null`, раздела нет ни у
  друга, ни в своей карточке.

**`show_weights` относится ТОЛЬКО к списку любимых.** В рекордах цифры показываются всегда:
«самый большой рабочий вес» без веса — не рекорд, а загадка. Прятать рекорд целиком —
работа тумблера `show_records`, а не весов.

- **Лучший месяц** — `srv_best_month(user, before)` → `(cnt, minutes, month_start)`, месяц с
  наибольшим числом тренировок по Москве; при равенстве берём поздний. Тот же хелпер сравнивает
  «до этого периода» в сводках бота.
- Силовой рекорд — МАКСИМУМ по `user_exercise_weight_history` (+ текущие `user_exercise_weights`),
  а не текущий вес: снизил вес после перерыва — рекорд остаётся. Отдельной колонки-рекорда НЕ заводим,
  история уже источник правды (иначе два состояния надо синхронизировать).
- Плавание — максимальная `workouts.distance_m` за одну завершённую тренировку. Кардио/растяжка — позже.
- **Порог «месяц считается рекордом» (≥2 тренировки) живёт на КЛИЕНТЕ** — там же, где текст
  (`PersonalRecords`, `notify-text.mjs`). База отдаёт сырое, продуктовое правило рядом с формулировкой.
- `srv_yearly_digest` отдаёт ещё и `best_month_minutes` + признаки `best_month_is_new`,
  `rec_weight_is_new`, `rec_swim_is_new` — «это НОВЫЙ рекорд, а не просто лучшее за год».
  Признак строго БОЛЬШЕ прежнего и требует, чтобы прежнее вообще было: «рекорд» в первый же
  год/месяц обесценивает пометку.

### ГРАБЛЯ ПРАВ: `REVOKE ALL FROM PUBLIC` НЕ снимает права у anon

Supabase выдаёт EXECUTE на КАЖДУЮ новую функцию в `public` ролям anon/authenticated
(default privileges), а `PUBLIC` в SQL — это не «все роли», а отдельная псевдороль. Поэтому
шаблон `REVOKE ALL ... FROM PUBLIC` оставлял свежую `srv_`-функцию открытой: `srv_user_records`
отдавала бы рекорды ЛЮБОГО человека мимо приватности, а `srv_yearly_digest` — telegram_id всех
сразу. **Для `srv_*` всегда писать `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;`
и явный `GRANT ... TO service_role`.** Проверять после миграции:
`SELECT proname, proacl FROM pg_proc WHERE proname LIKE 'srv\_%';` — там должен быть только
postgres + service_role. Вызову из `api_*` это не мешает: SECURITY DEFINER исполняется от
владельца, а не от anon.

## Любимые упражнения

- `user_favorite_exercises(user_id, slot, exercise_id)`, PK `(user_id, slot)`, CHECK `slot 1..5`.
- Лимит **5** живёт в ТРЁХ местах — менять все разом: CHECK на `slot`, константа `v_limit` в
  `api_add_favorite_exercise` (там же `generate_series(1, v_limit)` для поиска свободного слота)
  и `FAVORITE_LIMIT` во фронте (`src/lib/favorite-exercises.js`, оттуда же берут тексты про лимит).
  Превышение → `{success:false, error:'limit'}`, фронт показывает баннер в меню упражнения.
- `api_get_user_public_profile` отдаёт любимые БЕЗ своего лимита (сколько есть, столько и вернёт).
  В каждом любимом есть и `muscle_group`, и **`sub_group`** — без подгруппы тег у друга выходил
  урезанным («Спина» вместо «Спина — Ширина»). Миграция `public_profile_favorites_subgroup.sql`.

## Друзья

- Дружба — таблица `friendships(user_a_id, user_b_id)`, **симметричная** (одна строка на
  пару, направление любое). Закрепы — `friend_pins(owner_id, friend_id)`, лимит **6**.
- RPC: `api_get_friends_list(p_user_id)` (список без меня: `user_id, first_name, username,
  photo_url, last_workout_at, pinned_at, is_training` — поля-заглушки прежней
  соревновательной части из ответа УБРАНЫ,
  миграция `drop_league_leftovers.sql`), `api_toggle_pin_friend`,
  `api_remove_friend(p_user_id, p_friend_id)` (удаляет дружбу в обе стороны + закрепы пары;
  `not_friend`/`bad_args`). Клиент — `removeFriend` в `lib/friends-list.js`, UI — «Убрать из
  друзей» в модалке долгого нажатия (Friends.jsx, рядом с «Закрепить», с подтверждением).

## Программы и места (Зал/Дом/Улица)

**Лимит упражнений на день — 12** (был 10, поднят 2026-08-11: хвост дня это мелочь вроде икр,
приводящих и пресса, их делают суперсетами и тренировку они почти не удлиняют). Живёт в ДВУХ
местах, менять разом: `v_order > 12` в `api_save_my_program` и `MAX_PER_DAY` в `ProgramConstructor.jsx`.

**Встроенные программы** (`split`, `fullbody`, `swim`) держат слоты в КОДЕ (`data/programs/*.js`),
но строка в таблице `programs` им нужна — на неё ссылаются `workouts.program_id` и
`user_exercise_swaps.program_id`. Новая встроенная программа = файл данных + запись в `registry.js`
+ INSERT в `programs` (`source='global'`, `owner_id=NULL`).

**Грабля: `type` слота обязан совпадать с `type` упражнения в каталоге.** Экран замены ищет
альтернативы по `sub_group + type` — при расхождении список пустой. Так были сломаны икры
(в слоте `accessory`, в каталоге `isolation`), починено 2026-08-11. Заводишь слот — сверяйся с
`exercises`, а не переписывай тип из соседней строки.

- Слоты программ — таблица `program_days` (program_id, day A/B/C, **location** `gym|home|outdoor`,
  order_num, muscle_group, sub_group, type, exercise_id). Уникальность —
  `(program_id, location, day, order_num)` + CHECK на location.
- `api_save_my_program(p_user_id, p_name, p_day_count int, p_days jsonb)` — `p_days` это объект по
  местам `{ "gym": [ ["ex_001",...] /*день A*/, ... ], "home": [...], "outdoor": [...] }`. Удаляет все
  слоты программы и пересобирает; пустые дни/места пропускает; **≤12 упр/день**. Плюс чистит протухшие
  `user_exercise_swaps` этой программы: после пересборки order_num смещаются и свап мог бы попасть в
  чужой слот — остаются только совпавшие с новой раскладкой по (day, location, order_num)+sub_group+type.
  Зеркальная защита на клиенте — в `getWorkoutDay` (см. trpg-workflow «грабли»).
- `api_get_my_programs(p_user_id)` отдаёт по программе: `days` (набор **Зал**, для совместимости —
  экран дня читает его) **и** `locations` = `{ gym:{A:[...]}, home:{...}, outdoor:{...} }` (только
  непустые места).
- Существующие данные (Сплит + старые «Свои») мигрированы в `location='gym'`.

## История тренировок (`workouts`) и `api_finish_workout`

- Таблица `workouts` (user_id, program_id, day, started_at, finished_at, **distance_m**).
  `started_at` = реальный старт сессии (для длительности = `finished_at − started_at`);
  **distance_m** = метраж заплыва (плавание).
- `api_finish_workout(p_user_id, p_program_id, p_day, p_exercise_ids,
  p_finished_at DEFAULT now(), p_started_at DEFAULT NULL, p_distance_m DEFAULT NULL)`
  → `(workout_id, new_weekly_streak, already_completed_today, **highlights jsonb**)`.
  **Украшения идут тем же ответом** (`{comebackDays, records:[{kind,name,value,delta}]}`):
  вторым запросом с клиента они приезжали позже остальных показателей, и блок «Новые
  результаты» доезжал в уже открытую модалку. Логика НЕ продублирована — внутри зовётся та же
  `api_workout_highlights`, и её вызов обёрнут в `BEGIN/EXCEPTION WHEN OTHERS`: сохранение
  тренировки важнее украшений и не должно падать из-за них. Считается ПОСЛЕ вставки подходов
  (рекорды смотрят на упражнения этой тренировки); при `already_completed_today` — пусто.
  Отдельная `api_workout_highlights` жива: клиент ходит в неё запасным путём (`getWorkoutHighlights`).
  **Нагрузка от объединения не выросла** — те же запросы, но один поход к серверу вместо двух
  (одно соединение, одна проверка прав).
  `started_at := COALESCE(p_started_at, p_finished_at)` (силовая шлёт реальный старт из
  активной сессии; заплыв — null → длительность 0, меряется метрами). При добавлении
  параметра — **DROP старого оверлоуда + CREATE** (иначе PostgREST не выберет функцию из
  двух кандидатов с дефолтами → ambiguous). После пересоздания — заново REVOKE/GRANT.
- **Лимит пока ГЛОБАЛЬНЫЙ**: 1 засчитанная тренировка в сутки (Москва) на всё, второй раз
  `already_completed_today=true` без нового ряда/баллов. TODO (просил Дмитрий): лимит **на
  раздел** (силовая + плавание раздельно) + жёсткая блокировка кнопки «Завершить». См.
  [[proj-trpg-history-calendar]].
- История в UI — месячный календарь `components/HistoryCalendar.jsx` (на `/history` и внизу
  главной), показывает 2 месяца, данные из `getRecentWorkouts` (тянет started_at + distance_m).

## История веса (`user_exercise_weight_history`) — график прогресса

- Таблица `user_exercise_weight_history` (user_id bigint, exercise_id text, day date,
  weight_kg numeric, updated_at). PK `(user_id, exercise_id, day)` → **одна точка в день**
  (по Москве). RLS: select только своих (`current_user_id()`).
- Пишет **триггер** `record_weight_point()` (SECURITY DEFINER, в обход RLS) на
  `AFTER INSERT OR UPDATE OF weight_kg ON user_exercise_weights` — upsert точки за сегодня
  (Москва). То есть история наполняется сама при любом сохранении веса (онлайн-RPC,
  фолбэк-upsert, синк оффлайн-очереди) — отдельного вызова с клиента НЕТ.
- Чтение: `api_get_weight_history(p_user_id bigint, p_exercise_id text)` → `(day, weight_kg)`
  по возрастанию дня. Клиент: `getWeightHistory(exerciseId)` в `features/exercises/api.js`
  (кеш `weight-history:{userId}:{exId}`, сбрасывается в `saveExerciseWeight`).
- UI: иконка прогресса (Material trending_up) внизу карточки в `ExerciseActionMenu`
  (симметрично сердечку) → модалка `WeightProgressModal`. График «как в Тинькофф»:
  чистая SVG-линия без точек/сетки, пунктир текущего веса через весь график,
  скраб пальцем (вес+дата вверху, хаптика), переключатель Месяц·Год·Всё время со
  стрелками листания. Всё на клиенте (фильтр/скраб), БД не трогает. Правка веса на
  карточке синкается в модалку через `onWeightSaved` (ExerciseCard→WorkoutDay slots).
- **Задним числом данных нет**: миграция сидит текущие веса одной точкой «сегодня»,
  дальше линия растёт по мере изменений веса. Миграция — `supabase/migrations/weight_history.sql`.

## Свои упражнения пользователя (`exercises.owner_id`)

Своё упражнение лежит В ТОЙ ЖЕ таблице `exercises`, отдельной `user_exercises` НЕТ.
Системное — `owner_id IS NULL`, своё — `owner_id = users.id`, id с префиксом `ux_`
(сквозная последовательность `user_exercise_seq`, номера не переиспользуются).

**Почему одна таблица.** На `exercises.id` завязаны FK почти всего приложения:
`program_days`, `user_exercise_weights`, `user_exercise_swaps`,
`user_favorite_exercises`, `workout_exercises`, история весов, рекорды. Отдельная
таблица означала бы либо снять эти FK, либо продублировать каждую механику. С
колонкой владельца своё упражнение полноправно везде без единой правки этих
механик — это и есть главное архитектурное решение фичи.

**RLS.** На таблице висит RESTRICTIVE-политика `exercises_public_reads_system_only`
(`owner_id IS NULL`): прямой select с anon-ключом физически не может вернуть ничью
пользовательскую строку. RESTRICTIVE выбрана специально — она складывается с любой
существующей политикой через AND, поэтому имя старой знать не нужно.
Свои приходят ТОЛЬКО через SECURITY DEFINER функции.

Отсюда правило: **любое новое чтение своих упражнений — через RPC, не через
`.from('exercises')`**. Прямой select их не увидит (на эти грабли уже наступал
`getExerciseById` — экран техники для своего упражнения открывался пустым).

**Функции:** `api_get_my_exercises(user)`, `api_create_my_exercise`,
`api_update_my_exercise`, `api_delete_my_exercise`, `api_get_exercises_by_ids(ids[])`.

- Лимит 12 своих на человека — в `api_create_my_exercise`. Второе место лимита —
  `MY_EXERCISE_LIMIT` в `features/programs/userExercises.js`, менять разом.
- `api_get_exercises_by_ids` отвечает только по точному списку id (≤50) — нужна
  ровно для программы, сохранённой у друга: в её слотах может стоять его личное
  упражнение. Перебрать через неё каталог нельзя.
- **`api_get_all_exercises` фильтрует `owner_id IS NULL`.** Она SECURITY DEFINER
  и обходит RLS — без фильтра общий каталог раздавал бы всем чужие личные
  упражнения. Это же правило на любую новую definer-функцию по exercises.
- **Удаление — ПОЛНОЕ**, без архива: хлам в базе не копим. Функция руками чистит
  `exercise_sets` (FK RESTRICT), `program_days` (FK NO ACTION), заметки, историю
  веса, любимые, свапы, веса — и только потом сносит строку. Сами тренировки
  (`workouts`) не трогаются: день в календаре, серия и длительность остаются.
  После выемки `order_num` в дне пересобирается подряд — иначе дыры разъедутся
  со свапами. День может от этого опуститься до нуля: экран дня показывает
  состояние с выходом в конструктор, это нормальный сценарий, а не ошибка.
- `api_save_my_program` пускает в слот системное ИЛИ своё собственное упражнение
  (`owner_id is null or owner_id = p_user_id`) — без этой проверки чужой приватный
  id можно было бы затащить в программу запросом мимо интерфейса.

Группа и подгруппа — свободный текст, пустая строка вместо NULL (колонки участвуют
в сравнении слотов). Совпал ключ с системной группой (`legs`, `back`…) — тег
красится её цветом; не совпал — акцентным.

**Масштаб.** Своих не больше 12 на человека: тысяча пользователей — 12 тысяч строк
там, где сейчас 88. Для Postgres это ничто, индекс по владельцу частичный,
системный каталог читается тем же планом, что и раньше. Отдельная таблица ради
объёмов не нужна.

### Программа друга с личными упражнениями автора

Одолжить чужое личное упражнение нельзя: получателю нужно вести в него СВОЙ вес,
а вес привязан к упражнению. Поэтому при сохранении программы такие упражнения
**копируются получателю** и становятся его личными.

- Копия — из снимка ссылки (`shared_programs.custom_exercises`), а не из живой
  строки автора: автор мог успеть переименовать или удалить упражнение,
  а поделился он конкретной версией.
- `programs.share_token` помнит, из какой ссылки пришла программа, — иначе снимок
  пришлось бы угадывать по автору, а он мог поделиться несколькими программами.
- Копия упирается в тот же лимит 12. Не хватило места — программа сохраняется,
  но **заблокирована**: в слотах id автора, `pending_custom > 0`, приложение не
  даёт её открыть и говорит, сколько мест освободить.
- `api_adopt_program_exercises(user, program)` → `{ ok, need, free, copied }`.
  Зовётся и автоматически при сохранении, и потом кнопкой из модалки.

## Медиа (Selectel S3, бакет `trpg`)

- Cache-Control `public, max-age=31536000, immutable`.
- Видео: `TRPG/video/`, превью: `TRPG/`.
- При замене видео — всегда НОВОЕ имя файла; старый удалять с задержкой (из-за immutable-кэша).
- Не смешивать публичные и приватные файлы в одном бакете.
- Модерация пользовательских аватаров — только server-side через Edge Function.

## Соревновательной части и «валюты» в базе НЕТ (аудит 2026-08-19)

Лиги, сезоны, ранги, значки, титулы, подстраховка вычищены давно. Ревью 19.08 добило
последнее — то, что оставалось заглушками:

- поля `new_total_muscles` и `new_badge_rank_index` в `api_finish_workout`
  и `complete_daily_quest` (тела возвращали жёсткие 0 и NULL);
- параметр `p_reward` там же — он никогда никуда не записывался;
- колонки `users.total_muscles`, `workouts.muscles_earned`, `daily_quests.reward`.

Тогда же снесены три функции, которые не звал никто: `api_get_program_day`,
`get_workout_day` (сборка дня переехала на клиент; вторая вдобавок была
единственной без SECURITY DEFINER) и `upsert_user` (авторизация идёт через
Edge Function `telegram-auth`, которая пишет в `users` напрямую).

**НЕ путать с живым:** `users.weekly_streak` + `weekly_streak_week` (серия за неделю),
`exercises.muscle_group` / `muscle_icon` (группы мышц — это навигация, а не игра),
`workouts.distance_m`. Всё это в работе.

**Правило на будущее:** заглушка в сигнатуре — это не «безобидный ноль», а обещание,
которое читает следующий разработчик. Либо поле работает, либо его нет.

## Важно

- Legacy `service_role` ключ (формат `eyJ…`) действителен до конца 2026.
  Кнопку «disable legacy keys» НЕ нажимать до полной миграции ключей.
- GitHub Actions keepalive (2×/неделю) не даёт уснуть Supabase free-tier.
- **UI-настройки (свёрнутость секций, закрепы, активные дни) в Supabase НЕ хранить** —
  для них есть Telegram CloudStorage (`lib/cloud-storage.js`), он и синкает между устройствами.
  Не заводить таблицы/RPC под клиентские предпочтения. Детали — в trpg-workflow.
