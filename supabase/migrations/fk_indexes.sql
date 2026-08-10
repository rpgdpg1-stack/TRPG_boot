-- Индексы под внешние ключи (FK). Анализатор Supabase нашёл 10 ключей без
-- покрывающего индекса. На нынешних объёмах (десятки строк) разницы нет, но
-- каждый такой ключ заставляет базу перечитывать таблицу целиком при джойнах
-- и при проверке ссылок на удалении родителя — ставим заранее, чтобы не ловить
-- тормоза на росте.
-- Применено на проде 2026-08-08.
--
-- Прим.: сразу после создания анализатор пометит их как «unused index» — это
-- нормально. На таблицах в десятки строк планировщик всё равно выбирает полный
-- перебор (он дешевле), индекс включится в работу на реальных объёмах.

CREATE INDEX IF NOT EXISTS idx_friend_pins_friend_id
  ON public.friend_pins (friend_id);

CREATE INDEX IF NOT EXISTS idx_program_days_exercise_id
  ON public.program_days (exercise_id);

CREATE INDEX IF NOT EXISTS idx_programs_author_id
  ON public.programs (author_id);

CREATE INDEX IF NOT EXISTS idx_programs_source_author_id
  ON public.programs (source_author_id);

CREATE INDEX IF NOT EXISTS idx_programs_source_user_id
  ON public.programs (source_user_id);

CREATE INDEX IF NOT EXISTS idx_user_exercise_swaps_exercise_id
  ON public.user_exercise_swaps (exercise_id);

CREATE INDEX IF NOT EXISTS idx_user_exercise_swaps_program_id
  ON public.user_exercise_swaps (program_id);

CREATE INDEX IF NOT EXISTS idx_user_exercise_weights_exercise_id
  ON public.user_exercise_weights (exercise_id);

CREATE INDEX IF NOT EXISTS idx_user_favorite_exercises_exercise_id
  ON public.user_favorite_exercises (exercise_id);

CREATE INDEX IF NOT EXISTS idx_workouts_program_id
  ON public.workouts (program_id);
