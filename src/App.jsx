import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'

import Loader from './components/Loader'
import TabBar from './components/TabBar'
import ParticlesBg from './components/ParticlesBg'

import Home from './pages/Home'
import Category from './pages/Category'
import Program from './pages/Program'
import Progress from './pages/Progress'
import Settings from './pages/Settings'
import SupabaseTest from './pages/SupabaseTest'

import { initTelegram } from './lib/telegram'
import { ensureAuth } from './lib/auth'

export default function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initTelegram()
    // Авторизуемся в Supabase в фоне.
    // Не блокируем UI — лоадер показывается параллельно по таймеру.
    // Если авторизация упадёт — приложение всё равно работает, просто без сохранения.
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
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/supabase-test" element={<SupabaseTest />} />
      </Routes>

      <TabBar />
    </div>
  )
}
