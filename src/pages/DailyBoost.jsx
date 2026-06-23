import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import DailyQuests from '../components/DailyQuests'

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
      <header style={styles.header}>
        <h1 style={styles.title}>ДНЕВНОЙ БУСТ</h1>
      </header>
      <DailyQuests />
    </div>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '26px',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    lineHeight: 1,
    margin: 0
  }
}
