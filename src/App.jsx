import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'

import Loader from './components/Loader'
import TabBar from './components/TabBar'
import Home from './pages/Home'
import Workout from './pages/Workout'
import Progress from './pages/Progress'

import { initTelegram } from './lib/telegram'

export default function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Инициализируем Telegram SDK один раз при старте
    initTelegram()
  }, [])

  if (loading) {
    return <Loader onFinish={() => setLoading(false)} />
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/workout" element={<Workout />} />
        <Route path="/progress" element={<Progress />} />
      </Routes>

      <TabBar />
    </div>
  )
}
