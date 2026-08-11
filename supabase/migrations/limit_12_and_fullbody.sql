-- 1. Лимит упражнений на день 10 → 12.
--    Хвост дня — мелочь (икры, приводящие/отводящие, пресс), её делают
--    суперсетами и тренировку она почти не удлиняет.
--    Второе место лимита — MAX_PER_DAY в ProgramConstructor.jsx, менять разом.
--    Тело функции не тронуто: изменена ОДНА строка проверки (v_order > 10 → 12).
--    Контроль: длина pg_get_functiondef до и после = 3006 символов.
--
-- 2. Запись встроенной программы «Фулбади» (prog_002).
--    Слоты дней у встроенных программ живут в коде (data/programs/fullbody.js),
--    но строка в programs нужна: на неё ссылаются workouts.program_id и
--    user_exercise_swaps.program_id.
--
-- Применено на проде 2026-08-11.

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
        from exercises e where e.id = v_ex;
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

INSERT INTO public.programs (id, name, category, days_count, tags, available, source, owner_id, author_id)
VALUES ('prog_002', 'Фулбади', 'gym', 2, ARRAY['зал']::text[], true, 'global', NULL, NULL)
ON CONFLICT (id) DO UPDATE
  SET name = excluded.name, category = excluded.category, days_count = excluded.days_count,
      tags = excluded.tags, available = true, source = 'global';
