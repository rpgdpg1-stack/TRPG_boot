/**
 * Вход в ДЕВ-СБОРКЕ без ввода кода с почты. Только для локальной разработки.
 *
 * Зачем. В браузере приложение просит код на почту, в Telegram — работает по
 * подписи initData. Ни то ни другое не годится, когда экран надо просто
 * ОТКРЫТЬ И ПОСМОТРЕТЬ: браузерные инструменты (Playwright, Chrome DevTools)
 * упирались в форму входа, и вёрстку приходилось проверять на времянках вместо
 * настоящих экранов с настоящими данными.
 *
 * Как работает. В `.env.local` кладётся `VITE_DEV_REFRESH_TOKEN` — токен
 * обновления живой сессии (берётся один раз из localStorage браузера, где вход
 * уже сделан руками). При старте dev-сборки, если своей сессии нет, он
 * меняется на полноценную — дальше приложение работает ровно как в бою: те же
 * RPC, та же приватность, тот же пользователь.
 *
 * Безопасность:
 *  - `import.meta.env.DEV` — константа сборки: в боевом бандле всё тело
 *    функции удаляется целиком, кода просто нет;
 *  - `.env.local` в .gitignore и в репозиторий не попадает;
 *  - токен = доступ к аккаунту, поэтому он и живёт только на твоей машине.
 *    Утёк — смени пароль... точнее, выйди из всех сессий в Supabase, старый
 *    токен сразу умрёт.
 *
 * Токен протух (после долгого перерыва) — вход просто не сработает, приложение
 * покажет обычную форму почты. Тогда войти руками один раз и обновить строку
 * в `.env.local` (я умею забирать её из браузера сам).
 */
import { supabase } from './supabase'

export async function restoreDevSession() {
  if (!import.meta.env.DEV) return false

  const token = import.meta.env.VITE_DEV_REFRESH_TOKEN
  if (!token) return false

  try {
    // Своя сессия уже есть (входил в этом браузере) — она главнее.
    const { data } = await supabase.auth.getSession()
    if (data?.session) return true

    const { error } = await supabase.auth.refreshSession({ refresh_token: token })
    if (error) {
      console.warn('[dev-auth] токен из .env.local не сработал:', error.message)
      return false
    }
    console.info('[dev-auth] вошли по токену из .env.local (только dev-сборка)')
    return true
  } catch (e) {
    console.warn('[dev-auth] не вышло:', e?.message)
    return false
  }
}
