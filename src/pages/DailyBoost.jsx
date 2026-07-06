import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import DailyQuests from '../components/DailyQuests'
import ScreenTitle from '../components/ScreenTitle'

/**
 * Страница «Активности» — ежедневные активности (утро/день/вечер).
 * Открывается из профиля; контент — общий компонент DailyQuests (как на главной).
 */
export default function DailyBoost() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade" style={{}}>
      <ScreenTitle>Активности</ScreenTitle>
      <DailyQuests />
    </div>
  )
}
