-- ============================================================
-- История рабочего веса упражнений: одна точка в день (по Москве).
-- Питает график прогресса весов в модалке упражнения.
-- Применять целиком в Supabase SQL Editor (проект jybwxbqmnommazjfucbq).
-- Недеструктивно: только CREATE / INSERT ... ON CONFLICT DO NOTHING.
-- ============================================================

-- 1) Таблица истории. Ключ (user_id, exercise_id, day) => одна точка в день.
CREATE TABLE IF NOT EXISTS public.user_exercise_weight_history (
  user_id     bigint      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id text        NOT NULL,
  day         date        NOT NULL,
  weight_kg   numeric     NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id, day)
);

ALTER TABLE public.user_exercise_weight_history ENABLE ROW LEVEL SECURITY;

-- Читать может только владелец (маппинг auth.uid() -> users.id через current_user_id()).
DROP POLICY IF EXISTS "weight_history_select_own" ON public.user_exercise_weight_history;
CREATE POLICY "weight_history_select_own"
  ON public.user_exercise_weight_history
  FOR SELECT
  USING (user_id = public.current_user_id());

-- 2) Триггер: при любом сохранении веса (INSERT/UPDATE user_exercise_weights)
--    пишем/обновляем точку за СЕГОДНЯ (по Москве). SECURITY DEFINER — пишет в
--    обход RLS: точки истории пользователь напрямую не редактирует.
CREATE OR REPLACE FUNCTION public.record_weight_point()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.weight_kg IS NULL OR NEW.weight_kg <= 0 THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.user_exercise_weight_history (user_id, exercise_id, day, weight_kg, updated_at)
  VALUES (
    NEW.user_id,
    NEW.exercise_id,
    ((now() AT TIME ZONE 'Europe/Moscow'))::date,
    NEW.weight_kg,
    now()
  )
  ON CONFLICT (user_id, exercise_id, day)
  DO UPDATE SET weight_kg = EXCLUDED.weight_kg, updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_weight_point ON public.user_exercise_weights;
CREATE TRIGGER trg_record_weight_point
  AFTER INSERT OR UPDATE OF weight_kg ON public.user_exercise_weights
  FOR EACH ROW
  EXECUTE FUNCTION public.record_weight_point();

-- 3) Сид: текущие веса → первая точка «сегодня», чтобы график стартовал не пустым.
INSERT INTO public.user_exercise_weight_history (user_id, exercise_id, day, weight_kg, updated_at)
SELECT user_id, exercise_id, ((now() AT TIME ZONE 'Europe/Moscow'))::date, weight_kg, now()
FROM public.user_exercise_weights
WHERE weight_kg > 0
ON CONFLICT (user_id, exercise_id, day) DO NOTHING;

-- 4) RPC чтения истории по упражнению (только свои точки, по возрастанию дня).
CREATE OR REPLACE FUNCTION public.api_get_weight_history(p_user_id bigint, p_exercise_id text)
RETURNS TABLE (day date, weight_kg numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT day, weight_kg
  FROM public.user_exercise_weight_history
  WHERE user_id = p_user_id
    AND user_id = current_user_id()
    AND exercise_id = p_exercise_id
  ORDER BY day ASC;
$$;

REVOKE ALL ON FUNCTION public.api_get_weight_history(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_get_weight_history(bigint, text) TO authenticated;

-- Тест после применения (Дмитрий = user_id 2):
--   SELECT * FROM public.api_get_weight_history(2, 'ex_001');
