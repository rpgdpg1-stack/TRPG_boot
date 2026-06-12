/**
 * Пользовательские программы: своя (custom) и от друга (shared).
 *
 * Грузятся из БД через RPC и вливаются в реестр (registry.setUserPrograms),
 * после чего работают через те же геттеры, что и статические Сплит/Заплыв —
 * экран дня, замены, веса, заметки, завершение тренировки не требуют правок.
 *
 * Оффлайн: список программ кэшируется в localStorage и поднимается синхронно
 * при старте (hydrateUserProgramsFromCache), чтобы карточки и дни были доступны
 * даже после перезапуска без сети.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/auth'
import { setUserPrograms } from './registry'
import { localGet, localSet, localRemove } from '../../utils/storage'

const CACHE_KEY = 'user-programs'

const EMOJI = { custom: '💪', shared: '🤝' }
const TAGS = { custom: ['своя'], shared: ['от друга'] }

/**
 * Преобразовать строку из api_get_my_programs в объект реестра.
 * Поле days уже приходит в форме split.js: { A: [{ order_num, muscle_group,
 * sub_group, type, default_exercise_id }], ... } — кладём как есть.
 */
function mapToRegistry(p) {
  const source = p.source
  return {
    slug: source === 'custom' ? 'my' : 'friend',
    dbId: p.id,
    title: p.name,
    emoji: EMOJI[source] || '💪',
    tags: TAGS[source] || [],
    category: 'gym',
    available: true,
    comingSoon: false,
    source,                         // 'custom' | 'shared'
    editable: !!p.editable,         // редактировать можно только свою
    authorId: p.author_id || null,
    authorName: p.author_name || null,
    data: { days: p.days || {} }
  }
}

/**
 * Синхронно поднять программы из localStorage в реестр.
 * Зовётся в App.jsx до авторизации — даёт мгновенную доступность и оффлайн.
 */
export function hydrateUserProgramsFromCache() {
  const raw = localGet(CACHE_KEY)
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    if (Array.isArray(list)) {
      setUserPrograms(list)
      return list
    }
  } catch { /* ignore */ }
  return []
}

/**
 * Загрузить программы пользователя из БД, влить в реестр и кэш.
 * При ошибке/оффлайне — откатываемся на кэш.
 */
export async function loadMyPrograms() {
  const user = getCurrentUser()
  if (!user) return []
  try {
    const { data, error } = await supabase.rpc('api_get_my_programs', { p_user_id: user.id })
    if (error) {
      console.warn('[customProgram] loadMyPrograms RPC error:', error?.message)
      return hydrateUserProgramsFromCache()
    }
    const list = (data || []).map(mapToRegistry)
    setUserPrograms(list)
    localSet(CACHE_KEY, JSON.stringify(list))
    return list
  } catch (e) {
    console.warn('[customProgram] loadMyPrograms exception:', e?.message)
    return hydrateUserProgramsFromCache()
  }
}

/**
 * Сохранить/пересобрать свою программу.
 * days: [{ exercises: ['ex_001', ...] }, ...] — 1..3 дня, ≤10 упр/день.
 * Возвращает id программы ('usr_<id>') или бросает ошибку валидации из RPC.
 */
export async function saveMyProgram(name, days) {
  const user = getCurrentUser()
  if (!user) return null
  const { data, error } = await supabase.rpc('api_save_my_program', {
    p_user_id: user.id,
    p_name: name,
    p_days: days
  })
  if (error) {
    console.error('[customProgram] saveMyProgram error:', error)
    throw error
  }
  await loadMyPrograms()
  return data
}

/**
 * Удалить программу пользователя (свою или от друга) по dbId.
 */
export async function deleteMyProgram(programId) {
  const user = getCurrentUser()
  if (!user) return false
  const { data, error } = await supabase.rpc('api_delete_my_program', {
    p_user_id: user.id,
    p_program_id: programId
  })
  if (error) {
    console.error('[customProgram] deleteMyProgram error:', error)
    return false
  }
  await loadMyPrograms()
  return !!data
}

/**
 * Поделиться своей программой — вернуть токен для ссылки.
 */
export async function shareMyProgram(programId) {
  const user = getCurrentUser()
  if (!user) return null
  const { data, error } = await supabase.rpc('api_share_my_program', {
    p_user_id: user.id,
    p_program_id: programId
  })
  if (error) {
    console.error('[customProgram] shareMyProgram error:', error)
    return null
  }
  return data
}

/**
 * Прочитать снимок программы по токену (для модалки сохранения).
 */
export async function getSharedProgram(token) {
  const { data, error } = await supabase.rpc('api_get_shared_program', { p_token: token })
  if (error) {
    console.error('[customProgram] getSharedProgram error:', error)
    return null
  }
  return data
}

/**
 * Сохранить программу от друга по токену (под frnd_<id>, перезаписывает старую).
 * Возвращает id ('frnd_<id>') или бросает ошибку из RPC.
 */
export async function saveFriendProgram(token) {
  const user = getCurrentUser()
  if (!user) return null
  const { data, error } = await supabase.rpc('api_save_friend_program', {
    p_user_id: user.id,
    p_token: token
  })
  if (error) {
    console.error('[customProgram] saveFriendProgram error:', error)
    throw error
  }
  await loadMyPrograms()
  return data
}

/**
 * Каталог упражнений для конструктора/пикера. Прямой select (RLS exercises =
 * public read) — нужен muscle_group, которого нет в api_get_all_exercises.
 * Кэшируем в памяти модуля на время сессии.
 */
let _catalog = null
export async function loadExerciseCatalog() {
  if (_catalog) return _catalog
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, sub_group, type, preview_url, priority')
    .order('priority', { ascending: true })
  if (error) {
    console.error('[customProgram] loadExerciseCatalog error:', error)
    return []
  }
  _catalog = data || []
  return _catalog
}

/**
 * Сбросить кэш и реестр пользовательских программ (например при сбросе данных).
 */
export function clearUserProgramsCache() {
  localRemove(CACHE_KEY)
  setUserPrograms([])
}