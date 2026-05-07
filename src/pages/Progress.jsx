import { useEffect, useState } from 'react'
import { getStreak, getUserLevel, getLevelName, getTotalWorkouts } from '../lib/storage'
import { haptic } from '../lib/telegram'

/**
 * Экран прогресса — без заголовка.
 * Сразу показываем три блока статистики, призыв и список разделов.
 */
export default function Progress() {
  const [stats, setStats] = useState({ streak: 0, level: 1, levelName: 'NEWBIE', total: 0 })

  useEffect(() => {
    Promise.all([getStreak(), getUserLevel(), getTotalWorkouts()]).then(([streak, level, total]) => {
      setStats({ streak, level, levelName: getLevelName(level), total })
    })
  }, [])

  const sections = [
    { id: 'charts',       icon: '📈', title: 'Графики',         subtitle: 'Динамика весов и повторов' },
    { id: 'achievements', icon: '🏆', title: 'Достижения',      subtitle: 'Ачивки и значки' },
    { id: 'measurements', icon: '📏', title: 'Замеры тела',     subtitle: 'Прогресс веса и объёмов' },
    { id: 'calendar',     icon: '📅', title: 'Календарь',       subtitle: 'Активность по дням' },
    { id: 'records',      icon: '💪', title: 'Личные рекорды',  subtitle: '1RM по упражнениям' }
  ]

  const handleSectionTap = () => {
    haptic.light()
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Сразу три бокса статистики (без заголовка) */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <div style={styles.statValue}>LVL {stats.level}</div>
          <div style={styles.statLabel}>{stats.levelName}</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>🔥 {stats.streak}</div>
          <div style={styles.statLabel}>СТРИК</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.total}</div>
          <div style={styles.statLabel}>ВСЕГО</div>
        </div>
      </div>

      {/* Призыв */}
      <div style={styles.placeholder}>
        <div style={styles.placeholderTitle}>Скоро здесь будет твой прогресс</div>
        <div style={styles.placeholderText}>
          Сделай первую тренировку и начни наполнять статистику
        </div>
      </div>

      {/* Карточки разделов */}
      <div style={styles.sections}>
        {sections.map(section => (
          <button
            key={section.id}
            onClick={handleSectionTap}
            style={styles.sectionCard}
          >
            <span style={styles.sectionIcon}>{section.icon}</span>
            <div style={styles.sectionContent}>
              <div style={styles.sectionTitle}>{section.title}</div>
              <div style={styles.sectionSubtitle}>{section.subtitle}</div>
            </div>
            <span style={styles.sectionSoon}>СКОРО</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  page: {},
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '8px',
    marginBottom: '20px'
  },
  statBox: {
    padding: '14px 8px',
    background: 'var(--color-card)',
    borderRadius: '20px',
    textAlign: 'center'
  },
  statValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '16px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    marginBottom: '4px'
  },
  statLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1.5px',
    fontWeight: 600
  },
  placeholder: {
    textAlign: 'center',
    padding: '24px 16px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 'var(--radius-card)',
    marginBottom: '20px'
  },
  placeholderTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '6px'
  },
  placeholderText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  sectionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-small)',
    width: '100%',
    textAlign: 'left'
  },
  sectionIcon: {
    fontSize: '22px',
    width: '32px',
    textAlign: 'center'
  },
  sectionContent: {
    flex: 1,
    minWidth: 0
  },
  sectionTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  sectionSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  sectionSoon: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    flexShrink: 0
  }
}
