/**
 * Настройки приватности профиля. Хранятся в БД (users.show_*), чтобы применялись
 * и к тому, что видят друзья, и к своему профилю. Читаем из кешированного юзера,
 * пишем через RPC api_update_privacy + оптимистично обновляем кеш.
 *
 * Дефолты: последняя тренировка — вкл; статистика/любимые — выкл; веса — вкл.
 */
import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'

export function getPrivacy() {
  const u = getCurrentUser()
  return {
    showLastWorkout: u?.show_last_workout ?? true,
    showStats: u?.show_stats ?? false,
    showFavorites: u?.show_favorites ?? false,
    showWeights: u?.show_weights ?? true
  }
}

export async function savePrivacy(p) {
  const u = getCurrentUser()
  if (!u) return
  // Оптимистично обновляем кеш — UI реагирует сразу.
  setCurrentUser({
    ...u,
    show_last_workout: p.showLastWorkout,
    show_stats: p.showStats,
    show_favorites: p.showFavorites,
    show_weights: p.showWeights
  })
  try {
    await supabase.rpc('api_update_privacy', {
      p_show_last_workout: p.showLastWorkout,
      p_show_stats: p.showStats,
      p_show_favorites: p.showFavorites,
      p_show_weights: p.showWeights
    })
  } catch (e) {
    console.warn('[privacy] save failed:', e?.message)
  }
}
