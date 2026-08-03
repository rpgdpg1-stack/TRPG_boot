-- Личные рекорды для экрана статистики (/history).
-- Силовая: самый большой рабочий вес среди ВЕСОВЫХ упражнений (counts_reps = false).
-- Плавание: самая длинная дистанция за ОДНУ завершённую тренировку.
-- Кардио/растяжка пока без рекордов — добавим вместе с программами.
-- Применено на проде 2026-07-30, preview_url добавлен 2026-08-03. Клиент: src/lib/records.js.

CREATE OR REPLACE FUNCTION public.api_get_personal_records()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
  v_strength jsonb := NULL;
  v_swim jsonb := NULL;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('strength', NULL, 'swim', NULL); END IF;

  -- preview_url отдаём сразу: в «Лучших результатах» у рекорда силовой стоит
  -- миниатюра упражнения (как в списке любимых), и без неё клиенту пришлось бы
  -- делать второй запрос за той же строкой каталога.
  SELECT jsonb_build_object(
           'exercise_id', w.exercise_id,
           'name', e.name,
           'preview_url', e.preview_url,
           'weight_kg', w.weight_kg
         )
    INTO v_strength
  FROM public.user_exercise_weights w
  JOIN public.exercises e ON e.id = w.exercise_id
  WHERE w.user_id = uid
    AND COALESCE(e.counts_reps, false) = false
    AND COALESCE(w.weight_kg, 0) > 0
  ORDER BY w.weight_kg DESC
  LIMIT 1;

  SELECT jsonb_build_object('distance_m', k.distance_m, 'finished_at', k.finished_at)
    INTO v_swim
  FROM public.workouts k
  WHERE k.user_id = uid
    AND k.finished_at IS NOT NULL
    AND COALESCE(k.distance_m, 0) > 0
  ORDER BY k.distance_m DESC
  LIMIT 1;

  RETURN jsonb_build_object('strength', v_strength, 'swim', v_swim);
END;
$function$;
