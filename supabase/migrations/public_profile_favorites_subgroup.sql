-- В любимых у ДРУГА не хватало подгруппы: тег на карточке пишет
-- «Спина — Ширина», а без sub_group выходило просто «Спина» — у себя полный
-- тег, у друга урезанный.
--
-- Правка хирургическая: берём текущее определение функции и дописываем ОДНО
-- поле в jsonb_build_object. Функция длинная, переписывать её целиком ради
-- одного ключа — лишний риск. Сигнатура не меняется → GRANT'ы остаются.
-- Применено на проде 2026-08-12.
DO $do$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'api_get_user_public_profile';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'api_get_user_public_profile не найдена';
  END IF;

  IF position('''sub_group'', e.sub_group' in v_src) > 0 THEN
    RAISE NOTICE 'sub_group уже отдаётся — правка не нужна';
    RETURN;
  END IF;

  v_new := replace(
    v_src,
    '''muscle_group'', e.muscle_group,',
    '''muscle_group'', e.muscle_group, ''sub_group'', e.sub_group,'
  );

  IF v_new = v_src THEN
    RAISE EXCEPTION 'место вставки не найдено — определение функции изменилось';
  END IF;

  EXECUTE v_new;
END
$do$;
