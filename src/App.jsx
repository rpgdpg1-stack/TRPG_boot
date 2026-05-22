import { useState, useRef, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import Loader from './components/layout/Loader'
import ErrorBoundary from './components/layout/ErrorBoundary'
import TabBar from './components/TabBar'
import ParticlesBg from './components/ParticlesBg'

import Home from './pages/Home'
import Category from './pages/Category'
import WorkoutDay from './pages/WorkoutDay'
import SwapExercise from './pages/SwapExercise'
import Progress from './pages/Progress'
import Recovery from './pages/Recovery'
import Profile from './pages/Profile'
import Settings from './pages/Settings'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth } from './lib/auth'

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

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
          <Route path="/swap/:programId/:day/:orderNum" element={<SwapExercise />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<Profile />} />
          {/* Recovery остаётся доступным по прямой ссылке — открывается из Профиля.
              Из таб-бара убрали (теперь там Профиль), но роут жив. */}
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/settings" element={<Settings />} />
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