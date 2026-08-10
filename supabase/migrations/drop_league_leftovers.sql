-- ЧИСТКА ОСТАТКОВ СОРЕВНОВАТЕЛЬНОЙ ЧАСТИ.
-- Лиги, сезоны, ранги, значки и подстраховку из продукта убрали. Аудит базы
-- показал: таблиц, колонок, cron-задач и триггеров под них НЕ осталось —
-- висели только поля-заглушки в сигнатурах функций.
-- Применено на проде 2026-08-11.
--
-- НЕ трогали намеренно: new_badge_rank_index в api_finish_workout и
-- complete_daily_quest. Поле всегда NULL (тело функций его не заполняет), но
-- чтобы убрать его из ответа, функцию надо пересоздавать с выдачей прав, а
-- api_finish_workout — критический путь (каждое завершение тренировки).
-- Польза нулевая, риск реальный. Фронт это поле больше не читает.

-- 1. Мёртвый второй вариант api_get_shared_program. Фронт зовёт версию с
--    p_token; этот с p_share_code не вызывает никто. Два варианта одной
--    функции опасны сами по себе: PostgREST может не выбрать нужный
--    (см. грабли в trpg-supabase про ambiguous-оверлоуды).
DROP FUNCTION IF EXISTS public.api_get_shared_program(p_share_code text, p_viewer_id bigint);

-- 2. Мёртвый дубль сохранения программы друга (живой — api_save_friend_program).
DROP FUNCTION IF EXISTS public.api_save_shared_program(p_user_id bigint, p_share_code text);

-- 3. Список друзей без пяти полей-заглушек: total_muscles (0), rank_index (0),
--    league_place (1), total_in_league (1), backed_today (false). Фронт их не
--    читал. Тело запроса не тронуто — убраны только мёртвые колонки.
DROP FUNCTION IF EXISTS public.api_get_friends_list(p_user_id bigint);

CREATE FUNCTION public.api_get_friends_list(p_user_id bigint)
RETURNS TABLE (
  user_id bigint,
  first_name text,
  username text,
  photo_url text,
  last_workout_at timestamp with time zone,
  pinned_at timestamp with time zone,
  is_training boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH friends AS (
    SELECT user_b_id AS friend_id FROM public.friendships WHERE user_a_id = p_user_id
    UNION
    SELECT user_a_id AS friend_id FROM public.friendships WHERE user_b_id = p_user_id
  ),
  last_wo AS (
    SELECT w.user_id, MAX(w.finished_at) AS last_at
    FROM public.workouts w
    WHERE w.finished_at IS NOT NULL
    GROUP BY w.user_id
  )
  SELECT
    u.id, u.first_name, u.username, u.photo_url,
    lw.last_at, fp.pinned_at,
    (u.training_since IS NOT NULL AND u.training_since > now() - interval '3 hours')
  FROM friends f
  INNER JOIN public.users u ON u.id = f.friend_id
  LEFT JOIN last_wo lw ON lw.user_id = u.id
  LEFT JOIN public.friend_pins fp ON fp.owner_id = p_user_id AND fp.friend_id = u.id
  ORDER BY fp.pinned_at DESC NULLS LAST, lw.last_at DESC NULLS LAST, u.id ASC;
END;
$function$;

-- Права восстановлены ровно те же, что были до пересоздания.
GRANT EXECUTE ON FUNCTION public.api_get_friends_list(bigint) TO anon, authenticated, service_role;
