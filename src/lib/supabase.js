/**
 * Клиент Supabase — единственная точка подключения к базе.
 *
 * Использует переменные окружения VITE_SUPABASE_URL и VITE_SUPABASE_KEY,
 * которые задаются в Vercel (Environment Variables) и в .env.local для локальной разработки.
 *
 * ВАЖНО: префикс VITE_ обязателен, иначе Vite не отдаст переменную в браузер.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

// Защита от запуска без переменных — даём понятную ошибку в консоли
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '⚠️ Supabase не настроен. Проверь переменные окружения VITE_SUPABASE_URL и VITE_SUPABASE_KEY.'
  )
}

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '', {
  auth: {
    persistSession: false, // нам пока не нужны сессии — авторизуем через Telegram отдельно
    autoRefreshToken: false
  }
})
