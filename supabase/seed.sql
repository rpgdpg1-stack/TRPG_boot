-- ═══════════════════════════════════════════════════════════════════════════
--  TRPG — СПРАВОЧНЫЕ ДАННЫЕ
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Наполняет пустую базу тем, без чего приложение не работает: каталог
--  упражнений и встроенные программы. Пользователи, тренировки и веса сюда
--  НЕ входят — это данные людей, они появляются в работе.
--
--  Порядок: сначала schema.sql, потом этот файл.
--  Повторный прогон безопасен: везде ON CONFLICT DO NOTHING.
--
--  Снят: 2026-08-19
-- ═══════════════════════════════════════════════════════════════════════════


-- ── УПРАЖНЕНИЯ ─────────────────────────────────────────────────────────────
-- Колонки, одинаковые у всех, не перечисляем построчно: описание-заглушка
-- ставится ниже одним UPDATE, equipment и muscle_icon не заполнены нигде.
--
-- priority — порядок внутри подгруппы. Именно по нему подбирается упражнение
-- по умолчанию для слота программы (первое = основное), и по нему же
-- сортируется список замен.
-- counts_reps — в чём меряется результат: false = килограммы, true = разы.

INSERT INTO public.exercises (id, name, muscle_group, sub_group, type, meta_info, priority, counts_reps, preview_url) VALUES
  ('ex_001', 'Подтягивания нейтральным хватом', 'back', 'lats', 'base', '3 × 6-10', 1, 't', 'f'),
  ('ex_002', 'Подтягивания с весом', 'back', 'lats', 'base', '4 × 4-8', 2, 'f', 'f'),
  ('ex_003', 'Подтягивания прямым хватом', 'back', 'lats', 'base', '3 × 6-10', 3, 't', 't'),
  ('ex_004', 'Тяга верхнего блока нейтральным хватом', 'back', 'lats', 'base', '3 × 10-12', 4, 'f', 'f'),
  ('ex_005', 'Тяга верхнего блока прямым хватом', 'back', 'lats', 'base', '3 × 10-12', 5, 'f', 't'),
  ('ex_006', 'Становая тяга (классическая)', 'back', 'thickness', 'base', '4 × 4-6', 1, 'f', 'f'),
  ('ex_007', 'Тяга гантели одной рукой в наклоне', 'back', 'thickness', 'base', '3 × 10-12', 2, 'f', 't'),
  ('ex_008', 'Тяга горизонтального блока параллельным хватом', 'back', 'thickness', 'base', '3 × 10-12', 3, 'f', 't'),
  ('ex_009', 'Тяга на рычажном тренажере Хаммер одной рукой', 'back', 'thickness', 'base', '3 × 10-15', 4, 'f', 'f'),
  ('ex_010', 'Тяга на рычажном тренажере Хаммер', 'back', 'thickness', 'base', '3 × 10-12', 5, 'f', 't'),
  ('ex_011', 'Тяга штанги в наклоне', 'back', 'thickness', 'base', '4 × 6-8', 6, 'f', 'f'),
  ('ex_012', 'Тяга Т-грифа', 'back', 'thickness', 'base', '4 × 8-10', 7, 'f', 'f'),
  ('ex_013', 'Гиперэкстензия с отягощением (на разгибатели спины)', 'back', 'extensors', 'accessory', '3 × 12-15', 1, 'f', 't'),
  ('ex_014', 'Гиперэкстензия (на разгибатели спины)', 'back', 'extensors', 'accessory', '3 × 12-15', 2, 't', 't'),
  ('ex_015', 'Шраги гантелями', 'back', 'traps', 'accessory', '3 × 12-15', 1, 'f', 't'),
  ('ex_016', 'Шраги со штангой', 'back', 'traps', 'accessory', '3 × 12-15', 2, 'f', 'f'),
  ('ex_017', 'Жим штанги лежа', 'chest', 'chest', 'base', '4 × 6-8', 1, 'f', 't'),
  ('ex_018', 'Жим гантелей лёжа', 'chest', 'chest', 'base', '3 × 8-12', 2, 'f', 'f'),
  ('ex_019', 'Жим в тренажёре (Хаммер)', 'chest', 'chest', 'base', '3 × 10-12', 3, 'f', 'f'),
  ('ex_020', 'Отжимания на брусьях (на грудь - сильный наклон вперед)', 'chest', 'chest', 'base', '3 × 8-12', 4, 't', 'f'),
  ('ex_021', 'Отжимания от пола', 'chest', 'chest', 'base', '2 × 12-20', 5, 't', 'f'),
  ('ex_022', 'Сведение рук в тренажере (Бабочка)', 'chest', 'chest', 'isolation', '3 × 12-15', 6, 'f', 't'),
  ('ex_023', 'Разводка гантелей лежа на горизонтальной скамье', 'chest', 'chest', 'isolation', '3 × 12-15', 7, 'f', 'f'),
  ('ex_024', 'Жим гантелей на наклонной скамье 30-45°', 'chest', 'chest_upper', 'base', '3 × 8-10', 1, 'f', 't'),
  ('ex_025', 'Жим штанги на наклонной скамье 30-45°', 'chest', 'chest_upper', 'base', '4 × 6-8', 2, 'f', 't'),
  ('ex_026', 'Жим в тренажёре под углом 30-45°', 'chest', 'chest_upper', 'base', '3 × 10-12', 3, 'f', 'f'),
  ('ex_027', 'Кроссовер на верхних блоках', 'chest', 'chest_upper', 'isolation', '3 × 12-15', 4, 'f', 'f'),
  ('ex_028', 'Жим штанги на отрицательном наклоне (Decline)', 'chest', 'chest_lower', 'base', '3 × 8-10', 1, 'f', 't'),
  ('ex_029', 'Кроссовер на нижних блоках', 'chest', 'chest_lower', 'isolation', '3 × 12-15', 2, 'f', 'f'),
  ('ex_030', 'Приседания со штангой', 'legs', 'quadriceps', 'base', '4 × 5-8', 1, 'f', 'f'),
  ('ex_031', 'Приседания в (Смите)', 'legs', 'quadriceps', 'base', '3 × 8-10', 2, 'f', 't'),
  ('ex_032', 'Жим ногами в тренажёре', 'legs', 'quadriceps', 'base', '3 × 10-12', 3, 'f', 't'),
  ('ex_033', 'Гакк-приседания', 'legs', 'quadriceps', 'base', '3 × 10-12', 4, 'f', 'f'),
  ('ex_034', 'Выпады с гантелями', 'legs', 'quadriceps', 'base', '3 × 10-12', 5, 'f', 't'),
  ('ex_035', 'Болгарские сплит-приседания', 'legs', 'quadriceps', 'base', '3 × 8-10', 6, 'f', 't'),
  ('ex_036', 'Разгибание ног сидя в тренажере', 'legs', 'quadriceps', 'isolation', '3 × 12-15', 7, 'f', 't'),
  ('ex_037', 'Румынская тяга со штангой', 'legs', 'hamstrings', 'base', '4 × 8-10', 1, 'f', 'f'),
  ('ex_038', 'Румынская тяга с гантелями', 'legs', 'hamstrings', 'base', '3 × 10-12', 2, 'f', 't'),
  ('ex_039', 'Румынская тяга в Смите', 'legs', 'hamstrings', 'base', '3 × 10-12', 3, 'f', 'f'),
  ('ex_040', 'Сгибания ног лёжа в тренажёре', 'legs', 'hamstrings', 'isolation', '3 × 10-15', 4, 'f', 'f'),
  ('ex_041', 'Сгибания ног сидя в тренажёре', 'legs', 'hamstrings', 'isolation', '3 × 10-15', 5, 'f', 't'),
  ('ex_042', 'Ягодичный мостик со штангой', 'legs', 'glutes', 'base', '4 × 10-12', 1, 'f', 't'),
  ('ex_043', 'Ягодичный мостик в (Смите)', 'legs', 'glutes', 'base', '3 × 10-15', 2, 'f', 'f'),
  ('ex_044', 'Ягодичный мостик в тренажере', 'legs', 'glutes', 'base', '3 × 12-15', 3, 'f', 'f'),
  ('ex_045', 'Приседания Сумо с гантелей', 'legs', 'glutes', 'base', '3 × 12-15', 4, 'f', 't'),
  ('ex_046', 'Отведение ноги в тренажёре', 'legs', 'glutes', 'isolation', '3 × 15-20', 5, 'f', 't'),
  ('ex_047', 'Гиперэкстензия (на ягодицы)', 'legs', 'glutes', 'accessory', '3 × 12-15', 6, 't', 'f'),
  ('ex_048', 'Обратная гиперэкстензия', 'legs', 'glutes', 'accessory', '3 × 12-15', 7, 't', 'f'),
  ('ex_049', 'Разведение ног в тренажере', 'legs', 'abductors', 'accessory', '3 × 15-20', 1, 'f', 't'),
  ('ex_050', 'Сведение ног в тренажере', 'legs', 'adductors', 'accessory', '3 × 15-20', 1, 'f', 't'),
  ('ex_051', 'Подьем на носки стоя в тренажере', 'legs', 'calves', 'isolation', '3 × 15-20', 1, 'f', 't'),
  ('ex_052', 'Подъёмы на носки в жиме ногами', 'legs', 'calves', 'isolation', '3 × 15-20', 2, 'f', 'f'),
  ('ex_053', 'Подъёмы на носки сидя', 'legs', 'calves', 'isolation', '3 × 15-20', 3, 'f', 'f'),
  ('ex_054', 'Жим штанги стоя (армейский жим)', 'shoulders', 'front_delt', 'base', '4 × 6-8', 1, 'f', 'f'),
  ('ex_055', 'Жим гантелей сидя', 'shoulders', 'front_delt', 'base', '3 × 8-10', 2, 'f', 't'),
  ('ex_056', 'Жим в тренажёре сидя', 'shoulders', 'front_delt', 'base', '3 × 10-12', 3, 'f', 'f'),
  ('ex_057', 'Подьем гантелей перед собой стоя', 'shoulders', 'front_delt', 'isolation', '3 × 12-15', 4, 'f', 'f'),
  ('ex_058', 'Махи гантелями в стороны стоя', 'shoulders', 'mid_delt', 'isolation', '3 × 12-15', 1, 'f', 't'),
  ('ex_059', 'Тяга к лицу (Face Pull)', 'shoulders', 'rear_delt', 'isolation', '3 × 15-20', 1, 'f', 't'),
  ('ex_060', 'Обратные развордки в тренажере (Бабочка)', 'shoulders', 'rear_delt', 'isolation', '3 × 15-20', 2, 'f', 't'),
  ('ex_061', 'Разводка гантелей в наклоне сидя на скамье', 'shoulders', 'rear_delt', 'isolation', '3 × 15-20', 3, 'f', 't'),
  ('ex_062', 'Манжета плеча', 'shoulders', 'rotator_cuff', 'accessory', '3 × 15-20', 1, 'f', 'f'),
  ('ex_063', 'Подъём гантелей на бицепс попеременно на наклонной скамье 45°', 'biceps', 'biceps', 'isolation', '3 × 10-12', 1, 'f', 't'),
  ('ex_064', 'Подъём штанги с EZ грифом на бицепс стоя', 'biceps', 'biceps', 'isolation', '3 × 8-10', 2, 'f', 't'),
  ('ex_065', 'Подъём гантелей на бицепс попеременно стоя', 'biceps', 'biceps', 'isolation', '3 × 10-12', 3, 'f', 'f'),
  ('ex_066', 'Молотковые сгибания с гантелями', 'biceps', 'biceps', 'isolation', '3 × 10-12', 4, 'f', 't'),
  ('ex_067', 'Сгибания на нижнем блоке', 'biceps', 'biceps', 'isolation', '3 × 12-15', 5, 'f', 'f'),
  ('ex_068', 'Подъём на бицепс на скамье (Скотта)', 'biceps', 'biceps', 'isolation', '3 × 10-12', 6, 'f', 'f'),
  ('ex_069', 'Концентрированный подъём гантели', 'biceps', 'biceps', 'isolation', '3 × 12-15', 7, 'f', 'f'),
  ('ex_070', 'Разгибание на блоке вниз (верхний блок)', 'triceps', 'triceps', 'isolation', '3 × 12-15', 1, 'f', 't'),
  ('ex_071', 'Разгибание на блоке вверх (нижний блок)', 'triceps', 'triceps', 'isolation', '3 × 12-15', 2, 'f', 't'),
  ('ex_072', 'Французский жим штанги лёжа', 'triceps', 'triceps', 'isolation', '3 × 8-10', 3, 'f', 'f'),
  ('ex_073', 'Французский жим гантелей лёжа', 'triceps', 'triceps', 'isolation', '3 × 10-12', 4, 'f', 'f'),
  ('ex_074', 'Разгибание гантели из-за головы', 'triceps', 'triceps', 'isolation', '3 × 12-15', 5, 'f', 't'),
  ('ex_075', 'Отжимания на брусьях (на трицепс - прямо, без наклона вперед)', 'triceps', 'triceps', 'isolation', '3 × 8-12', 6, 't', 't'),
  ('ex_076', 'Жим штанги узким хватом', 'triceps', 'triceps', 'isolation', '4 × 6-8', 7, 'f', 'f'),
  ('ex_077', 'Отжимания от скамьи', 'triceps', 'triceps', 'isolation', '3 × 15-20', 8, 't', 'f'),
  ('ex_078', 'Скручивания в тренажёре', 'abs', 'abs_upper', 'isolation', '3 × 12-15', 1, 'f', 't'),
  ('ex_079', 'Скручивания на верхнем блоке стоя на коленях', 'abs', 'abs_upper', 'isolation', '3 × 12-15', 2, 'f', 'f'),
  ('ex_080', 'Скручивания лежа на скамье', 'abs', 'abs_upper', 'isolation', '3 × 15-20', 3, 't', 'f'),
  ('ex_081', 'Подьем ног в висе на турнике', 'abs', 'abs_lower', 'isolation', '3 × 10-15', 1, 't', 't'),
  ('ex_082', 'Обратные скручивания', 'abs', 'abs_lower', 'isolation', '3 × 15-20', 2, 't', 'f'),
  ('ex_083', 'Планка', 'abs', 'core', 'isolation', '3 × 30-45 сек', 1, 't', 'f'),
  ('ex_084', 'Сгибания запястий', 'forearms', 'forearm_flexors', 'accessory', '3 × 15-20', 1, 'f', 't'),
  ('ex_085', 'Разгибание запястий', 'forearms', 'forearm_extensors', 'accessory', '3 × 15-20', 1, 'f', 't'),
  ('ex_086', 'Подьем блина шеей лежа на спине', 'neck', 'neck_flexors', 'accessory', '3 × 15-20', 1, 'f', 't'),
  ('ex_087', 'Подьем блина шеей лежа на животе', 'neck', 'neck_extensors', 'accessory', '3 × 15-20', 1, 'f', 't'),
  ('ex_088', 'Разминка', 'warmup', 'warmup', 'warmup', '1 × 10-15', 1, 'f', 'f')
ON CONFLICT (id) DO NOTHING;

-- Ссылки на медиа строятся из id по единому шаблону, поэтому в списке выше
-- хранится только признак «медиа есть» (последняя колонка, временно легла
-- в preview_url). Разворачиваем его в настоящие адреса.
UPDATE public.exercises
   SET video_url   = 'https://55ee17b6-d242-49cb-92d3-e97297fb7934.selstorage.ru/TRPG/video/' || id || '.mp4',
       preview_url = 'https://55ee17b6-d242-49cb-92d3-e97297fb7934.selstorage.ru/TRPG/images/thumbnails/' || id || '.webp'
 WHERE owner_id IS NULL AND preview_url = 't';

UPDATE public.exercises SET preview_url = NULL
 WHERE owner_id IS NULL AND preview_url = 'f';

UPDATE public.exercises SET description = 'Здесь будет подробное описание'
 WHERE owner_id IS NULL AND description IS NULL;


-- ── ВСТРОЕННЫЕ ПРОГРАММЫ ───────────────────────────────────────────────────
-- Строка в programs нужна даже тем программам, чьи слоты живут в коде: на неё
-- ссылаются workouts.program_id и user_exercise_swaps.program_id.
INSERT INTO public.programs (id, name, category, days_count, tags, available, source) VALUES
  ('prog_001', 'Сплит',   'gym',  3, '{зал}',     't', 'global'),
  ('prog_002', 'Фулбади', 'gym',  2, '{зал}',     't', 'global'),
  ('swim_001', 'Заплыв',  'pool', 1, '{бассейн}', 't', 'global')
ON CONFLICT (id) DO NOTHING;

-- Слоты дня есть в базе ТОЛЬКО у Сплита. У Фулбади и Заплыва раскладка живёт
-- в коде (src/data/programs/fullbody.js и swim.js) — реестр собирает их дни
-- оттуда, база для них хранит лишь строку программы.
--
-- exercise_id = NULL означает «упражнение по умолчанию не задано»: приложение
-- подберёт первое по priority среди подходящих по подгруппе и типу.
INSERT INTO public.program_days (program_id, day, location, order_num, muscle_group, sub_group, type, exercise_id) VALUES
  ('prog_001', 'A', 'gym', 1,  'back', 'lats', 'base', NULL),
  ('prog_001', 'A', 'gym', 2,  'back', 'lats', 'base', NULL),
  ('prog_001', 'A', 'gym', 3,  'back', 'thickness', 'base', NULL),
  ('prog_001', 'A', 'gym', 4,  'arms', 'biceps', 'isolation', NULL),
  ('prog_001', 'A', 'gym', 5,  'arms', 'biceps', 'isolation', NULL),
  ('prog_001', 'A', 'gym', 6,  'forearms', 'forearm_flexors', 'accessory', NULL),
  ('prog_001', 'A', 'gym', 7,  'forearms', 'forearm_extensors', 'accessory', NULL),
  ('prog_001', 'A', 'gym', 8,  'neck', 'neck_flexors', 'accessory', NULL),
  ('prog_001', 'A', 'gym', 9,  'neck', 'neck_extensors', 'accessory', NULL),
  ('prog_001', 'A', 'gym', 10, 'back', 'extensors', 'accessory', NULL),
  ('prog_001', 'B', 'gym', 1,  'chest', 'chest', 'base', NULL),
  ('prog_001', 'B', 'gym', 2,  'chest', 'chest_upper', 'base', NULL),
  ('prog_001', 'B', 'gym', 3,  'chest', 'chest', 'isolation', NULL),
  ('prog_001', 'B', 'gym', 4,  'shoulders', 'front_delt', 'base', NULL),
  ('prog_001', 'B', 'gym', 5,  'shoulders', 'mid_delt', 'isolation', NULL),
  ('prog_001', 'B', 'gym', 6,  'shoulders', 'rear_delt', 'isolation', NULL),
  ('prog_001', 'B', 'gym', 7,  'arms', 'triceps', 'isolation', NULL),
  ('prog_001', 'B', 'gym', 8,  'arms', 'triceps', 'isolation', NULL),
  ('prog_001', 'B', 'gym', 9,  'abs', 'abs_upper', 'isolation', NULL),
  ('prog_001', 'C', 'gym', 1,  'legs', 'quadriceps', 'base', NULL),
  ('prog_001', 'C', 'gym', 2,  'legs', 'quadriceps', 'base', NULL),
  ('prog_001', 'C', 'gym', 3,  'legs', 'hamstrings', 'base', NULL),
  ('prog_001', 'C', 'gym', 4,  'legs', 'quadriceps', 'isolation', NULL),
  ('prog_001', 'C', 'gym', 5,  'legs', 'hamstrings', 'isolation', NULL),
  ('prog_001', 'C', 'gym', 6,  'legs', 'glutes', 'base', NULL),
  ('prog_001', 'C', 'gym', 7,  'legs', 'adductors', 'accessory', NULL),
  ('prog_001', 'C', 'gym', 8,  'legs', 'abductors', 'accessory', NULL),
  ('prog_001', 'C', 'gym', 9,  'legs', 'calves', 'accessory', NULL),
  ('prog_001', 'C', 'gym', 10, 'abs', 'abs_lower', 'isolation', NULL)
ON CONFLICT (program_id, location, day, order_num) DO NOTHING;

-- Строка-пульс (таблица служебная, одна запись).
INSERT INTO public.heartbeat (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
