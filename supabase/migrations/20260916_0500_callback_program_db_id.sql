-- В сессии программа лежит СЛАГОМ ('split'), а workouts.program_id — это id
-- справочника ('prog_001'): приложение переводит одно в другое у себя
-- (features/programs/registry.js), бот этого не умел и падал на внешнем ключе
-- workouts_program_id_fkey (поймано в логах при проверке нажатия).
--
-- Своя программа человека лежит строкой 'usr_<id владельца>' — для неё ищем по
-- владельцу, а не по слагу (слаг у неё 'my', в базе такого значения нет).
--
-- Сменился тип возврата → DROP + CREATE (иначе «cannot change return type»).
drop function if exists public.srv_session_for_callback(bigint, timestamptz);

create function public.srv_session_for_callback(
  p_telegram_id bigint, p_started_at timestamp with time zone)
returns table (user_id bigint, program_id text, program_db_id text, day text, place text,
               started_at timestamptz, last_tick_at timestamptz,
               done_count integer, done_exercise_ids text[])
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.user_id, s.program_id,
         case s.program_id
           when 'split' then 'prog_001'
           when 'fullbody' then 'prog_002'
           when 'swim' then 'swim_001'
           else (select pr.id from public.programs pr
                  where pr.owner_id = s.user_id and pr.source = 'custom'
                  order by pr.created_at
                  limit 1)
         end as program_db_id,
         s.day, s.place, s.started_at,
         coalesce(s.last_tick_at, s.updated_at), cardinality(s.done), s.done_exercise_ids
  from public.active_sessions s
  join public.users u on u.id = s.user_id
  where u.telegram_id = p_telegram_id
    and s.active
    -- секунда допуска: в кнопке время округлено до секунд
    and abs(extract(epoch from (s.started_at - p_started_at))) < 1.5;
$function$;

revoke all on function public.srv_session_for_callback(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.srv_session_for_callback(bigint, timestamptz) to service_role;
