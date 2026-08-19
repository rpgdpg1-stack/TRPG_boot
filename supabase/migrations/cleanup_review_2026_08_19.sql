-- РЕВЬЮ ПРОЕКТА 2026-08-19 — чистка базы.
-- Применено на проде четырьмя миграциями через коннектор:
--   cleanup_dead_functions, drop_muscles_currency,
--   cleanup_programs_and_indexes, drop_duplicate_program_days_index.
-- Файл — их слепок для истории репозитория.

-- ── 1. Функции, которые не вызывал никто ────────────────────────────────────
-- Проверено: нет вызовов ни из клиента (grep по rpc('…')), ни из тел других
-- функций, ни из триггеров.
--
-- api_get_program_day / get_workout_day — сборка дня тренировки переехала
--   на клиент (features/programs/api.js: слоты из реестра + свапы + веса).
--   get_workout_day к тому же был единственной функцией БЕЗ SECURITY DEFINER,
--   то есть под RLS всё равно не работал бы.
-- upsert_user — авторизация идёт через Edge Function telegram-auth, которая
--   пишет в public.users напрямую service-ключом.
DROP FUNCTION IF EXISTS public.api_get_program_day(text, text);
DROP FUNCTION IF EXISTS public.get_workout_day(bigint, text, text);
DROP FUNCTION IF EXISTS public.upsert_user(bigint, text, text, text);

-- ── 2. Последние следы игровой «валюты» ─────────────────────────────────────
-- Механику отменили давно, но в сигнатурах остались заглушки: обе функции
-- возвращали жёсткие 0 и NULL, users.total_muscles у всех был нулём,
-- p_reward никуда не записывался. Интерфейс эти числа не показывал нигде.
--
-- api_finish_workout:   было (…, p_reward, …) → (workout_id, new_total_muscles,
--                       new_weekly_streak, already_completed_today,
--                       new_badge_rank_index)
--                       стало (…) → (workout_id, new_weekly_streak,
--                       already_completed_today)
-- complete_daily_quest: было (…, p_reward) → TABLE(was_new, new_total_muscles,
--                       new_badge_rank_index)
--                       стало (…) → boolean
--
-- Пересоздание через DROP + CREATE обязательно: меняется и состав возвращаемых
-- колонок, и список аргументов — CREATE OR REPLACE такое не умеет. После
-- пересоздания заново выданы права (REVOKE/GRANT).
--
-- Полные тела — в проде; здесь важно, ЧТО изменилось, а не копия кода.
ALTER TABLE public.users        DROP COLUMN IF EXISTS total_muscles;
ALTER TABLE public.workouts     DROP COLUMN IF EXISTS muscles_earned;
ALTER TABLE public.daily_quests DROP COLUMN IF EXISTS reward;

-- api_reset_my_progress больше не обнуляет несуществующую валюту.

-- ── 3. Колонки programs от прежних схем «откуда взялась программа» ──────────
-- Три поколения одной идеи, все пустые: origin заполнен у 2 строк из 6,
-- остальные — ни у одной. В коде приложения не упоминалась ни одна.
-- Живые source ('custom' | 'shared' | 'global') и author_id не тронуты.
-- Вместе с колонками ушли их уникальные индексы (owner_id, origin)
-- и (owner_id, kind); programs_owner_source_unique остался — он на живом
-- source и держит правило «одна своя программа на человека».
ALTER TABLE public.programs
  DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS kind,
  DROP COLUMN IF EXISTS source_user_id,
  DROP COLUMN IF EXISTS source_author_id,
  DROP COLUMN IF EXISTS source_author_name,
  DROP COLUMN IF EXISTS is_shared;

-- workouts.notes — заметка к тренировке. Не заполнена ни разу и нигде
-- не читается: заметки в приложении живут у УПРАЖНЕНИЯ (user_exercise_notes).
ALTER TABLE public.workouts DROP COLUMN IF EXISTS notes;

-- ── 4. Дубли индексов ───────────────────────────────────────────────────────
-- На users для трёх колонок рядом с UNIQUE стоял ещё и обычный btree по тому же
-- полю. Обычный не даёт ничего: уникальный обслуживает те же запросы, а лишняя
-- структура обновляется на каждой записи.
DROP INDEX IF EXISTS public.idx_users_auth_id;
DROP INDEX IF EXISTS public.idx_users_referral_code;
DROP INDEX IF EXISTS public.idx_users_telegram_id;

-- То же на program_days: program_days_program_location_idx повторял
-- UNIQUE-индекс по тем же четырём колонкам в том же порядке. Программа
-- пересобирается целиком на каждое сохранение в конструкторе, так что лишний
-- индекс переписывался вхолостую при каждом.
DROP INDEX IF EXISTS public.program_days_program_location_idx;
