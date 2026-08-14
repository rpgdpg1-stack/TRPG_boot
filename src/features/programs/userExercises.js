/**
 * СВОИ УПРАЖНЕНИЯ — то, чего нет в каталоге приложения, человек заводит сам.
 *
 * Своё упражнение — НЕ отдельная сущность. В базе оно лежит в той же таблице
 * `exercises`, просто с владельцем (`owner_id`), поэтому автоматически
 * полноправно везде: вес сохраняется и растёт, попадает в историю, рекорды,
 * любимые, работает оффлайн-кэш дня. Ни одну из этих механик под «кастомные»
 * дублировать не пришлось (подробности — в supabase/migrations/user_exercises.sql).
 *
 * Отличить своё от системного можно по id: префикс `ux_`. Проверка по префиксу,
 * а не по наличию owner_id в ответе, потому что owner_id наружу не отдаётся —
 * функции возвращают только то, что нужно для показа.
 *
 * ЧУЖИЕ свои упражнения не видны вообще: прямой select их не достаёт (политика
 * RLS), а `api_get_my_exercises` отдаёт только собственные.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/auth'
import { cacheGet, cacheSet, cacheInvalidate, TTL } from '../../lib/cache'
import { pcacheGet, pcacheSet } from '../../lib/persistent-cache'
import { isOnline } from '../../lib/network-status'

/** Сколько своих упражнений можно завести. Второе место лимита — в RPC. */
export const MY_EXERCISE_LIMIT = 12

const key = (userId) => `my-exercises:${userId}`

/** Своё это упражнение или из каталога приложения. */
export function isCustomExercise(idOrEx) {
  const id = typeof idOrEx === 'string' ? idOrEx : idOrEx?.id || idOrEx?.exercise_id
  return typeof id === 'string' && id.startsWith('ux_')
}

/**
 * «3» и «8-12» → «3 × 8-12» — та же строка, что у системных упражнений
 * (meta_info), поэтому в карточке ничего особенного рисовать не нужно.
 * Пусто хоть с одной стороны — метаданных нет вовсе.
 */
export function buildMetaInfo(sets, reps) {
  const s = String(sets ?? '').trim()
  const r = String(reps ?? '').trim()
  if (!s && !r) return ''
  if (!s) return r
  if (!r) return s
  return `${s} × ${r}`
}

/** Разобрать «3 × 8-12» обратно на поля формы (для редактирования). */
export function parseMetaInfo(meta) {
  const m = String(meta || '').split(/[×x]/)
  if (m.length < 2) return { sets: '', reps: String(meta || '').trim() }
  return { sets: m[0].trim(), reps: m.slice(1).join('×').trim() }
}

/**
 * Список своих упражнений. Память → localStorage (оффлайн) → сеть.
 * Без сети отдаём последнее известное — свои упражнения нужны в зале ровно
 * так же, как остальной день.
 */
export async function loadMyExercises() {
  const user = getCurrentUser()
  if (!user) return []
  const k = key(user.id)

  const cached = cacheGet(k)
  if (cached) return cached

  const pcached = pcacheGet(k)
  if (pcached && !isOnline()) return pcached

  try {
    const { data, error } = await supabase.rpc('api_get_my_exercises', { p_user_id: user.id })
    if (error) throw error
    const list = data || []
    cacheSet(k, list, TTL.LONG)
    pcacheSet(k, list)
    return list
  } catch (e) {
    console.warn('[userExercises] load failed:', e?.message)
    return pcached || []
  }
}

/** Синхронно — то, что уже поднято в кэш (для первого кадра списка). */
export function getMyExercisesSync() {
  const user = getCurrentUser()
  if (!user) return []
  return cacheGet(key(user.id)) || pcacheGet(key(user.id)) || []
}

function dropCaches(userId) {
  cacheInvalidate(key(userId))
  // День тренировки собран с именами и метаданными — после правки он протух.
  // Инвалидируем по префиксу напрямую, а не через api.js: тот сам читает этот
  // модуль, и взаимный импорт двух модулей — лишний повод для тонких багов
  // порядка загрузки.
  cacheInvalidate('workout-day:')
}

/**
 * Завести своё упражнение. Возвращает id (`ux_…`).
 * Бросает Error с понятным текстом — форма показывает его как есть.
 */
export async function createMyExercise({ name, group, subGroup, meta, countsReps }) {
  const user = getCurrentUser()
  if (!user) throw new Error('Нет авторизации')
  if (!isOnline()) throw new Error('Нужен интернет — упражнение сохраняется на сервере')

  const { data, error } = await supabase.rpc('api_create_my_exercise', {
    p_user_id: user.id,
    p_name: name,
    p_group: group || '',
    p_sub_group: subGroup || '',
    p_meta: meta || '',
    p_counts_reps: !!countsReps
  })
  if (error) {
    console.error('[userExercises] create error:', error)
    throw new Error(
      /limit reached/.test(error.message || '')
        ? `Достигнут лимит — ${MY_EXERCISE_LIMIT} своих упражнений`
        : 'Не удалось сохранить. Попробуй ещё раз.'
    )
  }
  dropCaches(user.id)
  await loadMyExercises()
  return data
}

/** Переписать своё упражнение. */
export async function updateMyExercise(exerciseId, { name, group, subGroup, meta, countsReps }) {
  const user = getCurrentUser()
  if (!user) throw new Error('Нет авторизации')
  if (!isOnline()) throw new Error('Нужен интернет — упражнение сохраняется на сервере')

  const { error } = await supabase.rpc('api_update_my_exercise', {
    p_user_id: user.id,
    p_exercise_id: exerciseId,
    p_name: name,
    p_group: group || '',
    p_sub_group: subGroup || '',
    p_meta: meta || '',
    p_counts_reps: !!countsReps
  })
  if (error) {
    console.error('[userExercises] update error:', error)
    throw new Error('Не удалось сохранить. Попробуй ещё раз.')
  }
  dropCaches(user.id)
  await loadMyExercises()
  return true
}

/**
 * Убрать своё упражнение — НАСОВСЕМ. В базе не остаётся ничего: подходы прошлых
 * тренировок, заметка, история веса, любимое, слоты программ. Сами тренировки
 * (дата, длительность, серия) не трогаются — день в календаре остаётся на месте.
 *
 * Из программ оно вынимается, порядок в дне пересобирается подряд. День может
 * от этого опустеть — экран дня показывает состояние с выходом в конструктор.
 *
 * Возвращает, из скольких слотов программ его вынули.
 */
export async function deleteMyExercise(exerciseId) {
  const user = getCurrentUser()
  if (!user) throw new Error('Нет авторизации')
  if (!isOnline()) throw new Error('Нужен интернет')

  const { data, error } = await supabase.rpc('api_delete_my_exercise', {
    p_user_id: user.id,
    p_exercise_id: exerciseId
  })
  if (error) {
    console.error('[userExercises] delete error:', error)
    throw new Error('Не удалось удалить. Попробуй ещё раз.')
  }
  dropCaches(user.id)
  await loadMyExercises()
  return data ?? 0
}

/**
 * Скопировать себе личные упражнения автора программы, полученной от друга.
 *
 * Одолжить их нельзя: получателю нужно вести в них свой вес, а вес привязан
 * к упражнению. Поэтому они становятся его собственными — дальше он их правит
 * и удаляет наравне со своими. Данные берутся из снимка ссылки, а не из живой
 * строки автора: поделился он конкретной версией.
 *
 * Возвращает { ok, need, free, copied }. `ok: false` — не хватило места в лимите,
 * программа остаётся заблокированной, пока человек не освободит `need - free`.
 */
export async function adoptProgramExercises(programDbId) {
  const user = getCurrentUser()
  if (!user) throw new Error('Нет авторизации')
  if (!isOnline()) throw new Error('Нужен интернет')

  const { data, error } = await supabase.rpc('api_adopt_program_exercises', {
    p_user_id: user.id,
    p_program_id: programDbId
  })
  if (error) {
    console.error('[userExercises] adopt error:', error)
    throw new Error('Не удалось скопировать. Попробуй ещё раз.')
  }
  dropCaches(user.id)
  await loadMyExercises()
  return data || { ok: false, need: 0, free: 0, copied: 0 }
}

/**
 * Догрузить упражнения по конкретным id — для программы, сохранённой у друга:
 * в её слотах может стоять личное упражнение автора, которого нет ни в каталоге,
 * ни в своих. Без этого слот показал бы «подгруппа (тип)» вместо названия.
 * Строго по списку id, перебрать каталог так нельзя.
 */
export async function loadExercisesByIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean))]
  if (!list.length) return []
  const k = `ex-by-ids:${list.join(',')}`
  const cached = cacheGet(k) || pcacheGet(k)
  if (cached) return cached
  try {
    const { data, error } = await supabase.rpc('api_get_exercises_by_ids', { p_ids: list })
    if (error) throw error
    const rows = data || []
    cacheSet(k, rows, TTL.LONG)
    pcacheSet(k, rows)
    return rows
  } catch (e) {
    console.warn('[userExercises] by-ids failed:', e?.message)
    return []
  }
}
