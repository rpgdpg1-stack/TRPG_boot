import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import PixelHeart from '../components/PixelHeart'

/**
 * «Любимые упражнения» — до трёх упражнений с рабочим весом/результатом
 * (Жим лёжа — 100 кг, Присед — 140 кг, Подтягивания — 18). Витрина личного
 * прогресса: показывается в профиле и на главной, шарится с друзьями.
 *
 * ПОКА ЗАГЛУШКА («Скоро»): три пустых слота. Полная механика (тап по слоту →
 * пикер упражнений с лимитом 1, сохранение веса) — в плане, ждёт утверждения.
 * См. память проекта «TRPG: соц-архитектура» и «TRPG: любимые упражнения».
 */
export default function FavoriteExercises() {
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade" style={styles.page}>
      <header style={styles.header}>
        <ScreenTitle>Любимые упражнения</ScreenTitle>
        <span style={styles.headerIcon}><PixelHeart filled size={26} /></span>
      </header>

      <p style={styles.intro}>
        Твой топ-3: любимые упражнения и рабочие веса. Витрина личного прогресса —
        видна в профиле и друзьям.
      </p>

      <div style={styles.slots}>
        {[1, 2, 3].map(n => (
          <div key={n} style={styles.slot}>
            <span style={styles.slotIndex}>{n}</span>
            <div style={styles.slotBody}>
              <div style={styles.slotTitle}>Свободный слот</div>
              <div style={styles.slotHint}>Выбери упражнение и рабочий вес</div>
            </div>
            <span style={styles.soonTag}>Скоро</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  header: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '14px'
  },
  headerIcon: { display: 'inline-flex' },
  intro: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    margin: '0 auto 20px', maxWidth: '300px'
  },
  slots: { display: 'flex', flexDirection: 'column', gap: '10px', opacity: 0.7 },
  slot: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '16px 18px', minHeight: '68px',
    background: 'var(--surface)',
    border: '1px dashed rgba(255, 255, 255, 0.18)',
    borderRadius: 'var(--radius-card)'
  },
  slotIndex: {
    flexShrink: 0, width: '26px', height: '26px', borderRadius: '8px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-raised)',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '14px',
    color: 'var(--color-text-secondary)'
  },
  slotBody: { flex: 1, minWidth: 0 },
  slotTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600,
    color: 'var(--color-text)', marginBottom: '2px'
  },
  slotHint: {
    fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)'
  },
  soonTag: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '10px',
    letterSpacing: '1px', color: 'var(--color-text-secondary)', textTransform: 'uppercase'
  }
}
