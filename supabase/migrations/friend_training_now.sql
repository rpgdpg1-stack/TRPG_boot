-- «Друг сейчас тренируется» — зелёная точка рядом с именем в списке друзей.
--
-- Активная сессия живёт в localStorage устройства (`lib/active-workout.js`), и
-- сервер о ней не знал. Заводим users.training_since: старт тренировки его
-- ставит, финиш и отмена — обнуляют (клиент: `lib/training-state.js`).
--
-- Протухание 3 часа: приложение могли закрыть, не завершив тренировку, и точка
-- иначе горела бы у друзей вечно.
--
-- Применено на проде 2026-08-03 (Supabase MCP).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS training_since timestamptz;

-- Пишет ТОЛЬКО себе (uid из сессии) — подделать чужой статус нельзя.
CREATE OR REPLACE FUNCTION public.api_set_training_state(p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  UPDATE public.users
     SET training_since = CASE WHEN p_active THEN now() ELSE NULL END
   WHERE id = uid;
END;
$function$;

-- Список друзей + is_training. Сигнатура RETURNS TABLE менялась, поэтому DROP.
DROP FUNCTION IF EXISTS public.api_get_friends_list(bigint);

CREATE FUNCTION public.api_get_friends_list(p_user_id bigint)
 RETURNS TABLE(user_id bigint, first_name text, username text, photo_url text,
               total_muscles integer, rank_index integer, league_place integer,
               total_in_league integer, last_workout_at timestamp with time zone,
               pinned_at timestamp with time zone, backed_today boolean,
               is_training boolean)
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
    0::int, 0::int, 1::int, 1::int,
    lw.last_at, fp.pinned_at, false,
    (u.training_since IS NOT NULL AND u.training_since > now() - interval '3 hours')
  FROM friends f
  INNER JOIN public.users u ON u.id = f.friend_id
  LEFT JOIN last_wo lw ON lw.user_id = u.id
  LEFT JOIN public.friend_pins fp ON fp.owner_id = p_user_id AND fp.friend_id = u.id
  ORDER BY fp.pinned_at DESC NULLS LAST, lw.last_at DESC NULLS LAST, u.id ASC;
END;
$function$;
