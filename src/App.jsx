import { useState, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'

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

import { initTelegram } from './lib/telegram'
import { ensureAuth } from './lib/auth'

export default function App() {
  const [loading, setLoading] = useState(true)

  // Стартуем auth ОДИН раз и кладём промис в ref —
  // Loader ждёт именно этот промис, не запускает повторно.
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

  // ErrorBoundary оборачивает ВСЁ приложение (правка #6).
  // Если в любом компоненте упадёт исключение — увидим красивый экран,
  // а не белое пятно.
  return (
    <ErrorBoundary>
      <div className="app">
        <ParticlesBg />

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