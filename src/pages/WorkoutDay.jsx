import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getCurrentUser } from '../lib/auth'
import { getWorkoutDay, finishWorkout } from '../features/programs/api'
import { getProgramBySlug, getProgramDaySlots, getProgramPlaces } from '../features/programs/registry'
import { useProgramPlace } from '../lib/program-place'
import PlaceSwitcher from '../components/PlaceSwitcher'
import { MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { getDayMuscleTags } from '../utils/history'
import { setLastCompletedDay } from '../lib/storage'
import { XP_REWARDS } from '../lib/levels'
import {
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress
} from '../utils/workout-progress'
import ExerciseCard from '../components/ExerciseCard'
import ExerciseActionMenu from '../components/ExerciseActionMenu'
import WorkoutFinishedModal from '../components/WorkoutFinishedModal'
import ActionButton from '../components/ActionButton'

/**
 * Экран дня тренировки.
 *
 * Возврат с экранов "Сменить упражнение" и "Информация":
 *  - location.state.returnedFromOrderNum — order_num карточки откуда пришли
 *  - location.state.wasSwapped — true только для swap при реальной смене
 *  - location.state.scrollY — сохранённая позиция скролла страницы дня
 *
 * Эффекты при возврате (для ОБОИХ экранов — Инфо и Swap):
 *  1. Восстанавливаем точную позицию скролла (НЕ центрируем карточку).
 *     Так юзер не теряет контекст — страница ровно там же где была.
 *  2. Press-эффект (scale 0.97 → 1) на карточке откуда уходил.
 *  3. Зелёная обводка-подсветка карточки которая плавно затухает за ~1.5с —
 *     визуальный маркер "вот эту ты нажимал и сюда вернулся".
 *  4. Дополнительно для swap при wasSwapped=true: анимация "змейки" по
 *     контуру карточки (стрелки бегут по часовой стрелке один круг).
 *
 * Почему scrollY вместо scrollIntoView({block:'center'}):
 *   Раньше swap центрировал карточку, а Инфо вообще не запускал эффекты —
 *   и от этого получалось разное поведение: swap прыгал по странице,
 *   Инфо тихо возвращался куда было. Теперь оба сценария ведут себя
 *   одинаково — возврат на ту же позицию скролла.
 */
export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Прогресс грузится в эффекте ниже (после того как известно место) —
  // у каждого места (Зал/Дом/Улица) свой набор отжатых упражнений.
  const [activeOrderNums, setActiveOrderNums] = useState(() => new Set())

  const [showFinishedModal, setShowFinishedModal] = useState(false)
  const [finishStatus, setFinishStatus] = useState('idle')
  const [finishErrorMsg, setFinishErrorMsg] = useState('')
  const [finishedOffline, setFinishedOffline] = useState(false)

  const [actionSlot, setActionSlot] = useState(null)

  const [slideDir, setSlideDir] = useState('right')

  // Таймер тренировки: тикает с захода на день, сбрасывается при смене дня.
  // finishedSec фиксирует длительность на момент «Завершить» — для модалки.
  const [elapsedSec, setElapsedSec] = useState(0)
  const [finishedSec, setFinishedSec] = useState(0)

  // Эффекты возврата с других экранов:
  //   pressedOrderNum — карточка играет press-эффект (scale 0.97 → 1)
  //   glowedOrderNum  — карточка светится зелёной обводкой и плавно гаснет
  //   swappedOrderNum — карточка играет анимацию "змейки" (только swap)
  //   isReturning     — на время скролла прячем контент чтобы скрыть рывок
  const [pressedOrderNum, setPressedOrderNum] = useState(null)
  const [glowedOrderNum, setGlowedOrderNum] = useState(null)
  const [swappedOrderNum, setSwappedOrderNum] = useState(null)
  const [isReturning, setIsReturning] = useState(false)

  // Открыта ли клавиатура (ввод веса на карточке). Пока true — прибитую к низу
  // кнопку «Завершить» прячем, чтобы она не липла к клавиатуре.
  const [kbOpen, setKbOpen] = useState(false)

  const cardRefs = useRef(new Map())

  const program = useMemo(() => getProgramBySlug(programId), [programId])
  const days = useMemo(() => (program ? Object.keys(program.data.days) : ['A']), [program])

  // Выбранное место (Зал/Дом/Улица) — общий с карточками выбор. Упражнения дня
  // грузятся под него.
  const places = useMemo(() => getProgramPlaces(program), [program])
  const [place, setPlace] = useProgramPlace(programId, places)
  // Актуальное место для сейва прогресса (без гонки при переключении места).
  const placeRef = useRef(place)
  placeRef.current = place

  const programSlots = useMemo(() => getProgramDaySlots(programId, day, place), [programId, day, place])

  const dayTags = useMemo(() => getDayMuscleTags(program?.dbId, day), [program, day])

  const currentDayIdx = days.indexOf(day)
  const prevDay = currentDayIdx > 0 ? days[currentDayIdx - 1] : days[days.length - 1]
  const nextDay = currentDayIdx < days.length - 1 ? days[currentDayIdx + 1] : days[0]

  useEffect(() => {
    // Если пришли из избранного на главной (state.fromHome) — кнопка "Назад"
    // ведёт на главную. Иначе как обычно — в категорию программы.
    const fromHome = location.state?.fromHome === true
    const categoryId = program?.category || 'gym'
    backButton.setHandler(() => {
      if (fromHome) navigate('/')
      else navigate(`/category/${categoryId}`)
    })
    lockVerticalSwipes()
  }, [navigate, program, location.state])

  useEffect(() => {
    setActiveOrderNums(new Set(loadWorkoutProgress(programId, day, place)))
  }, [programId, day, place])

  // Старт/сброс таймера тренировки: при заходе и при переключении дня.
  useEffect(() => {
    setElapsedSec(0)
    const start = Date.now()
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [day])

  // На странице тренировки таб-бара нет, а кнопка «Завершить» прибита к низу
  // со своим градиентом-подложкой. Глобальный нижний скрим (.app::after) тут
  // лишний (двойное затемнение) — гасим на время страницы.
  useEffect(() => {
    document.body.classList.add('hide-app-scrim')
    return () => document.body.classList.remove('hide-app-scrim')
  }, [])

  // Клавиатура (ввод веса): прячем кнопку сразу при открытии, показываем с
  // задержкой при закрытии — чтобы не моргала на анимации клавиатуры.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let t = null
    const onResize = () => {
      const open = (window.innerHeight - vv.height) > 150
      if (open) { if (t) { clearTimeout(t); t = null } setKbOpen(true) }
      else { if (t) clearTimeout(t); t = setTimeout(() => setKbOpen(false), 350) }
    }
    vv.addEventListener('resize', onResize)
    onResize()
    return () => { vv.removeEventListener('resize', onResize); if (t) clearTimeout(t) }
  }, [])

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
        const data = await getWorkoutDay(programId, day, place)
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
  }, [programId, day, place])

  // Сохраняем под актуальное место (placeRef) — без place в deps, чтобы при
  // переключении места не затереть прогресс нового места старыми галочками
  // (load-эффект выше сначала подставит правильный набор).
  useEffect(() => {
    saveWorkoutProgress(programId, day, placeRef.current, Array.from(activeOrderNums))
  }, [programId, day, activeOrderNums])

  // Реакция на возврат с экранов "Сменить" и "Инфо".
  // Срабатывает после рендера карточек (slots не пустой, loading закончился).
  //
  // Алгоритм:
  //   1. Прячем body через opacity 0 — скрываем рывок прокрутки
  //   2. Восстанавливаем точную позицию scrollY (как было перед уходом)
  //   3. Через 60мс плавно показываем body (fade-in 220мс)
  //   4. Запускаем эффекты: press + glow (+ swap-snake если wasSwapped)
  //
  // Очищаем state из истории чтобы при свайпе между днями повтор не сработал.
  useEffect(() => {
    if (loading) return
    if (!slots.length) return

    const stateData = location.state || {}
    const returnedFrom = stateData.returnedFromOrderNum
    const wasSwapped = stateData.wasSwapped
    const savedScrollY = stateData.scrollY

    if (returnedFrom == null) return

    setIsReturning(true)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Восстанавливаем точную позицию скролла. Если savedScrollY не было
        // (например юзер пришёл из другой точки), скроллим к карточке центром
        // как раньше — мягкий fallback чтобы карточка точно нашлась.
        if (typeof savedScrollY === 'number') {
          window.scrollTo({ top: savedScrollY, left: 0, behavior: 'auto' })
        } else {
          const cardEl = cardRefs.current.get(returnedFrom)
          if (cardEl) cardEl.scrollIntoView({ behavior: 'auto', block: 'center' })
        }

        setTimeout(() => {
          setIsReturning(false)

          // Press-эффект и зелёное свечение — оба запускаются на той же
          // карточке. Press короткий (350мс), glow подольше (~1500мс).
          setPressedOrderNum(returnedFrom)
          setTimeout(() => setPressedOrderNum(null), 350)

          setGlowedOrderNum(returnedFrom)
          setTimeout(() => setGlowedOrderNum(null), 1600)

          // Анимация змейки — только для реальной смены упражнения
          if (wasSwapped) {
            setSwappedOrderNum(returnedFrom)
            setTimeout(() => setSwappedOrderNum(null), 2600)
          }
        }, 60)
      })
    })

    navigate(location.pathname, { replace: true, state: null })
  }, [loading, slots.length, location.state, location.pathname, navigate])

  const handleCardTap = (slot) => {
    if (showFinishedModal) return
    if (actionSlot) return

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

  // Вес отредактировали в модалке действий — обновляем слоты, чтобы карточка
  // под модалкой сразу показала новую цифру (без перезахода на экран).
  const handleWeightSaved = (exerciseId, weight) => {
    setSlots(prev => prev.map(s =>
      s.exercise_id === exerciseId ? { ...s, user_weight_kg: weight } : s
    ))
  }

  /**
   * Переход на страницу Инфо. Сохраняем текущий scrollY в state, чтобы
   * при возврате восстановить позицию скролла точь-в-точь. ReturnedFromOrderNum
   * передаём в state на путь возврата — он будет прочитан в state.returnTo
   * на ExerciseInfo, и оттуда переотправлен в WorkoutDay при backButton.
   */
  const handleMenuInfo = () => {
    if (!actionSlot) return
    const slot = actionSlot
    setActionSlot(null)
    navigate(`/exercise/${slot.exercise_id}`, {
      state: {
        returnTo: `/workout/${programId}/${day}`,
        returnedFromOrderNum: slot.order_num,
        scrollY: window.scrollY
      }
    })
  }

  /**
   * Переход на страницу Сменить. Аналогично Инфо — сохраняем scrollY,
   * чтобы возврат был на ту же позицию (а не центрирование карточки).
   */
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
        muscleGroup: slot.muscle_group,
        scrollY: window.scrollY
      }
    })
  }

  const goToDay = (targetDay, direction) => {
    if (targetDay === day) return
    haptic.light()
    setSlideDir(direction === 'next' ? 'right' : 'left')
    // Пробрасываем fromHome дальше, чтобы после переключения дней кнопка
    // "Назад" всё ещё вела на главную (если зашли из избранного).
    navigate(`/workout/${programId}/${targetDay}`, {
      replace: true,
      state: location.state?.fromHome ? { fromHome: true } : null
    })
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
    setFinishedSec(elapsedSec)
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

      // Оффлайн-завершение: тренировка ушла в очередь, синканётся при сети.
      // Прогресс галочек тоже чистим (тренировка считается завершённой локально),
      // день фиксируем в цикле A/B/C. Показываем спец-сообщение в модалке.
      if (result.offline) {
        await setLastCompletedDay(programId, day)
        clearWorkoutProgress(programId, day, place)
        haptic.warning()
        setFinishedOffline(true)
        setFinishStatus('idle')
        // Не уходим с экрана сразу — модалка покажет "сохранено локально",
        // юзер сам нажмёт ОК и уйдёт на главную.
        return
      }

      await setLastCompletedDay(programId, day)
      clearWorkoutProgress(programId, day, place)
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

      {/* Шапка дня закреплена сверху (sticky) — то же устройство, что карточка
          игрока на главной: сплошной фон зоны + фейд-переход под блоком. */}
      <div style={styles.stickyHeader}>

        {/* Один целиковый блок: место+таймер сверху, стрелки + день с группами,
            прогресс. Фон/строук как у карточки игрока на главной. */}
        <div style={styles.headerCard}>

          <div style={styles.topMetaRow}>
            {/* Место тренировки (Зал/Дом/Улица) — переключатель; смена места
                подгружает упражнения этого места из конструктора. */}
            <PlaceSwitcher program={program} value={place} onChange={setPlace} />
            <span style={styles.timer}>{formatDuration(elapsedSec)}</span>
          </div>

          <div
            style={styles.headerRow}
            onTouchStart={handleHeaderTouchStart}
            onTouchEnd={handleHeaderTouchEnd}
          >
            <button
              onClick={() => goToDay(prevDay, 'prev')}
              style={styles.arrowButton}
              className="press-tile"
              aria-label="Предыдущий день"
            >
              <ArrowLeft />
            </button>

            <div style={styles.dayCol}>
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
              {dayTags.length > 0 && (
                <div key={`tags-${day}`} style={styles.dayTagsRow}>
                  {dayTags.map((t, i) => (
                    <span key={t.key} style={styles.dayTagText}>
                      {i > 0 && <span style={styles.dayTagDot}> · </span>}
                      {t.label.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => goToDay(nextDay, 'next')}
              style={styles.arrowButton}
              className="press-tile"
              aria-label="Следующий день"
            >
              <ArrowRight />
            </button>
          </div>

          <div style={styles.progressRow}>
            <span style={styles.progressLabel}>
              {loading ? '...' : `${activeOrderNums.size} / ${slots.length}`}
            </span>
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

        {/* Fade-scrim под блоком дня: контент уходит под шапку плавно. */}
        <div style={styles.stickyFade} aria-hidden="true" />
      </div>

      <div style={{
        ...styles.body,
        opacity: isReturning ? 0 : 1,
        transition: isReturning ? 'none' : 'opacity 0.22s ease-out'
      }}>

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
              <section
                key={`${section.muscleGroup}-${sIdx}`}
                style={styles.section}
              >
                <h2 style={{
                  ...styles.muscleHeader,
                  color: getMuscleGroupColors(section.muscleGroup).accent
                }}>
                  {MUSCLE_GROUP_LABELS[section.muscleGroup] || section.muscleGroup.toUpperCase()}
                </h2>

                <div style={styles.exerciseList}>
                  {section.slots.map(slot => {
                    const isPressed = pressedOrderNum === slot.order_num
                    const isGlowed = glowedOrderNum === slot.order_num
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

                        {/* Зелёная подсветка-обводка — индикатор "вот эту ты
                            нажимал и сюда вернулся". Плавно появляется и гаснет.
                            Радиус 33px совпадает с border-radius карточки. */}
                        {isGlowed && <ReturnGlow />}

                        {isSwapped && <SwapAnimationOverlay />}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

      </div>

      {/* Кнопка «Завершить» прибита к низу (как «Добавить упражнения» в пикере):
          градиент-подложка + кнопка. При открытой клавиатуре прячем, чтобы не
          липла к клавишам. */}
      {!loading && slots.length > 0 && !kbOpen && (
        <div style={styles.finishBar}>
          <ActionButton
            onClick={handleFinishButtonTap}
            disabled={!canFinish}
            variant={isAllDone ? 'accent' : 'neutral'}
            hug
          >
            {isAllDone ? '✓ ЗАВЕРШИТЬ ТРЕНИРОВКУ' : 'ЗАВЕРШИТЬ ТРЕНИРОВКУ'}
          </ActionButton>
        </div>
      )}

      {actionSlot && (
        <ExerciseActionMenu
          slot={actionSlot}
          onWeightSaved={handleWeightSaved}
          onInfo={handleMenuInfo}
          onSwap={handleMenuSwap}
          onClose={() => {
            const orderNum = actionSlot.order_num
            setActionSlot(null)
            // Тот же эффект что при возврате с Инфо/Смены: лёгкий press
            // + зелёная подсветка-обводка карточки которую долго тапнули.
            setPressedOrderNum(orderNum)
            setTimeout(() => setPressedOrderNum(null), 350)
            setGlowedOrderNum(orderNum)
            setTimeout(() => setGlowedOrderNum(null), 1600)
          }}
        />
      )}

      {showFinishedModal && (
        <WorkoutFinishedModal
          reward={XP_REWARDS.WORKOUT_COMPLETE}
          durationLabel={formatDuration(finishedSec)}
          status={finishStatus}
          errorMsg={finishErrorMsg}
          offline={finishedOffline}
          onConfirm={() => {
            // Если завершили оффлайн — кнопка ОК просто уводит на главную
            if (finishedOffline) {
              setShowFinishedModal(false)
              setFinishedOffline(false)
              navigate('/')
              return
            }
            handleConfirmFinish()
          }}
        />
      )}
    </div>
  )
}

/**
 * Зелёная обводка-подсветка вокруг карточки — индикатор возврата.
 *
 * Поведение:
 *  - Появляется быстро (~150мс)
 *  - Держится ~600мс на полную яркость
 *  - Плавно гаснет до 0 (~800мс)
 *  - Полное время ~1.5с
 *
 * Технически: абсолютно позиционированный div на инсете -1px чтобы
 * обводка выходила за края карточки на пиксель (как у featured карточки
 * "СИЛОВАЯ" на главной). Border + box-shadow дают двойное свечение —
 * чёткий контур + мягкое сияние вокруг.
 *
 * pointerEvents: none — клики проходят сквозь, карточка остаётся тапабельной.
 * border-radius 33px = радиус карточки, иначе обводка не повторит форму.
 */
function ReturnGlow() {
  return <div style={glowStyles.wrap} aria-hidden="true" />
}

const glowStyles = {
  wrap: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: '34px',
    border: '1.5px solid var(--color-primary)',
    boxShadow: '0 0 18px rgba(158, 209, 83, 0.45), inset 0 0 14px rgba(158, 209, 83, 0.10)',
    pointerEvents: 'none',
    animation: 'returnGlowFade 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
    zIndex: 9
  }
}

/**
 * Анимация "змейки" — один зелёный сегмент-полоса проходит по контуру
 * карточки по часовой стрелке ровно один круг и исчезает.
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
  const SEGMENT = PERIMETER * 0.14

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
            strokeDasharray: `${SEGMENT} ${PERIMETER}`,
            filter: 'drop-shadow(0 0 6px rgba(158, 209, 83, 0.7))',
            animation: 'snakeRun 2.4s cubic-bezier(0.45, 0, 0.55, 1) forwards'
          }}
        />
      </svg>

      <style>{`
        @keyframes snakeRun {
          0%   { stroke-dashoffset: 0; opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 5 L8 12 L15 19" stroke="rgba(255,255,255,0.5)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 5 L16 12 L9 19" stroke="rgba(255,255,255,0.5)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// mm:ss из секунд (таймер тренировки).
function formatDuration(totalSec) {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
    padding: '0 16px',
    paddingBottom: 'calc(120px + env(safe-area-inset-bottom))',
    minHeight: '100dvh'
  },
  // Шапка дня закреплена сверху — то же устройство, что playerSticky на главной:
  // sticky, сплошной фон зоны (чтобы контент не просвечивал), отступ под
  // телеграмовские элементы, full-width через отрицательные боковые margin.
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'var(--color-bg)',
    // Верх карточки-шапки — ровно 16px ниже кнопок Telegram (зашито в var).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: 0,
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  // Fade-переход под блоком дня: контент уходит под шапку плавно (градиент + blur).
  stickyFade: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: '28px',
    pointerEvents: 'none',
    zIndex: 29,
    background: 'linear-gradient(to bottom, var(--color-bg) 0%, rgba(13, 12, 12, 0.7) 35%, rgba(13, 12, 12, 0) 100%)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    maskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)'
  },
  // Один целиковый блок — фон и строук как у карточки игрока на главной.
  // Тень не нужна — переход даёт фейд под блоком (как на главной).
  headerCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)'
  },
  // Верхний ряд блока: место тренировки слева, таймер справа.
  topMetaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2px'
  },
  timer: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    fontVariantNumeric: 'tabular-nums'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    touchAction: 'pan-y'
  },
  // Стрелки — прозрачные кнопки внутри общего блока (без своих пузырей).
  arrowButton: {
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  dayCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px'
  },
  dayLetterWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  dayLetter: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '45px',
    color: 'var(--color-primary)',
    letterSpacing: '0',
    lineHeight: 1,
    textShadow: '0 0 12px rgba(158, 209, 83, 0.3)',
    display: 'inline-block'
  },
  // Прогресс: цифры 7 / 10 слева, длинная полоска справа — строкой внутри блока.
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 8px'
  },
  progressLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    flexShrink: 0,
    whiteSpace: 'nowrap'
  },
  progressTrack: {
    flex: 1,
    height: '7px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: '4px',
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
  // Текст заголовка стоит ровно там же, где текст закреплённого пузырька
  // (left 20px + padding-left 14px = 34px от края страницы). Страница даёт
  // отступ 16px, значит у заголовка padding-left 18px → текст тоже на 34px.
  // Так при скролле пилюля-пузырёк появляется ВОКРУГ заголовка, а сам текст
  // не сдвигается.
  muscleHeader: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    padding: '4px 4px 4px 18px',
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
    borderRadius: 'var(--radius-medium)',
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
  // Футер кнопки «Завершить» — прибит к низу (как пикер/конструктор):
  // градиент-подложка, список уезжает под него; сама кнопка кликабельна.
  finishBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    padding: '44px 16px calc(16px + env(safe-area-inset-bottom))',
    background: 'linear-gradient(180deg, rgba(13,12,12,0) 0%, rgba(13,12,12,0.35) 55%, rgba(13,12,12,0.8) 82%, var(--color-bg) 100%)',
    pointerEvents: 'none',
    zIndex: 40
  },
  dayTagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0',
    maxWidth: '240px'
  },
  dayTagText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    lineHeight: 1.2
  },
  dayTagDot: {
    color: 'var(--color-text-secondary)',
    opacity: 0.5
  }
}