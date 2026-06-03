import { useState, useRef, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import Loader from './components/layout/Loader'
import ErrorBoundary from './components/layout/ErrorBoundary'
import TabBar from './components/TabBar'
import ParticlesBg from './components/ParticlesBg'
import LeagueBadgeModal from './components/rewards/LeagueBadgeModal'
import SeasonEndModal from './components/rewards/SeasonEndModal'
import NewSeasonModal from './components/rewards/NewSeasonModal'

import Home from './pages/Home'
import Category from './pages/Category'
import WorkoutDay from './pages/WorkoutDay'
import SwapExercise from './pages/SwapExercise'
import Recovery from './pages/Recovery'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Leaderboard from './pages/Leaderboard'
import Rewards from './pages/Rewards'
import ExerciseInfo from './pages/ExerciseInfo'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth, getCurrentUser, setCurrentUser } from './lib/auth'
import { getPendingRewards, markRewardShown } from './lib/rewards'
import { loadFavoritesEntries, getActiveDay } from './lib/storage'
import { getProgramBySlug } from './features/programs/registry'
import { getCurrentSeason, getDaysUntilSeasonEnd } from './utils/season'
import { supabase } from './lib/supabase'
import { EVENTS, on } from './lib/events'
import { checkAndResetSeasonIfNeeded } from './lib/season-reset'
import { startNetworkMonitor, onNetworkChange } from './lib/network-status'
import { syncQueue } from './lib/sync-engine'
import OfflineBanner from './components/OfflineBanner'

export default function App() {
  const [loading, setLoading] = useState(true)

  const authPromiseRef = useRef(null)
  if (authPromiseRef.current === null) {
    initTelegram()
    startNetworkMonitor() // запускаем детектор сети как можно раньше
    authPromiseRef.current = ensureAuth().catch(err => {
      console.error('[App] ensureAuth failed:', err)
      return null
    })
  }

  useEffect(() => {
    let cancelled = false
    authPromiseRef.current?.then(user => {
      if (cancelled || !user) return
      checkAndResetSeasonIfNeeded()
      // После авторизации — пробуем разгрести очередь (вдруг с прошлого
      // раза остались несинканутые операции и сеть уже есть).
      syncQueue()
      // Предзагружаем избранное в кеш, чтобы на главной карточка появилась
      // сразу вместе с остальным контентом, без мигания.
      loadFavoritesEntries(async (slug) => {
        const prog = getProgramBySlug(slug)
        if (!prog) return null
        const activeDay = await getActiveDay(slug)
        return { prog, activeDay }
      }).catch(() => {})
    })

    // Когда сеть возвращается — запускаем синк очереди.
    const offNet = onNetworkChange((isOnline) => {
      if (isOnline) {
        console.log('[App] сеть вернулась → запускаем syncQueue')
        syncQueue()
      }
    })

    return () => {
      cancelled = true
      offNet()
    }
  }, [])

  if (loading) {
    return (
      <Loader
        readyPromise={authPromiseRef.current}
        onFinish={() => setLoading(false)}
      />
    )
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <OfflineBanner />
        <ParticlesBg />

        <SettingsButtonController />
        <RewardsQueueController />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
          <Route path="/swap/:programId/:day/:orderNum" element={<SwapExercise />} />
          
          <Route path="/profile" element={<Profile />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/exercise/:id" element={<ExerciseInfo />} />
        </Routes>

        <TabBar />
      </div>
    </ErrorBoundary>
  )
}

function SettingsButtonController() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/settings') {
      settingsButton.hide()
    } else {
      settingsButton.show(() => navigate('/settings'))
    }
  }, [location.pathname, navigate])

  return null
}

/**
 * Контроллер очереди наград и сезонных событий.
 *
 * Очередь модалок (показываются по одной):
 *  1. Значки лиг (LeagueBadgeModal) — отсортированы по возрастанию ранга
 *  2. Сезонные рамки (SeasonEndModal) — за прошлые сезоны
 *  3. Приветствие нового сезона (NewSeasonModal) — если сменился сезон
 *
 * Источники значков:
 *  - getPendingRewards() при старте — накопленные за прошлые сессии
 *  - событие BADGE_EARNED — свежевыданный значок ПРЯМО СЕЙЧАС, добавляется
 *    в очередь моментально, чтобы модалка появилась без перезахода
 *
 * Дедупликация: при добавлении значка через BADGE_EARNED проверяем что
 * такого rank_index ещё нет в очереди (защита от дублей если событие
 * прилетит дважды). Также не добавляем если модалка такого rank_index
 * уже показывается (queue[0]).
 *
 * Для новых юзеров (last_seen_season = NULL) модалку NewSeasonModal НЕ
 * показываем — тихо проставляем текущий сезон в БД.
 */
function RewardsQueueController() {
  const [queue, setQueue] = useState([])

  // Базовая загрузка очереди — стартовая + при USER_CHANGED.
  // Свежие значки догружаются через отдельный эффект на BADGE_EARNED.
  useEffect(() => {
    let cancelled = false

    const buildQueue = async () => {
      const items = []

      const { badges, frames } = await getPendingRewards()
      if (badges?.length) {
        const sortedBadges = [...badges].sort((a, b) => a.rank_index - b.rank_index)
        for (const b of sortedBadges) items.push({ type: 'badge', payload: b })
      }

      if (frames?.length) {
        const sortedFrames = [...frames].sort((a, b) => a.place - b.place)
        for (const f of sortedFrames) items.push({ type: 'frame', payload: f })
      }

      const user = getCurrentUser()
      const currentSeason = getCurrentSeason()

      if (user && currentSeason) {
        if (user.last_seen_season === null || user.last_seen_season === undefined) {
          try {
            await supabase
              .from('users')
              .update({ last_seen_season: currentSeason.key })
              .eq('id', user.id)
            setCurrentUser({ ...user, last_seen_season: currentSeason.key })
          } catch (e) {
            console.warn('[App] silent last_seen_season init failed:', e?.message)
          }
        } else if (user.last_seen_season !== currentSeason.key) {
          items.push({
            type: 'new_season',
            payload: {
              season: currentSeason,
              daysLeft: getDaysUntilSeasonEnd()
            }
          })
        }
      }

      if (!cancelled) setQueue(items)
    }

    buildQueue()

    const offChanged = on(EVENTS.USER_CHANGED, buildQueue)
    return () => {
      cancelled = true
      offChanged()
    }
  }, [])

  // Подписка на свежевыданные значки. Когда юзер только что пересёк порог —
  // добавляем значок в начало очереди (после текущего показываемого),
  // чтобы модалка появилась моментально.
  useEffect(() => {
    const handler = async (evt) => {
      const rankIndex = evt?.detail?.rank_index
      if (rankIndex === null || rankIndex === undefined) return

      console.log('[App] BADGE_EARNED received, rank_index =', rankIndex)

      // Получаем актуальный id записи из БД, чтобы потом markRewardShown
      // сработал по правильному id. Запись уже создана RPC, ищем её.
      const user = getCurrentUser()
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('league_badges')
          .select('id, rank_index')
          .eq('user_id', user.id)
          .eq('rank_index', rankIndex)
          .single()

        if (error || !data) {
          console.warn('[App] could not find badge record after BADGE_EARNED:', error)
          return
        }

        setQueue(prev => {
          // Дедупликация: уже есть такой значок в очереди?
          const alreadyQueued = prev.some(
            it => it.type === 'badge' && it.payload.rank_index === rankIndex
          )
          if (alreadyQueued) return prev

          // Вставляем сразу после текущего (если он показывается), иначе в начало.
          // Это даёт эффект "значок появился моментально, но плавно ждёт
          // если что-то уже на экране".
          const newItem = { type: 'badge', payload: { id: data.id, rank_index: rankIndex } }
          if (prev.length === 0) return [newItem]
          return [prev[0], newItem, ...prev.slice(1)]
        })
      } catch (e) {
        console.warn('[App] BADGE_EARNED handler exception:', e?.message)
      }
    }

    return on(EVENTS.BADGE_EARNED, handler)
  }, [])

  const handleConfirm = async () => {
    const current = queue[0]
    if (!current) return

    if (current.type === 'badge') {
      markRewardShown(current.payload.id, 'badge')
    } else if (current.type === 'frame') {
      markRewardShown(current.payload.id, 'frame')
    } else if (current.type === 'new_season') {
      const user = getCurrentUser()
      if (user) {
        const newKey = current.payload.season.key
        try {
          await supabase
            .from('users')
            .update({ last_seen_season: newKey })
            .eq('id', user.id)
          setCurrentUser({ ...user, last_seen_season: newKey })
        } catch (e) {
          console.warn('[App] update last_seen_season failed:', e?.message)
        }
      }
    }

    setQueue(prev => prev.slice(1))
  }

  const current = queue[0]
  if (!current) return null

  if (current.type === 'badge') {
    return (
      <LeagueBadgeModal
        key={`badge-${current.payload.id}`}
        rankIndex={current.payload.rank_index}
        onConfirm={handleConfirm}
      />
    )
  }

  if (current.type === 'frame') {
    return (
      <SeasonEndModal
        key={`frame-${current.payload.id}`}
        reward={current.payload}
        onConfirm={handleConfirm}
      />
    )
  }

  if (current.type === 'new_season') {
    return (
      <NewSeasonModal
        key="new-season"
        season={current.payload.season}
        daysLeft={current.payload.daysLeft}
        onConfirm={handleConfirm}
      />
    )
  }

  return null
}