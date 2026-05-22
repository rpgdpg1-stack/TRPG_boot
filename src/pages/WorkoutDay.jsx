import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getCurrentUser } from '../lib/auth'
import { getWorkoutDay, finishWorkout } from '../features/programs/api'
import { getProgramBySlug, getProgramDaySlots } from '../features/programs/registry'
import { MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
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
 * Возврат с экрана замены упражнения:
 *  - location.state.returnedFromOrderNum — order_num карточки откуда пришли
 *  - location.state.wasSwapped — было ли реально сохранено новое упражнение
 *
 * Когда юзер возвращается:
 *  1. Скроллим к нужной карточке МГНОВЕННО (behavior: 'auto') — без езды
 *     снизу-вверх. Юзер видит сразу нужную позицию страницы.
 *  2. Press-эффект (scale 0.97 → 1) — визуальная подсказка "вот эта карточка".
 *  3. Если wasSwapped === true → играет анимация "змейки" — два зелёных
 *     сегмента идут друг за другом по контуру карточки по часовой стрелке,
 *     обходят полный круг и исчезают. Эффект лоадера.
 */
export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeOrderNums, setActiveOrderNums] = useState(() => {
    return new Set(loadWorkoutProgress(programId, day))
  })

  const [showFinishedModal, setShowFinishedModal] = useState(false)
  const [finishStatus, setFinishStatus] = useState('idle')
  const [finishErrorMsg, setFinishErrorMsg] = useState('')

  const [actionSlot, setActionSlot] = useState(null)
  const [infoSlot, setInfoSlot] = useState(null)

  const [slideDir, setSlideDir] = useState('right')

  // pressedOrderNum — карточка играет лёгкий press-эффект (scale 0.97 → 1)
  // swappedOrderNum — карточка играет анимацию "змейки" (стрелки по контуру)
  const [pressedOrderNum, setPressedOrderNum] = useState(null)
  const [swappedOrderNum, setSwappedOrderNum] = useState(null)

  // Реф на DOM-обёртки карточек: order_num → div. Нужно для scrollIntoView.
  const cardRefs = useRef(new Map())

  const program = useMemo(() => getProgramBySlug(programId), [programId])
  const days = useMemo(() => (program ? Object.keys(program.data.days) : ['A']), [program])

  const programSlots = useMemo(() => getProgramDaySlots(programId, day), [programId, day])

  const currentDayIdx = days.indexOf(day)
  const prevDay = currentDayIdx > 0 ? days[currentDayIdx - 1] : days[days.length - 1]
  const nextDay = currentDayIdx < days.length - 1 ? days[currentDayIdx + 1] : days[0]

  useEffect(() => {
    const categoryId = program?.category || 'gym'
    backButton.setHandler(() => navigate(`/category/${categoryId}`))
    lockVerticalSwipes()
  }, [navigate, program])

  useEffect(() => {
    setActiveOrderNums(new Set(loadWorkoutProgress(programId, day)))
  }, [programId, day])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!getCurrentUser()) {
        setError('Не удалось авторизоваться. Перезапусти приложение.')
        setLoading(false)
        return
      }

      setLoading(true)
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

  useEffect(() => {
    saveWorkoutProgress(programId, day, Array.from(activeOrderNums))
  }, [programId, day, activeOrderNums])

  // Реакция на возврат с экрана замены упражнения.
  // Срабатывает после рендера карточек (slots не пустой, loading закончился).
  useEffect(() => {
    if (loading) return
    if (!slots.length) return

    const stateData = location.state || {}
    const returnedFrom = stateData.returnedFromOrderNum
    const wasSwapped = stateData.wasSwapped

    if (returnedFrom == null) return

    // requestAnimationFrame ×2 — даём React дорисовать карточки в DOM.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cardEl = cardRefs.current.get(returnedFrom)
        if (cardEl) {
          // behavior: 'auto' — мгновенный скролл, без анимации езды.
          cardEl.scrollIntoView({ behavior: 'auto', block: 'center' })
        }

        // Лёгкий press-эффект на 350мс
        setPressedOrderNum(returnedFrom)
        setTimeout(() => setPressedOrderNum(null), 350)

        // Анимация змейки — только если реально была смена упражнения
        if (wasSwapped) {
          setSwappedOrderNum(returnedFrom)
          // Длительность: 1.4с основная анимация + 0.3с задержка второй стрелки
          setTimeout(() => setSwappedOrderNum(null), 1700)
        }
      })
    })

    // Чистим state из истории чтобы при последующих re-render'ах (например
    // при свайпе между днями) повтор не сработал.
    navigate(location.pathname, { replace: true, state: null })
  }, [loading, slots.length, location.state, location.pathname, navigate])

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

    const programSlot = programSlots.find(s => s.order_num === slot.order_num)
    const defaultExerciseId = programSlot?.default_exercise_id || null

    navigate(`/swap/${programId}/${day}/${slot.order_num}`, {
      state: {
        subGroup: slot.sub_group,
        type: slot.type,
        currentExerciseId: slot.exercise_id,
        currentExerciseName: slot.exercise_name,
        defaultExerciseId,
        muscleGroup: slot.muscle_group
      }
    })
  }

  const goToDay = (targetDay, direction) => {
    if (targetDay === day) return
    haptic.light()
    setSlideDir(direction === 'next' ? 'right' : 'left')
    navigate(`/workout/${programId}/${targetDay}`, { replace: true })
  }

  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  const handleHeaderTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleHeaderTouchEnd = (e) => {
    if (touchStartX.current === null) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const dx = endX - touchStartX.current
    const dy = endY - touchStartY.current

    touchStartX.current = null
    touchStartY.current = null

    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return

    if (dx < 0) {
      goToDay(nextDay, 'next')
    } else {
      goToDay(prevDay, 'prev')
    }
  }

  const handleFinishButtonTap = () => {
    if (activeOrderNums.size === 0) return
    haptic.medium()
    setShowFinishedModal(true)
  }

  const handleConfirmFinish = async () => {
    if (finishStatus === 'saving') return

    setFinishStatus('saving')
    setFinishErrorMsg('')

    try {
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

  const totalSlots = slots.length || 1
  const progressPct = Math.min(100, (activeOrderNums.size / totalSlots) * 100)

  const dayLetterAnimClass = slideDir === 'right'
    ? 'day-letter-slide-in-right'
    : 'day-letter-slide-in-left'

  return (
    <div style={styles.page}>

      <div style={styles.stickyHeader}>

        <div
          style={styles.headerRow}
          onTouchStart={handleHeaderTouchStart}
          onTouchEnd={handleHeaderTouchEnd}
        >
          <button
            onClick={() => goToDay(prevDay, 'prev')}
            style={styles.arrowButton}
            aria-label="Предыдущий день"
          >
            <ArrowLeft />
          </button>

          <div style={styles.dayLetterWrap}>
            <span
              key={day}
              className={dayLetterAnimClass}
              style={styles.dayLetter}
            >
              {day}
            </span>
            <SwipeHintArrow />
          </div>

          <button
            onClick={() => goToDay(nextDay, 'next')}
            style={styles.arrowButton}
            aria-label="Следующий день"
          >
            <ArrowRight />
          </button>
        </div>

        <div style={styles.progressWrap}>
          <div style={styles.progressLabel}>
            {loading ? '...' : `${activeOrderNums.size} / ${slots.length}`}
          </div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPct}%`
              }}
            />
          </div>
        </div>
      </div>

      <div style={styles.body}>

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
                <h2 style={{
                  ...styles.muscleHeader,
                  color: getMuscleGroupColors(section.muscleGroup).accent
                }}>
                  {MUSCLE_GROUP_LABELS[section.muscleGroup] || section.muscleGroup.toUpperCase()}
                </h2>

                <div style={styles.exerciseList}>
                  {section.slots.map(slot => {
                    const isPressed = pressedOrderNum === slot.order_num
                    const isSwapped = swappedOrderNum === slot.order_num
                    return (
                      <div
                        key={`${slot.order_num}-${slot.exercise_id}`}
                        ref={(el) => {
                          if (el) cardRefs.current.set(slot.order_num, el)
                          else cardRefs.current.delete(slot.order_num)
                        }}
                        style={{
                          position: 'relative',
                          transform: isPressed ? 'scale(0.97)' : 'scale(1)',
                          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <ExerciseCard
                          slot={slot}
                          isActive={activeOrderNums.has(slot.order_num)}
                          onTap={handleCardTap}
                          onLongPress={handleCardLongPress}
                        />

                        {isSwapped && <SwapAnimationOverlay />}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {!loading && slots.length > 0 && (
          <div style={styles.finishWrap}>
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
      </div>

      {actionSlot && (
        <ExerciseActionMenu
          slot={actionSlot}
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

/**
 * Анимация "змейки" — два зелёных сегмента-лоадера обходят контур карточки
 * по часовой стрелке. Второй идёт за первым с задержкой 0.3с, образуя
 * эффект двойной полоски-загрузки.
 *
 * Геометрия:
 *  - SVG растягивается под реальные размеры карточки (preserveAspectRatio="none")
 *  - rx/ry углов = 33px — совпадает с border-radius карточки
 *  - Путь стартует с середины верхней грани (12 часов) и идёт по часовой
 *  - vectorEffect="non-scaling-stroke" — толщина линии 3px остаётся постоянной
 *    при любом растяжении SVG
 *
 * stroke-dasharray делает видимым только сегмент в 18% длины периметра.
 * stroke-dashoffset → -PERIMETER за 1.4с создаёт эффект бегущей точки.
 */
function SwapAnimationOverlay() {
  const W = 700
  const H = 150
  const R = 33

  const path = `
    M ${W / 2} 0
    H ${W - R}
    A ${R} ${R} 0 0 1 ${W} ${R}
    V ${H - R}
    A ${R} ${R} 0 0 1 ${W - R} ${H}
    H ${R}
    A ${R} ${R} 0 0 1 0 ${H - R}
    V ${R}
    A ${R} ${R} 0 0 1 ${R} 0
    Z
  `.trim()

  const PERIMETER = 2 * (W + H) - 8 * R + 2 * Math.PI * R

  return (
    <div style={overlayStyles.wrap} aria-hidden="true">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={overlayStyles.svg}
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{
            strokeDasharray: `${PERIMETER * 0.18} ${PERIMETER}`,
            filter: 'drop-shadow(0 0 6px rgba(158, 209, 83, 0.7))',
            animation: 'snakeRun 1.4s cubic-bezier(0.4, 0, 0.2, 1) forwards'
          }}
        />

        <path
          d={path}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{
            strokeDasharray: `${PERIMETER * 0.18} ${PERIMETER}`,
            filter: 'drop-shadow(0 0 6px rgba(158, 209, 83, 0.7))',
            animation: 'snakeRun 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards',
            opacity: 0
          }}
        />
      </svg>

      <style>{`
        @keyframes snakeRun {
          0%   { stroke-dashoffset: 0; opacity: 0; }
          10%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { stroke-dashoffset: -${PERIMETER}; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

const overlayStyles = {
  wrap: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 10
  },
  svg: {
    width: '100%',
    height: '100%',
    overflow: 'visible'
  }
}

function ArrowLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <g fill="rgba(255,255,255,0.5)">
        <rect x="12" y="6"  width="2" height="2" />
        <rect x="10" y="8"  width="2" height="2" />
        <rect x="8"  y="10" width="2" height="2" />
        <rect x="6"  y="12" width="2" height="2" />
        <rect x="8"  y="14" width="2" height="2" />
        <rect x="10" y="16" width="2" height="2" />
        <rect x="12" y="18" width="2" height="2" />
      </g>
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <g fill="rgba(255,255,255,0.5)">
        <rect x="10" y="6"  width="2" height="2" />
        <rect x="12" y="8"  width="2" height="2" />
        <rect x="14" y="10" width="2" height="2" />
        <rect x="16" y="12" width="2" height="2" />
        <rect x="14" y="14" width="2" height="2" />
        <rect x="12" y="16" width="2" height="2" />
        <rect x="10" y="18" width="2" height="2" />
      </g>
    </svg>
  )
}

function SwipeHintArrow() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" style={{ marginLeft: 4 }}>
      <g fill="rgba(255,255,255,0.35)">
        <rect x="5"  y="2"  width="2" height="2" />
        <rect x="5"  y="4"  width="2" height="2" />
        <rect x="5"  y="6"  width="2" height="2" />
        <rect x="3"  y="8"  width="2" height="2" />
        <rect x="5"  y="8"  width="2" height="2" />
        <rect x="7"  y="8"  width="2" height="2" />
        <rect x="5"  y="10" width="2" height="2" />
      </g>
    </svg>
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
    padding: '0 16px 40px',
    minHeight: '100dvh'
  },
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'var(--color-bg)',
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: '14px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px',
    marginBottom: '14px',
    touchAction: 'pan-y'
  },
  arrowButton: {
    background: 'transparent',
    border: 'none',
    padding: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent'
  },
  dayLetterWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: '120px'
  },
  dayLetter: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '64px',
    color: 'var(--color-primary)',
    letterSpacing: '0',
    lineHeight: 1,
    textShadow: '0 0 12px rgba(158, 209, 83, 0.3)',
    display: 'inline-block'
  },
  progressWrap: {
    padding: '0 4px'
  },
  progressLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    marginBottom: '6px'
  },
  progressTrack: {
    width: '100%',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: '2px',
    transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
  },
  body: {
    paddingTop: '20px'
  },
  sectionsWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  muscleHeader: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    fontWeight: 'normal',
    padding: '4px 4px',
    margin: 0
  },
  exerciseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
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
  },
  finishWrap: {
    marginTop: '28px',
    paddingTop: '8px'
  },
  finishButton: {
    width: '100%',
    padding: '18px',
    background: 'var(--color-card)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    transition: 'opacity 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease'
  },
  finishButtonReady: {
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    border: '1px solid var(--color-primary)',
    boxShadow: '0 4px 20px rgba(158, 209, 83, 0.3)'
  }
}