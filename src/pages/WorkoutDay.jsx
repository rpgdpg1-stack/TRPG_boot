import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getCurrentUser } from '../lib/auth'
import { getWorkoutDay, finishWorkout } from '../features/programs/api'
import { MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { setLastCompletedDay } from '../lib/storage'
import { XP_REWARDS } from '../lib/levels'
import {
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress
} from '../utils/workout-progress'
import ExerciseCard from '../components/ExerciseCard'
import ExerciseActionMenu from '../components/ExerciseActionMenu'
import ExerciseInfoModal from '../components/ExerciseInfoModal'
import WorkoutFinishedModal from '../components/WorkoutFinishedModal'

/**
 * Экран дня тренировки.
 *
 * ПРАВКИ:
 * - Прогресс отжатых упражнений сохраняется в localStorage. Если юзер вышел
 *   и вернулся — продолжает с того же места. Сбрасывается только при явном
 *   завершении тренировки.
 * - Кнопка "ЗАВЕРШИТЬ ТРЕНИРОВКУ" всегда внизу страницы. Неактивна пока не
 *   отжато хотя бы одно упражнение. Юзер может завершить даже не доделав
 *   все упражнения.
 * - Старая логика "отжал все → автоматически модалка" остаётся.
 */
export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Восстанавливаем прогресс синхронно при первом рендере,
  // чтобы карточки сразу появились в правильном состоянии без мигания.
  const [activeOrderNums, setActiveOrderNums] = useState(() => {
    return new Set(loadWorkoutProgress(programId, day))
  })

  const [showFinishedModal, setShowFinishedModal] = useState(false)

  // Состояние модалки: 'idle' | 'saving' | 'error'
  const [finishStatus, setFinishStatus] = useState('idle')
  const [finishErrorMsg, setFinishErrorMsg] = useState('')

  const [actionSlot, setActionSlot] = useState(null)
  const [infoSlot, setInfoSlot] = useState(null)

  useEffect(() => {
    backButton.setHandler(() => navigate(`/program/${programId}`))
    lockVerticalSwipes()
  }, [navigate, programId])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!getCurrentUser()) {
        setError('Не удалось авторизоваться. Перезапусти приложение.')
        setLoading(false)
        return
      }

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

    load()
    return () => { cancelled = true }
  }, [programId, day])

  /**
   * Каждый раз когда меняется набор отжатых — пишем в localStorage.
   * Это автосохранение: даже если приложение убьют, состояние не потеряется.
   */
  useEffect(() => {
    saveWorkoutProgress(programId, day, Array.from(activeOrderNums))
  }, [programId, day, activeOrderNums])

  const handleCardTap = (slot) => {
    if (showFinishedModal) return
    if (actionSlot || infoSlot) return

    setActiveOrderNums(prev => {
      const next = new Set(prev)
      if (next.has(slot.order_num)) {
        next.delete(slot.order_num)
        haptic.light()
      } else {
        next.add(slot.order_num)
        haptic.success()

        // Если отжаты все упражнения — автоматически открываем модалку
        if (slots.length > 0 && next.size === slots.length) {
          setTimeout(() => setShowFinishedModal(true), 600)
        }
      }
      return next
    })
  }

  const handleCardLongPress = (slot) => {
    if (showFinishedModal) return
    setActionSlot(slot)
  }

  const handleMenuInfo = () => {
    if (!actionSlot) return
    const slot = actionSlot
    setActionSlot(null)
    setTimeout(() => setInfoSlot(slot), 100)
  }

  const handleMenuSwap = () => {
    if (!actionSlot) return
    const slot = actionSlot
    setActionSlot(null)

    navigate(`/swap/${programId}/${day}/${slot.order_num}`, {
      state: {
        subGroup: slot.sub_group,
        type: slot.type,
        currentExerciseId: slot.exercise_id,
        currentExerciseName: slot.exercise_name
      }
    })
  }

  /**
   * Тап по кнопке "ЗАВЕРШИТЬ ТРЕНИРОВКУ".
   * Просто открываем модалку — реальное сохранение происходит при подтверждении.
   */
  const handleFinishButtonTap = () => {
    if (activeOrderNums.size === 0) return
    haptic.medium()
    setShowFinishedModal(true)
  }

  /**
   * Подтверждение в модалке завершения.
   * При ошибке модалка остаётся открытой с кнопкой "Повторить".
   */
  const handleConfirmFinish = async () => {
    if (finishStatus === 'saving') return

    setFinishStatus('saving')
    setFinishErrorMsg('')

    try {
      // Сохраняем только реально активированные упражнения (не все 10 если
      // юзер решил завершить раньше).
      const exerciseIds = slots
        .filter(s => activeOrderNums.has(s.order_num))
        .map(s => s.exercise_id)
        .filter(Boolean)

      const reward = XP_REWARDS.WORKOUT_COMPLETE
      const result = await finishWorkout(programId, day, exerciseIds, reward)

      if (!result) {
        setFinishStatus('error')
        setFinishErrorMsg('Проверь подключение к интернету и попробуй ещё раз.')
        haptic.error()
        return
      }

      // Успех — отмечаем день пройденным, чистим прогресс, уходим
      await setLastCompletedDay(programId, day)
      clearWorkoutProgress(programId, day)
      haptic.success()

      setShowFinishedModal(false)
      setFinishStatus('idle')
      navigate('/')

    } catch (e) {
      console.error('[WorkoutDay] handleConfirmFinish error:', e)
      setFinishStatus('error')
      setFinishErrorMsg(e?.message || 'Что-то пошло не так. Попробуй ещё раз.')
      haptic.error()
    }
  }

  const sections = groupByMuscleGroup(slots)
  const canFinish = activeOrderNums.size > 0
  const isAllDone = slots.length > 0 && activeOrderNums.size === slots.length

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

      {/* Кнопка ЗАВЕРШИТЬ — всегда внизу, неактивна пока ничего не отжато */}
      {!loading && slots.length > 0 && (
        <div style={styles.bottomBar}>
          <button
            onClick={handleFinishButtonTap}
            disabled={!canFinish}
            style={{
              ...styles.finishButton,
              ...(isAllDone ? styles.finishButtonReady : {}),
              opacity: canFinish ? 1 : 0.35,
              cursor: canFinish ? 'pointer' : 'default'
            }}
          >
            {isAllDone ? '✓ ЗАВЕРШИТЬ ТРЕНИРОВКУ' : 'ЗАВЕРШИТЬ ТРЕНИРОВКУ'}
          </button>
        </div>
      )}

      {actionSlot && (
        <ExerciseActionMenu
          exerciseName={actionSlot.exercise_name}
          onInfo={handleMenuInfo}
          onSwap={handleMenuSwap}
          onClose={() => setActionSlot(null)}
        />
      )}

      {infoSlot && (
        <ExerciseInfoModal
          exerciseName={infoSlot.exercise_name}
          onClose={() => setInfoSlot(null)}
        />
      )}

      {showFinishedModal && (
        <WorkoutFinishedModal
          reward={XP_REWARDS.WORKOUT_COMPLETE}
          status={finishStatus}
          errorMsg={finishErrorMsg}
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
  page: {
    // Большой отступ снизу — чтобы контент не залезал под кнопку "Завершить"
    padding: '16px 16px 120px'
  },
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
  },
  // Bottom-bar над таб-баром — фиксированный, с лёгким градиентом для разделения
  bottomBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    // Над таб-баром: tabbar-height + bottom + небольшой gap
    bottom: 'calc(var(--tabbar-height) + var(--tabbar-bottom) + 8px)',
    padding: '8px 16px',
    background: 'linear-gradient(180deg, transparent 0%, var(--color-bg) 30%, var(--color-bg) 100%)',
    paddingTop: '20px',
    zIndex: 90,
    pointerEvents: 'none'
  },
  finishButton: {
    width: '100%',
    padding: '16px',
    background: 'var(--color-card)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    pointerEvents: 'auto',
    transition: 'opacity 0.2s ease, background 0.2s ease, border-color 0.2s ease'
  },
  // Когда отжаты все упражнения — кнопка зелёная и заметная
  finishButtonReady: {
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    border: '1px solid var(--color-primary)',
    boxShadow: '0 4px 20px rgba(158, 209, 83, 0.3)'
  }
}