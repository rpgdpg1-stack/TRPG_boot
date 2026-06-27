import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import DailyQuests from '../components/DailyQuests'
import ScreenTitle from '../components/ScreenTitle'

/**
 * Страница «Дневной буст» — ежедневные квесты.
 * Открывается тапом по заголовку ДНЕВНОЙ БУСТ на главной и живёт в профиле.
 * Контент — общий компонент DailyQuests (тот же, что на главной).
 */
export default function DailyBoost() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade" style={{}}>
      <ScreenTitle>Дневной буст</ScreenTitle>
      <DailyQuests />
    </div>
  )
}
