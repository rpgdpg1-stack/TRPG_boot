-- СВОИ УПРАЖНЕНИЯ ПОЛЬЗОВАТЕЛЯ
--
-- Ключевое решение: НЕ заводим отдельную таблицу user_exercises, а добавляем
-- владельца в существующую `exercises`.
--
-- Почему. На exercises.id завязано внешними ключами почти всё приложение:
-- program_days.exercise_id, user_exercise_weights, user_exercise_swaps,
-- user_favorite_exercises, workout_exercises, история весов, рекорды. Отдельная
-- таблица означала бы либо снять эти FK (потерять целостность), либо продублировать
-- каждую механику «а если упражнение из второй таблицы». С колонкой владельца
-- своё упражнение автоматически полноправно везде: вес сохраняется, попадает
-- в историю и рекорды, работает в оффлайне — без единой правки этих механик.
--
-- Системное упражнение: owner_id IS NULL. Своё: owner_id = users.id.
--
-- Применить целиком одним запуском.

-- ── 1. Колонки ────────────────────────────────────────────────────────────────

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS owner_id    bigint REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_exercises_owner_id
  ON public.exercises (owner_id) WHERE owner_id IS NOT NULL;

-- Сквозная нумерация своих упражнений. Именно последовательность, а не
-- «первый свободный номер у пользователя»: переиспользованный id прицепил бы
-- к новому упражнению историю весов удалённого.
CREATE SEQUENCE IF NOT EXISTS public.user_exercise_seq START 1;

-- ── 2. RLS: чужие свои упражнения не видны вообще ────────────────────────────
-- Каталог читается прямым select с anon-ключом (RLS «exercises = public read»),
-- а у приложения нет сессии Supabase — по политике пользователя не различить.
-- Поэтому режем на уровне таблицы: RESTRICTIVE-политика складывается с любой
-- существующей через AND, поэтому имя старой политики знать не нужно и прямой
-- select физически не может вернуть ничью пользовательскую строку.
-- Свои приходят только через SECURITY DEFINER функции ниже (они обходят RLS).
DROP POLICY IF EXISTS exercises_public_reads_system_only ON public.exercises;
CREATE POLICY exercises_public_reads_system_only ON public.exercises
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (owner_id IS NULL);

-- ── 3. Чтение своих ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_get_my_exercises(p_user_id bigint)
RETURNS TABLE (
  id text, name text, muscle_group text, sub_group text, type text,
  meta_info text, preview_url text, video_url text, counts_reps boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.muscle_group, e.sub_group, e.type,
         e.meta_info, e.preview_url, e.video_url, coalesce(e.counts_reps, false)
  FROM exercises e
  WHERE e.owner_id = p_user_id AND e.archived_at IS NULL
  ORDER BY e.id;
$function$;

REVOKE ALL ON FUNCTION public.api_get_my_exercises(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_get_my_exercises(bigint) TO anon, authenticated, service_role;

-- Разрешить названия для чужих своих упражнений — но ТОЛЬКО по точному списку id.
-- Нужно ровно для одного случая: сохранил программу друга, а в ней его личное
-- упражнение. Без этого слот показал бы «подгруппа (тип)» вместо названия.
-- Перебрать каталог так нельзя — функция отвечает лишь на конкретные id.
CREATE OR REPLACE FUNCTION public.api_get_exercises_by_ids(p_ids text[])
RETURNS TABLE (
  id text, name text, muscle_group text, sub_group text, type text,
  meta_info text, preview_url text, video_url text, counts_reps boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.muscle_group, e.sub_group, e.type,
         e.meta_info, e.preview_url, e.video_url, coalesce(e.counts_reps, false)
  FROM exercises e
  WHERE e.id = ANY(coalesce(p_ids, '{}'::text[]))
  LIMIT 50;
$function$;

REVOKE ALL ON FUNCTION public.api_get_exercises_by_ids(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_get_exercises_by_ids(text[]) TO anon, authenticated, service_role;

-- ── 4. Создание ──────────────────────────────────────────────────────────────
-- Группа и подгруппа — свободный текст. Если группа совпала с ключом системной
-- ('legs', 'back'…), тег в приложении окрасится в цвет этой группы; иначе —
-- в акцентный. Пустая строка вместо NULL: колонки участвуют в сравнениях
-- слотов, NULL там ведёт себя иначе, чем «не задано».

CREATE OR REPLACE FUNCTION public.api_create_my_exercise(
  p_user_id bigint, p_name text, p_group text, p_sub_group text, p_meta text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_count int;
  v_id text;
begin
  if v_name = '' then raise exception 'name is required'; end if;
  if length(v_name) > 60 then raise exception 'name too long'; end if;

  select count(*) into v_count from exercises
  where owner_id = p_user_id and archived_at is null;
  if v_count >= 12 then raise exception 'limit reached: 12 custom exercises'; end if;

  v_id := 'ux_' || nextval('user_exercise_seq')::text;

  insert into exercises (id, name, muscle_group, sub_group, type, meta_info,
                         preview_url, video_url, counts_reps, priority, owner_id)
  values (v_id, v_name,
          btrim(coalesce(p_group, '')), btrim(coalesce(p_sub_group, '')),
          'accessory', nullif(btrim(coalesce(p_meta, '')), ''),
          null, null, false, 9999, p_user_id);

  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_create_my_exercise(bigint, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_create_my_exercise(bigint, text, text, text, text) TO anon, authenticated, service_role;

-- ── 5. Правка ────────────────────────────────────────────────────────────────
-- Группа/подгруппа меняются и в самом упражнении, и в слотах программ, где оно
-- стоит: program_days хранит их копией, и без этого тег в дне тренировки остался
-- бы старым.

CREATE OR REPLACE FUNCTION public.api_update_my_exercise(
  p_user_id bigint, p_exercise_id text, p_name text, p_group text, p_sub_group text, p_meta text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_group text := btrim(coalesce(p_group, ''));
  v_sub text := btrim(coalesce(p_sub_group, ''));
begin
  if v_name = '' then raise exception 'name is required'; end if;
  if length(v_name) > 60 then raise exception 'name too long'; end if;

  update exercises
  set name = v_name, muscle_group = v_group, sub_group = v_sub,
      meta_info = nullif(btrim(coalesce(p_meta, '')), '')
  where id = p_exercise_id and owner_id = p_user_id and archived_at is null;

  if not found then return false; end if;

  update program_days pd
  set muscle_group = v_group, sub_group = v_sub
  where pd.exercise_id = p_exercise_id
    and exists (select 1 from programs p where p.id = pd.program_id and p.owner_id = p_user_id);

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_update_my_exercise(bigint, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_update_my_exercise(bigint, text, text, text, text, text) TO anon, authenticated, service_role;

-- ── 6. Удаление ──────────────────────────────────────────────────────────────
-- НЕ delete, а архивация. Строка остаётся, потому что на неё ссылается история:
-- workout_exercises, история весов, рекорды. Физическое удаление либо снесло бы
-- каскадом отработанные тренировки, либо упёрлось бы в FK. Архивное упражнение
-- пропадает из «Моих» и из программ, но прошлые тренировки читаются как прежде.
-- Возвращает, из скольких слотов программ оно было вынуто.

CREATE OR REPLACE FUNCTION public.api_delete_my_exercise(p_user_id bigint, p_exercise_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_removed int := 0;
begin
  update exercises set archived_at = now()
  where id = p_exercise_id and owner_id = p_user_id and archived_at is null;
  if not found then return -1; end if;

  with gone as (
    delete from program_days pd
    where pd.exercise_id = p_exercise_id
      and exists (select 1 from programs p where p.id = pd.program_id and p.owner_id = p_user_id)
    returning 1
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

  delete from user_favorite_exercises where exercise_id = p_exercise_id and user_id = p_user_id;

  return v_removed;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_delete_my_exercise(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_delete_my_exercise(bigint, text) TO anon, authenticated, service_role;

-- ── 7. Защита сборки программы ───────────────────────────────────────────────
-- Единственная правка в теле api_save_my_program: в слот пускаем системное
-- упражнение ИЛИ своё, но только своё собственное. Иначе, подставив чужой id
-- запросом мимо интерфейса, можно было бы затащить в программу приватное
-- упражнение другого человека. Остальное тело не тронуто.

CREATE OR REPLACE FUNCTION public.api_save_my_program(p_user_id bigint, p_name text, p_day_count integer, p_days jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pid text := 'usr_' || p_user_id::text;
  v_letters text[] := array['A','B','C'];
  v_locs text[] := array['gym','home','outdoor'];
  v_loc text; v_letter text; v_ex text;
  v_day_list jsonb; v_day_arr jsonb;
  v_idx int; v_order int; v_filled boolean := false;
begin
  if jsonb_typeof(p_days) <> 'object' then raise exception 'p_days must be a JSON object'; end if;
  if p_day_count < 1 or p_day_count > 3 then raise exception 'day_count must be 1..3, got %', p_day_count; end if;

  insert into programs (id, name, category, days_count, tags, available, owner_id, source, author_id)
  values (v_pid, coalesce(nullif(btrim(p_name), ''), 'Моя программа'), 'gym', p_day_count,
          array[]::text[], true, p_user_id, 'custom', null)
  on conflict (id) do update
    set name = excluded.name, days_count = excluded.days_count, available = true,
        owner_id = p_user_id, source = 'custom';

  delete from program_days where program_id = v_pid;

  foreach v_loc in array v_locs loop
    v_day_list := p_days -> v_loc;
    if v_day_list is null or jsonb_typeof(v_day_list) <> 'array' then continue; end if;

    for v_idx in 0 .. least(jsonb_array_length(v_day_list), p_day_count) - 1 loop
      v_day_arr := v_day_list -> v_idx;
      v_letter := v_letters[v_idx + 1];
      if v_day_arr is null or jsonb_typeof(v_day_arr) <> 'array' then continue; end if;

      v_order := 0;
      for v_ex in select jsonb_array_elements_text(v_day_arr) loop
        v_order := v_order + 1;
        if v_order > 12 then raise exception 'day % (%) exceeds 12 exercises', v_letter, v_loc; end if;
        insert into program_days (program_id, day, location, order_num, muscle_group, sub_group, type, exercise_id)
        select v_pid, v_letter, v_loc, v_order, e.muscle_group, e.sub_group, e.type, e.id
        from exercises e
        where e.id = v_ex
          and e.archived_at is null
          and (e.owner_id is null or e.owner_id = p_user_id);
        if not found then raise exception 'unknown exercise %', v_ex; end if;
        v_filled := true;
      end loop;
    end loop;
  end loop;

  if not v_filled then raise exception 'program has no exercises'; end if;

  -- Чистим протухшие свапы этой программы: после пересборки order_num могут
  -- сместиться, и старый свап оказался бы в чужом слоте (упражнение другой
  -- группы). Оставляем только те, что совпадают с новой раскладкой по
  -- (day, location, order_num) и по подгруппе+типу слота. Остальные удаляем.
  delete from user_exercise_swaps s
  where s.program_id = v_pid
    and not exists (
      select 1 from program_days pd
      join exercises e on e.id = s.exercise_id
      where pd.program_id = s.program_id
        and pd.day = s.day
        and pd.location = s.location
        and pd.order_num = s.order_num
        and pd.sub_group = e.sub_group
        and pd.type = e.type
    );

  return v_pid;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_save_my_program(bigint, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_save_my_program(bigint, text, integer, jsonb) TO anon, authenticated, service_role;
