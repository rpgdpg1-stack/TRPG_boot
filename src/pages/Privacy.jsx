import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getPrivacy, savePrivacy } from '../lib/privacy'
import { FAVORITE_LIMIT } from '../lib/favorite-exercises'
import ScreenTitle from '../components/ScreenTitle'
import { FormCard, ToggleRow } from '../components/FormControls'

/**
 * Страница «Приватность» — что видишь ты и твои друзья. Настроил один раз и вышел
 * (чтобы не мельтешило блоком под профилем).
 */
export default function Privacy() {
  const navigate = useNavigate()
  const [privacy, setPrivacy] = useState(() => getPrivacy())

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const toggle = (key) => {
    // Отклик даёт сам ToggleRow — второй вызов здесь бил бы дважды.
    const next = { ...privacy, [key]: !privacy[key] }
    setPrivacy(next)
    savePrivacy(next)
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Приватность</ScreenTitle>

      <p style={styles.intro}>Выбери, что видно в твоём профиле — тебе и друзьям.</p>

      <FormCard>
        <ToggleRow label="Последняя тренировка" hint="Дата последней тренировки" value={privacy.showLastWorkout} onToggle={() => toggle('showLastWorkout')} />
        <ToggleRow label="Статистика" hint="Тренировки и часы за текущий месяц" value={privacy.showStats} onToggle={() => toggle('showStats')} divider />
        <ToggleRow label="Любимые упражнения" hint={`Твой топ-${FAVORITE_LIMIT}`} value={privacy.showFavorites} onToggle={() => toggle('showFavorites')} divider />
        {/* Веса — вложены в «Любимые»: видны только когда любимые включены. Выключил
            любимые — веса и сам пункт «Показывать веса» прячутся. */}
        {privacy.showFavorites && (
          <ToggleRow label="Показывать веса" hint="Рабочие веса в списке любимых" value={privacy.showWeights} onToggle={() => toggle('showWeights')} divider nested />
        )}
      </FormCard>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  intro: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    margin: '0 auto var(--space-5)', maxWidth: '300px'
  }
}
