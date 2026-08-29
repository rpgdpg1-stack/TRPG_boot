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
import { invalidateWorkoutDayCache } from './api'
import { localGet, localSet } from '../../utils/storage'
import { pcacheGet, pcacheSet, CATALOG_VERSION } from '../../lib/persistent-cache'
import { canReadServer, canTrust } from '../../lib/session'

import { isTelegramEnv } from '../../lib/telegram'

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

const CACHE_KEY = 'user-programs'

const EMOJI = { custom: '💪', shared: '🤝' }
// Тег «своя» убран — у кастомной программы вместо него показываются места
// (Зал/Дом/Улица) из data.locations. Программе от друга тег пока оставляем.
const TAGS = { custom: [], shared: ['от друга'] }

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
    // Сколько личных упражнений автора ещё не скопировано себе. > 0 — программа
    // ЗАБЛОКИРОВАНА: открыть её нельзя, пока они не станут своими (вес привязан
    // к упражнению, а чужое личное упражнение весом не наполнишь).
    pendingCustom: p.pending_custom || 0,
    // days — набор «Зал» (для экрана дня, совместимость); locations — карта по
    // местам { gym:{A:[...]}, home:{...}, outdoor:{...} } для карточек/конструктора.
    data: { days: p.days || {}, locations: p.locations || {} }
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
  // Без сети или сессии база отдаёт пустой список своих программ — раньше он
  // затирал кеш, и своя программа с программой друга просто исчезали.
  if (!canReadServer()) return hydrateUserProgramsFromCache()
  try {
    const { data, error } = await supabase.rpc('api_get_my_programs', { p_user_id: user.id })
    if (!canTrust(error)) {
      if (error) console.warn('[customProgram] loadMyPrograms RPC error:', error?.message)
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
 * dayCount: 1..3 (общее число дней A/B/C).
 * byLocation: { gym: [ ['ex_001',...], ... ], home: [...], outdoor: [...] } —
 *   ключ места → массив дней, день → массив exercise_id. Пустые дни/места
 *   можно не передавать; RPC их пропускает. ≤10 упр/день.
 * Возвращает id программы ('usr_<id>') или бросает ошибку валидации из RPC.
 */
export async function saveMyProgram(name, dayCount, byLocation) {
  const user = getCurrentUser()
  if (!user) return null
  const { data, error } = await supabase.rpc('api_save_my_program', {
    p_user_id: user.id,
    p_name: name,
    p_day_count: dayCount,
    p_days: byLocation
  })
  if (error) {
    console.error('[customProgram] saveMyProgram error:', error)
    throw error
  }
  await loadMyPrograms()
  invalidateWorkoutDayCache()
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
  invalidateWorkoutDayCache()
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
 * Поделиться программой.
 *
 * Ссылка зависит от того, ОТКУДА делятся. Из Telegram — telegram-ссылка
 * на мини-приложение. Из браузера — обычная ссылка на сайт: человек, сидящий
 * в браузере, шлёт её кому угодно, и получатель не обязан открывать Telegram,
 * чтобы посмотреть программу.
 *
 * Раньше проверка была `tg && tg.openTelegramLink` — и она врала: SDK Telegram
 * подключён на странице всегда, в браузере тоже, поэтому браузерная ветка
 * не срабатывала никогда и наружу всегда уходила telegram-ссылка.
 * Правильный признак — подписанный initData, он есть только внутри Telegram.
 */
export async function shareProgramLink(programId) {
  const token = await shareMyProgram(programId)
  if (!token) {
    window.alert('Не удалось создать ссылку. Попробуй ещё раз.')
    return false
  }

  const text = '💪🏻 Попробуй мою программу тренировок в TRPG'

  if (isTelegramEnv() && typeof tg?.openTelegramLink === 'function') {
    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'YourBot'
    const appName = import.meta.env.VITE_APP_NAME || 'app'
    const link = `https://t.me/${botUsername}/${appName}?startapp=share_${token}`
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
    tg.openTelegramLink(shareUrl)
    return true
  }

  const webLink = `${window.location.origin}/?share=${encodeURIComponent(token)}`

  // Родное меню «Поделиться» есть почти на всех телефонах — оно удобнее
  // буфера, потому что сразу предлагает мессенджеры.
  if (navigator.share) {
    try {
      await navigator.share({ title: 'TRPG', text, url: webLink })
      return true
    } catch (e) {
      // Человек закрыл меню — это не ошибка, молча уходим в копирование.
      if (e?.name === 'AbortError') return false
    }
  }

  try {
    await navigator.clipboard.writeText(webLink)
    window.alert(`Ссылка скопирована:\n${webLink}`)
    return true
  } catch {
    window.alert(`Скопируй ссылку:\n${webLink}`)
    return false
  }
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

const PENDING_SHARE_KEY = 'pending-share-token'

/**
 * Забрать токен из адреса и запомнить. Вызывается ОДИН раз при старте
 * приложения, до авторизации.
 *
 * Почему до: по ссылке приходят чаще всего БЕЗ аккаунта, и до модалки
 * сохранения человек доберётся только после входа по почте. Если ждать
 * авторизации, токен потеряется по дороге. А из адреса его убираем сразу,
 * иначе ссылка сработает второй раз при обновлении страницы.
 */
export function captureShareToken() {
  const fromUrl = new URLSearchParams(window.location.search).get('share')
  if (!fromUrl) return
  try { sessionStorage.setItem(PENDING_SHARE_KEY, fromUrl) } catch { /* приватный режим */ }
  window.history.replaceState({}, '', window.location.pathname)
}

/**
 * Токен программы, по ссылке которой пришли: из start_param Telegram
 * (префикс 'share_') или из запомненного браузерного (см. captureShareToken).
 */
export function getStartParamShareToken() {
  const param = tg?.initDataUnsafe?.start_param
  if (param && param.startsWith('share_')) return param.slice('share_'.length)
  try { return sessionStorage.getItem(PENDING_SHARE_KEY) } catch { return null }
}

/** Забыть токен — программа сохранена или человек отказался. */
export function clearPendingShareToken() {
  try { sessionStorage.removeItem(PENDING_SHARE_KEY) } catch { /* ignore */ }
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
  invalidateWorkoutDayCache()
  return data
}

/**
 * Каталог упражнений для конструктора/пикера. Прямой select (RLS exercises =
 * public read) — нужен muscle_group, которого нет в api_get_all_exercises.
 * Кэшируем в памяти модуля на время сессии.
 */
let _catalog = null
// Свой набор полей (нужен muscle_group), поэтому и кеш свой — но версия общая
// с остальным каталогом: поднимается один раз в persistent-cache.js.
const CATALOG_PCACHE_KEY = `constructor-catalog-v${CATALOG_VERSION}`

export async function loadExerciseCatalog() {
  if (_catalog) return _catalog

  // Раньше каталог жил только в переменной модуля и пропадал при каждой
  // перезагрузке: конструктор открывался с пустым списком и подгружал всё
  // заново. Каталог меняется редко — диску его можно доверить.
  const fromDisk = pcacheGet(CATALOG_PCACHE_KEY)
  if (fromDisk?.length) {
    _catalog = fromDisk
    // Кеш отдали сразу — экран открывается мгновенно и работает без сети.
    // Параллельно тихо ходим за свежим: новые упражнения и заменённые
    // картинки подхватятся к следующему открытию, а не через неделю.
    refreshCatalogInBackground()
    return _catalog
  }

  const fresh = await fetchCatalog()
  if (fresh.length) {
    _catalog = fresh
    pcacheSet(CATALOG_PCACHE_KEY, _catalog)
  }
  return _catalog || []
}

async function fetchCatalog() {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, sub_group, type, preview_url, priority')
    .is('archived_at', null)   // убранные из каталога в конструкторе не показываем
    .order('id', { ascending: true })
  if (error) {
    console.error('[customProgram] loadExerciseCatalog error:', error)
    return []
  }
  return data || []
}

// Обновление в фоне: ошибки глушим — офлайн это норма, у нас уже есть кеш.
let _refreshing = false
function refreshCatalogInBackground() {
  if (_refreshing) return
  _refreshing = true
  fetchCatalog()
    .then(fresh => {
      if (fresh.length) {
        _catalog = fresh
        pcacheSet(CATALOG_PCACHE_KEY, fresh)
      }
    })
    .catch(() => { /* нет сети — остаёмся на кеше */ })
    .finally(() => { _refreshing = false })
}
