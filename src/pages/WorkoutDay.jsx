import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getCurrentUser, refreshCurrentUser } from '../lib/auth'
import { getWorkoutDay, MUSCLE_GROUP_LABELS, finishWorkout } from '../lib/programs'
import { setLastCompletedDay } from '../lib/storage'
import { XP_REWARDS } from '../lib/levels'
import ExerciseCard from '../components/ExerciseCard'
import ExerciseActionMenu from '../components/ExerciseActionMenu'
import ExerciseInfoModal from '../components/ExerciseInfoModal'
import WorkoutFinishedModal from '../components/WorkoutFinishedModal'

/**
 * Экран дня тренировки.
 *
 * Д3.2:
 * - Long-press на карточку → меню Инфо / Сменить
 * - Инфо → модалка-заглушка
 * - Сменить → переход на /swap/:programId/:day/:orderNum
 *   с передачей данных слота через location.state
 */
export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeOrderNums, setActiveOrderNums] = useState(() => new Set())
  const [showFinishedModal, setShowFinishedModal] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // Д3.2: state для меню действий и инфо
  const [actionSlot, setActionSlot] = useState(null)  // slot для которого открыто меню
  const [infoSlot, setInfoSlot] = useState(null)      // slot для модалки Инфо

  useEffect(() => {
    backButton.setHandler(() => navigate(`/program/${programId}`))
    lockVerticalSwipes()
  }, [navigate, programId])

  useEffect(() => {
    let cancelled = false
    let pollTimer = null
    let pollAttempts = 0
    const MAX_POLL_ATTEMPTS = 50

    const doLoad = async () => {
      setError(null)
      try {
        const data = await getWorkoutDay(programId, day)
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
      if (getCurrentUser()) {
        await doLoad()
        return
      }
      pollTimer = setInterval(async () => {
        if (cancelled) {
          clearInterval(pollTimer)
          return
        }
        pollAttempts++
        if (getCurrentUser()) {
          clearInterval(pollTimer)
          await doLoad()
          return
        }
        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          clearInterval(pollTimer)
          try { await refreshCurrentUser() } catch {}
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

    const onUserReady = async () => {
      if (cancelled) return
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
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

  // Обычный тап — активация
  const handleCardTap = (slot) => {
    if (showFinishedModal || finishing) return
    if (actionSlot || infoSlot) return // если открыты модалки — игнорируем

    setActiveOrderNums(prev => {
      const next = new Set(prev)
      if (next.has(slot.order_num)) {
        next.delete(slot.order_num)
        haptic.light()
      } else {
        next.add(slot.order_num)
        haptic.success()

        if (slots.length > 0 && next.size === slots.length) {
          setTimeout(() => setShowFinishedModal(true), 600)
        }
      }
      return next
    })
  }

  // Долгое нажатие → открыть меню
  const handleCardLongPress = (slot) => {
    if (showFinishedModal || finishing) return
    setActionSlot(slot)
  }

  // Меню → Инфо
  const handleMenuInfo = () => {
    if (!actionSlot) return
    const slot = actionSlot
    setActionSlot(null)
    // Микро-задержка чтобы анимация меню успела свернуться
    setTimeout(() => setInfoSlot(slot), 100)
  }

  // Меню → Сменить
  const handleMenuSwap = () => {
    if (!actionSlot) return
    const slot = actionSlot
    setActionSlot(null)

    // Передаём данные через state, чтобы /swap знал что показывать
    navigate(`/swap/${programId}/${day}/${slot.order_num}`, {
      state: {
        subGroup: slot.sub_group,
        type: slot.type,
        currentExerciseId: slot.exercise_id,
        currentExerciseName: slot.exercise_name
      }
    })
  }

  const handleConfirmFinish = async () => {
    if (finishing) return
    setFinishing(true)

    try {
      const exerciseIds = slots.map(s => s.exercise_id).filter(Boolean)
      const reward = XP_REWARDS.WORKOUT_COMPLETE

      const result = await finishWorkout(programId, day, exerciseIds, reward)

      if (result) {
        await setLastCompletedDay(programId, day)
        haptic.success()
      } else {
        haptic.warning()
        console.warn('[WorkoutDay] finishWorkout returned null, navigating anyway')
      }

      setShowFinishedModal(false)
      navigate('/')
    } catch (e) {
      console.error('[WorkoutDay] handleConfirmFinish error:', e)
      haptic.error()
      setFinishing(false)
    }
  }

  const sections = groupByMuscleGroup(slots)

  return (
    <div className="page page-enter" style={styles.page}>

      <header style={styles.header}>
        <h1 style={styles.title}>ДЕНЬ {day}</h1>
        <div style={styles.subtitle}>
          {loading
            ? 'Загрузка...'
            : `${activeOrderNums.size} / ${slots.length} выполнено`}
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
                    isActive={activeOrderNums.has(slot.order_num)}
                    onTap={handleCardTap}
                    onLongPress={handleCardLongPress}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Меню действий по долгому нажатию */}
      {actionSlot && (
        <ExerciseActionMenu
          exerciseName={actionSlot.exercise_name}
          onInfo={handleMenuInfo}
          onSwap={handleMenuSwap}
          onClose={() => setActionSlot(null)}
        />
      )}

      {/* Модалка Инфо (заглушка) */}
      {infoSlot && (
        <ExerciseInfoModal
          exerciseName={infoSlot.exercise_name}
          onClose={() => setInfoSlot(null)}
        />
      )}

      {/* Модалка завершения тренировки */}
      {showFinishedModal && (
        <WorkoutFinishedModal
          reward={XP_REWARDS.WORKOUT_COMPLETE}
          onConfirm={handleConfirmFinish}
        />
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
  page: { padding: '16px 16px 24px' },
  header: { marginBottom: '16px', textAlign: 'center' },
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
  sectionsWrap: { display: 'flex', flexDirection: 'column', gap: '20px' },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
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
  exerciseList: { display: 'flex', flexDirection: 'column', gap: '8px' },
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
