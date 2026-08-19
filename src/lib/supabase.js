/**
 * Клиент Supabase — единственная точка подключения к базе.
 *
 * Использует переменные окружения VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY,
 * которые задаются в Vercel (Environment Variables) и в .env.local для локальной
 * разработки.
 *
 * ВАЖНО: префикс VITE_ обязателен, иначе Vite не отдаст переменную в браузер.
 *
 * Ключ читается и под старым именем VITE_SUPABASE_KEY — чтобы переименование
 * в Vercel можно было сделать без простоя: сначала выкатывается этот код,
 * потом добавляется переменная с новым именем, и только затем убирается старая.
 * Когда старой нигде не останется, фолбэк можно снять.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY

// Защита от запуска без переменных — даём понятную ошибку в консоли
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '⚠️ Supabase не настроен. Проверь переменные окружения VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '', {
  auth: {
    persistSession: false, // нам пока не нужны сессии — авторизуем через Telegram отдельно
    autoRefreshToken: false
  }
})
