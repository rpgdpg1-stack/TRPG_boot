-- 20260903_1600_fix_heartbeat_keepalive.sql
-- ============================================================================
-- Починка SEC-004. В той миграции я снял у anon права INSERT/UPDATE/DELETE
-- на heartbeat, написав в комментарии «пишет keepalive под service_role».
-- Не проверил. На деле GitHub Actions пингует PATCH-запросом под ПУБЛИЧНЫМ
-- ключом — задача упала с 401, последний успешный пинг был 31.08.
--
-- Возвращаем ровно то, что нужно пингу, и не больше:
--   UPDATE — да, это и есть обновление даты;
--   INSERT/DELETE — по-прежнему нет: строка одна (CHECK id = 1),
--   добавлять и удалять её анониму незачем.
-- Худшее, что сделает посторонний, — переставит дату последнего пинга.
-- Таблица служебная, пользовательских данных в ней нет.
-- ============================================================================

GRANT UPDATE ON public.heartbeat TO anon, authenticated;

DROP POLICY IF EXISTS heartbeat_update_ping ON public.heartbeat;
CREATE POLICY heartbeat_update_ping ON public.heartbeat
  FOR UPDATE USING (id = 1) WITH CHECK (id = 1);

COMMENT ON TABLE public.heartbeat IS
  'Служебная таблица: одна строка, дату в ней обновляет GitHub Actions дважды в неделю, чтобы база на бесплатном тарифе не уснула. Пинг идёт ПУБЛИЧНЫМ ключом (anon) — поэтому anon нужен SELECT и UPDATE. INSERT/DELETE не давать.';
