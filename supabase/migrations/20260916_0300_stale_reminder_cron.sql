-- Расписание напоминаний о забытой тренировке: каждые 15 минут дёргаем
-- Edge Function stale-workout-remind. Кого звать — решает она сама через
-- srv_stale_session_candidates; повторный вызов безвреден (reminded_at).
--
-- Заведено ОТДЕЛЬНОЙ миграцией, после обкатки функции вхолостую (dry_run):
-- первый запуск сразу пишет живым людям.
--
-- Посмотреть/выключить:
--   select jobid, jobname, schedule, active from cron.job;
--   select cron.unschedule('stale-workout-remind');
--   select * from cron.job_run_details order by start_time desc limit 10;

select cron.schedule(
  'stale-workout-remind',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://jybwxbqmnommazjfucbq.supabase.co/functions/v1/stale-workout-remind',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);
