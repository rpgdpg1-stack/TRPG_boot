-- В список друзей добавлено week_workouts — сколько тренировок у друга за
-- текущую неделю (Москва, Пн–Вс). Нужно недельному бицепсу (WeeklyMuscle):
-- в списке он должен показывать РЕАЛЬНУЮ стадию друга, а не всегда первую.
--
-- Приватность: точное число — это статистика, поэтому у того, кто её закрыл
-- (show_stats = false), поле приходит NULL, и фронт рисует первую стадию —
-- виден сам факт активности, без цифры.
--
-- Границы недели считаются тем же приёмом, что в srv_weekly_digest: date_trunc
-- отдаёт локальный timestamp, внешний timezone() возвращает его в timestamptz,
-- иначе сравнение зависело бы от часового пояса сессии.
--
-- Менялся тип возврата → DROP + CREATE, после чего заново выданы GRANT.

DROP FUNCTION IF EXISTS public.api_get_friends_list(bigint);

CREATE OR REPLACE FUNCTION public.api_get_friends_list(p_user_id bigint)
 RETURNS TABLE(user_id bigint, first_name text, username text, photo_url text, last_workout_at timestamp with time zone, pinned_at timestamp with time zone, is_training boolean, week_workouts integer)
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
  ),
  week_bounds AS (
    SELECT timezone('Europe/Moscow', date_trunc('week', timezone('Europe/Moscow', now()))) AS ws
  ),
  week_wo AS (
    SELECT w.user_id, count(*)::int AS cnt
    FROM public.workouts w CROSS JOIN week_bounds b
    WHERE w.finished_at IS NOT NULL
      AND w.finished_at >= b.ws
      AND w.finished_at <  b.ws + interval '7 days'
    GROUP BY w.user_id
  )
  SELECT
    u.id, u.first_name, u.username, u.photo_url,
    lw.last_at, fp.pinned_at,
    (u.training_since IS NOT NULL AND u.training_since > now() - interval '3 hours'),
    CASE WHEN u.show_stats THEN COALESCE(ww.cnt, 0) ELSE NULL END
  FROM friends f
  INNER JOIN public.users u ON u.id = f.friend_id
  LEFT JOIN last_wo lw ON lw.user_id = u.id
  LEFT JOIN week_wo ww ON ww.user_id = u.id
  LEFT JOIN public.friend_pins fp ON fp.owner_id = p_user_id AND fp.friend_id = u.id
  ORDER BY fp.pinned_at DESC NULLS LAST, lw.last_at DESC NULLS LAST, u.id ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.api_get_friends_list(bigint) TO anon, authenticated, service_role;
