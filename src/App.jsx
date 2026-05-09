import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'

import Loader from './components/Loader'
import TabBar from './components/TabBar'
import ParticlesBg from './components/ParticlesBg'

import Home from './pages/Home'
import Category from './pages/Category'
import Program from './pages/Program'
import WorkoutDay from './pages/WorkoutDay'
import Progress from './pages/Progress'
import Settings from './pages/Settings'

import { initTelegram } from './lib/telegram'
import { ensureAuth } from './lib/auth'

export default function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initTelegram()
    ensureAuth().catch(err => {
      console.error('[App] ensureAuth failed:', err)
    })
  }, [])

  if (loading) {
    return <Loader onFinish={() => setLoading(false)} />
  }

  return (
    <div className="app">
      <ParticlesBg />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/category/:id" element={<Category />} />
        <Route path="/program/:id" element={<Program />} />
        <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>

      <TabBar />
    </div>
  )
}
