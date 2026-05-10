import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getCurrentUser, refreshCurrentUser } from '../lib/auth'
import { getWorkoutDay, MUSCLE_GROUP_LABELS } from '../lib/programs'
import ExerciseCard from '../components/ExerciseCard'

/**
 * Экран дня тренировки.
 *
 * Д1-fix2: Надёжная загрузка с polling'ом auth.
 * - Если юзер есть — грузим сразу
 * - Если нет — проверяем каждые 100ms до 5 секунд
 * - Если за 5с не дождались — пробуем refreshCurrentUser()
 * - Параллельно слушаем событие 'user-ready' как подстраховку
 */
export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    backButton.setHandler(() => navigate(`/program/${programId}`))
    lockVerticalSwipes()
  }, [navigate, programId])

  useEffect(() => {
    let cancelled = false
    let pollTimer = null
    let pollAttempts = 0
    const MAX_POLL_ATTEMPTS = 50 // 50 × 100ms = 5 секунд

    const doLoad = async () => {
      console.log('[WorkoutDay] doLoad start, user:', getCurrentUser())
      setError(null)
      try {
        const data = await getWorkoutDay(programId, day)
        console.log('[WorkoutDay] received', (data || []).length, 'slots')
        if (!cancelled) {
          setSlots(data || [])
          setLoading(false)
        }
      } catch (e) {
        console.error('[WorkoutDay] load error:', e)
        if (!cancelled) {
          setError(e.message || String(e))
          setLoading(false)
        }
      }
    }

    const tryLoadOrPoll = async () => {
      // Если юзер уже есть — грузим
      if (getCurrentUser()) {
        await doLoad()
        return
      }

      // Иначе ждём с polling'ом
      console.log('[WorkoutDay] no auth yet, polling...')
      pollTimer = setInterval(async () => {
        if (cancelled) {
          clearInterval(pollTimer)
          return
        }
        pollAttempts++
        if (getCurrentUser()) {
          console.log('[WorkoutDay] auth ready after', pollAttempts, 'polls')
          clearInterval(pollTimer)
          await doLoad()
          return
        }
        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          clearInterval(pollTimer)
          // Последняя попытка — принудительно обновим юзера из БД
          console.log('[WorkoutDay] polling exhausted, forcing refreshCurrentUser')
          try {
            await refreshCurrentUser()
          } catch (e) {
            console.error('[WorkoutDay] refresh failed:', e)
          }
          if (getCurrentUser()) {
            await doLoad()
          } else if (!cancelled) {
            setError('Не удалось авторизоваться. Перезапусти приложение.')
            setLoading(false)
          }
        }
      }, 100)
    }

    tryLoadOrPoll()

    // Подстраховка через события
    const onUserReady = async () => {
      if (cancelled) return
      console.log('[WorkoutDay] user-ready event received')
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      await doLoad()
    }
    window.addEventListener('user-ready', onUserReady)
    window.addEventListener('user-updated', onUserReady)

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      window.removeEventListener('user-ready', onUserReady)
      window.removeEventListener('user-updated', onUserReady)
    }
  }, [programId, day])

  // Группируем последовательные слоты с одной muscle_group в "секции"
  const sections = groupByMuscleGroup(slots)

  return (
    <div className="page page-enter" style={styles.page}>

      <header style={styles.header}>
        <h1 style={styles.title}>ДЕНЬ {day}</h1>
        <div style={styles.subtitle}>
          {loading ? 'Загрузка...' : `${slots.length} упражнений`}
        </div>
      </header>

      {error && (
        <div style={styles.error}>
          <div style={styles.errorTitle}>Ошибка загрузки:</div>
          <div style={styles.errorText}>{error}</div>
        </div>
      )}

      {!loading && !error && slots.length === 0 && (
        <div style={styles.empty}>
          День пуст — упражнения не настроены для этой программы
        </div>
      )}

      {!loading && sections.length > 0 && (
        <div style={styles.sectionsWrap}>
          {sections.map((section, sIdx) => (
            <section key={`${section.muscleGroup}-${sIdx}`} style={styles.section}>
              <h2 style={styles.stickyHeader}>
                {MUSCLE_GROUP_LABELS[section.muscleGroup] || section.muscleGroup.toUpperCase()}
              </h2>

              <div style={styles.exerciseList}>
                {section.slots.map(slot => (
                  <ExerciseCard
                    key={`${slot.order_num}-${slot.exercise_id}`}
                    slot={slot}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

    </div>
  )
}

function groupByMuscleGroup(slots) {
  if (!slots.length) return []

  const sections = []
  let current = null

  for (const slot of slots) {
    if (!current || current.muscleGroup !== slot.muscle_group) {
      current = { muscleGroup: slot.muscle_group, slots: [] }
      sections.push(current)
    }
    current.slots.push(slot)
  }

  return sections
}

const styles = {
  page: {
    padding: '16px 16px 24px'
  },
  header: {
    marginBottom: '16px',
    textAlign: 'center'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '36px',
    color: 'var(--color-primary)',
    letterSpacing: '4px',
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
  sectionsWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  stickyHeader: {
    position: 'sticky',
    top: 'calc(var(--tg-safe-top) - 80px)',
    zIndex: 10,
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    fontWeight: 'normal',
    padding: '8px 4px',
    margin: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '8px'
  },
  exerciseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  },
  error: {
    background: 'rgba(232, 69, 69, 0.08)',
    border: '1px solid rgba(232, 69, 69, 0.3)',
    borderRadius: '12px',
    padding: '14px 16px',
    marginBottom: '16px'
  },
  errorTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: '#E84545',
    fontWeight: 700,
    marginBottom: '6px'
  },
  errorText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-word'
  }
}
