import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getActiveDay } from '../lib/storage'

/**
 * Экран программы — выбор дня A/B/C.
 *
 * dbId — это идентификатор программы в Supabase (prog_001),
 * id в URL (split) — для красивых ссылок.
 * При тапе по дню навигируем используя dbId, чтобы он был доступен в /workout/:programId/:day
 */

const PROGRAM_TO_CATEGORY = {
  split: 'gym'
}

const PROGRAM_DATA = {
  split: {
    title: 'СПЛИТ',
    tags: ['зал'],
    days: ['A', 'B', 'C'],
    dbId: 'prog_001'
  }
}

export default function Program() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeDay, setActiveDay] = useState(null)

  const data = PROGRAM_DATA[id]
  const parentCategory = PROGRAM_TO_CATEGORY[id] || 'gym'

  useEffect(() => {
    backButton.setHandler(() => navigate(`/category/${parentCategory}`))
    lockVerticalSwipes()
  }, [navigate, parentCategory])

  useEffect(() => {
    getActiveDay(id).then(setActiveDay)
  }, [id])

  if (!data) {
    return (
      <div className="page page-enter" style={styles.notFoundPage}>
        <div style={styles.notFoundText}>Программа не найдена</div>
      </div>
    )
  }

  const recommendedDay = activeDay || 'A'

  const handleDayTap = (day) => {
    haptic.light()
    // Навигируем по dbId (prog_001), чтобы при сохранении в БД использовался правильный foreign key
    const programDbId = data.dbId || id
    setTimeout(() => navigate(`/workout/${programDbId}/${day}`), 80)
  }

  return (
    <div className="page page-enter" style={styles.page}>

      <header style={styles.header}>
        <h1 style={styles.title}>{data.title}</h1>
        <div style={styles.tags}>
          {data.tags.map(tag => (
            <span key={tag} style={styles.tag}>{tag.toUpperCase()}</span>
          ))}
        </div>
      </header>

      {activeDay && (
        <div style={styles.activeDayHint}>
          СЕГОДНЯ ДЕНЬ <span style={styles.activeDayLetter}>{activeDay}</span>
        </div>
      )}
      {!activeDay && (
        <div style={styles.activeDayHint}>
          НАЧНИ С ДНЯ <span style={styles.activeDayLetter}>A</span>
        </div>
      )}

      <div style={styles.daysGrid}>
        {data.days.map(day => {
          const isRecommended = day === recommendedDay
          return (
            <button
              key={day}
              onClick={() => handleDayTap(day)}
              style={{
                ...styles.dayCard,
                ...(isRecommended ? styles.dayCardActive : {})
              }}
            >
              <div style={{
                ...styles.dayLetter,
                color: isRecommended ? 'var(--color-primary)' : 'var(--color-text-secondary)'
              }}>
                {day}
              </div>
              <div style={{
                ...styles.dayLabel,
                color: isRecommended ? 'var(--color-primary)' : 'var(--color-text-secondary)'
              }}>
                ДЕНЬ {day}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '16px 16px 24px' },
  header: { marginBottom: '20px', textAlign: 'center' },
  title: { fontFamily: 'var(--font-tiny5)', fontSize: '40px', color: 'var(--color-primary)', letterSpacing: '4px', lineHeight: 1, marginBottom: '8px' },
  tags: { display: 'flex', gap: '6px', justifyContent: 'center' },
  tag: { display: 'inline-block', padding: '3px 10px', background: 'var(--tag-gym)', borderRadius: '6px', fontFamily: 'var(--font-tiny5)', fontSize: '11px', color: 'var(--color-bg)', letterSpacing: '1px', fontWeight: 600 },
  activeDayHint: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '2px', textAlign: 'center', marginBottom: '16px' },
  activeDayLetter: { fontFamily: 'var(--font-tiny5)', fontSize: '14px', color: 'var(--color-primary)', letterSpacing: '1px' },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '32px' },
  dayCard: {
    aspectRatio: '1',
    background: 'var(--color-card)',
    borderRadius: '24px',
    border: '2px solid transparent',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s ease'
  },
  dayCardActive: { border: '2px solid var(--color-primary)', background: 'rgba(158, 209, 83, 0.08)' },
  dayLetter: { fontFamily: 'var(--font-tiny5)', fontSize: '52px', letterSpacing: '0', lineHeight: 1 },
  dayLabel: { fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px' },
  notFoundPage: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontFamily: 'var(--font-manrope)', color: 'var(--color-text-secondary)' }
}
