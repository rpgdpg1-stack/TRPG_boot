/**
 * Вход в ДЕВ-СБОРКЕ без ввода кода с почты. Только для локальной разработки.
 *
 * Зачем. В браузере приложение просит код на почту, в Telegram — работает по
 * подписи initData. Ни то ни другое не годится, когда экран надо просто
 * ОТКРЫТЬ И ПОСМОТРЕТЬ: браузерные инструменты (Playwright, Chrome DevTools)
 * упирались в форму входа, и вёрстку приходилось проверять на времянках вместо
 * настоящих экранов с настоящими данными.
 *
 * КАК ЭТО ТЕПЕРЬ РАБОТАЕТ САМО. Токен обновления у Supabase ОДНОРАЗОВЫЙ: им
 * воспользовались — выдан новый, старый мёртв. Поэтому строка в `.env.local`
 * сгорала на первом же запуске в чистом профиле браузера, и вход приходилось
 * повторять руками через почту. Теперь так:
 *   1. при старте dev-сборки, если своей сессии нет, спрашиваем токен у
 *      dev-сервера (`GET /__dev-session`, см. scripts/dev-session-plugin.mjs);
 *   2. меняем его на живую сессию;
 *   3. КАЖДЫЙ новый токен (после входа руками, после планового обновления
 *      сессии) отправляем обратно на dev-сервер — он кладёт его в
 *      `.dev-session.json`.
 * Отсюда главное следствие: достаточно ОДИН раз войти по коду с почты в
 * браузере — дальше любая новая вкладка и любой чистый профиль входят сами.
 *
 * Безопасность:
 *  - `import.meta.env.DEV` — константа сборки: в боевом бандле всё тело
 *    функций удаляется целиком, кода просто нет;
 *  - ручка `/__dev-session` живёт только в dev-сервере Vite (`apply: 'serve'`);
 *  - `.dev-session.json` и `.env.local` — в .gitignore, лежат на твоей машине.
 *    Токен утёк — выйти из всех сессий в Supabase, старый умрёт сразу.
 *
 * Ничего не помогло (перерыв в несколько месяцев, сессии сброшены) — приложение
 * просто покажет обычную форму почты. Один вход руками всё чинит.
 */
import { supabase } from './supabase'

const ROUTE = '/__dev-session'

/** Отдать dev-серверу свежий токен, чтобы следующий запуск вошёл сам. */
async function запомнить(token) {
  if (!import.meta.env.DEV || !token) return
  try {
    await fetch(ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token })
    })
  } catch { /* нет dev-сервера — не беда, это лишь удобство */ }
}

/**
 * Следить за сессией и сохранять каждый новый токен обновления.
 * Ставится один раз при старте dev-сборки — в том числе ДО входа, чтобы
 * поймать ручной вход по коду с почты.
 */
export function watchDevSession() {
  if (!import.meta.env.DEV) return
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (session?.refresh_token) запомнить(session.refresh_token)
    }
  })
}

export async function restoreDevSession() {
  if (!import.meta.env.DEV) return false

  try {
    // Своя сессия уже есть (входил в этом браузере) — она главнее.
    const { data } = await supabase.auth.getSession()
    if (data?.session) {
      запомнить(data.session.refresh_token)
      return true
    }

    let token = null
    try {
      const res = await fetch(ROUTE)
      const json = await res.json()
      token = json?.refresh_token || null
    } catch { /* dev-сервер без плагина — попробуем строку из .env.local */ }
    if (!token) token = import.meta.env.VITE_DEV_REFRESH_TOKEN || null
    if (!token) return false

    const { data: fresh, error } = await supabase.auth.refreshSession({ refresh_token: token })
    if (error) {
      console.warn('[dev-auth] сохранённый токен не сработал:', error.message,
        '— войди один раз по коду с почты, дальше вход снова станет автоматическим')
      return false
    }
    // Новый токен сразу на диск: старый уже сгорел в этом же запросе.
    запомнить(fresh?.session?.refresh_token)
    console.info('[dev-auth] вошли по сохранённому токену (только dev-сборка)')
    return true
  } catch (e) {
    console.warn('[dev-auth] не вышло:', e?.message)
    return false
  }
}
