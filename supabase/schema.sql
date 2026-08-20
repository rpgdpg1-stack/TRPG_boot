-- ═══════════════════════════════════════════════════════════════════════════
--  TRPG — ПОЛНАЯ СХЕМА БАЗЫ (слепок продакшена)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Этот файл — ЕДИНСТВЕННЫЙ источник правды по структуре базы. Из него
--  поднимается пустая база с нуля: локально, на новом проекте Supabase
--  или на своём сервере.
--
--  ЧТО ЗДЕСЬ ЕСТЬ: расширения, последовательности, таблицы, ключи, индексы,
--  функции, триггеры, RLS-политики и права. ЧЕГО НЕТ: данных — они в seed.sql
--  (справочник упражнений и встроенные программы) и в самой рабочей базе
--  (пользователи, тренировки).
--
--  КАК ПОДДЕРЖИВАТЬ. Файл перезаписывается целиком после каждой правки базы —
--  в гите всегда одна актуальная версия, а не десяток слоёв. История правок
--  живёт в истории git, а не в куче файлов рядом.
--
--  ВАЖНО. Пока в базе нет живых пользователей, этот файл — и слепок, и способ
--  разворачивания. Как только появятся реальные люди, накатывать его на
--  работающую базу будет НЕЛЬЗЯ (он пересоздаёт объекты) — тогда каждая правка
--  оформляется отдельным файлом-миграцией с меткой времени, а слепок остаётся
--  для разворачивания с нуля. Подробности — в скиле trpg-supabase.
--
--  Снят: 2026-08-19 · Postgres 17.6 · проект jybwxbqmnommazjfucbq
-- ═══════════════════════════════════════════════════════════════════════════


-- ── РАСШИРЕНИЯ ─────────────────────────────────────────────────────────────
-- pgcrypto нужен для md5/gen_random_uuid в дефолтах (реферальный код, токен
-- ссылки). Остальные ставит сам Supabase.
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;


-- ── ПОСЛЕДОВАТЕЛЬНОСТИ ─────────────────────────────────────────────────────
-- user_exercise_seq — сквозная нумерация СВОИХ упражнений (id вида ux_N).
-- Именно последовательность, а не «первый свободный номер»: переиспользованный
-- id прицепил бы к новому упражнению историю удалённого.
CREATE SEQUENCE IF NOT EXISTS public.daily_quests_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.exercise_sets_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.friendships_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.program_days_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.user_exercise_seq;
CREATE SEQUENCE IF NOT EXISTS public.user_exercise_swaps_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.user_exercise_weights_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.users_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.workouts_id_seq;


-- ── ТАБЛИЦЫ ────────────────────────────────────────────────────────────────

-- Пользователь. telegram_id — связь с Telegram, auth_id — с auth.users
-- (сессию выдаёт GoTrue). show_* — настройки приватности профиля.
CREATE TABLE IF NOT EXISTS public.users (
  id bigint DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
  -- Не NOT NULL: аккаунт может родиться в браузере и никогда не увидеть Telegram.
  telegram_id bigint,
  first_name text,
  username text,
  photo_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  weekly_streak integer DEFAULT 0 NOT NULL,
  weekly_streak_week text,
  referral_code text DEFAULT ('ref_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 8)) NOT NULL,
  auth_id uuid,
  last_progress_reset_at timestamp with time zone,
  progress_reset_count integer DEFAULT 0 NOT NULL,
  show_last_workout boolean DEFAULT true NOT NULL,
  show_stats boolean DEFAULT false NOT NULL,
  show_favorites boolean DEFAULT false NOT NULL,
  show_weights boolean DEFAULT true NOT NULL,
  training_since timestamp with time zone,
  -- Второй способ входа. Хранится только нормализованным (нижний регистр,
  -- без пробелов) — этим занимается normalize_email.
  email text,
  email_verified_at timestamp with time zone
);

-- Каталог упражнений. owner_id IS NULL — упражнение приложения, owner_id
-- заполнен — личное упражнение пользователя (id вида ux_N). Одна таблица на
-- оба вида специально: на exercises.id завязаны ключи почти всех механик.
CREATE TABLE IF NOT EXISTS public.exercises (
  id text NOT NULL,
  name text NOT NULL,
  muscle_group text NOT NULL,
  sub_group text NOT NULL,
  type text NOT NULL,
  equipment text,
  meta_info text,
  description text,
  priority integer DEFAULT 1 NOT NULL,
  preview_url text,
  video_url text,
  muscle_icon text,
  counts_reps boolean DEFAULT false NOT NULL,
  owner_id bigint
);

-- Программа тренировок. source: global — от приложения, custom — своя,
-- shared — сохранённая у друга. share_token помнит, из какой ссылки пришла.
CREATE TABLE IF NOT EXISTS public.programs (
  id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  days_count integer DEFAULT 1 NOT NULL,
  tags text[] DEFAULT '{}'::text[],
  available boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_id bigint,
  source text DEFAULT 'global'::text NOT NULL,
  author_id bigint,
  share_token text
);

-- Слоты дней программы. location — Зал/Дом/Улица, у каждого свой набор.
CREATE TABLE IF NOT EXISTS public.program_days (
  id bigint DEFAULT nextval('program_days_id_seq'::regclass) NOT NULL,
  program_id text NOT NULL,
  day text NOT NULL,
  order_num integer NOT NULL,
  muscle_group text NOT NULL,
  sub_group text NOT NULL,
  type text NOT NULL,
  exercise_id text,
  location text DEFAULT 'gym'::text NOT NULL
);

-- Завершённая тренировка. started_at — реальный старт сессии (нужен для
-- длительности), distance_m — метраж заплыва.
CREATE TABLE IF NOT EXISTS public.workouts (
  id bigint DEFAULT nextval('workouts_id_seq'::regclass) NOT NULL,
  user_id bigint NOT NULL,
  program_id text,
  day text,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone,
  distance_m integer
);

-- Отработанные упражнения тренировки (по одной строке на упражнение).
CREATE TABLE IF NOT EXISTS public.exercise_sets (
  id bigint DEFAULT nextval('exercise_sets_id_seq'::regclass) NOT NULL,
  workout_id bigint NOT NULL,
  exercise_id text NOT NULL,
  slot_order integer,
  set_number integer NOT NULL,
  weight_kg numeric(6,2),
  reps integer,
  duration_sec integer,
  completed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Текущий рабочий вес и его история по дням (историю пишет триггер).
CREATE TABLE IF NOT EXISTS public.user_exercise_weights (
  id bigint DEFAULT nextval('user_exercise_weights_id_seq'::regclass) NOT NULL,
  user_id bigint NOT NULL,
  exercise_id text NOT NULL,
  weight_kg numeric(6,2) NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_exercise_weight_history (
  user_id bigint NOT NULL,
  exercise_id text NOT NULL,
  day date NOT NULL,
  weight_kg numeric NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Замена упражнения в конкретном слоте программы у конкретного человека.
CREATE TABLE IF NOT EXISTS public.user_exercise_swaps (
  id bigint DEFAULT nextval('user_exercise_swaps_id_seq'::regclass) NOT NULL,
  user_id bigint NOT NULL,
  program_id text NOT NULL,
  day text NOT NULL,
  order_num integer NOT NULL,
  exercise_id text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  location text DEFAULT 'gym'::text NOT NULL
);

-- Заметка к упражнению и топ-5 любимых (slot 1..5).
CREATE TABLE IF NOT EXISTS public.user_exercise_notes (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  exercise_id text NOT NULL,
  note text NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_favorite_exercises (
  user_id bigint NOT NULL,
  slot smallint NOT NULL,
  exercise_id text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Отметки дневных активностей.
CREATE TABLE IF NOT EXISTS public.daily_quests (
  id bigint DEFAULT nextval('daily_quests_id_seq'::regclass) NOT NULL,
  user_id bigint NOT NULL,
  day_key text NOT NULL,
  quest_id text NOT NULL,
  completed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Друзья. Пара всегда хранится упорядоченной (user_a_id < user_b_id) —
-- так дружба не задваивается зеркальной записью.
CREATE TABLE IF NOT EXISTS public.friendships (
  id bigint DEFAULT nextval('friendships_id_seq'::regclass) NOT NULL,
  user_a_id bigint NOT NULL,
  user_b_id bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.friend_pins (
  id bigint NOT NULL,
  owner_id bigint NOT NULL,
  friend_id bigint NOT NULL,
  pinned_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Снимок программы для ссылки «поделиться». custom_exercises — личные
-- упражнения автора на момент шеринга, чтобы получатель мог скопировать себе
-- именно ту версию, которой поделились.
CREATE TABLE IF NOT EXISTS public.shared_programs (
  token text DEFAULT substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10) NOT NULL,
  author_id bigint NOT NULL,
  source_program_id text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  custom_exercises jsonb
);

-- Служебная таблица-пульс (одна строка). Приложением не используется.
CREATE TABLE IF NOT EXISTS public.heartbeat (
  id integer DEFAULT 1 NOT NULL,
  last_ping timestamp with time zone DEFAULT now() NOT NULL
);

-- Одноразовые коды подтверждения почты.
-- Хранится НЕ код, а его отпечаток: утёкшая таблица не отдаёт действующие коды.
-- Отпечаток считает Edge Function с секретной солью (иначе шесть цифр
-- перебираются по словарю за секунды).
CREATE TABLE IF NOT EXISTS public.email_codes (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  -- 'login' — вход в браузере, 'link' — привязка почты изнутри Telegram.
  -- Разделены намеренно: код для привязки не должен работать как ключ входа.
  purpose text NOT NULL CHECK (purpose IN ('login', 'link')),
  user_id bigint REFERENCES public.users(id) ON DELETE CASCADE,
  attempts smallint NOT NULL DEFAULT 0,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.friend_pins ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.user_exercise_notes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;


-- ── КЛЮЧИ И ОГРАНИЧЕНИЯ ────────────────────────────────────────────────────
ALTER TABLE public.daily_quests ADD CONSTRAINT daily_quests_pkey PRIMARY KEY (id);
ALTER TABLE public.exercise_sets ADD CONSTRAINT exercise_sets_pkey PRIMARY KEY (id);
ALTER TABLE public.exercises ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);
ALTER TABLE public.friend_pins ADD CONSTRAINT friend_pins_pkey PRIMARY KEY (id);
ALTER TABLE public.friendships ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);
ALTER TABLE public.heartbeat ADD CONSTRAINT heartbeat_pkey PRIMARY KEY (id);
ALTER TABLE public.program_days ADD CONSTRAINT program_days_pkey PRIMARY KEY (id);
ALTER TABLE public.programs ADD CONSTRAINT programs_pkey PRIMARY KEY (id);
ALTER TABLE public.shared_programs ADD CONSTRAINT shared_programs_pkey PRIMARY KEY (token);
ALTER TABLE public.user_exercise_notes ADD CONSTRAINT user_exercise_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.user_exercise_swaps ADD CONSTRAINT user_exercise_swaps_pkey PRIMARY KEY (id);
ALTER TABLE public.user_exercise_weight_history ADD CONSTRAINT user_exercise_weight_history_pkey PRIMARY KEY (user_id, exercise_id, day);
ALTER TABLE public.user_exercise_weights ADD CONSTRAINT user_exercise_weights_pkey PRIMARY KEY (id);
ALTER TABLE public.user_favorite_exercises ADD CONSTRAINT user_favorite_exercises_pkey PRIMARY KEY (user_id, slot);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.workouts ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);

ALTER TABLE public.daily_quests ADD CONSTRAINT daily_quests_user_id_day_key_quest_id_key UNIQUE (user_id, day_key, quest_id);
ALTER TABLE public.friend_pins ADD CONSTRAINT friend_pins_owner_id_friend_id_key UNIQUE (owner_id, friend_id);
ALTER TABLE public.friendships ADD CONSTRAINT unique_pair UNIQUE (user_a_id, user_b_id);
ALTER TABLE public.program_days ADD CONSTRAINT program_days_program_location_day_order_key UNIQUE (program_id, location, day, order_num);
ALTER TABLE public.user_exercise_notes ADD CONSTRAINT user_exercise_notes_user_id_exercise_id_key UNIQUE (user_id, exercise_id);
ALTER TABLE public.user_exercise_swaps ADD CONSTRAINT user_exercise_swaps_user_prog_day_loc_order_key UNIQUE (user_id, program_id, day, location, order_num);
ALTER TABLE public.user_exercise_weights ADD CONSTRAINT user_exercise_weights_user_id_exercise_id_key UNIQUE (user_id, exercise_id);
ALTER TABLE public.user_favorite_exercises ADD CONSTRAINT user_favorite_exercises_user_exercise_uniq UNIQUE (user_id, exercise_id);
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);
ALTER TABLE public.users ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);
ALTER TABLE public.users ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);

ALTER TABLE public.friendships ADD CONSTRAINT user_order CHECK ((user_a_id < user_b_id));
ALTER TABLE public.heartbeat ADD CONSTRAINT single_row CHECK ((id = 1));
ALTER TABLE public.program_days ADD CONSTRAINT program_days_location_chk CHECK ((location = ANY (ARRAY['gym'::text, 'home'::text, 'outdoor'::text])));
ALTER TABLE public.programs ADD CONSTRAINT programs_source_check CHECK ((source = ANY (ARRAY['global'::text, 'custom'::text, 'shared'::text])));
ALTER TABLE public.user_exercise_swaps ADD CONSTRAINT user_exercise_swaps_location_check CHECK ((location = ANY (ARRAY['gym'::text, 'home'::text, 'outdoor'::text])));
ALTER TABLE public.user_favorite_exercises ADD CONSTRAINT user_favorite_exercises_slot_check CHECK (((slot >= 1) AND (slot <= 5)));

-- Внешние ключи. exercise_sets → exercises стоит RESTRICT осознанно: удаление
-- упражнения не должно молча стирать отработанные подходы. Свои упражнения
-- удаляются через api_delete_my_exercise, которая чистит зависимости сама.
ALTER TABLE public.daily_quests ADD CONSTRAINT daily_quests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.exercise_sets ADD CONSTRAINT exercise_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT;
ALTER TABLE public.exercise_sets ADD CONSTRAINT exercise_sets_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.friend_pins ADD CONSTRAINT friend_pins_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.friend_pins ADD CONSTRAINT friend_pins_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.friendships ADD CONSTRAINT friendships_user_a_id_fkey FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.friendships ADD CONSTRAINT friendships_user_b_id_fkey FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.program_days ADD CONSTRAINT program_days_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id);
ALTER TABLE public.program_days ADD CONSTRAINT program_days_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE public.programs ADD CONSTRAINT programs_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE public.programs ADD CONSTRAINT programs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
ALTER TABLE public.shared_programs ADD CONSTRAINT shared_programs_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_exercise_notes ADD CONSTRAINT user_exercise_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_exercise_swaps ADD CONSTRAINT user_exercise_swaps_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE;
ALTER TABLE public.user_exercise_swaps ADD CONSTRAINT user_exercise_swaps_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE public.user_exercise_swaps ADD CONSTRAINT user_exercise_swaps_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_exercise_weight_history ADD CONSTRAINT user_exercise_weight_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_exercise_weights ADD CONSTRAINT user_exercise_weights_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE;
ALTER TABLE public.user_exercise_weights ADD CONSTRAINT user_exercise_weights_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_favorite_exercises ADD CONSTRAINT user_favorite_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id);
ALTER TABLE public.user_favorite_exercises ADD CONSTRAINT user_favorite_exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.workouts ADD CONSTRAINT workouts_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL;
ALTER TABLE public.workouts ADD CONSTRAINT workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


-- Железное правило: у записи обязан остаться хотя бы один способ войти.
-- Держим его в базе, а не в коде, — тогда ошибка в отвязке не сможет запереть
-- человека снаружи собственного аккаунта.
ALTER TABLE public.users ADD CONSTRAINT users_has_login_method
  CHECK (telegram_id IS NOT NULL OR email IS NOT NULL);


-- ── ИНДЕКСЫ ────────────────────────────────────────────────────────────────
-- Дубли неуникальных индексов рядом с UNIQUE тут не заводить: уникальный
-- обслуживает те же запросы, а лишний обновляется на каждой записи.
CREATE INDEX IF NOT EXISTS idx_daily_quests_user_day ON public.daily_quests USING btree (user_id, day_key);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON public.exercise_sets USING btree (exercise_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sets_workout ON public.exercise_sets USING btree (workout_id, slot_order, set_number);
CREATE INDEX IF NOT EXISTS idx_exercises_filter ON public.exercises USING btree (muscle_group, sub_group, type, priority);
CREATE INDEX IF NOT EXISTS idx_exercises_owner_id ON public.exercises USING btree (owner_id) WHERE (owner_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_friend_pins_friend_id ON public.friend_pins USING btree (friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_pins_owner ON public.friend_pins USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_friendships_a ON public.friendships USING btree (user_a_id);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON public.friendships USING btree (user_b_id);
CREATE INDEX IF NOT EXISTS idx_program_days_exercise_id ON public.program_days USING btree (exercise_id);
CREATE INDEX IF NOT EXISTS idx_program_days_lookup ON public.program_days USING btree (program_id, day, order_num);
CREATE INDEX IF NOT EXISTS idx_programs_author_id ON public.programs USING btree (author_id);
CREATE INDEX IF NOT EXISTS idx_programs_category ON public.programs USING btree (category, available);
CREATE UNIQUE INDEX IF NOT EXISTS programs_owner_source_unique ON public.programs USING btree (owner_id, source) WHERE (owner_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS shared_programs_author_idx ON public.shared_programs USING btree (author_id);
CREATE INDEX IF NOT EXISTS idx_ues_user_prog ON public.user_exercise_swaps USING btree (user_id, program_id, day);
CREATE INDEX IF NOT EXISTS idx_user_exercise_swaps_exercise_id ON public.user_exercise_swaps USING btree (exercise_id);
CREATE INDEX IF NOT EXISTS idx_user_exercise_swaps_program_id ON public.user_exercise_swaps USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_uew_user ON public.user_exercise_weights USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_exercise_weights_exercise_id ON public.user_exercise_weights USING btree (exercise_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_exercises_exercise_id ON public.user_favorite_exercises USING btree (exercise_id);
CREATE INDEX IF NOT EXISTS idx_workouts_program_id ON public.workouts USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_workouts_user ON public.workouts USING btree (user_id, finished_at DESC);


-- Уникальность почты по lower(): страховка на случай записи мимо normalize_email.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON public.users (lower(email)) WHERE email IS NOT NULL;
-- По нему идут обе горячие операции с кодами: проверка и счёт частоты запросов.
CREATE INDEX IF NOT EXISTS email_codes_email_created_idx
  ON public.email_codes (email, created_at DESC);


-- ── ФУНКЦИИ ────────────────────────────────────────────────────────────────
-- Все api_* — SECURITY DEFINER с явным search_path. У приложения нет своей
-- роли в базе: оно ходит anon-ключом, а личность определяет current_user_id()
-- через auth.uid(). Поэтому любая функция, работающая с данными человека,
-- ОБЯЗАНА начинаться с проверки current_user_id() на NULL.

CREATE OR REPLACE FUNCTION public.current_user_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.users where auth_id = auth.uid()
$function$;

-- Триггерная: пишет точку истории веса (одна на день, по Москве).
CREATE OR REPLACE FUNCTION public.record_weight_point()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.weight_kg IS NULL OR NEW.weight_kg <= 0 THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.user_exercise_weight_history (user_id, exercise_id, day, weight_kg, updated_at)
  VALUES (
    NEW.user_id,
    NEW.exercise_id,
    ((now() AT TIME ZONE 'Europe/Moscow'))::date,
    NEW.weight_kg,
    now()
  )
  ON CONFLICT (user_id, exercise_id, day)
  DO UPDATE SET weight_kg = EXCLUDED.weight_kg, updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_add_favorite_exercise(p_exercise_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid    bigint := public.current_user_id();
  v_cnt  integer;
  v_slot smallint;
  v_limit constant integer := 5;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM public.user_favorite_exercises f
             WHERE f.user_id = uid AND f.exercise_id = p_exercise_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.user_favorite_exercises f WHERE f.user_id = uid;
  IF v_cnt >= v_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'limit');
  END IF;

  SELECT MIN(s)::smallint INTO v_slot
  FROM generate_series(1, v_limit) s
  WHERE s NOT IN (SELECT f.slot FROM public.user_favorite_exercises f WHERE f.user_id = uid);

  INSERT INTO public.user_favorite_exercises (user_id, slot, exercise_id, updated_at)
  VALUES (uid, v_slot, p_exercise_id, now());

  RETURN jsonb_build_object('success', true, 'slot', v_slot);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_add_friend_by_ref(p_user_id bigint, p_referral_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_friend_id BIGINT;
  v_user_a BIGINT;
  v_user_b BIGINT;
BEGIN
  SELECT id INTO v_friend_id FROM users WHERE referral_code = p_referral_code;

  IF v_friend_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_friend_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self');
  END IF;

  IF p_user_id < v_friend_id THEN
    v_user_a := p_user_id; v_user_b := v_friend_id;
  ELSE
    v_user_a := v_friend_id; v_user_b := p_user_id;
  END IF;

  IF (SELECT COUNT(*) FROM friendships WHERE user_a_id = p_user_id OR user_b_id = p_user_id) >= 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'limit');
  END IF;

  INSERT INTO friendships (user_a_id, user_b_id)
  VALUES (v_user_a, v_user_b)
  ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'friend_id', v_friend_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_adopt_program_exercises(p_user_id bigint, p_program_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

    insert into exercises (id, name, muscle_group, sub_group, type, meta_info,
                           preview_url, video_url, counts_reps, priority, owner_id)
    select v_new,
           coalesce(v_src->>'name', e.name),
           coalesce(v_src->>'muscle_group', e.muscle_group),
           coalesce(v_src->>'sub_group', e.sub_group),
           coalesce(v_src->>'type', e.type),
           coalesce(v_src->>'meta_info', e.meta_info),
           null, null,
           coalesce((v_src->>'counts_reps')::boolean, e.counts_reps, false),
           9999, p_user_id
    from exercises e where e.id = v_old;

    update program_days set exercise_id = v_new
    where program_id = p_program_id and exercise_id = v_old;

    v_copied := v_copied + 1;
  end loop;

  return jsonb_build_object('ok', true, 'need', v_need, 'free', v_free - v_copied, 'copied', v_copied);
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_create_my_exercise(p_user_id bigint, p_name text, p_group text, p_sub_group text, p_meta text, p_counts_reps boolean)
 RETURNS text
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

  select count(*) into v_count from exercises where owner_id = p_user_id;
  if v_count >= 12 then raise exception 'limit reached: 12 custom exercises'; end if;

  v_id := 'ux_' || nextval('user_exercise_seq')::text;

  insert into exercises (id, name, muscle_group, sub_group, type, meta_info,
                         preview_url, video_url, counts_reps, priority, owner_id)
  values (v_id, v_name,
          left(btrim(coalesce(p_group, '')), 30), left(btrim(coalesce(p_sub_group, '')), 30),
          'accessory', nullif(left(btrim(coalesce(p_meta, '')), 30), ''),
          null, null, coalesce(p_counts_reps, false), 9999, p_user_id);

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_delete_my_exercise(p_user_id bigint, p_exercise_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_removed int := 0;
begin
  if not exists (select 1 from exercises where id = p_exercise_id and owner_id = p_user_id) then
    return -1;
  end if;

  delete from exercise_sets              where exercise_id = p_exercise_id;
  delete from user_exercise_notes        where exercise_id = p_exercise_id;
  delete from user_exercise_weight_history where exercise_id = p_exercise_id;
  delete from user_favorite_exercises    where exercise_id = p_exercise_id;
  delete from user_exercise_swaps        where exercise_id = p_exercise_id;
  delete from user_exercise_weights      where exercise_id = p_exercise_id;

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

CREATE OR REPLACE FUNCTION public.api_delete_my_program(p_user_id bigint, p_program_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from programs where id = p_program_id and owner_id = p_user_id) then
    return false;
  end if;
  update workouts set program_id = null where program_id = p_program_id;
  delete from user_exercise_swaps where program_id = p_program_id;
  delete from shared_programs where author_id = p_user_id and source_program_id = p_program_id;
  delete from program_days where program_id = p_program_id;
  delete from programs where id = p_program_id and owner_id = p_user_id;
  return true;
end;
$function$;

-- Завершение тренировки. Лимит «одна засчитанная в сутки (Москва)» — здесь,
-- а не на клиенте: оффлайн-очередь может прислать повтор.
CREATE OR REPLACE FUNCTION public.api_finish_workout(p_user_id bigint, p_program_id text, p_day text, p_exercise_ids text[], p_finished_at timestamp with time zone DEFAULT now(), p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_distance_m integer DEFAULT NULL::integer)
 RETURNS TABLE(workout_id bigint, new_weekly_streak integer, already_completed_today boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workout_id bigint;
  v_today_start timestamptz;
  v_existing_workout_id bigint;
  v_new_weekly_streak integer;
  v_current_week_key text;
  v_last_week_key text;
  v_exercise_id text;
  v_set_order integer := 1;
BEGIN
  p_user_id := current_user_id();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_current_week_key := to_char(p_finished_at AT TIME ZONE 'Europe/Moscow', 'IYYY-IW');
  v_today_start := date_trunc('day', p_finished_at AT TIME ZONE 'Europe/Moscow');

  -- Лимит «одна тренировка в день»: вторая за сутки не создаёт запись и
  -- не двигает серию.
  SELECT id INTO v_existing_workout_id
  FROM workouts
  WHERE user_id = p_user_id AND finished_at IS NOT NULL
    AND finished_at >= v_today_start
    AND finished_at < v_today_start + interval '1 day'
  LIMIT 1;

  IF v_existing_workout_id IS NOT NULL THEN
    SELECT weekly_streak INTO v_new_weekly_streak FROM users WHERE id = p_user_id;
    RETURN QUERY SELECT v_existing_workout_id, v_new_weekly_streak, true;
    RETURN;
  END IF;

  INSERT INTO workouts (user_id, program_id, day, started_at, finished_at, distance_m)
  VALUES (p_user_id, p_program_id, p_day, COALESCE(p_started_at, p_finished_at), p_finished_at, p_distance_m)
  RETURNING id INTO v_workout_id;

  FOREACH v_exercise_id IN ARRAY p_exercise_ids LOOP
    INSERT INTO exercise_sets (workout_id, exercise_id, slot_order, set_number, completed_at)
    VALUES (v_workout_id, v_exercise_id, v_set_order, 1, p_finished_at);
    v_set_order := v_set_order + 1;
  END LOOP;

  -- Серия считается в пределах недели по Москве и начинается заново
  -- с понедельника.
  SELECT weekly_streak_week INTO v_last_week_key FROM users WHERE id = p_user_id;

  IF v_last_week_key = v_current_week_key THEN
    UPDATE users SET weekly_streak = weekly_streak + 1, updated_at = NOW()
    WHERE id = p_user_id RETURNING weekly_streak INTO v_new_weekly_streak;
  ELSE
    UPDATE users SET weekly_streak = 1, weekly_streak_week = v_current_week_key, updated_at = NOW()
    WHERE id = p_user_id RETURNING weekly_streak INTO v_new_weekly_streak;
  END IF;

  RETURN QUERY SELECT v_workout_id, v_new_weekly_streak, false;
END;
$function$;

-- Общий каталог. Фильтр owner_id IS NULL обязателен: функция SECURITY DEFINER,
-- она обходит RLS, и без него раздавала бы всем чужие личные упражнения.
CREATE OR REPLACE FUNCTION public.api_get_all_exercises()
 RETURNS TABLE(id text, name text, sub_group text, type text, meta_info text, preview_url text, video_url text, priority integer, counts_reps boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, sub_group, type, meta_info, preview_url, video_url, priority, counts_reps
  FROM public.exercises
  WHERE owner_id IS NULL
  ORDER BY priority ASC;
$function$;

-- Названия по точному списку id (≤50). Нужна для программы друга, пока её
-- личные упражнения ещё не скопированы себе. Каталог через неё не перебрать.
CREATE OR REPLACE FUNCTION public.api_get_exercises_by_ids(p_ids text[])
 RETURNS TABLE(id text, name text, muscle_group text, sub_group text, type text, meta_info text, preview_url text, video_url text, counts_reps boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.muscle_group, e.sub_group, e.type,
         e.meta_info, e.preview_url, e.video_url, coalesce(e.counts_reps, false)
  FROM exercises e
  WHERE e.id = ANY(coalesce(p_ids, '{}'::text[]))
  LIMIT 50;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_favorite_exercises()
 RETURNS TABLE(slot smallint, exercise_id text, name text, muscle_group text, sub_group text, meta_info text, preview_url text, video_url text, weight_kg numeric, counts_reps boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid bigint := public.current_user_id();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT f.slot, f.exercise_id, e.name, e.muscle_group, e.sub_group,
         e.meta_info, e.preview_url, e.video_url, w.weight_kg, e.counts_reps
  FROM public.user_favorite_exercises f
  JOIN public.exercises e ON e.id = f.exercise_id
  LEFT JOIN public.user_exercise_weights w ON w.user_id = f.user_id AND w.exercise_id = f.exercise_id
  WHERE f.user_id = uid
  ORDER BY f.slot;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_my_exercises(p_user_id bigint)
 RETURNS TABLE(id text, name text, muscle_group text, sub_group text, type text, meta_info text, preview_url text, video_url text, counts_reps boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.muscle_group, e.sub_group, e.type,
         e.meta_info, e.preview_url, e.video_url, coalesce(e.counts_reps, false)
  FROM exercises e
  WHERE e.owner_id = p_user_id
  ORDER BY e.id;
$function$;

-- pending_custom — сколько чужих личных упражнений в программе ещё не
-- скопировано себе. > 0 означает «программа заблокирована».
CREATE OR REPLACE FUNCTION public.api_get_my_programs(p_user_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(prog order by (prog->>'source')), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'source', p.source,
      'editable', (p.source = 'custom'),
      'author_id', p.author_id, 'author_name', au.first_name,
      'days_count', p.days_count,
      'pending_custom', (
        select count(distinct pd.exercise_id)
        from program_days pd
        join exercises e on e.id = pd.exercise_id
        where pd.program_id = p.id
          and e.owner_id is not null and e.owner_id <> p_user_id
      ),
      -- days: набор «Зал» — для совместимости (экран дня грузит его как раньше)
      'days', coalesce((
        select jsonb_object_agg(t.day, t.slots) from (
          select pd.day, jsonb_agg(jsonb_build_object(
            'order_num', pd.order_num, 'muscle_group', pd.muscle_group, 'sub_group', pd.sub_group,
            'type', pd.type, 'default_exercise_id', pd.exercise_id) order by pd.order_num) as slots
          from program_days pd where pd.program_id = p.id and pd.location = 'gym' group by pd.day
        ) t
      ), '{}'::jsonb),
      -- locations: полная карта по местам { gym:{A:[...]}, home:{...}, outdoor:{...} }
      'locations', coalesce((
        select jsonb_object_agg(z.loc, z.days_obj) from (
          select pd.location as loc, jsonb_object_agg(pd.day, pd.slots) as days_obj
          from (
            select location, day, jsonb_agg(jsonb_build_object(
              'order_num', order_num, 'muscle_group', muscle_group, 'sub_group', sub_group,
              'type', type, 'default_exercise_id', exercise_id) order by order_num) as slots
            from program_days where program_id = p.id group by location, day
          ) pd
          group by pd.location
        ) z
      ), '{}'::jsonb)
    ) as prog
    from programs p
    left join users au on au.id = p.author_id
    where p.owner_id = p_user_id
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.api_reset_my_progress()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid bigint := public.current_user_id();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.users
    set weekly_streak          = 0,
        weekly_streak_week      = null,
        last_progress_reset_at  = now(),
        progress_reset_count    = coalesce(progress_reset_count, 0) + 1,
        updated_at              = now()
    where id = uid;

  delete from public.workouts     where user_id = uid;  -- exercise_sets уйдут каскадом
  delete from public.daily_quests where user_id = uid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_set_training_state(p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  UPDATE public.users
     SET training_since = CASE WHEN p_active THEN now() ELSE NULL END
   WHERE id = uid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_daily_quest(p_user_id bigint, p_day_key text, p_quest_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_count integer;
BEGIN
  p_user_id := current_user_id();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO daily_quests (user_id, day_key, quest_id)
  VALUES (p_user_id, p_day_key, p_quest_id)
  ON CONFLICT (user_id, day_key, quest_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_shared_program(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'token', sp.token, 'name', sp.name,
    'author_id', sp.author_id, 'author_name', u.first_name,
    'days', sp.payload,
    'days_count', (select count(*) from jsonb_object_keys(sp.payload))
  )
  from shared_programs sp join users u on u.id = sp.author_id
  where sp.token = p_token;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_user_note(p_user_id bigint, p_exercise_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_note TEXT;
BEGIN
  p_user_id := current_user_id();
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT note INTO v_note
  FROM public.user_exercise_notes
  WHERE user_id = p_user_id AND exercise_id = p_exercise_id;
  RETURN v_note;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_user_swaps(p_user_id bigint, p_program_id text, p_day text, p_location text DEFAULT 'gym'::text)
 RETURNS TABLE(order_num integer, exercise_id text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT order_num, exercise_id
  FROM public.user_exercise_swaps
  WHERE user_id = current_user_id()
    AND program_id = p_program_id
    AND day = p_day
    AND location = p_location;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_user_weights(p_user_id bigint)
 RETURNS TABLE(exercise_id text, weight_kg numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT exercise_id, weight_kg
  FROM public.user_exercise_weights
  WHERE user_id = current_user_id();
$function$;

CREATE OR REPLACE FUNCTION public.api_get_weight_history(p_user_id bigint, p_exercise_id text)
 RETURNS TABLE(day date, weight_kg numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT day, weight_kg
  FROM public.user_exercise_weight_history
  WHERE user_id = p_user_id
    AND user_id = current_user_id()
    AND exercise_id = p_exercise_id
  ORDER BY day ASC;
$function$;

CREATE OR REPLACE FUNCTION public.api_remove_favorite_exercise(p_exercise_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid bigint := public.current_user_id();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.user_favorite_exercises WHERE user_id = uid AND exercise_id = p_exercise_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_remove_friend(p_user_id bigint, p_friend_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_friend boolean;
BEGIN
  IF p_user_id IS NULL OR p_friend_id IS NULL OR p_user_id = p_friend_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_args');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (user_a_id = p_user_id AND user_b_id = p_friend_id)
       OR (user_b_id = p_user_id AND user_a_id = p_friend_id)
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_friend');
  END IF;

  -- Удаляем дружбу (симметричная строка, любое направление).
  DELETE FROM public.friendships
  WHERE (user_a_id = p_user_id AND user_b_id = p_friend_id)
     OR (user_b_id = p_user_id AND user_a_id = p_friend_id);

  -- Пара больше не друзья → чистим закрепы в обе стороны.
  DELETE FROM public.friend_pins
  WHERE (owner_id = p_user_id AND friend_id = p_friend_id)
     OR (owner_id = p_friend_id AND friend_id = p_user_id);

  RETURN jsonb_build_object('success', true, 'removed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_save_user_note(p_user_id bigint, p_exercise_id text, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  p_user_id := current_user_id();
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_note IS NULL OR btrim(p_note) = '' THEN
    DELETE FROM public.user_exercise_notes
    WHERE user_id = p_user_id AND exercise_id = p_exercise_id;
    RETURN TRUE;
  END IF;

  INSERT INTO public.user_exercise_notes (user_id, exercise_id, note, updated_at)
  VALUES (p_user_id, p_exercise_id, btrim(p_note), NOW())
  ON CONFLICT (user_id, exercise_id)
  DO UPDATE SET note = btrim(EXCLUDED.note), updated_at = NOW();
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_save_user_swap(p_user_id bigint, p_program_id text, p_day text, p_order_num integer, p_exercise_id text, p_location text DEFAULT 'gym'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  p_user_id := current_user_id();
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.user_exercise_swaps (user_id, program_id, day, location, order_num, exercise_id, updated_at)
  VALUES (p_user_id, p_program_id, p_day, p_location, p_order_num, p_exercise_id, NOW())
  ON CONFLICT (user_id, program_id, day, location, order_num)
  DO UPDATE SET exercise_id = EXCLUDED.exercise_id, updated_at = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_save_user_weight(p_user_id bigint, p_exercise_id text, p_weight_kg numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  p_user_id := current_user_id();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.user_exercise_weights (user_id, exercise_id, weight_kg, updated_at)
  VALUES (p_user_id, p_exercise_id, p_weight_kg, NOW())
  ON CONFLICT (user_id, exercise_id)
  DO UPDATE SET weight_kg = EXCLUDED.weight_kg, updated_at = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_toggle_pin_friend(p_user_id bigint, p_friend_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exists      boolean;
  v_is_friend   boolean;
  v_pin_count   int;
BEGIN
  IF p_user_id IS NULL OR p_friend_id IS NULL OR p_user_id = p_friend_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_args');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (user_a_id = p_user_id AND user_b_id = p_friend_id)
       OR (user_b_id = p_user_id AND user_a_id = p_friend_id)
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_friend');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.friend_pins
    WHERE owner_id = p_user_id AND friend_id = p_friend_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.friend_pins
    WHERE owner_id = p_user_id AND friend_id = p_friend_id;
    RETURN jsonb_build_object('success', true, 'pinned', false);
  END IF;

  SELECT COUNT(*)::int INTO v_pin_count
  FROM public.friend_pins
  WHERE owner_id = p_user_id;

  IF v_pin_count >= 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'limit', 'limit', 6);
  END IF;

  INSERT INTO public.friend_pins (owner_id, friend_id)
  VALUES (p_user_id, p_friend_id);

  RETURN jsonb_build_object('success', true, 'pinned', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_update_my_exercise(p_user_id bigint, p_exercise_id text, p_name text, p_group text, p_sub_group text, p_meta text, p_counts_reps boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
      meta_info = nullif(left(btrim(coalesce(p_meta, '')), 30), ''),
      counts_reps = coalesce(p_counts_reps, false)
  where id = p_exercise_id and owner_id = p_user_id;

  if not found then return false; end if;

  update program_days pd set muscle_group = v_group, sub_group = v_sub
  where pd.exercise_id = p_exercise_id;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_update_privacy(p_show_last_workout boolean, p_show_stats boolean, p_show_favorites boolean, p_show_weights boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.users
     SET show_last_workout = COALESCE(p_show_last_workout, show_last_workout),
         show_stats        = COALESCE(p_show_stats, show_stats),
         show_favorites    = COALESCE(p_show_favorites, show_favorites),
         show_weights      = COALESCE(p_show_weights, show_weights),
         updated_at = now()
   WHERE id = uid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_friends_list(p_user_id bigint)
 RETURNS TABLE(user_id bigint, first_name text, username text, photo_url text, last_workout_at timestamp with time zone, pinned_at timestamp with time zone, is_training boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH friends AS (
    SELECT user_b_id AS friend_id FROM public.friendships WHERE user_a_id = p_user_id
    UNION
    SELECT user_a_id AS friend_id FROM public.friendships WHERE user_b_id = p_user_id
  ),
  last_wo AS (
    SELECT w.user_id, MAX(w.finished_at) AS last_at
    FROM public.workouts w
    WHERE w.finished_at IS NOT NULL
    GROUP BY w.user_id
  )
  SELECT
    u.id, u.first_name, u.username, u.photo_url,
    lw.last_at, fp.pinned_at,
    (u.training_since IS NOT NULL AND u.training_since > now() - interval '3 hours')
  FROM friends f
  INNER JOIN public.users u ON u.id = f.friend_id
  LEFT JOIN last_wo lw ON lw.user_id = u.id
  LEFT JOIN public.friend_pins fp ON fp.owner_id = p_user_id AND fp.friend_id = u.id
  ORDER BY fp.pinned_at DESC NULLS LAST, lw.last_at DESC NULLS LAST, u.id ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_personal_records()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
  v_strength jsonb := NULL;
  v_swim jsonb := NULL;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('strength', NULL, 'swim', NULL); END IF;

  SELECT jsonb_build_object(
           'exercise_id', w.exercise_id,
           'name', e.name,
           'preview_url', e.preview_url,
           'weight_kg', w.weight_kg
         )
    INTO v_strength
  FROM public.user_exercise_weights w
  JOIN public.exercises e ON e.id = w.exercise_id
  WHERE w.user_id = uid
    AND COALESCE(e.counts_reps, false) = false
    AND COALESCE(w.weight_kg, 0) > 0
  ORDER BY w.weight_kg DESC
  LIMIT 1;

  SELECT jsonb_build_object('distance_m', k.distance_m, 'finished_at', k.finished_at)
    INTO v_swim
  FROM public.workouts k
  WHERE k.user_id = uid
    AND k.finished_at IS NOT NULL
    AND COALESCE(k.distance_m, 0) > 0
  ORDER BY k.distance_m DESC
  LIMIT 1;

  RETURN jsonb_build_object('strength', v_strength, 'swim', v_swim);
END;
$function$;

-- Профиль для чужих глаз. Каждый блок отдаётся ТОЛЬКО если владелец разрешил
-- его в приватности (show_*) — фильтрация здесь, а не на клиенте.
CREATE OR REPLACE FUNCTION public.api_get_user_public_profile(p_user_id bigint, p_viewer_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last record; v_streak integer; v_week text; v_total integer; v_minutes integer;
  v_show_last boolean; v_show_stats boolean; v_show_fav boolean; v_show_weights boolean;
  v_favorites jsonb := NULL;
  v_month jsonb := NULL; v_year jsonb := NULL;
  v_msk_now timestamptz := now() AT TIME ZONE 'UTC' + interval '3 hours';
  v_month_start timestamptz; v_year_start timestamptz;
BEGIN
  SELECT weekly_streak, weekly_streak_week, show_last_workout, show_stats, show_favorites, show_weights
    INTO v_streak, v_week, v_show_last, v_show_stats, v_show_fav, v_show_weights
  FROM public.users WHERE id = p_user_id;

  IF v_show_last THEN
    SELECT finished_at, program_id, day INTO v_last
    FROM public.workouts WHERE user_id = p_user_id AND finished_at IS NOT NULL
    ORDER BY finished_at DESC LIMIT 1;
  END IF;

  IF v_show_stats THEN
    SELECT COUNT(*),
           COALESCE(SUM(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60)
                    FILTER (WHERE started_at IS NOT NULL AND finished_at > started_at), 0)::int
      INTO v_total, v_minutes
    FROM public.workouts WHERE user_id = p_user_id AND finished_at IS NOT NULL;

    v_month_start := date_trunc('month', v_msk_now) - interval '3 hours';
    v_year_start  := date_trunc('year',  v_msk_now) - interval '3 hours';

    SELECT jsonb_build_object(
             'count', COUNT(*),
             'minutes', COALESCE(SUM(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60)
                          FILTER (WHERE started_at IS NOT NULL AND finished_at > started_at), 0)::int)
      INTO v_month
    FROM public.workouts
    WHERE user_id = p_user_id AND finished_at IS NOT NULL AND finished_at >= v_month_start;

    SELECT jsonb_build_object(
             'count', COUNT(*),
             'minutes', COALESCE(SUM(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60)
                          FILTER (WHERE started_at IS NOT NULL AND finished_at > started_at), 0)::int)
      INTO v_year
    FROM public.workouts
    WHERE user_id = p_user_id AND finished_at IS NOT NULL AND finished_at >= v_year_start;
  END IF;

  IF v_show_fav THEN
    SELECT jsonb_agg(jsonb_build_object(
             'slot', f.slot, 'name', e.name, 'muscle_icon', e.muscle_icon,
             'muscle_group', e.muscle_group, 'sub_group', e.sub_group, 'counts_reps', e.counts_reps,
             'preview_url', e.preview_url,
             'weight_kg', CASE WHEN v_show_weights THEN w.weight_kg ELSE NULL END
           ) ORDER BY f.slot)
      INTO v_favorites
    FROM public.user_favorite_exercises f
    JOIN public.exercises e ON e.id = f.exercise_id
    LEFT JOIN public.user_exercise_weights w ON w.user_id = f.user_id AND w.exercise_id = f.exercise_id
    WHERE f.user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'last_workout', CASE WHEN NOT v_show_last OR v_last.finished_at IS NULL THEN NULL ELSE jsonb_build_object(
      'finished_at', v_last.finished_at, 'program_id', v_last.program_id, 'day', v_last.day) END,
    'weekly_streak', COALESCE(v_streak, 0),
    'weekly_streak_week', v_week,
    'total_workouts', CASE WHEN v_show_stats THEN COALESCE(v_total, 0) ELSE NULL END,
    'total_minutes', CASE WHEN v_show_stats THEN COALESCE(v_minutes, 0) ELSE NULL END,
    'stats_month', v_month,
    'stats_year', v_year,
    'show_last_workout', COALESCE(v_show_last, true),
    'show_stats', COALESCE(v_show_stats, false),
    'show_favorites', COALESCE(v_show_fav, false),
    'favorites', v_favorites
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_save_friend_program(p_user_id bigint, p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pid text := 'frnd_' || p_user_id::text;
  v_name text; v_author bigint; v_payload jsonb; v_count int; v_letter text; v_slot jsonb;
begin
  select name, author_id, payload into v_name, v_author, v_payload
  from shared_programs where token = p_token;
  if v_name is null then raise exception 'share not found'; end if;
  if v_author = p_user_id then raise exception 'cannot save your own program'; end if;

  v_count := (select count(*) from jsonb_object_keys(v_payload));

  insert into programs (id, name, category, days_count, tags, available, owner_id, source, author_id, share_token)
  values (v_pid, v_name, 'gym', v_count, array['от друга'], true, p_user_id, 'shared', v_author, p_token)
  on conflict (id) do update
    set name = excluded.name, days_count = excluded.days_count, available = true,
        owner_id = p_user_id, source = 'shared', author_id = excluded.author_id,
        share_token = excluded.share_token;

  -- Прошлая программа от друга могла оставить скопированные упражнения. Они уже
  -- личные упражнения этого человека — не трогаем, он сам решит их судьбу.
  delete from program_days where program_id = v_pid;

  for v_letter in select jsonb_object_keys(v_payload) loop
    for v_slot in select jsonb_array_elements(v_payload -> v_letter) loop
      insert into program_days (program_id, day, order_num, muscle_group, sub_group, type, exercise_id)
      select v_pid, v_letter, (v_slot->>'order_num')::int, v_slot->>'muscle_group',
             v_slot->>'sub_group', v_slot->>'type', v_slot->>'default_exercise_id'
      where exists (select 1 from exercises e where e.id = v_slot->>'default_exercise_id');
    end loop;
  end loop;

  perform api_adopt_program_exercises(p_user_id, v_pid);

  return v_pid;
end;
$function$;

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
          and (e.owner_id is null or e.owner_id = p_user_id);
        if not found then raise exception 'unknown exercise %', v_ex; end if;
        v_filled := true;
      end loop;
    end loop;
  end loop;

  if not v_filled then raise exception 'program has no exercises'; end if;

  -- Чистим протухшие свапы этой программы: после пересборки order_num могут
  -- сместиться, и старый свап оказался бы в чужом слоте.
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

CREATE OR REPLACE FUNCTION public.api_share_my_program(p_user_id bigint, p_program_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_payload jsonb; v_custom jsonb; v_token text;
begin
  select name into v_name from programs where id = p_program_id and owner_id = p_user_id;
  if v_name is null then raise exception 'program not found or not yours'; end if;

  select coalesce(jsonb_object_agg(t.day, t.slots), '{}'::jsonb) into v_payload
  from (
    select pd.day, jsonb_agg(jsonb_build_object(
      'order_num', pd.order_num, 'muscle_group', pd.muscle_group, 'sub_group', pd.sub_group,
      'type', pd.type, 'default_exercise_id', pd.exercise_id) order by pd.order_num) as slots
    from program_days pd where pd.program_id = p_program_id group by pd.day
  ) t;

  if v_payload = '{}'::jsonb then raise exception 'program is empty'; end if;

  select coalesce(jsonb_object_agg(e.id, jsonb_build_object(
           'name', e.name, 'muscle_group', e.muscle_group, 'sub_group', e.sub_group,
           'type', e.type, 'meta_info', e.meta_info, 'counts_reps', e.counts_reps)), '{}'::jsonb)
  into v_custom
  from exercises e
  where e.owner_id = p_user_id
    and exists (select 1 from program_days pd where pd.program_id = p_program_id and pd.exercise_id = e.id);

  delete from shared_programs where author_id = p_user_id and source_program_id = p_program_id;

  insert into shared_programs (author_id, source_program_id, name, payload, custom_exercises)
  values (p_user_id, p_program_id, v_name, v_payload, v_custom)
  returning token into v_token;

  return v_token;
end;
$function$;


-- ВХОД ПО ПОЧТЕ (второй способ входа рядом с Telegram).
-- Функции с префиксом srv_ фронту НЕ предназначены: их зовёт только Edge
-- Function под service_role. Префикс важен буквально — блок прав в конце файла
-- выдаёт anon доступ ко всем api_*, и под тем именем srv_email_attach позволил
-- бы привязать свою почту к чужому аккаунту, то есть войти в него.

CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
$function$;

-- Пустой ли аккаунт — вопрос ровно один: потеряет ли человек что-нибудь, если
-- эту запись стереть. Поэтому смотрим ВСЁ, что он мог накопить, а не только
-- тренировки: программа, своё упражнение, друг и даже сохранённый вес — повод
-- аккаунт не трогать.
CREATE OR REPLACE FUNCTION public.account_is_empty(p_user_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT (
       EXISTS (SELECT 1 FROM public.workouts               WHERE user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.programs               WHERE owner_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.exercises              WHERE owner_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.user_exercise_weights  WHERE user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.user_favorite_exercises WHERE user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.user_exercise_notes    WHERE user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.friendships            WHERE user_a_id = p_user_id OR user_b_id = p_user_id)
  );
$function$;

-- Выпуск кода. Ограничения от перебора живут ЗДЕСЬ, а не в приложении: минута
-- между письмами — чтобы адрес нельзя было завалить почтой, пять в час — чтобы
-- рассылкой не пользовались через нашу форму.
CREATE OR REPLACE FUNCTION public.srv_email_issue_code(p_email text, p_purpose text, p_code_hash text, p_ttl_seconds integer DEFAULT 600, p_user_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := public.normalize_email(p_email);
  v_last timestamptz;
  v_hour_count int;
BEGIN
  IF v_email IS NULL OR v_email NOT LIKE '%_@_%.__%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_email');
  END IF;
  IF p_purpose NOT IN ('login', 'link') OR p_code_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_args');
  END IF;

  SELECT max(created_at) INTO v_last
    FROM public.email_codes WHERE email = v_email;

  IF v_last IS NOT NULL AND v_last > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'too_soon',
      'retry_after', ceil(extract(epoch FROM (v_last + interval '60 seconds' - now())))::int
    );
  END IF;

  SELECT count(*) INTO v_hour_count
    FROM public.email_codes
   WHERE email = v_email AND created_at > now() - interval '1 hour';

  IF v_hour_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  -- Прошлые коды этого адреса гасим: действующим остаётся только последний,
  -- иначе старое письмо из почты работало бы наравне со свежим.
  UPDATE public.email_codes SET consumed_at = now()
   WHERE email = v_email AND consumed_at IS NULL;

  INSERT INTO public.email_codes (email, code_hash, purpose, user_id, expires_at)
  VALUES (v_email, p_code_hash, p_purpose, p_user_id,
          now() + make_interval(secs => greatest(60, least(p_ttl_seconds, 1800))));

  DELETE FROM public.email_codes WHERE created_at < now() - interval '1 day';

  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$function$;

-- Проверка кода. Пять попыток: человек ошибается один-два раза, перебор шести
-- цифр требует тысяч. На шестой код сгорает — новый запрашивается письмом,
-- а там своя минутная пауза.
CREATE OR REPLACE FUNCTION public.srv_email_verify_code(p_email text, p_purpose text, p_code_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := public.normalize_email(p_email);
  v_row public.email_codes;
BEGIN
  IF v_email IS NULL OR p_code_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_args');
  END IF;

  SELECT * INTO v_row
    FROM public.email_codes
   WHERE email = v_email
     AND purpose = p_purpose
     AND consumed_at IS NULL
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_code');
  END IF;

  IF v_row.attempts >= 5 THEN
    UPDATE public.email_codes SET consumed_at = now() WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  END IF;

  IF v_row.code_hash <> p_code_hash THEN
    UPDATE public.email_codes SET attempts = attempts + 1 WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_code',
                              'attempts_left', 4 - v_row.attempts);
  END IF;

  UPDATE public.email_codes SET consumed_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'user_id', v_row.user_id);
END;
$function$;

-- Привязка почты. Здесь живёт решение «аккаунты НЕ сливаем»: вместо переноса
-- чужих тренировок с разбором конфликтов переносим СПОСОБ ВХОДА с пустого
-- аккаунта на тот, где есть данные. Пустой аккаунт потерять нельзя — в нём
-- нечего терять. Данные с обеих сторон — честный отказ, решает человек.
-- final_user_id может ОТЛИЧАТЬСЯ от исходного: сессию выдавать на него.
CREATE OR REPLACE FUNCTION public.srv_email_attach(p_user_id bigint, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := public.normalize_email(p_email);
  v_me public.users;
  v_other public.users;
  v_freed_auth uuid;
BEGIN
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_email');
  END IF;

  SELECT * INTO v_me FROM public.users WHERE id = p_user_id;
  IF v_me.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_user');
  END IF;

  SELECT * INTO v_other FROM public.users
   WHERE lower(email) = v_email AND id <> p_user_id;

  IF v_me.email IS NOT NULL AND lower(v_me.email) = v_email THEN
    RETURN jsonb_build_object('ok', true, 'final_user_id', v_me.id,
                              'final_auth_id', v_me.auth_id, 'changed', false);
  END IF;

  IF v_other.id IS NOT NULL THEN
    IF public.account_is_empty(v_other.id) THEN
      v_freed_auth := v_other.auth_id;
      DELETE FROM public.users WHERE id = v_other.id;

    ELSIF public.account_is_empty(v_me.id) THEN
      IF v_other.telegram_id IS NOT NULL AND v_other.telegram_id IS DISTINCT FROM v_me.telegram_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'other_has_telegram');
      END IF;

      -- ПОРЯДОК ВАЖЕН: сначала сносим пустую запись, только потом переносим
      -- её telegram_id. Наоборот нельзя — номер уникален, и на миг он
      -- принадлежал бы сразу двум записям. Обнулить номер заранее тоже не
      -- выйдет: у пустой записи нет почты, а база не разрешает остаться
      -- совсем без способа входа.
      v_freed_auth := v_me.auth_id;
      DELETE FROM public.users WHERE id = v_me.id;

      UPDATE public.users
         SET telegram_id = COALESCE(v_me.telegram_id, telegram_id),
             first_name  = COALESCE(first_name, v_me.first_name),
             username    = COALESCE(username, v_me.username),
             photo_url   = COALESCE(photo_url, v_me.photo_url),
             email_verified_at = COALESCE(email_verified_at, now()),
             updated_at = now()
       WHERE id = v_other.id;

      RETURN jsonb_build_object('ok', true, 'final_user_id', v_other.id,
                                'final_auth_id', v_other.auth_id,
                                'freed_auth_id', v_freed_auth,
                                'moved', true, 'changed', true);
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'both_have_data');
    END IF;
  END IF;

  UPDATE public.users
     SET email = v_email, email_verified_at = now(), updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'final_user_id', v_me.id,
                            'final_auth_id', v_me.auth_id,
                            'freed_auth_id', v_freed_auth, 'changed', true);
END;
$function$;

-- Вход по почте: находим аккаунт или заводим новый, вообще без Telegram.
CREATE OR REPLACE FUNCTION public.srv_email_login_user(p_email text, p_auth_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := public.normalize_email(p_email);
  v_user public.users;
  v_id bigint;
BEGIN
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_email');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE lower(email) = v_email;

  IF v_user.id IS NOT NULL THEN
    -- auth_id проставляем, только если его нет: перезаписывать существующий
    -- нельзя, иначе разорвём вход через Telegram у того же человека.
    IF v_user.auth_id IS NULL AND p_auth_id IS NOT NULL THEN
      UPDATE public.users SET auth_id = p_auth_id, updated_at = now() WHERE id = v_user.id;
      v_user.auth_id := p_auth_id;
    END IF;
    UPDATE public.users SET email_verified_at = COALESCE(email_verified_at, now())
     WHERE id = v_user.id;
    RETURN jsonb_build_object('ok', true, 'user_id', v_user.id,
                              'auth_id', v_user.auth_id, 'created', false);
  END IF;

  INSERT INTO public.users (email, email_verified_at, auth_id, first_name)
  VALUES (v_email, now(), p_auth_id, split_part(v_email, '@', 1))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'user_id', v_id,
                            'auth_id', p_auth_id, 'created', true);
END;
$function$;

-- Отвязка. Обе кнопки упираются в одно правило: последнюю дверь убрать нельзя.
-- Проверка стоит и здесь, и в CHECK на users — здесь ради внятного ответа
-- человеку, там ради того, чтобы ошибка в коде не заперла его снаружи.
CREATE OR REPLACE FUNCTION public.api_unlink_my_email()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
  v_user public.users;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_user FROM public.users WHERE id = uid;

  IF v_user.email IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;
  IF v_user.telegram_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'last_login_method');
  END IF;

  UPDATE public.users SET email = NULL, email_verified_at = NULL, updated_at = now()
   WHERE id = uid;
  RETURN jsonb_build_object('ok', true, 'changed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_unlink_my_telegram()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint := public.current_user_id();
  v_user public.users;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_user FROM public.users WHERE id = uid;

  IF v_user.telegram_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;
  IF v_user.email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'last_login_method');
  END IF;

  UPDATE public.users SET telegram_id = NULL, updated_at = now() WHERE id = uid;
  RETURN jsonb_build_object('ok', true, 'changed', true);
END;
$function$;


-- ── ТРИГГЕРЫ ───────────────────────────────────────────────────────────────
CREATE TRIGGER trg_record_weight_point
  AFTER INSERT OR UPDATE OF weight_kg ON public.user_exercise_weights
  FOR EACH ROW EXECUTE FUNCTION record_weight_point();


-- ── RLS ────────────────────────────────────────────────────────────────────
-- Защита включена на ВСЕХ таблицах. Личность определяется через
-- current_user_id() → auth.uid(). Пользователь видит только свои строки;
-- справочники (exercises, programs, program_days) читаются всеми.
--
-- user_favorite_exercises намеренно БЕЗ политик: прямой доступ к ней закрыт
-- полностью, работа идёт только через api_* функции.
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exercise_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exercise_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exercise_weight_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exercise_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorite_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- Каталог упражнений. Две политики работают ВМЕСТЕ: обычная разрешает чтение
-- всем, RESTRICTIVE поверх неё режет чужие личные упражнения. RESTRICTIVE
-- складывается с любой другой политикой через AND — поэтому прямой select
-- физически не может вернуть строку с owner_id.
CREATE POLICY public_read_exercises ON public.exercises FOR SELECT TO public
  USING (true);

CREATE POLICY exercises_public_reads_system_only ON public.exercises AS RESTRICTIVE FOR SELECT TO authenticated, anon
  USING ((owner_id IS NULL));

CREATE POLICY read_programs ON public.programs FOR SELECT TO public
  USING (((owner_id IS NULL) OR (owner_id = current_user_id())));

CREATE POLICY read_program_days ON public.program_days FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM programs p
  WHERE ((p.id = program_days.program_id) AND ((p.owner_id IS NULL) OR (p.owner_id = current_user_id()))))));

-- Своя запись — и только она. Раньше чтение было открыто всем: имя и аватар
-- нужны в списке друзей, и это казалось безобидным. С появлением почты стало
-- утечкой персональных данных — anon-ключ лежит в коде приложения, то есть
-- у всех, и одного запроса хватило бы, чтобы выгрузить адреса.
--
-- Списку друзей открытая таблица и не нужна: чужие профили отдают SECURITY
-- DEFINER функции (api_get_friends_list, api_get_user_public_profile), которые
-- RLS обходят и возвращают только разрешённые поля. В приложении все прямые
-- чтения users — свои собственные.
CREATE POLICY users_select_own ON public.users FOR SELECT TO public
  USING ((id = current_user_id()));
CREATE POLICY us_update_own ON public.users FOR UPDATE TO public
  USING ((id = current_user_id())) WITH CHECK ((id = current_user_id()));
CREATE POLICY us_delete_own ON public.users FOR DELETE TO public
  USING ((id = current_user_id()));

CREATE POLICY wk_select_own ON public.workouts FOR SELECT TO public USING ((user_id = current_user_id()));
CREATE POLICY wk_insert_own ON public.workouts FOR INSERT TO public WITH CHECK ((user_id = current_user_id()));
CREATE POLICY wk_update_own ON public.workouts FOR UPDATE TO public
  USING ((user_id = current_user_id())) WITH CHECK ((user_id = current_user_id()));
CREATE POLICY wk_delete_own ON public.workouts FOR DELETE TO public USING ((user_id = current_user_id()));

-- Подходы принадлежат тренировке — проверяем владельца через неё.
CREATE POLICY es_select_own ON public.exercise_sets FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM workouts w
   WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = current_user_id())))));
CREATE POLICY es_insert_own ON public.exercise_sets FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1 FROM workouts w
   WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = current_user_id())))));
CREATE POLICY es_update_own ON public.exercise_sets FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1 FROM workouts w
   WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = current_user_id())))));
CREATE POLICY es_delete_own ON public.exercise_sets FOR DELETE TO public
  USING ((EXISTS ( SELECT 1 FROM workouts w
   WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = current_user_id())))));

CREATE POLICY uew_select_own ON public.user_exercise_weights FOR SELECT TO public USING ((user_id = current_user_id()));
CREATE POLICY uew_insert_own ON public.user_exercise_weights FOR INSERT TO public WITH CHECK ((user_id = current_user_id()));
CREATE POLICY uew_update_own ON public.user_exercise_weights FOR UPDATE TO public
  USING ((user_id = current_user_id())) WITH CHECK ((user_id = current_user_id()));
CREATE POLICY uew_delete_own ON public.user_exercise_weights FOR DELETE TO public USING ((user_id = current_user_id()));

CREATE POLICY weight_history_select_own ON public.user_exercise_weight_history FOR SELECT TO public
  USING ((user_id = current_user_id()));

CREATE POLICY ues_select_own ON public.user_exercise_swaps FOR SELECT TO public USING ((user_id = current_user_id()));
CREATE POLICY ues_insert_own ON public.user_exercise_swaps FOR INSERT TO public WITH CHECK ((user_id = current_user_id()));
CREATE POLICY ues_update_own ON public.user_exercise_swaps FOR UPDATE TO public
  USING ((user_id = current_user_id())) WITH CHECK ((user_id = current_user_id()));
CREATE POLICY ues_delete_own ON public.user_exercise_swaps FOR DELETE TO public USING ((user_id = current_user_id()));

CREATE POLICY uen_select_own ON public.user_exercise_notes FOR SELECT TO public USING ((user_id = current_user_id()));
CREATE POLICY uen_insert_own ON public.user_exercise_notes FOR INSERT TO public WITH CHECK ((user_id = current_user_id()));
CREATE POLICY uen_update_own ON public.user_exercise_notes FOR UPDATE TO public
  USING ((user_id = current_user_id())) WITH CHECK ((user_id = current_user_id()));
CREATE POLICY uen_delete_own ON public.user_exercise_notes FOR DELETE TO public USING ((user_id = current_user_id()));

CREATE POLICY dq_select_own ON public.daily_quests FOR SELECT TO public USING ((user_id = current_user_id()));
CREATE POLICY dq_insert_own ON public.daily_quests FOR INSERT TO public WITH CHECK ((user_id = current_user_id()));
CREATE POLICY dq_update_own ON public.daily_quests FOR UPDATE TO public
  USING ((user_id = current_user_id())) WITH CHECK ((user_id = current_user_id()));
CREATE POLICY dq_delete_own ON public.daily_quests FOR DELETE TO public USING ((user_id = current_user_id()));

CREATE POLICY fr_select_own ON public.friendships FOR SELECT TO public
  USING (((user_a_id = current_user_id()) OR (user_b_id = current_user_id())));
CREATE POLICY fr_insert_own ON public.friendships FOR INSERT TO public
  WITH CHECK (((user_a_id = current_user_id()) OR (user_b_id = current_user_id())));
CREATE POLICY fr_delete_own ON public.friendships FOR DELETE TO public
  USING (((user_a_id = current_user_id()) OR (user_b_id = current_user_id())));

CREATE POLICY friend_pins_select ON public.friend_pins FOR SELECT TO public
  USING ((owner_id = current_user_id()));

CREATE POLICY sp_select_own ON public.shared_programs FOR SELECT TO public
  USING ((author_id = current_user_id()));

CREATE POLICY "Allow all heartbeat" ON public.heartbeat FOR ALL TO public
  USING (true) WITH CHECK (true);


-- Коды подтверждения: политик НЕТ намеренно. Ни anon, ни authenticated не
-- должны видеть эту таблицу вовсе — с ней работает только сервер под
-- service_role, который RLS обходит.
ALTER TABLE public.email_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_codes FROM anon, authenticated;


-- ── ПРАВА НА ФУНКЦИИ ───────────────────────────────────────────────────────
-- Приложение ходит anon-ключом, поэтому право на выполнение нужно роли anon.
-- Сначала снимаем у PUBLIC, потом выдаём явно — чтобы список был осознанным,
-- а не «кому-то досталось по умолчанию».
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'api\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.complete_daily_quest(bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO anon, authenticated, service_role;

-- Серверные функции входа по почте: только service_role. Общий блок выше их
-- не трогает — он про api_*, и это единственная причина, по которой они
-- называются srv_*.
REVOKE ALL ON FUNCTION public.srv_email_issue_code(text, text, text, int, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.srv_email_verify_code(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.srv_email_attach(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.srv_email_login_user(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_is_empty(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO anon, authenticated, service_role;

-- Таблица пользователей: клиенту доступно только чтение (и то — своей записи,
-- см. политику выше). Записи заводит и правит сервер: Edge Function под
-- service_role и DEFINER-функции. Право писать у роли приложения означало бы
-- ровно одно — возможность обойти всю логику входа.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.users FROM anon, authenticated;
GRANT SELECT ON public.users TO anon, authenticated;
