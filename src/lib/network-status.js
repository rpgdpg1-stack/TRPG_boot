/**
 * Отслеживание статуса сети: онлайн / оффлайн.
 *
 * Зачем отдельный модуль, а не просто navigator.onLine:
 * navigator.onLine ВРЁТ. Он показывает true если есть подключение к роутеру/
 * сотовой сети, даже когда реального доступа в интернет нет (типичная ситуация
 * в зале: телефон цепляется к Wi-Fi зала, но интернета за ним нет). Поэтому
 * кроме браузерных событий мы периодически пингуем Supabase лёгким запросом.
 *
 * Архитектура:
 *  - isOnline() — текущий статус (синхронно, из памяти)
 *  - onNetworkChange(handler) — подписка на смену статуса, возвращает отписку
 *  - browser online/offline события → мгновенная реакция
 *  - ping каждые PING_INTERVAL_MS → ловит "мёртвый Wi-Fi" который браузер
 *    считает живым
 *  - checkNow() — форсированная проверка (зовём при старте и при возврате
 *    приложения из фона)
 *
 * Событие смены статуса шлём через тот же шину что и остальное приложение
 * (lib/events.js), имя — NETWORK_CHANGED.
 */

import { emit } from './events'

// Имя события смены сети. Кладём прямо тут (а не в events.js EVENTS),
// потому что это внутренняя деталь сетевого слоя — другие модули
// подписываются через onNetworkChange(), а не через EVENTS напрямую.
const NETWORK_CHANGED = 'network-changed'

// Как часто пинговать когда вкладка активна. 20 сек — баланс между
// "быстро заметить что сеть вернулась" и "не долбить сервер".
const PING_INTERVAL_MS = 20 * 1000

// Таймаут одного пинга. Если Supabase не ответил за 5 сек — считаем оффлайн.
const PING_TIMEOUT_MS = 5 * 1000

// URL для пинга. Берём из той же переменной что и Supabase-клиент.
// Дёргаем /auth/v1/health — лёгкий публичный эндпоинт, не требует ключа,
// отвечает быстро. Если его не будет — упадём в catch и сочтём оффлайн,
// что безопасно (лучше ложный оффлайн чем ложный онлайн).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const PING_URL = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/health` : ''

// Текущий статус в памяти. Стартуем с того что говорит браузер —
// потом первый ping уточнит.
let online = typeof navigator !== 'undefined' ? navigator.onLine : true

let pingTimer = null
let started = false

/**
 * Текущий статус сети. Синхронно, из памяти — можно звать на каждый рендер.
 */
export function isOnline() {
  return online
}

/**
 * Подписаться на смену статуса сети.
 * handler получает boolean (true = онлайн). Возвращает функцию отписки.
 */
export function onNetworkChange(handler) {
  const wrapped = (e) => handler(e.detail)
  window.addEventListener(NETWORK_CHANGED, wrapped)
  return () => window.removeEventListener(NETWORK_CHANGED, wrapped)
}

/**
 * Внутреннее: меняем статус и, если он реально изменился, шлём событие.
 */
function setStatus(next) {
  if (next === online) return
  online = next
  console.log('[network] status changed →', online ? 'ONLINE' : 'OFFLINE')
  emit(NETWORK_CHANGED, online)
}

/**
 * Реальная проверка сети пингом Supabase.
 * navigator.onLine === false — сразу оффлайн, не тратим пинг.
 * Иначе пробуем достучаться до сервера с таймаутом.
 */
export async function checkNow() {
  // Браузер уверенно говорит "сети нет" — верим, пинг не нужен
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus(false)
    return false
  }

  // Нет URL для пинга (переменные не настроены) — полагаемся на браузер
  if (!PING_URL) {
    setStatus(typeof navigator !== 'undefined' ? navigator.onLine : true)
    return online
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)

    // cache: 'no-store' — чтобы не получить закешированный ответ и не
    // принять мёртвую сеть за живую. mode по умолчанию — health отвечает.
    await fetch(PING_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    })

    clearTimeout(timeout)
    // Дошли до сервера (даже если статус не 200 — главное что ответил) → онлайн
    setStatus(true)
    return true
  } catch (e) {
    // abort по таймауту или сетевая ошибка → оффлайн
    setStatus(false)
    return false
  }
}

/**
 * Запустить мониторинг. Безопасно звать многократно — стартует один раз.
 * Вызывается из App.jsx при инициализации приложения.
 */
export function startNetworkMonitor() {
  if (started) return
  started = true

  // Браузерные события — мгновенная реакция на смену сети
  window.addEventListener('online', () => {
    console.log('[network] browser fired "online", verifying with ping...')
    // Браузер сказал "online" — но это может быть мёртвый Wi-Fi.
    // Проверяем пингом прежде чем поверить.
    checkNow()
  })

  window.addEventListener('offline', () => {
    console.log('[network] browser fired "offline"')
    // "offline" от браузера — доверяем сразу, пинг не нужен
    setStatus(false)
  })

  // Когда вкладка/приложение возвращается из фона (Telegram свернули-развернули)
  // — сразу проверяем сеть, чтобы статус был актуальным к моменту когда юзер
  // снова смотрит на экран.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkNow()
    }
  })

  // Периодический пинг пока приложение активно
  pingTimer = setInterval(() => {
    // Пингуем только когда вкладка видима — не жжём батарею в фоне
    if (document.visibilityState === 'visible') {
      checkNow()
    }
  }, PING_INTERVAL_MS)

  // Первая проверка сразу при старте
  checkNow()
}

/**
 * Остановить мониторинг (на случай если понадобится — сейчас не используется,
 * но пусть будет для чистоты).
 */
export function stopNetworkMonitor() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
  started = false
}