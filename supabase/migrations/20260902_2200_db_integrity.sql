-- 20260902_2200_db_integrity.sql
-- ============================================================================
-- DB-001 · SEC-006 · DB-002 · DB-003 · DB-004 — целостность данных.
--
-- DB-001. Лимит «одна тренировка в сутки на раздел» проверялся по схеме
--   «сначала SELECT, потом INSERT», без блокировки и без ограничения в базе.
--   Два одновременных вызова (оффлайн-очередь досылает завершение ровно тогда,
--   когда человек жмёт «Завершить» с другого устройства) оба не находили записи
--   и оба вставляли: лишняя тренировка в истории и двойной инкремент серии.
--   Лечение — SELECT ... FOR UPDATE по строке пользователя в начале функции.
--   Он выстраивает завершения ОДНОГО человека в очередь и не влияет на других.
--   Частичный уникальный индекс не подошёл: лимит считается по КАТЕГОРИИ
--   программы (COALESCE(pr.category, w.program_id)), а не по самой программе,
--   и выражение с подзапросом в индекс не положить.
--
-- SEC-006. p_finished_at и p_started_at приходят от клиента и использовались
--   без проверки, причём лимит суток считался от присланного значения. Тридцать
--   вызовов с разными датами давали месяц «ежедневных тренировок» в обход
--   лимита. Параметры убрать нельзя — их шлёт оффлайн-очередь с настоящим
--   временем. Ограничиваем окно доверия: не в будущем и не глубже недели.
--
-- DB-002. exercise_sets называлась «подходы», но хранила плоский список
--   упражнений тренировки: weight_kg, reps, duration_sec — всегда NULL,
--   set_number — всегда 1. Переименована в workout_exercises, мёртвые колонки
--   убраны. Имя теперь описывает содержимое.
--   ВАЖНО: RENAME обновляет политики и индексы, но НЕ тела функций — три
--   функции со ссылкой на старое имя переписаны здесь же.
--
-- DB-003. Три индекса дублировали левые префиксы уникальных: составной индекс
--   обслуживает и запросы по своему префиксу, поэтому они были лишними.
--   idx_sets_exercise НЕ удаляем вопреки отчёту: у него 74 скана, он живой.
--
-- DB-004. weekly_streak считает тренировки внутри недели, а не недели подряд.
--   Поведение верное, имя вводит в заблуждение — вешаем комментарий к колонке
--   вместо переименования (переименование задело бы фронт).
-- ============================================================================

BEGIN;

-- ── DB-002: переименование и чистка ─────────────────────────────────────────
ALTER TABLE public.exercise_sets RENAME TO workout_exercises;

ALTER TABLE public.workout_exercises DROP COLUMN IF EXISTS weight_kg;
ALTER TABLE public.workout_exercises DROP COLUMN IF EXISTS reps;
ALTER TABLE public.workout_exercises DROP COLUMN IF EXISTS duration_sec;
ALTER TABLE public.workout_exercises DROP COLUMN IF EXISTS set_number;

-- Индекс держал set_number третьей колонкой — пересобираем без неё.
DROP INDEX IF EXISTS public.idx_sets_workout;
CREATE INDEX idx_workout_exercises_workout
  ON public.workout_exercises (workout_id, slot_order);

COMMENT ON TABLE public.workout_exercises IS
  'Состав завершённой тренировки: какие упражнения в неё вошли и в каком порядке. '
  'Не подходы: подетальный учёт (вес/повторы за подход) в продукте не ведётся. '
  'Рабочий вес живёт в user_exercise_weights, история — в user_exercise_weight_history.';

-- ── DB-003: дубли префиксов уникальных индексов ─────────────────────────────
DROP INDEX IF EXISTS public.idx_uew_user;        -- покрыт UNIQUE (user_id, exercise_id)
DROP INDEX IF EXISTS public.idx_ues_user_prog;   -- покрыт UNIQUE (user_id, program_id, day, location, order_num)
DROP INDEX IF EXISTS public.idx_friendships_a;   -- покрыт unique_pair (user_a_id, user_b_id)

-- ── DB-004: имя колонки врёт, поведение верное ──────────────────────────────
COMMENT ON COLUMN public.users.weekly_streak IS
  'Сколько тренировок сделано на ТЕКУЩЕЙ неделе (с понедельника по Москве). '
  'Это НЕ серия недель подряд: при переходе на новую неделю счётчик начинается '
  'с единицы. Имя историческое; переименование задело бы фронт.';

COMMENT ON COLUMN public.users.weekly_streak_week IS
  'ISO-ключ недели (IYYY-IW), когда weekly_streak менялся последний раз. '
  'Не совпадает с текущей неделей — значит счётчик протух, показываем 0 '
  '(resolveWeeklyStreak в utils/dates.js).';

-- ── DB-001 + SEC-006 + DB-002: завершение тренировки ────────────────────────
CREATE OR REPLACE FUNCTION public.api_finish_workout(
  p_user_id bigint, p_program_id text, p_day text, p_exercise_ids text[],
  p_finished_at timestamp with time zone, p_started_at timestamp with time zone,
  p_distance_m integer)
RETURNS TABLE(workout_id bigint, new_weekly_streak integer,
              already_completed_today boolean, highlights jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workout_id bigint;
  v_today_start timestamptz;
  v_existing_workout_id bigint;
  v_new_weekly_streak integer;
  v_current_week_key text;
  v_last_week_key text;
  v_exercise_id text;
  v_set_order integer := 1;
  v_category text;
  v_limit_key text;
  v_empty_highlights jsonb := jsonb_build_object('comebackDays', NULL, 'records', '[]'::jsonb);
  v_highlights jsonb;
BEGIN
  -- SEC-001: личность берём ИЗ СЕССИИ, параметру от клиента не верим.
  p_user_id := public.current_user_id();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- SEC-006: время завершения приходит от клиента (так надо оффлайн-очереди,
  -- она досылает настоящее время после возврата связи). Но доверять ему без
  -- границ нельзя: лимит суток считается ОТ ЭТОГО значения, и произвольная
  -- дата пускала бы мимо лимита сколько угодно записей.
  -- Пять минут вперёд — на расхождение часов устройства; неделя назад —
  -- с запасом на любой оффлайн.
  IF p_finished_at IS NULL THEN
    p_finished_at := now();
  END IF;
  IF p_finished_at > now() + interval '5 minutes'
     OR p_finished_at < now() - interval '7 days' THEN
    RAISE EXCEPTION 'finished_at out of range' USING ERRCODE = '22007';
  END IF;
  -- Длительность тоже задаёт клиент. Тренировка длиннее шести часов — это
  -- забытая сессия, а не рекорд: подрезаем, чтобы не портить статистику времени.
  IF p_started_at IS NOT NULL AND p_finished_at - p_started_at > interval '6 hours' THEN
    p_started_at := p_finished_at - interval '6 hours';
  END IF;
  -- Старт позже финиша — мусор, длительность считаем нулевой.
  IF p_started_at IS NOT NULL AND p_started_at > p_finished_at THEN
    p_started_at := NULL;
  END IF;

  -- DB-001: выстраиваем завершения ОДНОГО человека в очередь. Без этого
  -- проверка «была ли сегодня» и вставка расходились: два одновременных
  -- вызова оба проходили проверку. На других пользователей блокировка
  -- не влияет — строка своя у каждого.
  PERFORM 1 FROM users WHERE id = p_user_id FOR UPDATE;

  v_current_week_key := to_char(p_finished_at AT TIME ZONE 'Europe/Moscow', 'IYYY-IW');
  v_today_start := date_trunc('day', p_finished_at AT TIME ZONE 'Europe/Moscow');

  SELECT category INTO v_category FROM programs WHERE id = p_program_id;
  v_limit_key := COALESCE(v_category, p_program_id);

  SELECT w.id INTO v_existing_workout_id
  FROM workouts w
  LEFT JOIN programs pr ON pr.id = w.program_id
  WHERE w.user_id = p_user_id AND w.finished_at IS NOT NULL
    AND w.finished_at >= v_today_start
    AND w.finished_at < v_today_start + interval '1 day'
    AND COALESCE(pr.category, w.program_id) IS NOT DISTINCT FROM v_limit_key
  LIMIT 1;

  IF v_existing_workout_id IS NOT NULL THEN
    SELECT weekly_streak INTO v_new_weekly_streak FROM users WHERE id = p_user_id;
    RETURN QUERY SELECT v_existing_workout_id, v_new_weekly_streak, true, v_empty_highlights;
    RETURN;
  END IF;

  INSERT INTO workouts (user_id, program_id, day, started_at, finished_at, distance_m)
  VALUES (p_user_id, p_program_id, p_day, COALESCE(p_started_at, p_finished_at), p_finished_at, p_distance_m)
  RETURNING id INTO v_workout_id;

  -- DB-002: таблица переименована, set_number убран (всегда была единица).
  FOREACH v_exercise_id IN ARRAY p_exercise_ids LOOP
    INSERT INTO workout_exercises (workout_id, exercise_id, slot_order, completed_at)
    VALUES (v_workout_id, v_exercise_id, v_set_order, p_finished_at);
    v_set_order := v_set_order + 1;
  END LOOP;

  SELECT weekly_streak_week INTO v_last_week_key FROM users WHERE id = p_user_id;

  IF v_last_week_key = v_current_week_key THEN
    UPDATE users SET weekly_streak = weekly_streak + 1, updated_at = NOW()
    WHERE id = p_user_id RETURNING weekly_streak INTO v_new_weekly_streak;
  ELSE
    UPDATE users SET weekly_streak = 1, weekly_streak_week = v_current_week_key, updated_at = NOW()
    WHERE id = p_user_id RETURNING weekly_streak INTO v_new_weekly_streak;
  END IF;

  BEGIN
    v_highlights := api_workout_highlights(v_workout_id);
  EXCEPTION WHEN OTHERS THEN
    v_highlights := v_empty_highlights;
  END;

  RETURN QUERY SELECT v_workout_id, v_new_weekly_streak, false, COALESCE(v_highlights, v_empty_highlights);
END;
$function$;

-- ── DB-002: функции со ссылкой на старое имя таблицы ────────────────────────
-- RENAME не трогает тела функций: текст «exercise_sets» внутри них остался бы
-- и сломался. Заменяем имя в тех, где оно реально используется.
-- api_reset_my_progress не трогаем: там это только слово в комментарии,
-- удаление идёт каскадом от workouts.
DO $mig$
DECLARE r record; v_def text; v_n int := 0;
BEGIN
  FOR r IN
    SELECT oid, proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('api_delete_my_exercise', 'api_workout_highlights')
      AND prosrc ILIKE '%exercise_sets%'
  LOOP
    v_def := replace(pg_get_functiondef(r.oid), 'exercise_sets', 'workout_exercises');
    EXECUTE v_def;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'DB-002: ссылок на таблицу обновлено в % функциях', v_n;
END $mig$;

COMMIT;
