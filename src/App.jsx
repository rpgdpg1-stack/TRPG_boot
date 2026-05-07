import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'

import Loader from './components/Loader'
import TabBar from './components/TabBar'
import ParticlesBg from './components/ParticlesBg'

import Home from './pages/Home'
import Workout from './pages/Workout'
import Progress from './pages/Progress'

import { initTelegram } from './lib/telegram'

export default function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initTelegram()
  }, [])

  if (loading) {
    return <Loader onFinish={() => setLoading(false)} />
  }

  return (
    <div className="app">
      {/* Фоновые частицы — над фоном, под контентом */}
      <ParticlesBg />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/workout" element={<Workout />} />
        <Route path="/progress" element={<Progress />} />

        {/*
          Роуты ниже добавим после Порций 2 и 3 — пока компонентов нет
          <Route path="/category/:id" element={<Category />} />
          <Route path="/program/:id" element={<Program />} />
          <Route path="/settings" element={<Settings />} />
        */}
      </Routes>

      <TabBar />
    </div>
  )
}
