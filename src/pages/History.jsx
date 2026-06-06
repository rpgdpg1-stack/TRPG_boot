import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getRecentWorkouts } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import HistoryRow from '../components/HistoryRow'

/**
 * Полный список истории тренировок.
 * Превью (3 шт) живёт на главной и в профиле, отсюда — вся история целиком.
 */
export default function History() {
  const navigate = useNavigate()
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getRecentWorkouts(100).then(data => {
        if (!cancelled) {
          setWorkouts(data || [])
          setLoading(false)
        }
      })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  return (
    <div className="page page-fade" style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>ИСТОРИЯ</h1>
        <div style={styles.subtitle}>ВСЕ ТРЕНИРОВКИ</div>
      </header>

      {loading ? (
        <div style={styles.empty}>Загрузка...</div>
      ) : workouts.length === 0 ? (
        <div style={styles.empty}>
          Пока нет завершённых тренировок.<br />
          Заверши первую — она появится здесь.
        </div>
      ) : (
        <div style={styles.list}>
          {workouts.map((w, i) => (
            <HistoryRow key={`${w.finished_at}-${i}`} workout={w} />
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {},
  header: { marginTop: '8px', marginBottom: '20px', textAlign: 'center' },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '32px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1,
    marginBottom: '6px'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  }
}