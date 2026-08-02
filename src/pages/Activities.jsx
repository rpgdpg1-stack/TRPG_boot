import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import DailyQuests from '../components/DailyQuests'

/**
 * Экран «Активности» (из профиля) — сам виджет активностей (утро/день/вечер с
 * отметками). Редактор (конструктор своих активностей) спрятан: открывается
 * только по ⋯ на виджете → /daily-boost/edit.
 */
export default function Activities() {
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade">
      <ScreenTitle>Активности</ScreenTitle>

      <p style={styles.intro}>
        Утро, день и вечер — по одной активности за раз. Минимум шума, максимум действия.
      </p>

      <DailyQuests />
    </div>
  )
}

const styles = {
  intro: {
    margin: '0 var(--space-1) var(--space-4)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    lineHeight: 1.4,
    color: 'var(--color-text-secondary)'
  }
}
