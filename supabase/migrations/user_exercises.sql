-- СВОИ УПРАЖНЕНИЯ ПОЛЬЗОВАТЕЛЯ
--
-- ПРИМЕНЕНО НА ПРОДЕ 2026-08-14 пятью миграциями через коннектор:
--   user_exercises, user_exercises_program_guard,
--   friend_program_custom_exercises, adopt_exercises_by_share_token,
--   my_programs_pending_custom.
-- Файл — их слепок для истории репозитория. Повторный прогон безопасен
-- (всё идемпотентно), но не нужен.
--
-- ── ГЛАВНОЕ РЕШЕНИЕ ──────────────────────────────────────────────────────────
-- НЕ заводим отдельную таблицу user_exercises, а добавляем владельца
-- в существующую `exercises`.
--
-- Почему. На exercises.id завязаны внешними ключами почти все механики:
-- program_days, user_exercise_weights, user_exercise_swaps,
-- user_favorite_exercises, exercise_sets (подходы прошлых тренировок).
-- Отдельная таблица означала бы либо снять эти ключи (потерять целостность),
-- либо продублировать каждую механику «а если упражнение из второй таблицы».
-- С колонкой владельца своё упражнение полноправно везде без единой правки
-- этих механик.
--
-- Масштаб: своих не больше 12 на человека. Тысяча пользователей — 12 тысяч
-- строк в таблице, где сейчас 88. Для Postgres это ничто; индекс по владельцу
-- частичный, системный каталог читается тем же планом, что и раньше.
--
-- Системное упражнение: owner_id IS NULL. Своё: owner_id = users.id, id `ux_N`.

-- ── 1. Колонки и последовательность ──────────────────────────────────────────

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS owner_id bigint REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_exercises_owner_id
  ON public.exercises (owner_id) WHERE owner_id IS NOT NULL;

-- Сквозная нумерация. Именно последовательность, а не «первый свободный номер
-- у пользователя»: переиспользованный id прицепил бы к новому упражнению
-- историю удалённого.
CREATE SEQUENCE IF NOT EXISTS public.user_exercise_seq START 1;

-- ── 2. RLS: чужие личные упражнения не видны вообще ──────────────────────────
-- Каталог читается прямым select с anon-ключом, а сессии Supabase у приложения
-- нет — по политике пользователя не различить. Поэтому режем на уровне таблицы:
-- RESTRICTIVE-политика складывается с существующей public_read_exercises через
-- AND, поэтому имя старой знать не нужно, и прямой select физически не может
-- вернуть ничью пользовательскую строку.
DROP POLICY IF EXISTS exercises_public_reads_system_only ON public.exercises;
CREATE POLICY exercises_public_reads_system_only ON public.exercises
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (owner_id IS NULL);

-- КРИТИЧНО: SECURITY DEFINER обходит RLS, и без этого фильтра общий каталог
-- раздавал бы всем чужие личные упражнения.
CREATE OR REPLACE FUNCTION public.api_get_all_exercises()
 RETURNS TABLE(id text, name text, sub_group text, type text, meta_info text, preview_url text, video_url text, priority integer, counts_reps boolean)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id, name, sub_group, type, meta_info, preview_url, video_url, priority, counts_reps
  FROM public.exercises
  WHERE owner_id IS NULL
  ORDER BY priority ASC;
$function$;

-- ── 3. Чтение ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_get_my_exercises(p_user_id bigint)
RETURNS TABLE (
  id text, name text, muscle_group text, sub_group text, type text,
  meta_info text, preview_url text, video_url text, counts_reps boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.muscle_group, e.sub_group, e.type,
         e.meta_info, e.preview_url, e.video_url, coalesce(e.counts_reps, false)
  FROM exercises e
  WHERE e.owner_id = p_user_id
  ORDER BY e.id;
$function$;

REVOKE ALL ON FUNCTION public.api_get_my_exercises(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_get_my_exercises(bigint) TO anon, authenticated, service_role;

-- Названия чужих личных упражнений — ТОЛЬКО по точному списку id. Нужна для
-- программы друга, пока её упражнения ещё не скопированы себе. Перебрать
-- каталог через неё нельзя.
CREATE OR REPLACE FUNCTION public.api_get_exercises_by_ids(p_ids text[])
RETURNS TABLE (
  id text, name text, muscle_group text, sub_group text, type text,
  meta_info text, preview_url text, video_url text, counts_reps boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.muscle_group, e.sub_group, e.type,
         e.meta_info, e.preview_url, e.video_url, coalesce(e.counts_reps, false)
  FROM exercises e
  WHERE e.id = ANY(coalesce(p_ids, '{}'::text[]))
  LIMIT 50;
$function$;

REVOKE ALL ON FUNCTION public.api_get_exercises_by_ids(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_get_exercises_by_ids(text[]) TO anon, authenticated, service_role;

-- ── 4. Заведение и правка ────────────────────────────────────────────────────
-- Группа и подгруппа — свободный текст. Пустая строка вместо NULL: колонки
-- NOT NULL и участвуют в сравнении слотов.

CREATE OR REPLACE FUNCTION public.api_create_my_exercise(
  p_user_id bigint, p_name text, p_group text, p_sub_group text, p_meta text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_count int;
  v_id text;
begin
  if v_name = '' then raise exception 'name is required'; end if;
  if length(v_name) > 60 then raise exception 'name too long'; end if;

  select count(*) into v_count from exercises where owner_id = p_user_id;
  if v_count >= 12 then raise exception 'limit reached: 12 custom exercises'; end if;

  v_id := 'ux_' || nextval('user_exercise_seq')::text;

  insert into exercises (id, name, muscle_group, sub_group, type, meta_info,
                         preview_url, video_url, counts_reps, priority, owner_id)
  values (v_id, v_name,
          left(btrim(coalesce(p_group, '')), 30), left(btrim(coalesce(p_sub_group, '')), 30),
          'accessory', nullif(left(btrim(coalesce(p_meta, '')), 30), ''),
          null, null, false, 9999, p_user_id);

  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_create_my_exercise(bigint, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_create_my_exercise(bigint, text, text, text, text) TO anon, authenticated, service_role;

-- Группа/подгруппа лежат копией и в слотах программ — иначе тег в дне
-- тренировки остался бы старым.
CREATE OR REPLACE FUNCTION public.api_update_my_exercise(
  p_user_id bigint, p_exercise_id text, p_name text, p_group text, p_sub_group text, p_meta text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_group text := left(btrim(coalesce(p_group, '')), 30);
  v_sub text := left(btrim(coalesce(p_sub_group, '')), 30);
begin
  if v_name = '' then raise exception 'name is required'; end if;
  if length(v_name) > 60 then raise exception 'name too long'; end if;

  update exercises
  set name = v_name, muscle_group = v_group, sub_group = v_sub,
      meta_info = nullif(left(btrim(coalesce(p_meta, '')), 30), '')
  where id = p_exercise_id and owner_id = p_user_id;

  if not found then return false; end if;

  update program_days pd set muscle_group = v_group, sub_group = v_sub
  where pd.exercise_id = p_exercise_id;

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_update_my_exercise(bigint, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_update_my_exercise(bigint, text, text, text, text, text) TO anon, authenticated, service_role;

-- ── 5. Удаление — ПОЛНОЕ, без архива ─────────────────────────────────────────
-- От упражнения не остаётся ничего: подходы прошлых тренировок, заметка,
-- история веса, любимое, слоты программ. Сами тренировки (дата, длительность,
-- серия) не трогаются — они в workouts, день в календаре остаётся на месте.
-- Порядок важен: exercise_sets держит FK с RESTRICT, program_days — с NO ACTION,
-- поэтому обе чистим руками до удаления самой строки.
CREATE OR REPLACE FUNCTION public.api_delete_my_exercise(p_user_id bigint, p_exercise_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_removed int := 0;
begin
  if not exists (select 1 from exercises where id = p_exercise_id and owner_id = p_user_id) then
    return -1;
  end if;

  delete from exercise_sets                 where exercise_id = p_exercise_id;
  delete from user_exercise_notes           where exercise_id = p_exercise_id;
  delete from user_exercise_weight_history  where exercise_id = p_exercise_id;
  delete from user_favorite_exercises       where exercise_id = p_exercise_id;
  delete from user_exercise_swaps           where exercise_id = p_exercise_id;
  delete from user_exercise_weights         where exercise_id = p_exercise_id;

  with gone as (
    delete from program_days where exercise_id = p_exercise_id returning program_id, day, location
  )
  select count(*) into v_removed from gone;

  -- Дыры в нумерации после выемки: порядок внутри дня пересобираем подряд,
  -- иначе order_num разъедется со свапами (они привязаны к номеру слота).
  with renum as (
    select pd.ctid, row_number() over (partition by pd.program_id, pd.day, pd.location
                                       order by pd.order_num) as rn
    from program_days pd
    join programs p on p.id = pd.program_id
    where p.owner_id = p_user_id
  )
  update program_days pd set order_num = renum.rn
  from renum where pd.ctid = renum.ctid and pd.order_num <> renum.rn;

  delete from exercises where id = p_exercise_id and owner_id = p_user_id;

  return v_removed;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_delete_my_exercise(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_delete_my_exercise(bigint, text) TO anon, authenticated, service_role;

-- ── 6. Защита сборки программы ───────────────────────────────────────────────
-- Единственная правка в теле api_save_my_program: в слот пускаем системное
-- упражнение ИЛИ своё собственное. Иначе, подставив чужой id запросом мимо
-- интерфейса, можно было бы затащить в программу приватное упражнение другого
-- человека. Полное тело — в проде, здесь для истории только суть условия:
--
--   from exercises e
--   where e.id = v_ex and (e.owner_id is null or e.owner_id = p_user_id)

-- ── 7. ПРОГРАММА ДРУГА СО СВОИМИ УПРАЖНЕНИЯМИ АВТОРА ─────────────────────────
--
-- Личное упражнение автора нельзя «одолжить»: получателю нужно вести в него
-- СВОЙ вес, а вес привязан к упражнению. Поэтому при сохранении программы такие
-- упражнения КОПИРУЮТСЯ получателю и становятся его личными — дальше он их
-- правит и удаляет наравне со своими.
--
-- Копия делается из снимка в момент шеринга (shared_programs.custom_exercises),
-- а не из живой строки автора: автор мог успеть переименовать или удалить
-- упражнение, а поделился он конкретной версией.
--
-- Не хватило места в лимите 12 — программа всё равно сохраняется, но остаётся
-- ЗАБЛОКИРОВАННОЙ: в слотах стоят id автора, приложение не даёт её открыть
-- и говорит, сколько мест освободить. Освободил — кнопка копирует и открывает.
-- Признак блокировки — pending_custom в api_get_my_programs.

ALTER TABLE public.shared_programs ADD COLUMN IF NOT EXISTS custom_exercises jsonb;

-- Программа от друга помнит, из какой ссылки пришла: снимок лежит в той же
-- строке shared_programs. Без этого снимок пришлось бы угадывать по автору,
-- а он мог поделиться несколькими программами.
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS share_token text;

CREATE OR REPLACE FUNCTION public.api_adopt_program_exercises(p_user_id bigint, p_program_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_ids text[]; v_need int; v_free int; v_copied int := 0;
  v_old text; v_new text; v_src jsonb; v_snap jsonb; v_token text;
begin
  if not exists (select 1 from programs where id = p_program_id and owner_id = p_user_id) then
    raise exception 'program not found or not yours';
  end if;

  select coalesce(array_agg(distinct pd.exercise_id), '{}')
  into v_ids
  from program_days pd
  join exercises e on e.id = pd.exercise_id
  where pd.program_id = p_program_id
    and e.owner_id is not null and e.owner_id <> p_user_id;

  v_need := coalesce(array_length(v_ids, 1), 0);
  select 12 - count(*) into v_free from exercises where owner_id = p_user_id;

  if v_need = 0 then
    return jsonb_build_object('ok', true, 'need', 0, 'free', greatest(v_free, 0), 'copied', 0);
  end if;
  if v_need > v_free then
    return jsonb_build_object('ok', false, 'need', v_need, 'free', greatest(v_free, 0), 'copied', 0);
  end if;

  select p.share_token into v_token from programs p where p.id = p_program_id;
  select sp.custom_exercises into v_snap from shared_programs sp where sp.token = v_token;

  foreach v_old in array v_ids loop
    v_src := coalesce(v_snap -> v_old, '{}'::jsonb);
    v_new := 'ux_' || nextval('user_exercise_seq')::text;

    -- Данные из снимка ссылки; живая строка автора — запасной вариант для
    -- старых ссылок, где снимка ещё не было.
    insert into exercises (id, name, muscle_group, sub_group, type, meta_info,
                           preview_url, video_url, counts_reps, priority, owner_id)
    select v_new,
           coalesce(v_src->>'name', e.name),
           coalesce(v_src->>'muscle_group', e.muscle_group),
           coalesce(v_src->>'sub_group', e.sub_group),
           coalesce(v_src->>'type', e.type),
           coalesce(v_src->>'meta_info', e.meta_info),
           null, null, false, 9999, p_user_id
    from exercises e where e.id = v_old;

    update program_days set exercise_id = v_new
    where program_id = p_program_id and exercise_id = v_old;

    v_copied := v_copied + 1;
  end loop;

  return jsonb_build_object('ok', true, 'need', v_need, 'free', v_free - v_copied, 'copied', v_copied);
end;
$function$;

REVOKE ALL ON FUNCTION public.api_adopt_program_exercises(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_adopt_program_exercises(bigint, text) TO anon, authenticated, service_role;

-- api_share_my_program дополнительно кладёт в снимок сами личные упражнения,
-- задействованные в программе; api_save_friend_program после вставки слотов
-- зовёт api_adopt_program_exercises; api_get_my_programs отдаёт pending_custom —
-- количество чужих личных упражнений, ещё не скопированных себе.
-- Полные тела — в проде (миграции friend_program_custom_exercises,
-- adopt_exercises_by_share_token, my_programs_pending_custom).
