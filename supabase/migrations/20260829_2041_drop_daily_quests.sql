-- Активности (утро/день/вечер) выпилены из приложения 29.08.2026: дневнику
-- тренировок они лишние, контент ушёл постом в канал. Эта миграция убирает
-- их след в базе.
--
-- СТАТУС: ПРИМЕНЕНА 29.08.2026.
-- Данные на момент подготовки: 253 отметки, 5 человек (id 2, 11, 12, 15, 22).
-- Копия лежит в ежедневном бэкапе базы (Actions db-backup.yml → Yandex Object
-- Storage, 7 файлов по дням недели) — восстановить можно оттуда.
--
-- ПОРЯДОК ВАЖЕН: сначала переписываем функцию сброса прогресса (она чистила
-- daily_quests и после DROP TABLE падала бы при каждом сбросе), и только потом
-- сносим саму RPC отметки и таблицу.

CREATE OR REPLACE FUNCTION public.api_reset_my_progress()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid bigint := public.current_user_id();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.users
    set weekly_streak          = 0,
        weekly_streak_week      = null,
        last_progress_reset_at  = now(),
        progress_reset_count    = coalesce(progress_reset_count, 0) + 1,
        updated_at              = now()
    where id = uid;

  delete from public.workouts where user_id = uid;  -- exercise_sets уйдут каскадом
end;
$function$;

DROP FUNCTION IF EXISTS public.complete_daily_quest(bigint, text, text);

DROP TABLE IF EXISTS public.daily_quests;
