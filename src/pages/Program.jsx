import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getActiveDay } from '../lib/storage'

/**
 * Экран программы — выбор дня A/B/C.
 *
 * Г8.2:
 * - Возврат всегда в категорию (не navigate(-1) который иногда кидает на главную)
 * - Кнопка назад через setHandler (без мерцания)
 */

// Какая программа в какой категории — для возврата по кнопке Назад
const PROGRAM_TO_CATEGORY = {
  split: 'gym'
  // когда добавим другие — допишем сюда
}

const PROGRAM_DATA = {
  split: {
    title: 'СПЛИТ',
    tags: ['зал'],
    days: ['A', 'B', 'C'],
    dbId: 'prog_001'  // как программа называется в БД
  }
}

export default function Program() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeDay, setActiveDay] = useState(null)

  const data = PROGRAM_DATA[id]
  const parentCategory = PROGRAM_TO_CATEGORY[id] || 'gym'

  useEffect(() => {
    // Кнопка назад → в родительскую категорию (а не navigate(-1) который мог кинуть на главную)
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
    // Используем БД id (prog_001) для URL — он попадёт в БД при finishWorkout
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
  placeholder: { textAlign: 'center', padding: '40px 20px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-card)' },
  placeholderIcon: { fontSize: '48px', marginBottom: '12px' },
  placeholderTitle: { fontFamily: 'var(--font-tiny5)', fontSize: '20px', color: 'var(--color-primary)', letterSpacing: '2px', marginBottom: '8px' },
  placeholderText: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6 },
  notFoundPage: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontFamily: 'var(--font-manrope)', color: 'var(--color-text-secondary)' }
}
