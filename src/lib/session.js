/**
 * Страж сессии: есть ли у нас ПРАВО читать свои данные с сервера.
 *
 * Зачем отдельный модуль. Все пользовательские RPC (`api_get_user_weights`,
 * `api_get_user_note`, `api_get_user_swaps`, `api_get_my_prefs`, любимые,
 * рекорды, друзья) берут человека НЕ из параметра, а из подписи сессии —
 * `current_user_id()` внутри функции. Параметр `p_user_id` там игнорируется.
 * Отсюда главная ловушка: без живой сессии эти функции возвращают ПУСТО
 * И БЕЗ ОШИБКИ. Для клиента это неотличимо от честного «у тебя ничего нет»,
 * и пустота уезжала в кеш поверх настоящих данных.
 *
 * Так и пропадали заметки и рабочие веса в Telegram: вход там делается заново
 * при каждом запуске (подпись initData → Edge Function → сессия), и на плохой
 * связи он не доходил до конца. Сессии нет → сервер отвечает пустотой → пустота
 * ложится в localStorage на неделю → «заметки исчезли, вес 0», причём насовсем,
 * потому что дальше читался уже кеш и в сеть никто не шёл. В браузере вход
 * другой (сессия по почте лежит на диске и живёт долго) — там всё было цело.
 *
 * Правило, которое вводит этот модуль:
 *   • `canReadServer()` — идти ли в сеть за пользовательскими данными вообще;
 *   • `canTrust(error)` — можно ли ЗАПИСАТЬ полученный ответ в кеш.
 * Нет сессии → не ходим и не пишем, показываем то, что уже знаем о человеке.
 *
 * Статус держим синхронно (читать его приходится на каждый рендер и перед
 * каждым запросом): первичное значение снимаем прямо с диска, дальше его
 * ведёт `onAuthStateChange` супабейз-клиента.
 */

import { supabase } from './supabase'
import { isOnline, checkNow } from './network-status'
import { EVENTS, emit } from './events'
import { debug } from './debug'

// Есть ли сессия. Стартовое значение — синхронно с диска (см. readTokenFromDisk),
// потому что первые запросы уходят раньше, чем ответит getSession().
let sessionAlive = readTokenFromDisk()

// Авторизация завершилась неудачей (Telegram не смог обменять подпись на
// сессию). Отдельно от sessionAlive: «ещё не входили» и «вход сорвался» —
// разные вещи, вторая должна быть видна человеку как «нет связи».
let authBroken = false

/**
 * Синхронно посмотреть, лежит ли на диске токен сессии.
 *
 * Клиент supabase-js хранит его под ключом `sb-<ref>-auth-token`. Ref в имени
 * не хардкодим — ищем по форме ключа, чтобы переезд проекта ничего не сломал.
 */
function readTokenFromDisk() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('sb-') || !k.endsWith('-auth-token')) continue
      const raw = localStorage.getItem(k)
      if (!raw) continue

      // Формат значения зависит от версии клиента: обычно это JSON сессии,
      // но встречается и base64 с префиксом. Разбирать его до конца не нужно —
      // нам хватает факта, что токен там лежит. Ошибиться здесь не страшно:
      // через мгновение статус уточнит getSession() ниже.
      if (raw.includes('access_token')) return true
      if (raw.startsWith('base64-')) {
        try {
          if (atob(raw.slice(7)).includes('access_token')) return true
        } catch { /* не разобрали — идём дальше */ }
      }
    }
  } catch { /* приватный режим — считаем, что сессии нет */ }
  return false
}

/** Есть ли живая сессия (синхронно). */
export function hasSession() {
  return sessionAlive
}

/** Сорвался ли вход. Нужно плашке статуса: пустой экран должен быть объяснён. */
export function isAuthBroken() {
  return authBroken
}

/**
 * Можно ли идти на сервер за ПОЛЬЗОВАТЕЛЬСКИМИ данными.
 * Нет сети или нет сессии — нельзя: ответ будет либо ошибкой, либо пустотой.
 */
export function canReadServer() {
  return isOnline() && sessionAlive
}

/**
 * Можно ли верить ответу настолько, чтобы положить его в кеш.
 * Ошибка — нет. Нет сессии — нет (пустота там не факт, а следствие).
 *
 * Заодно ловим момент, когда запросы начали падать по сети: браузер считает
 * себя онлайн (типичный мёртвый Wi-Fi или еле живой VPN), а до сервера мы не
 * доходим. Просим сетевой монитор перепроверить — тогда загорится честный
 * «Офлайн», а не тишина при пустых экранах.
 */
export function canTrust(error) {
  if (error && looksLikeNetworkError(error)) checkNow()
  return !error && sessionAlive
}

/** Сетевая ли это ошибка (а не отказ базы вроде нарушенного ограничения). */
function looksLikeNetworkError(error) {
  const text = String(error?.message || error || '').toLowerCase()
  return text.includes('fetch') || text.includes('network') ||
    text.includes('timeout') || text.includes('load failed')
}

/**
 * Отметить состояние сессии. Зовёт авторизация; сюда же приходит
 * onAuthStateChange клиента.
 */
export function setSessionAlive(alive, { broken = null } = {}) {
  const wasAlive = sessionAlive
  const wasBroken = authBroken

  sessionAlive = !!alive
  if (broken !== null) authBroken = !!broken
  if (alive) authBroken = false

  if (wasAlive !== sessionAlive || wasBroken !== authBroken) {
    debug('[session] сессия:', sessionAlive ? 'ЕСТЬ' : 'НЕТ', '· вход сорван:', authBroken)
    emit(EVENTS.AUTH_STATE, { hasSession: sessionAlive, broken: authBroken })
  }
}

/** Пометить, что вход сорвался (сеть/сервер). Плашка покажет «Нет связи». */
export function markAuthBroken() {
  setSessionAlive(false, { broken: true })
}

// Клиент сам сообщает о входе, выходе и продлении токена — держим статус по нему.
supabase.auth.onAuthStateChange((event, session) => {
  setSessionAlive(!!session?.access_token)
})

// И уточняем стартовое значение: диск мог соврать (токен снесли из другой вкладки).
supabase.auth.getSession()
  .then(({ data }) => { setSessionAlive(!!data?.session?.access_token) })
  .catch(() => { /* не смогли спросить — остаёмся на том, что прочитали с диска */ })
