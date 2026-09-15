-- Кнопки «Засчитать / Не засчитывать» прямо в сообщении бота.
--
-- Серверу нужно уметь завершить тренировку БЕЗ сессии браузера: нажатие
-- приходит от Telegram, человек приложение не открывает.
--
-- Что делает миграция:
--   1. active_sessions.done_exercise_ids — какие упражнения отмечены (у встроенных
--      программ состав дня лежит в коде приложения, сервер его не знает);
--   2. api_set_active_session принимает состав; старый 5-аргументный вариант удалён
--      (два кандидата с умолчаниями PostgREST не различает — ambiguous);
--   3. api_get_active_session отдаёт состав (сменился тип возврата → DROP + CREATE);
--   4. srv_finish_workout — тело завершения; api_finish_workout стала обёрткой
--      (личность из сессии). Копии логики быть не должно: лимит суток, серия и
--      украшения обязаны считаться одинаково у приложения и у бота;
--   5. srv_clear_active_session — снять сессию от имени сервера;
--   6. srv_session_for_callback — найти сессию по telegram_id и времени старта из кнопки;
--   7. bot_config + srv_bot_config_get/set — секрет вебхука (функция выпускает его сама).

-- 1. Состав отмеченного.
alter table public.active_sessions
  add column if not exists done_exercise_ids text[] not null default '{}';

comment on column public.active_sessions.done_exercise_ids is
  'id отмеченных упражнений (параллельно done). Нужен боту: он завершает тренировку без приложения.';

-- 2. Запись сессии — с составом. Старый 5-аргументный вариант удаляем.
drop function if exists public.api_set_active_session(text, text, text, timestamptz, integer[]);

create or replace function public.api_set_active_session(
  p_program_id text, p_day text, p_place text, p_started_at timestamp with time zone,
  p_done integer[], p_done_ids text[] default '{}')
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.active_sessions as s
    (user_id, program_id, day, place, started_at, done, done_exercise_ids,
     active, updated_at, last_tick_at, reminded_at)
  values (public.current_user_id(), p_program_id, p_day,
          coalesce(p_place, 'gym'), p_started_at, coalesce(p_done, '{}'), coalesce(p_done_ids, '{}'),
          true, now(),
          case when cardinality(coalesce(p_done, '{}')) > 0 then now() end, null)
  on conflict (user_id) do update
    set program_id = excluded.program_id, day = excluded.day, place = excluded.place,
        started_at = excluded.started_at, done = excluded.done,
        done_exercise_ids = excluded.done_exercise_ids,
        active = true, updated_at = now(),
        last_tick_at = case
          when not (s.active and s.program_id = excluded.program_id and s.day = excluded.day
                    and s.started_at = excluded.started_at)
            then case when cardinality(excluded.done) > 0 then now() end
          when not (s.done @> excluded.done and s.done <@ excluded.done) then now()
          else s.last_tick_at
        end,
        reminded_at = case
          when not (s.active and s.program_id = excluded.program_id and s.day = excluded.day
                    and s.started_at = excluded.started_at)
            then null
          when not (s.done @> excluded.done and s.done <@ excluded.done) then null
          else s.reminded_at
        end;
$function$;

grant execute on function public.api_set_active_session(text, text, text, timestamptz, integer[], text[])
  to anon, authenticated, service_role;

-- 3. Чтение сессии — с составом (сменился тип возврата → DROP + CREATE + гранты).
drop function if exists public.api_get_active_session();

create or replace function public.api_get_active_session()
returns table (program_id text, day text, place text, started_at timestamptz,
               done integer[], done_exercise_ids text[], updated_at timestamptz, active boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.program_id, s.day, s.place, s.started_at, s.done, s.done_exercise_ids, s.updated_at, s.active
  from public.active_sessions s
  where s.user_id = public.current_user_id();
$function$;

grant execute on function public.api_get_active_session() to anon, authenticated, service_role;

-- 4. srv_finish_workout — тело завершения; api_finish_workout — обёртка.
--    Полные определения см. supabase/schema.sql (раздел функций).

-- 5. Снять сессию от имени сервера.
create or replace function public.srv_clear_active_session(p_user_id bigint)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.active_sessions as s
    (user_id, program_id, day, place, started_at, done, active, updated_at)
  values (p_user_id, '', '', 'gym', now(), '{}', false, now())
  on conflict (user_id) do update
    set active = false, done = '{}', done_exercise_ids = '{}', updated_at = now();
$function$;

-- 6. Сессия по нажатию кнопки.
create or replace function public.srv_session_for_callback(
  p_telegram_id bigint, p_started_at timestamp with time zone)
returns table (user_id bigint, program_id text, day text, place text,
               started_at timestamptz, last_tick_at timestamptz,
               done_count integer, done_exercise_ids text[])
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.user_id, s.program_id, s.day, s.place, s.started_at,
         coalesce(s.last_tick_at, s.updated_at), cardinality(s.done), s.done_exercise_ids
  from public.active_sessions s
  join public.users u on u.id = s.user_id
  where u.telegram_id = p_telegram_id
    and s.active
    -- секунда допуска: в кнопке время округлено до секунд
    and abs(extract(epoch from (s.started_at - p_started_at))) < 1.5;
$function$;

-- 7. Секрет вебхука.
create table if not exists public.bot_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.bot_config enable row level security;
revoke all on table public.bot_config from anon, authenticated;

create or replace function public.srv_bot_config_get(p_key text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select value from public.bot_config where key = p_key;
$function$;

create or replace function public.srv_bot_config_set(p_key text, p_value text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.bot_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
$function$;

revoke all on function public.srv_finish_workout(bigint, text, text, text[], timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.srv_clear_active_session(bigint) from public, anon, authenticated;
revoke all on function public.srv_session_for_callback(bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.srv_bot_config_get(text) from public, anon, authenticated;
revoke all on function public.srv_bot_config_set(text, text) from public, anon, authenticated;
grant execute on function public.srv_finish_workout(bigint, text, text, text[], timestamptz, timestamptz, integer) to service_role;
grant execute on function public.srv_clear_active_session(bigint) to service_role;
grant execute on function public.srv_session_for_callback(bigint, timestamptz) to service_role;
grant execute on function public.srv_bot_config_get(text) to service_role;
grant execute on function public.srv_bot_config_set(text, text) to service_role;
grant execute on function public.api_finish_workout(bigint, text, text, text[], timestamptz, timestamptz, integer) to authenticated, service_role;
