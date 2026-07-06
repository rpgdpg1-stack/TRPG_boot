---
name: trpg-supabase
description: Конвенции базы данных проекта TRPG (Supabase Postgres). Применять при написании SQL, RPC, RLS-политик, миграций и Edge Functions для проекта TRPG.
---

# TRPG Supabase

Правила работы с базой данных проекта **TRPG**. Project Ref: `jybwxbqmnommazjfucbq`.

## Применение миграций

- Если правка **утверждена Дмитрием** — применять её самому через Supabase MCP-коннектор
  (`apply_migration` / `execute_sql`), не выводить SQL-блок для ручной вставки.
- Перед применением показать финальный SQL.
- На деструктив (DROP, TRUNCATE, DELETE/UPDATE без WHERE, ALTER с потерей данных) —
  переспросить отдельно, даже если задача в целом утверждена.
- Если коннектор недоступен — фолбэк: готовый блок для Supabase SQL Editor.
- После применения миграции — сразу тестировать (см. ниже).

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

- Все таблицы защищены реальными политиками через `auth.uid()`.
- Хелпер `current_user_id()` мапит `auth.uid()` → внутренний `users.id`.
- Колоночная защита таблицы `users` от накрутки мускулов.
- DEFINER-функция `api_reset_my_progress()` для сброса прогресса.
- Тестовые внутренние user ID: 2 (Дмитрий), 10, 11, 12 (друзья).

## Аутентификация

- Edge Function `telegram-auth`: HMAC-SHA256 верификация Telegram initData.
- `auth_id` в таблице `users`; вход через `supabase.auth.verifyOtp`.

## Сезонная система

- Сброс раз в квартал через `pg_cron` + фронтенд-фолбэк.
- ISO-неделя: формат `IYYY-IW` (НЕ `YYYY-WW`) — для совместимости с `to_char`.
- Стрики кэпнуты на 7 естественно структурой БД (one-workout-per-day), `LEAST()` не нужен.

## Друзья

- Таблица `friend_pins` (лимит 5, RLS).
- RPC: `api_get_friends_list`, `api_toggle_pin_friend`, `api_get_my_league_place`.

## Программы и места (Зал/Дом/Улица)

- Слоты программ — таблица `program_days` (program_id, day A/B/C, **location** `gym|home|outdoor`,
  order_num, muscle_group, sub_group, type, exercise_id). Уникальность —
  `(program_id, location, day, order_num)` + CHECK на location.
- `api_save_my_program(p_user_id, p_name, p_day_count int, p_days jsonb)` — `p_days` это объект по
  местам `{ "gym": [ ["ex_001",...] /*день A*/, ... ], "home": [...], "outdoor": [...] }`. Удаляет все
  слоты программы и пересобирает; пустые дни/места пропускает; ≤10 упр/день. Плюс чистит протухшие
  `user_exercise_swaps` этой программы: после пересборки order_num смещаются и свап мог бы попасть в
  чужой слот — остаются только совпавшие с новой раскладкой по (day, location, order_num)+sub_group+type.
  Зеркальная защита на клиенте — в `getWorkoutDay` (см. trpg-workflow «грабли»).
- `api_get_my_programs(p_user_id)` отдаёт по программе: `days` (набор **Зал**, для совместимости —
  экран дня читает его) **и** `locations` = `{ gym:{A:[...]}, home:{...}, outdoor:{...} }` (только
  непустые места).
- Существующие данные (Сплит + старые «Свои») мигрированы в `location='gym'`.

## История тренировок (`workouts`) и `api_finish_workout`

- Таблица `workouts` (user_id, program_id, day, started_at, finished_at, muscles_earned,
  notes, **distance_m**). `started_at` = реальный старт сессии (для длительности =
  `finished_at − started_at`); **distance_m** = метраж заплыва (плавание).
- `api_finish_workout(p_user_id, p_program_id, p_day, p_exercise_ids, p_reward,
  p_finished_at DEFAULT now(), p_started_at DEFAULT NULL, p_distance_m DEFAULT NULL)`.
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

## Медиа (Selectel S3, бакет `trpg`)

- Cache-Control `public, max-age=31536000, immutable`.
- Видео: `TRPG/video/`, превью: `TRPG/`.
- При замене видео — всегда НОВОЕ имя файла; старый удалять с задержкой (из-за immutable-кэша).
- Не смешивать публичные и приватные файлы в одном бакете.
- Модерация пользовательских аватаров — только server-side через Edge Function.

## Важно

- Legacy `service_role` ключ (формат `eyJ…`) действителен до конца 2026.
  Кнопку «disable legacy keys» НЕ нажимать до полной миграции ключей.
- GitHub Actions keepalive (2×/неделю) не даёт уснуть Supabase free-tier.
- **UI-настройки (свёрнутость секций, закрепы, активные дни) в Supabase НЕ хранить** —
  для них есть Telegram CloudStorage (`lib/cloud-storage.js`), он и синкает между устройствами.
  Не заводить таблицы/RPC под клиентские предпочтения. Детали — в trpg-workflow.
