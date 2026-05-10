import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getCurrentUser, refreshCurrentUser } from '../lib/auth'
import { getWorkoutDay, MUSCLE_GROUP_LABELS, finishWorkout } from '../lib/programs'
import { setLastCompletedDay } from '../lib/storage'
import { XP_REWARDS } from '../lib/levels'
import ExerciseCard from '../components/ExerciseCard'
import WorkoutFinishedModal from '../components/WorkoutFinishedModal'

/**
 * Экран дня тренировки.
 *
 * Д2:
 * - Тап карточки → активация (затемнение + блюр + "Готово, молодец")
 * - Когда ВСЕ карточки активированы → модалка финиша через 0.5 сек
 * - Кнопка ОК → finishWorkout (RPC: workouts + exercise_sets + +150 💪 + стрик) → / (Home)
 */
export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Set order_num'ов активных карточек. Используем Set для быстрых toggle-операций
  const [activeOrderNums, setActiveOrderNums] = useState(() => new Set())

  // Показывать ли финальную модалку
  const [showFinishedModal, setShowFinishedModal] = useState(false)

  // Защита от двойного нажатия "ОК"
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    backButton.setHandler(() => navigate(`/program/${programId}`))
    lockVerticalSwipes()
  }, [navigate, programId])

  // Загрузка упражнений (как было в Д1)
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

  /**
   * Тап на карточку — активируем/деактивируем.
   * Если после активации ВСЕ карточки активны — открываем модалку финиша.
   */
  const handleCardTap = (slot) => {
    if (showFinishedModal || finishing) return

    setActiveOrderNums(prev => {
      const next = new Set(prev)
      if (next.has(slot.order_num)) {
        // Деактивация
        next.delete(slot.order_num)
        haptic.light()
      } else {
        // Активация
        next.add(slot.order_num)
        haptic.success()

        // Проверка - все ли карточки теперь активны?
        if (slots.length > 0 && next.size === slots.length) {
          // Через 0.6 сек показываем модалку (даём toast'у "Готово!" анимироваться)
          setTimeout(() => setShowFinishedModal(true), 600)
        }
      }
      return next
    })
  }

  /**
   * Кнопка ОК на модалке финиша.
   * Финализируем тренировку в БД, ставим last_day, возвращаемся на главную.
   */
  const handleConfirmFinish = async () => {
    if (finishing) return
    setFinishing(true)

    try {
      const exerciseIds = slots.map(s => s.exercise_id).filter(Boolean)
      const reward = XP_REWARDS.WORKOUT_COMPLETE // 150

      const result = await finishWorkout(programId, day, exerciseIds, reward)

      if (result) {
        // Запоминаем какой день только что закончили (для Program.jsx → "Сегодня день B")
        await setLastCompletedDay(programId, day)
        haptic.success()
      } else {
        // Даже если не смогли записать в БД — UX не должен ломаться
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
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

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
