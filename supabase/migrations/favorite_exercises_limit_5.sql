-- Лимит любимых упражнений 3 → 5.
-- Меняем CHECK на slot (1..5) и сам лимит внутри api_add_favorite_exercise.
-- Применено на проде 2026-07-29 (Supabase MCP). Фронт: FAVORITE_LIMIT в
-- src/lib/favorite-exercises.js — держать синхронным с этим значением.

ALTER TABLE public.user_favorite_exercises
  DROP CONSTRAINT IF EXISTS user_favorite_exercises_slot_check;

ALTER TABLE public.user_favorite_exercises
  ADD CONSTRAINT user_favorite_exercises_slot_check CHECK (slot >= 1 AND slot <= 5);

CREATE OR REPLACE FUNCTION public.api_add_favorite_exercise(p_exercise_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid    bigint := public.current_user_id();
  v_cnt  integer;
  v_slot smallint;
  v_limit constant integer := 5;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM public.user_favorite_exercises f
             WHERE f.user_id = uid AND f.exercise_id = p_exercise_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.user_favorite_exercises f WHERE f.user_id = uid;
  IF v_cnt >= v_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'limit');
  END IF;

  SELECT MIN(s)::smallint INTO v_slot
  FROM generate_series(1, v_limit) s
  WHERE s NOT IN (SELECT f.slot FROM public.user_favorite_exercises f WHERE f.user_id = uid);

  INSERT INTO public.user_favorite_exercises (user_id, slot, exercise_id, updated_at)
  VALUES (uid, v_slot, p_exercise_id, now());

  RETURN jsonb_build_object('success', true, 'slot', v_slot);
END;
$function$;
