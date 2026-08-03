-- Статистика друга по периодам (месяц / год) для карточки профиля.
-- Раньше отдавались только тоталы за всё время, из-за чего в модалке друга
-- переключатель периодов показать было нечем.
-- Применено на проде 2026-08-03 (Supabase MCP). Фронт: `PlayerProfileModal`
-- читает stats_month/stats_year; если их нет — показывает один период «Всё время».

CREATE OR REPLACE FUNCTION public.api_get_user_public_profile(p_user_id bigint, p_viewer_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last record; v_streak integer; v_week text; v_total integer; v_minutes integer;
  v_show_last boolean; v_show_stats boolean; v_show_fav boolean; v_show_weights boolean;
  v_favorites jsonb := NULL;
  v_month jsonb := NULL; v_year jsonb := NULL;
  v_msk_now timestamptz := now() AT TIME ZONE 'UTC' + interval '3 hours';
  v_month_start timestamptz; v_year_start timestamptz;
BEGIN
  SELECT weekly_streak, weekly_streak_week, show_last_workout, show_stats, show_favorites, show_weights
    INTO v_streak, v_week, v_show_last, v_show_stats, v_show_fav, v_show_weights
  FROM public.users WHERE id = p_user_id;

  IF v_show_last THEN
    SELECT finished_at, program_id, day INTO v_last
    FROM public.workouts WHERE user_id = p_user_id AND finished_at IS NOT NULL
    ORDER BY finished_at DESC LIMIT 1;
  END IF;

  IF v_show_stats THEN
    SELECT COUNT(*),
           COALESCE(SUM(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60)
                    FILTER (WHERE started_at IS NOT NULL AND finished_at > started_at), 0)::int
      INTO v_total, v_minutes
    FROM public.workouts WHERE user_id = p_user_id AND finished_at IS NOT NULL;

    -- Границы периодов по Москве (как везде в проекте).
    v_month_start := date_trunc('month', v_msk_now) - interval '3 hours';
    v_year_start  := date_trunc('year',  v_msk_now) - interval '3 hours';

    SELECT jsonb_build_object(
             'count', COUNT(*),
             'minutes', COALESCE(SUM(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60)
                          FILTER (WHERE started_at IS NOT NULL AND finished_at > started_at), 0)::int)
      INTO v_month
    FROM public.workouts
    WHERE user_id = p_user_id AND finished_at IS NOT NULL AND finished_at >= v_month_start;

    SELECT jsonb_build_object(
             'count', COUNT(*),
             'minutes', COALESCE(SUM(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60)
                          FILTER (WHERE started_at IS NOT NULL AND finished_at > started_at), 0)::int)
      INTO v_year
    FROM public.workouts
    WHERE user_id = p_user_id AND finished_at IS NOT NULL AND finished_at >= v_year_start;
  END IF;

  IF v_show_fav THEN
    SELECT jsonb_agg(jsonb_build_object(
             'slot', f.slot, 'name', e.name, 'muscle_icon', e.muscle_icon,
             'muscle_group', e.muscle_group, 'counts_reps', e.counts_reps,
             'preview_url', e.preview_url,
             'weight_kg', CASE WHEN v_show_weights THEN w.weight_kg ELSE NULL END
           ) ORDER BY f.slot)
      INTO v_favorites
    FROM public.user_favorite_exercises f
    JOIN public.exercises e ON e.id = f.exercise_id
    LEFT JOIN public.user_exercise_weights w ON w.user_id = f.user_id AND w.exercise_id = f.exercise_id
    WHERE f.user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'last_workout', CASE WHEN NOT v_show_last OR v_last.finished_at IS NULL THEN NULL ELSE jsonb_build_object(
      'finished_at', v_last.finished_at, 'program_id', v_last.program_id, 'day', v_last.day) END,
    'weekly_streak', COALESCE(v_streak, 0),
    'weekly_streak_week', v_week,
    'total_workouts', CASE WHEN v_show_stats THEN COALESCE(v_total, 0) ELSE NULL END,
    'total_minutes', CASE WHEN v_show_stats THEN COALESCE(v_minutes, 0) ELSE NULL END,
    'stats_month', v_month,
    'stats_year', v_year,
    'show_last_workout', COALESCE(v_show_last, true),
    'show_stats', COALESCE(v_show_stats, false),
    'show_favorites', COALESCE(v_show_fav, false),
    'favorites', v_favorites
  );
END;
$function$;
