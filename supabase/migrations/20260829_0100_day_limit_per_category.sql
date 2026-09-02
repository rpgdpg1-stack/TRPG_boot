-- Лимит «одна тренировка в день» → «одна тренировка в день НА РАЗДЕЛ».
--
-- Было: отбор шёл только по человеку и дате, без разбора программы. Поэтому
-- вторая тренировка за сутки — растяжка после зала, заплыв после силовой —
-- не просто не считалась в серии, а вообще НЕ СОХРАНЯЛАСЬ: ни записи в
-- истории, ни минут, ни строки в итогах месяца и в сводках бота. Человек
-- потренировался, а система считала, что он этого не делал.
--
-- Стало: в один день можно закрыть по одной тренировке в каждом разделе
-- (силовая, плавание, кардио, растяжка), но не две силовых подряд. Раздел
-- берём из programs.category; если программы в справочнике нет, ключом
-- служит сам program_id — лимит остаётся, просто на программу.
--
-- Следствие: недельная серия перестаёт упираться в 7. Она и раньше считала
-- ТРЕНИРОВКИ, а не дни — просто одно совпадало с другим, пока за день
-- засчитывалась ровно одна.

CREATE OR REPLACE FUNCTION public.api_finish_workout(
  p_user_id bigint,
  p_program_id text,
  p_day text,
  p_exercise_ids text[],
  p_finished_at timestamp with time zone DEFAULT now(),
  p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_distance_m integer DEFAULT NULL::integer
)
RETURNS TABLE(workout_id bigint, new_weekly_streak integer, already_completed_today boolean, highlights jsonb)
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
  p_user_id := current_user_id();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_current_week_key := to_char(p_finished_at AT TIME ZONE 'Europe/Moscow', 'IYYY-IW');
  v_today_start := date_trunc('day', p_finished_at AT TIME ZONE 'Europe/Moscow');

  -- Раздел этой тренировки. Программы нет в справочнике (удалили, чужая) —
  -- ключом становится сам id: лимит не должен исчезать вовсе.
  SELECT category INTO v_category FROM programs WHERE id = p_program_id;
  v_limit_key := COALESCE(v_category, p_program_id);

  -- Лимит «одна тренировка в день в этом разделе»: вторая за сутки в ТОМ ЖЕ
  -- разделе не создаёт запись и не двигает серию. Другой раздел — засчитаем.
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
    -- Повтор за день не засчитан — украшать нечего.
    RETURN QUERY SELECT v_existing_workout_id, v_new_weekly_streak, true, v_empty_highlights;
    RETURN;
  END IF;

  INSERT INTO workouts (user_id, program_id, day, started_at, finished_at, distance_m)
  VALUES (p_user_id, p_program_id, p_day, COALESCE(p_started_at, p_finished_at), p_finished_at, p_distance_m)
  RETURNING id INTO v_workout_id;

  FOREACH v_exercise_id IN ARRAY p_exercise_ids LOOP
    INSERT INTO exercise_sets (workout_id, exercise_id, slot_order, set_number, completed_at)
    VALUES (v_workout_id, v_exercise_id, v_set_order, 1, p_finished_at);
    v_set_order := v_set_order + 1;
  END LOOP;

  -- Серия считается в пределах недели по Москве и начинается заново
  -- с понедельника.
  SELECT weekly_streak_week INTO v_last_week_key FROM users WHERE id = p_user_id;

  IF v_last_week_key = v_current_week_key THEN
    UPDATE users SET weekly_streak = weekly_streak + 1, updated_at = NOW()
    WHERE id = p_user_id RETURNING weekly_streak INTO v_new_weekly_streak;
  ELSE
    UPDATE users SET weekly_streak = 1, weekly_streak_week = v_current_week_key, updated_at = NOW()
    WHERE id = p_user_id RETURNING weekly_streak INTO v_new_weekly_streak;
  END IF;

  -- Украшения — тем же ответом. Считаются ПОСЛЕ вставки подходов: рекорды
  -- смотрят на упражнения этой тренировки. Своя запись сравнению не мешает —
  -- прошлое ищется строго по finished_at < текущей.
  BEGIN
    v_highlights := api_workout_highlights(v_workout_id);
  EXCEPTION WHEN OTHERS THEN
    v_highlights := v_empty_highlights;
  END;

  RETURN QUERY SELECT v_workout_id, v_new_weekly_streak, false, COALESCE(v_highlights, v_empty_highlights);
END;
$function$;
