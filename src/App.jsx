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
import Progress from './pages/Progress'
import Recovery from './pages/Recovery'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Leaderboard from './pages/Leaderboard'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth, getCurrentUser, setCurrentUser } from './lib/auth'
import { getPendingRewards, markRewardShown } from './lib/rewards'
import { getCurrentSeason, getDaysUntilSeasonEnd } from './utils/season'
import { supabase } from './lib/supabase'
import { EVENTS, on } from './lib/events'

export default function App() {
  const [loading, setLoading] = useState(true)

  const authPromiseRef = useRef(null)
  if (authPromiseRef.current === null) {
    initTelegram()
    authPromiseRef.current = ensureAuth().catch(err => {
      console.error('[App] ensureAuth failed:', err)
      return null
    })
  }

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
        <ParticlesBg />

        <SettingsButtonController />
        <RewardsQueueController />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
          <Route path="/swap/:programId/:day/:orderNum" element={<SwapExercise />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
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
 * Показывает модалки одну за другой в фиксированном порядке:
 *  1. Значки лиг (LeagueBadgeModal) — отсортированы по возрастанию ранга
 *  2. Сезонные рамки (SeasonEndModal) — за прошлые сезоны
 *  3. Приветствие нового сезона (NewSeasonModal) — если сменился сезон
 *
 * Каждая модалка имеет свой onConfirm:
 *  - badge/frame: помечается shown_to_user=true в БД через markRewardShown
 *  - new season: пишется в users.last_seen_season ключ текущего сезона
 *
 * Перезагрузка очереди — по USER_CHANGED (после тренировки могли выдать новый
 * значок, потому что add_muscles в RPC вызывает grant_league_badge_if_new).
 */
function RewardsQueueController() {
  // queue — массив элементов { type, payload } которые надо показать по очереди
  // type: 'badge' | 'frame' | 'new_season'
  const [queue, setQueue] = useState([])

  useEffect(() => {
    let cancelled = false

    const buildQueue = async () => {
      const items = []

      // 1. Значки лиг (badges)
      const { badges, frames } = await getPendingRewards()
      if (badges?.length) {
        const sortedBadges = [...badges].sort((a, b) => a.rank_index - b.rank_index)
        for (const b of sortedBadges) items.push({ type: 'badge', payload: b })
      }

      // 2. Сезонные рамки (frames)
      if (frames?.length) {
        const sortedFrames = [...frames].sort((a, b) => a.place - b.place)
        for (const f of sortedFrames) items.push({ type: 'frame', payload: f })
      }

      // 3. Приветствие нового сезона — если last_seen_season не совпадает
      // с текущим ключом сезона. Юзера читаем свежий, не из стейта.
      const user = getCurrentUser()
      const currentSeason = getCurrentSeason()
      if (user && user.last_seen_season !== currentSeason.key) {
        items.push({
          type: 'new_season',
          payload: {
            season: currentSeason,
            daysLeft: getDaysUntilSeasonEnd()
          }
        })
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

  // Закрытие текущей модалки → удаление первого элемента из очереди.
  // Для каждого типа своя логика отметки "показано".
  const handleConfirm = async () => {
    const current = queue[0]
    if (!current) return

    if (current.type === 'badge') {
      markRewardShown(current.payload.id, 'badge')
    } else if (current.type === 'frame') {
      markRewardShown(current.payload.id, 'frame')
    } else if (current.type === 'new_season') {
      // Обновляем last_seen_season в БД — на следующем заходе модалка не покажется
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