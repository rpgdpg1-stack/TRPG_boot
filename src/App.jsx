import { useState, useRef, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import Loader from './components/layout/Loader'
import ErrorBoundary from './components/layout/ErrorBoundary'
import TabBar from './components/TabBar'
import ParticlesBg from './components/ParticlesBg'

import Home from './pages/Home'
import Category from './pages/Category'
import Program from './pages/Program'
import WorkoutDay from './pages/WorkoutDay'
import SwapExercise from './pages/SwapExercise'
import Progress from './pages/Progress'
import Settings from './pages/Settings'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth } from './lib/auth'

/**
 * Корневой компонент приложения.
 *
 * Бизнес-логика:
 *  - Ждём авторизацию Telegram (Loader)
 *  - Подключаем глобальную кнопку шестерёнки в шапке Telegram
 *  - ErrorBoundary ловит любые ошибки в роутах
 */
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

        {/* SettingsButtonController должен быть внутри Routes-контекста,
            чтобы иметь доступ к useNavigate */}
        <SettingsButtonController />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/program/:id" element={<Program />} />
          <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
          <Route path="/swap/:programId/:day/:orderNum" element={<SwapExercise />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>

        <TabBar />
      </div>
    </ErrorBoundary>
  )
}

/**
 * Контроллер шестерёнки в шапке Telegram.
 * Показывает её на всех экранах, кроме самих настроек, и ведёт на /settings.
 *
 * Вынесен в отдельный компонент, потому что useNavigate работает только
 * внутри роутера, а Routes монтируется внутри ErrorBoundary в App.
 */
function SettingsButtonController() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // На странице настроек прячем — нет смысла кнопкой ведущей в текущее место
    if (location.pathname === '/settings') {
      settingsButton.hide()
      return
    }

    settingsButton.show(() => navigate('/settings'))

    return () => {
      // При размонтировании — снимаем обработчик чтобы не утёк навигатор
      settingsButton.hide()
    }
  }, [location.pathname, navigate])

  return null
}