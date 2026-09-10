-- Рассылка «пинок» падала на закрепах: 09.09.2026 список закреплённых программ
-- в настройках стал МАССИВОМ слагов (закрепить можно сколько угодно), а функция
-- по-прежнему разбирала его как карту {категория: слаг} через jsonb_each —
-- «cannot call jsonb_each on a non-object», и весь прогон вставал.
--
-- Читаем оба вида: у части людей в базе ещё лежит старая карта. Раздел теперь
-- берём у самой программы, а не из ключа настройки: в списке ключа нет вовсе.
-- В сообщение уходят первые 5 закрепов — ровно те, что человек видит в карусели
-- на главной (PINNED_VISIBLE), иначе у любителя закрепить всё письмо
-- превратилось бы в простыню кнопок.

CREATE OR REPLACE FUNCTION public.srv_nudge_candidates()
RETURNS TABLE (user_id bigint, telegram_id bigint, days_since integer,
               nudge_ignored integer, programs jsonb,
               best_count integer, best_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH last_w AS (
    SELECT w.user_id, max(w.finished_at) AS last_at FROM public.workouts w
    WHERE w.finished_at IS NOT NULL GROUP BY w.user_id
  ),
  -- Вид настройки выбираем ВНУТРИ вызова, через CASE. Условие в WHERE тут не
  -- спасает: оно применяется уже ПОСЛЕ раскрытия, и массив всё равно попадал бы
  -- в jsonb_each — ровно так рассылка и падала.
  pinned AS (
    -- С 09.2026: список слагов, порядок = порядок закрепления (свежее впереди).
    SELECT p.user_id, el.value #>> '{}' AS slug, el.ord::int AS ord
    FROM public.user_prefs p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.value) = 'array' THEN p.value ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS el(value, ord)
    WHERE p.key = 'favorite_programs'
    UNION ALL
    -- До 09.2026: карта {категория: слаг}, по одной программе на раздел.
    -- Порядок для неё оставляем прежний — по разделам.
    SELECT p.user_id, e.value #>> '{}' AS slug,
           CASE e.key WHEN 'gym' THEN 1 WHEN 'pool' THEN 2 WHEN 'cardio' THEN 3 ELSE 4 END
    FROM public.user_prefs p
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(p.value) = 'object' THEN p.value ELSE '{}'::jsonb END
    ) e
    WHERE p.key = 'favorite_programs'
  ),
  resolved AS (
    SELECT pn.user_id, pn.slug, pn.ord,
           (SELECT pr.id FROM public.programs pr
             WHERE (pn.slug = 'split'    AND pr.id = 'prog_001')
                OR (pn.slug = 'fullbody' AND pr.id = 'prog_002')
                OR (pn.slug = 'swim'     AND pr.id = 'swim_001')
                OR (pn.slug = 'my'     AND pr.owner_id = pn.user_id AND pr.source = 'custom')
                OR (pn.slug = 'friend' AND pr.owner_id = pn.user_id AND pr.source = 'shared')
             LIMIT 1) AS db_id
    FROM pinned pn
  ),
  -- Раздел — у самой программы: в новом списке ключа с категорией нет, а
  -- программа свой раздел знает всегда.
  detailed AS (
    SELECT r.user_id, pr.category, r.slug, r.ord, pr.name,
           (SELECT up.value #>> '{}' FROM public.user_prefs up
             WHERE up.user_id = r.user_id
               AND up.key = 'program:' || r.slug || ':last_day') AS last_day,
           COALESCE((SELECT NULLIF(up.value #>> '{}', '')::int FROM public.user_prefs up
                     WHERE up.user_id = r.user_id
                       AND up.key = 'swim-reps:' || r.slug), 5) AS swim_reps
    FROM resolved r JOIN public.programs pr ON pr.id = r.db_id
  ),
  with_est AS (
    SELECT d.user_id, d.category, d.slug, d.ord, d.name, d.last_day,
           CASE WHEN d.category = 'pool' THEN 250 + 100 * d.swim_reps END AS meters,
           CASE
             WHEN d.category = 'pool'
               THEN ROUND((250 + 100 * d.swim_reps) * 45.0 / 750)::int
             ELSE NULLIF((SELECT count(*)::int * 7 FROM public.program_days pd
                          JOIN resolved r2 ON r2.user_id = d.user_id AND r2.slug = d.slug
                          WHERE pd.program_id = r2.db_id
                            AND pd.day = COALESCE(d.last_day, 'A')
                            AND pd.location = 'gym'), 0)
           END AS est_minutes
    FROM detailed d
  ),
  capped AS (
    SELECT t.* FROM (
      SELECT w.*, row_number() OVER (PARTITION BY w.user_id ORDER BY w.ord) AS rn
      FROM with_est w
    ) t WHERE t.rn <= 5
  ),
  grouped AS (
    SELECT user_id, jsonb_agg(jsonb_build_object(
             'slug', slug, 'name', name, 'category', category,
             'lastDay', last_day, 'estMinutes', est_minutes, 'meters', meters
           ) ORDER BY ord) AS programs
    FROM capped GROUP BY user_id
  ),
  base AS (
    SELECT u.id AS uid, u.telegram_id AS tg, u.nudge_ignored AS ignored,
           u.last_nudge_at, lw.last_at,
           EXTRACT(DAY FROM (now() - lw.last_at))::int AS days_since,
           COALESCE(g.programs, '[]'::jsonb) AS programs,
           bm.cnt AS best_count, bm.minutes AS best_minutes
    FROM public.users u
    JOIN last_w lw ON lw.user_id = u.id
    LEFT JOIN grouped g ON g.user_id = u.id
    LEFT JOIN LATERAL public.srv_best_month(u.id, NULL) bm ON true
    WHERE u.telegram_id IS NOT NULL AND u.notify_nudge
  ),
  stepped AS (
    SELECT base.*,
           CASE WHEN days_since >= 90 THEN 90
                WHEN days_since >= 30 THEN 30
                WHEN days_since >= 7  THEN 7
           END AS step
    FROM base
  )
  SELECT uid, tg, days_since, ignored, programs, best_count, best_minutes
  FROM stepped
  WHERE step IS NOT NULL
    AND (last_nudge_at IS NULL
         OR last_nudge_at < last_at + (step || ' days')::interval);
$$;

REVOKE ALL ON FUNCTION public.srv_nudge_candidates() FROM PUBLIC, anon, authenticated;
