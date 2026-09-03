/**
 * Ключи локальных хранилищ — В ОДНОМ МЕСТЕ (FE-006).
 *
 * Зачем. Раньше ключи писались строкой там, где использовались, и один и тот
 * же ключ встречался в трёх-четырёх файлах. Опечатка в такой строке не ловится
 * ни линтером, ни сборкой, ни тестом: приложение не падает — просто перестаёт
 * находить сохранённое. Данные при этом никуда не делись, они лежат под старым
 * ключом, а человек видит «прогресс пропал». Отсюда правило: новый ключ
 * заводить здесь, а не по месту.
 *
 * Что где лежит:
 *  - `localStorage` — переживает перезапуск, привязан к устройству;
 *  - `user_prefs` в базе — настройки аккаунта, общие для телефона и браузера
 *    (см. lib/prefs.js, там свои имена настроек);
 *  - CloudStorage Telegram — то, что должно доезжать между устройствами
 *    внутри Telegram (см. lib/cloud-storage.js).
 *
 * Ключи с двоеточием на конце — ПРЕФИКСЫ: к ним дописывается уточнение
 * (идентификатор человека, слаг программы, день). Для них есть функции ниже:
 * они собирают ключ целиком, чтобы порядок частей не приходилось помнить.
 */

/* ── Активная тренировка ──────────────────────────────────────────────────── */

/** Идущая сейчас тренировка: `{ programId, day, place, startedAt }`. Одна на приложение. */
export const ACTIVE_WORKOUT = 'active-workout'

/** Событие «активная тренировка изменилась» — общий канал между экранами. */
export const ACTIVE_WORKOUT_CHANGED = 'active-workout-changed'

/* ── Префиксы (ключ собирается функцией ниже) ─────────────────────────────── */

/** Отметки упражнений в дне. Место входит в ключ: в зале и дома прогресс разный. */
export const WORKOUT_PROGRESS_PREFIX = 'workout-progress:'

/** Последние тренировки, снятые с сервера. В ключе — человек и размер выборки. */
export const RECENT_WORKOUTS_PREFIX = 'recent-workouts:'

/** Сколько кругов в основной части заплыва. В ключе — слаг программы. */
export const SWIM_REPS_PREFIX = 'swim-reps:'

/** Длина бассейна (25/50 м). В ключе — слаг программы. */
export const SWIM_POOL_PREFIX = 'swim-pool:'

/* ── Разовые метки ────────────────────────────────────────────────────────── */

/**
 * Разовая чистка кеша, в который однажды уехала пустота (см. lib/cache-repair.js).
 * Номер в имени — версия чистки: понадобится ещё одна, заводим `-2`, а не
 * переиспользуем эту, иначе у тех, кто уже почистился, она не сработает.
 */
export const EMPTY_CACHE_PURGE = 'empty-cache-purge-1'

/* ── Кеши данных (целиком, без уточнения) ─────────────────────────────────── */

/** Личные рекорды, снятые с сервера. */
export const PERSONAL_RECORDS = 'personal-records'

/** Любимые упражнения (до пяти слотов). */
export const FAV_EXERCISES_LIST = 'fav-exercises-list'

/** Свои программы и программа, сохранённая от друга. */
export const USER_PROGRAMS = 'user-programs'

/** Настройки напоминаний от бота. */
export const NOTIFICATION_SETTINGS = 'notification-settings'

/**
 * Неотправленные операции. При смене аккаунта чистится ОБЯЗАТЕЛЬНО:
 * применить чужую очередь к своим данным хуже, чем потерять её.
 */
export const OFFLINE_QUEUE = 'offline-operations-queue'

/* ── Остальные префиксы ───────────────────────────────────────────────────── */

/** Настройки аккаунта, зеркало user_prefs. */
export const PREFS_PREFIX = 'prefs:'

/** Список друзей. В ключе — человек. */
export const FRIENDS_LIST_PREFIX = 'friends-list:'

/** Постоянный кеш ответов сервера (lib/persistent-cache.js). */
export const PCACHE_PREFIX = 'pcache:'

/** Состояние программы: цикл дней A/B/C и выбранное место. */
export const PROGRAM_PREFIX = 'program:'

/** Набор упражнений быстрой тренировки. В ключе — слаг программы. */
export const QUICK_SET_PREFIX = 'quick-set:'

/** Включена ли быстрая тренировка. В ключе — слаг программы. */
export const QUICK_ON_PREFIX = 'quick-on:'

/* ── Что чистить при смене аккаунта ───────────────────────────────────────── */

/**
 * Ключи и префиксы, привязанные к КОНКРЕТНОМУ человеку. При входе другим
 * аккаунтом их надо снести, иначе новый человек увидит чужую историю и
 * чужие отметки. Списки читает lib/auth.js.
 *
 * Заводишь новый ключ с личными данными — добавь его сюда СРАЗУ. Забытый
 * ключ проявится редким и очень неприятным багом: чужие данные в своём
 * аккаунте, причём только у тех, кто входил двумя аккаунтами на одном
 * устройстве.
 */
export const USER_SCOPED_KEYS = [
  PERSONAL_RECORDS,
  FAV_EXERCISES_LIST,
  USER_PROGRAMS,
  ACTIVE_WORKOUT,
  NOTIFICATION_SETTINGS,
  OFFLINE_QUEUE
]

export const USER_SCOPED_PREFIXES = [
  PREFS_PREFIX,
  FRIENDS_LIST_PREFIX,
  PCACHE_PREFIX,
  RECENT_WORKOUTS_PREFIX,
  WORKOUT_PROGRESS_PREFIX,
  PROGRAM_PREFIX,
  SWIM_POOL_PREFIX,
  SWIM_REPS_PREFIX,
  QUICK_SET_PREFIX,
  QUICK_ON_PREFIX
]

/* ── Сборка ключей с префиксом ────────────────────────────────────────────── */

/**
 * Ключ прогресса дня. Место обязательно: в зале и дома разные упражнения,
 * а значит и разные отметки — без места они бы затирали друг друга.
 */
export function workoutProgressKey(programSlug, place, day) {
  return `${WORKOUT_PROGRESS_PREFIX}${programSlug}:${place}:${day}`
}

/** Ключ последних тренировок: свой у каждого человека и каждого размера выборки. */
export function recentWorkoutsKey(userId, limit) {
  return `${RECENT_WORKOUTS_PREFIX}${userId}:${limit}`
}

/** Ключ числа кругов заплыва. */
export function swimRepsKey(programSlug) {
  return `${SWIM_REPS_PREFIX}${programSlug}`
}

/** Ключ длины бассейна. */
export function swimPoolKey(programSlug) {
  return `${SWIM_POOL_PREFIX}${programSlug}`
}
