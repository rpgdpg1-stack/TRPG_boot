import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import { getPrivacy, savePrivacy } from '../lib/privacy'
import ScreenTitle from '../components/ScreenTitle'

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
    haptic.selection()
    const next = { ...privacy, [key]: !privacy[key] }
    setPrivacy(next)
    savePrivacy(next)
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Приватность</ScreenTitle>

      <p style={styles.intro}>Выбери, что видно в твоём профиле — тебе и друзьям.</p>

      <div style={styles.groupCard}>
        <ToggleRow label="Последняя тренировка" hint="Дата и вид последней тренировки" value={privacy.showLastWorkout} onToggle={() => toggle('showLastWorkout')} />
        <ToggleRow label="Статистика" hint="Блок с периодами (неделя/месяц/год)" value={privacy.showStats} onToggle={() => toggle('showStats')} divider />
        <ToggleRow label="Любимые упражнения" hint="Твой топ-3" value={privacy.showFavorites} onToggle={() => toggle('showFavorites')} divider />
        <ToggleRow label="Показывать веса" hint="Рабочие веса в любимых упражнениях" value={privacy.showWeights} onToggle={() => toggle('showWeights')} divider />
      </div>
    </div>
  )
}

function ToggleRow({ label, hint, value, onToggle, divider = false }) {
  return (
    <div style={{ ...styles.toggleRow, borderTop: divider ? '1px solid var(--border-hairline)' : 'none' }}>
      <div style={styles.rowContent}>
        <div style={styles.rowTitle}>{label}</div>
        <div style={styles.rowSubtitle}>{hint}</div>
      </div>
      <button
        onClick={onToggle}
        aria-label={label}
        style={{ ...styles.switch, background: value ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.14)' }}
      >
        <span style={{ ...styles.knob, transform: value ? 'translateX(18px)' : 'translateX(0)' }} />
      </button>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  intro: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    margin: '0 auto 20px', maxWidth: '300px'
  },
  groupCard: {
    display: 'flex', flexDirection: 'column', background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)', overflow: 'hidden'
  },
  toggleRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', minHeight: '64px' },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' },
  rowSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', color: 'var(--color-text-secondary)' },
  switch: {
    position: 'relative', flexShrink: 0, width: '42px', height: '24px', borderRadius: '12px',
    border: 'none', padding: 0, cursor: 'pointer', transition: 'background 0.2s ease', WebkitTapHighlightColor: 'transparent'
  },
  knob: {
    position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px', borderRadius: '50%',
    background: '#FFFFFF', transition: 'transform 0.2s var(--ease-ios)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
  }
}
