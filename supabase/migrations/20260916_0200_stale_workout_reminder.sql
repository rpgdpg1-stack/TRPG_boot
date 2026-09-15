-- Напоминание о забытой тренировке (бот, шаг 2).
--
-- Человек начал тренировку и не нажал «Завершить». Приложение показывает
-- модалку «Тренировка не завершена», но только когда его откроют. Бот
-- напоминает сам: раз в 15 минут Edge Function `stale-workout-remind`
-- спрашивает у базы, кого пора позвать, и шлёт сообщение с кнопкой
-- «Открыть тренировку».
--
-- Пороги те же, что в приложении (src/utils/workout-stale.js) — менять разом:
--   есть галочки → 90 мин после последней;
--   галочек нет  → 3 ч после старта.
--
-- Расписание (cron) заводится ОТДЕЛЬНО, после ручной обкатки функции: первый
-- же запуск пишет живым людям.

create extension if not exists pg_net with schema extensions;

-- Время последней ГАЛОЧКИ. updated_at для этого не годится: он меняется при
-- любом сохранении сессии, а приложение пересохраняет её и при простом
-- открытии дня. reminded_at — бот уже написал про ЭТУ сессию.
alter table public.active_sessions
  add column if not exists last_tick_at timestamptz,
  add column if not exists reminded_at timestamptz;

comment on column public.active_sessions.last_tick_at is
  'Когда в последний раз менялся набор галочек (не любое сохранение). Порог забытой тренировки.';
comment on column public.active_sessions.reminded_at is
  'Бот напомнил о забытой тренировке. Сбрасывается новой сессией или новой галочкой.';

-- Сессию пишет приложение. Время галочки ставим ТОЛЬКО когда набор реально
-- поменялся: сравнение как множеств (порядок в массиве не важен). Та же сессия —
-- совпали программа, день и старт; иначе это новая тренировка, и её
-- счётчики начинаются заново.
create or replace function public.api_set_active_session(
  p_program_id text, p_day text, p_place text, p_started_at timestamp with time zone, p_done integer[])
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.active_sessions as s
    (user_id, program_id, day, place, started_at, done, active, updated_at, last_tick_at, reminded_at)
  values (public.current_user_id(), p_program_id, p_day,
          coalesce(p_place, 'gym'), p_started_at, coalesce(p_done, '{}'), true, now(),
          case when cardinality(coalesce(p_done, '{}')) > 0 then now() end, null)
  on conflict (user_id) do update
    set program_id = excluded.program_id, day = excluded.day, place = excluded.place,
        started_at = excluded.started_at, done = excluded.done,
        active = true, updated_at = now(),
        last_tick_at = case
          -- другая тренировка — отсчёт с нуля
          when not (s.active and s.program_id = excluded.program_id and s.day = excluded.day
                    and s.started_at = excluded.started_at)
            then case when cardinality(excluded.done) > 0 then now() end
          -- та же, набор галочек поменялся
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

-- Кому напомнить. Только живые сессии с Telegram, у кого не выключены пинки,
-- ещё не напомненные и не древнее 30 дней (дальше напоминание уже бессмысленно,
-- а модалка в приложении снимет такую сессию при первом запуске).
create or replace function public.srv_stale_session_candidates()
returns table (user_id bigint, telegram_id bigint, program_id text, day text, place text,
               started_at timestamptz, last_tick_at timestamptz, done_count integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.user_id, u.telegram_id, s.program_id, s.day, s.place, s.started_at,
         coalesce(s.last_tick_at, s.updated_at) as last_tick_at,
         cardinality(s.done) as done_count
  from public.active_sessions s
  join public.users u on u.id = s.user_id
  where s.active
    and s.reminded_at is null
    and s.program_id <> ''
    and u.telegram_id is not null
    and u.notify_nudge
    and s.started_at > now() - interval '30 days'
    and (
      (cardinality(s.done) > 0 and coalesce(s.last_tick_at, s.updated_at) <= now() - interval '90 minutes')
      or (cardinality(s.done) = 0 and s.started_at <= now() - interval '3 hours')
    )
  order by s.started_at;
$function$;

-- Отметить «напомнили». Привязка к started_at: пока бот собирал сообщение,
-- человек мог начать новую тренировку — её отметка не касается.
create or replace function public.srv_mark_session_reminded(p_user_id bigint, p_started_at timestamptz)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.active_sessions
     set reminded_at = now()
   where user_id = p_user_id and started_at = p_started_at and active;
$function$;

-- srv_* — только сервер. REVOKE FROM PUBLIC не снимает права у anon и
-- authenticated (их выдаёт default privileges Supabase) — перечисляем явно.
revoke all on function public.srv_stale_session_candidates() from public, anon, authenticated;
revoke all on function public.srv_mark_session_reminded(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.srv_stale_session_candidates() to service_role;
grant execute on function public.srv_mark_session_reminded(bigint, timestamptz) to service_role;
