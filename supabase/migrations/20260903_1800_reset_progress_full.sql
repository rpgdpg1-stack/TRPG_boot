-- 20260903_1800_reset_progress_full.sql
-- ============================================================================
-- Полный сброс аккаунта «к заводским установкам».
--
-- Было: api_reset_my_progress чистила ТОЛЬКО историю тренировок и недельную
-- серию. Всё остальное — рабочие веса и их история, заметки, замены упражнений,
-- любимые, настройки аккаунта, свои упражнения и свои программы, идущая сессия,
-- личные данные, приватность, уведомления — переживало «полное обнуление»
-- и возвращалось при следующем заходе. Человек жал «Сбросить прогресс»,
-- а получал полусброс.
--
-- Стало: аккаунт приводится к состоянию только что зарегистрировавшегося.
--
-- НЕ трогаем намеренно:
--   • способ входа (telegram_id, email, auth_id) и referral_code — иначе
--     человек потеряет доступ к собственному аккаунту;
--   • имя, ник и фото — приходят из Telegram и перезапишутся при входе;
--   • ДРУЖБЫ. Связь двусторонняя: молча вычеркнув себя, мы поменяли бы список
--     друзей другому человеку, который ничего не сбрасывал. Друга удаляют
--     по одному и осознанно. Свои ЗАКРЕПЫ друзей (friend_pins) при этом
--     чистим — это личная настройка списка, а не сама дружба;
--   • email_codes — служебные коды входа, истекают сами.
--
-- Порядок удаления продиктован внешними ключами: program_days,
-- workout_exercises и user_favorite_exercises ссылаются на exercises БЕЗ
-- каскада, поэтому упражнения удаляются последними.
--
-- Отдельный случай — своё упражнение, попавшее в программу друга через
-- «поделиться». Удалить его нельзя: на него ссылаются program_days друга.
-- Такие АРХИВИРУЕМ (archived_at) — из своих списков пропадут, у друга
-- программа не развалится. Число архивированных возвращается фронту.
--
-- Тип возврата меняется с void на jsonb, поэтому DROP + CREATE.
-- Фронт результат не читает (только error) — вызовы не ломаются.
-- ============================================================================

DROP FUNCTION IF EXISTS public.api_reset_my_progress();

CREATE FUNCTION public.api_reset_my_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
  v_archived int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- 1. Идущая тренировка: чтобы после сброса не всплыла «продолжить».
  DELETE FROM active_sessions WHERE user_id = uid;

  -- 2. История тренировок. workout_exercises уходят каскадом — заодно
  --    снимается RESTRICT, мешающий удалить свои упражнения ниже.
  DELETE FROM workouts WHERE user_id = uid;

  -- 3. Любимые: ссылаются на exercises без каскада, убираем до упражнений.
  DELETE FROM user_favorite_exercises WHERE user_id = uid;

  -- 4. Всё, что человек накопил по упражнениям.
  DELETE FROM user_exercise_notes          WHERE user_id = uid;
  DELETE FROM user_exercise_weight_history WHERE user_id = uid;
  DELETE FROM user_exercise_swaps          WHERE user_id = uid;
  DELETE FROM user_exercise_weights        WHERE user_id = uid;

  -- 5. Ссылки «поделиться программой», которые он раздал.
  DELETE FROM shared_programs WHERE author_id = uid;

  -- 6. Свои программы (своя и сохранённая от друга). program_days уходят
  --    каскадом. Каталожные (owner_id IS NULL) не трогаем.
  DELETE FROM programs WHERE owner_id = uid;

  -- 7. Свои упражнения; отданные другу — архивируем, а не удаляем.
  UPDATE exercises SET archived_at = now()
  WHERE owner_id = uid AND archived_at IS NULL
    AND EXISTS (SELECT 1 FROM program_days pd WHERE pd.exercise_id = exercises.id);
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  DELETE FROM exercises
  WHERE owner_id = uid
    AND NOT EXISTS (SELECT 1 FROM program_days pd WHERE pd.exercise_id = exercises.id);

  -- 8. Настройки аккаунта: закрепы программ, выбранные места, наборы быстрой
  --    тренировки — всё, что копится в user_prefs.
  DELETE FROM user_prefs WHERE user_id = uid;

  -- 9. Закреплённые друзья — МОЯ настройка списка, а не сама дружба.
  DELETE FROM friend_pins WHERE owner_id = uid;

  -- 10. Поля самого человека: прогресс, личные данные, приватность и
  --     уведомления возвращаются к значениям по умолчанию из схемы.
  UPDATE users SET
    weekly_streak          = 0,
    weekly_streak_week     = NULL,
    training_since         = NULL,
    sex                    = NULL,
    height_cm              = NULL,
    birth_date             = NULL,
    show_last_workout      = true,
    show_stats             = false,
    show_favorites         = false,
    show_weights           = true,
    show_records           = true,
    notify_digest          = true,
    notify_nudge           = true,
    nudge_ignored          = 0,
    last_nudge_at          = NULL,
    last_progress_reset_at = now(),
    progress_reset_count   = coalesce(progress_reset_count, 0) + 1,
    updated_at             = now()
  WHERE id = uid;

  RETURN jsonb_build_object('ok', true, 'archived_exercises', v_archived);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.api_reset_my_progress() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_reset_my_progress() TO authenticated, service_role;

COMMENT ON FUNCTION public.api_reset_my_progress() IS
  'Полный сброс аккаунта к состоянию только что зарегистрировавшегося. НЕ трогает способ входа, referral_code и дружбы (связь двусторонняя). Свои упражнения, попавшие в программу друга, архивируются, а не удаляются.';
