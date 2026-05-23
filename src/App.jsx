import { useState, useRef, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import Loader from './components/layout/Loader'
import ErrorBoundary from './components/layout/ErrorBoundary'
import TabBar from './components/TabBar'
import ParticlesBg from './components/ParticlesBg'
import LeagueBadgeModal from './components/rewards/LeagueBadgeModal'

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
import { ensureAuth } from './lib/auth'
import { getPendingRewards, markRewardShown } from './lib/rewards'
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
 * Контроллер показа наград.
 *
 * После авторизации проверяет: есть ли невыданные награды у юзера.
 * Если есть — показывает модалки по одной.
 *
 * Если за раз несколько значков (юзер перепрыгнул через лиги) —
 * показываем подряд: закрыл первую → сразу следующая → и т.д.
 *
 * Также подписывается на USER_CHANGED — после finish workout мог появиться
 * новый значок, проверяем заново.
 *
 * Сезонные рамки (frames) пока НЕ показываем здесь — для них будет
 * отдельная модалка SeasonEndModal с другим визуалом (следующая порция).
 */
function RewardsQueueController() {
  const [pendingBadges, setPendingBadges] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Загружаем pending награды один раз после auth и потом по USER_CHANGED
  useEffect(() => {
    let cancelled = false

    const loadPending = async () => {
      const { badges } = await getPendingRewards()
      if (cancelled) return
      if (badges && badges.length > 0) {
        // Сортируем по rank_index возрастающе — показываем сначала младшую
        // лигу, потом старшие (так логичнее ощущается прогрессия)
        const sorted = [...badges].sort((a, b) => a.rank_index - b.rank_index)
        setPendingBadges(sorted)
        setCurrentIndex(0)
      }
    }

    // Слушаем сразу — на момент монтирования юзер уже авторизован
    loadPending()

    const offChanged = on(EVENTS.USER_CHANGED, loadPending)
    return () => {
      cancelled = true
      offChanged()
    }
  }, [])

  const handleConfirm = async () => {
    const current = pendingBadges[currentIndex]
    if (!current) return

    // Помечаем показанной в БД, не ждём ответа — UX важнее
    markRewardShown(current.id, 'badge')

    // Следующая модалка или закрытие
    if (currentIndex + 1 < pendingBadges.length) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setPendingBadges([])
      setCurrentIndex(0)
    }
  }

  const current = pendingBadges[currentIndex]
  if (!current) return null

  return (
    <LeagueBadgeModal
      key={current.id}
      rankIndex={current.rank_index}
      onConfirm={handleConfirm}
    />
  )
}