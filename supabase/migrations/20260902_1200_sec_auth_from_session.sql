-- 20260902_1200_sec_auth_from_session.sql
-- ============================================================================
-- SEC-001 · SEC-002 · SEC-004 — закрываем доступ к чужим данным.
--
-- SEC-001. Пятнадцать функций определяли человека ТОЛЬКО по параметру
--   p_user_id, который присылает клиент, и были открыты роли anon. Публичный
--   ключ лежит в бандле, идентификаторы идут подряд — посторонний мог читать,
--   менять и удалять чужие данные вообще без входа.
--   Лечение: личность берём из public.current_user_id() (подпись сессии).
--   Параметр в сигнатуре ОСТАВЛЕН — фронт его шлёт, ломать вызовы незачем.
--
--   Исключение: api_get_user_public_profile. Там p_user_id — это ЧУЖОЙ профиль,
--   который смотрят, и перезаписывать его нельзя (сломается просмотр друзей).
--   Из сессии берём p_viewer_id — того, КТО смотрит.
--
--   Две функции на языке sql (api_get_my_exercises, api_get_my_programs) тела
--   с BEGIN не имеют, пролог туда не вставить — в них p_user_id заменён
--   вызовом public.current_user_id() прямо в запросе.
--
--   Миграция ИДЕМПОТЕНТНА: функция, уже берущая личность из сессии,
--   пропускается. Повторный прогон безопасен.
--
-- SEC-002. На exercises висели ДВЕ политики чтения: правильная (только
--   каталожные) и public_read_exercises с USING (true). Разрешающие политики
--   складываются через ИЛИ, поэтому вторая отменяла первую и открывала чужие
--   пользовательские упражнения всем.
--   Проверено перед удалением: прямые select из exercises во фронте — это
--   ЗАПАСНОЙ путь под каталог (свои упражнения идут через api_get_my_exercises),
--   getExerciseById для своих уже ходит через loadExercisesByIds. Не сломается.
--
-- SEC-004. heartbeat был открыт анониму на запись (политика Allow all).
--   Оставляем anon только чтение; пишет keepalive под service_role.
--
-- Откат: определения сохранены в public._rollback_sec001 (proname, def).
-- ============================================================================

BEGIN;

-- ── SEC-001 · plpgsql: вставляем пролог после первого BEGIN ─────────────────
DO $mig$
DECLARE
  r record;
  v_def text;
  v_var text;
  v_pos int;
  v_prolog text;
  v_done int := 0;
  v_skip int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND l.lanname = 'plpgsql'
      AND p.proname IN (
        'api_add_friend_by_ref','api_adopt_program_exercises','api_create_my_exercise',
        'api_delete_my_exercise','api_delete_my_program','api_get_friends_list',
        'api_remove_friend','api_save_friend_program','api_save_my_program',
        'api_share_my_program','api_toggle_pin_friend','api_update_my_exercise',
        'api_get_user_public_profile')
  LOOP
    -- Уже берёт личность из сессии — не трогаем (идемпотентность).
    IF (SELECT prosrc FROM pg_proc WHERE oid = r.oid) ILIKE '%current_user_id()%' THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    -- В api_get_user_public_profile p_user_id — ЧУЖОЙ профиль. Из сессии берём смотрящего.
    v_var := CASE WHEN r.proname = 'api_get_user_public_profile'
                  THEN 'p_viewer_id' ELSE 'p_user_id' END;

    v_prolog := E'\n  -- SEC-001: личность берём ИЗ СЕССИИ, параметру от клиента не верим.\n'
             || '  ' || v_var || E' := public.current_user_id();\n'
             || '  IF ' || v_var || E' IS NULL THEN\n'
             || E'    RAISE EXCEPTION ''not authenticated'' USING ERRCODE = ''28000'';\n'
             || E'  END IF;\n';

    v_def := pg_get_functiondef(r.oid);

    -- Первое BEGIN на своей строке внутри тела (после AS $function$).
    v_pos := position(E'\nbegin\n' in lower(v_def));
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'SEC-001: не нашёл BEGIN в %', r.proname;
    END IF;

    v_def := left(v_def, v_pos + 6) || v_prolog || substr(v_def, v_pos + 7);
    EXECUTE v_def;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'SEC-001 plpgsql: переписано %, пропущено (уже с сессией) %', v_done, v_skip;
END
$mig$;

-- ── SEC-001 · sql-функции: параметр заменяем вызовом ────────────────────────
DO $mig$
DECLARE
  r record;
  v_def text;
  v_done int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND l.lanname = 'sql'
      AND p.proname IN ('api_get_my_exercises','api_get_my_programs')
  LOOP
    IF (SELECT prosrc FROM pg_proc WHERE oid = r.oid) ILIKE '%current_user_id()%' THEN
      CONTINUE;
    END IF;
    -- Заменяем только ВХОЖДЕНИЯ В ТЕЛЕ: сигнатуру не трогаем, она до AS $function$.
    v_def := pg_get_functiondef(r.oid);
    v_def := left(v_def, position('AS $function$' in v_def) + 12)
          || replace(substr(v_def, position('AS $function$' in v_def) + 13),
                     'p_user_id', 'public.current_user_id()');
    EXECUTE v_def;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'SEC-001 sql: переписано %', v_done;
END
$mig$;

-- ── SEC-001 · отзываем право вызова у анонимной роли ────────────────────────
REVOKE EXECUTE ON FUNCTION public.api_add_friend_by_ref(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_adopt_program_exercises(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_create_my_exercise(bigint, text, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_delete_my_exercise(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_delete_my_program(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_get_friends_list(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_get_my_exercises(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_get_my_programs(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_get_user_public_profile(bigint, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_remove_friend(bigint, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_save_friend_program(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_save_my_program(bigint, text, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_share_my_program(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_toggle_pin_friend(bigint, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.api_update_my_exercise(bigint, text, text, text, text, text, boolean) FROM anon;

-- ── SEC-002 ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS public_read_exercises ON public.exercises;

-- ── SEC-004 ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all heartbeat" ON public.heartbeat;
CREATE POLICY heartbeat_read_all ON public.heartbeat FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.heartbeat FROM anon, authenticated;

COMMIT;

-- ── SEC-001 (дополнение) ────────────────────────────────────────────────────
-- У части функций EXECUTE был выдан роли PUBLIC (в ACL: «=X/postgres»).
-- REVOKE ... FROM anon такой грант НЕ снимает — аноним продолжает вызывать
-- функцию через PUBLIC. Снимаем PUBLIC и anon, authenticated выдаём явно.
DO $mig$
DECLARE r record; v_sig text; v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'api\_%'
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_user_id%'
  LOOP
    v_sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_sig);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'SEC-001: права пересобраны у % функций', v_n;
END $mig$;
