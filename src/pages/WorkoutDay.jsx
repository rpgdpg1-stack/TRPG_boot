import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react'
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
import AnchorMenu from '../components/AnchorMenu'
import { getExerciseNote, getExerciseNoteCached } from '../lib/notes'
import WorkoutFinishedModal from '../components/WorkoutFinishedModal'
import FinishConfirmModal from '../components/FinishConfirmModal'
import ActionButton from '../components/ActionButton'
import UiIcon from '../components/UiIcon'

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

// Память последних загруженных слотов по ключу `${programId}/${day}/${place}`.
// На возврате с Инфо/Смены отдаёт их синхронно — без скелетона и дозагрузки,
// чтобы позицию скролла можно было восстановить до отрисовки (без моргания).
const slotsMemory = new Map()

export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Тик повторной загрузки (кнопка «Обновить» на экране ошибки).
  const [reloadTick, setReloadTick] = useState(0)

  // Прогресс грузится в эффекте ниже (после того как известно место) —
  // у каждого места (Зал/Дом/Улица) свой набор отжатых упражнений.
  const [activeOrderNums, setActiveOrderNums] = useState(() => new Set())

  // Подтверждение завершения (минимал-модалка перед «праздничной»).
  const [showConfirm, setShowConfirm] = useState(false)
  const [showFinishedModal, setShowFinishedModal] = useState(false)
  const [finishStatus, setFinishStatus] = useState('idle')
  const [finishErrorMsg, setFinishErrorMsg] = useState('')
  const [finishedOffline, setFinishedOffline] = useState(false)
  // true, если за сегодня награда уже была (лимит 1 тренировка/день) — тогда
  // модалка поздравляет, но +150 не показывает.
  const [alreadyToday, setAlreadyToday] = useState(false)

  const [actionSlot, setActionSlot] = useState(null)
  // Меню «⋯» у упражнения: заметка / техника / замена (привязано к кнопке).
  const [dotsSlot, setDotsSlot] = useState(null)
  const [dotsAnchor, setDotsAnchor] = useState(null)
  const [dotsHasNote, setDotsHasNote] = useState(false)

  const [slideDir, setSlideDir] = useState('right')

  // Таймер тренировки: тикает с захода на день, сбрасывается при смене дня.
  // finishedSec фиксирует длительность на момент «Завершить» — для модалки.
  const [elapsedSec, setElapsedSec] = useState(0)
  const [finishedSec, setFinishedSec] = useState(0)

  // Эффекты возврата с других экранов:
  //   pressedOrderNum — карточка играет press-эффект (scale 0.97 → 1)
  //   glowedOrderNum  — карточка светится зелёной обводкой и плавно гаснет
  //   swappedOrderNum — карточка играет анимацию "змейки" (только swap)
  const [pressedOrderNum, setPressedOrderNum] = useState(null)
  const [glowedOrderNum, setGlowedOrderNum] = useState(null)
  const [swappedOrderNum, setSwappedOrderNum] = useState(null)

  // Открыта ли клавиатура (ввод веса на карточке). Пока true — прибитую к низу
  // кнопку «Завершить» прячем, чтобы она не липла к клавиатуре.
  const [kbOpen, setKbOpen] = useState(false)

  const cardRefs = useRef(new Map())

  // Финал прогресса: счётчик 3-2-1 + искра на «голове» заливки и микро-салют на
  // 100%. Анимации событийные (вспышка на нажатие), чтобы ничего не мельтешило в
  // закреплённой шапке. sparkKey/finishKey — ремаунт частиц для повтора анимации.
  const prevDoneRef = useRef(0)
  const [sparkKey, setSparkKey] = useState(0)
  const [finishKey, setFinishKey] = useState(0)

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

  // Префилл из памяти ДО отрисовки (на каждую смену дня/места): если слоты уже
  // загружались — показываем их сразу, без скелетона (возврат с Инфо/Смены,
  // свайп на ранее открытый день). useLayoutEffect → успеваем до paint, скролл
  // восстановится без моргания. Если в памяти пусто — скелетон.
  useLayoutEffect(() => {
    const cached = slotsMemory.get(`${programId}/${day}/${place}`)
    if (cached && cached.length) {
      setSlots(cached)
      setLoading(false)
    } else {
      setSlots([])
      setLoading(true)
    }
  }, [programId, day, place])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!getCurrentUser()) {
        setError('Не удалось авторизоваться. Перезапусти приложение.')
        setLoading(false)
        return
      }

      // Состояние loading/skeleton уже выставил префилл-эффект выше. Здесь только
      // фетчим и обновляем: при наличии кеша — «по-тихому», без скелетона.
      const hasCache = slotsMemory.has(`${programId}/${day}/${place}`)
      setError(null)
      try {
        const data = await getWorkoutDay(programId, day, place)
        if (!cancelled) {
          const arr = data || []
          slotsMemory.set(`${programId}/${day}/${place}`, arr)
          setSlots(arr)
          setLoading(false)
        }
      } catch (e) {
        // Технический текст — только в консоль; пользователю человеческое.
        console.error('[WorkoutDay] load error:', e)
        if (!cancelled && !hasCache) {
          setError('Не удалось загрузить тренировку. Проверь интернет и попробуй ещё раз.')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [programId, day, place, reloadTick])

  // Сохраняем под актуальное место (placeRef) — без place в deps, чтобы при
  // переключении места не затереть прогресс нового места старыми галочками
  // (load-эффект выше сначала подставит правильный набор).
  useEffect(() => {
    saveWorkoutProgress(programId, day, placeRef.current, Array.from(activeOrderNums))
  }, [programId, day, activeOrderNums])

  // Префетч заметок упражнений дня — греем кэш, чтобы меню «⋯» и модалка заметки
  // открывались без мигания «Добавить»→«Открыть».
  useEffect(() => {
    if (loading || !slots.length) return
    for (const s of slots) {
      if (s.exercise_id && getExerciseNoteCached(s.exercise_id) === null) {
        getExerciseNote(s.exercise_id).catch(() => {})
      }
    }
  }, [loading, slots])

  // Триггер искры/салюта. Только когда отжали ровно одно упражнение (now - prev
  // === 1) — так не срабатывает на загрузке прогресса (скачок 0→N) и на снятии
  // галочки. Осталось 3/2/1 → искра; осталось 0 → финальный салют.
  useEffect(() => {
    const prev = prevDoneRef.current
    const now = activeOrderNums.size
    prevDoneRef.current = now
    if (loading) return
    if (now - prev !== 1) return
    const rem = slots.length - now
    if (rem === 0) setFinishKey(k => k + 1)
    else if (rem <= 3) setSparkKey(k => k + 1)
  }, [activeOrderNums.size, slots.length, loading])

  // Возврат с "Сменить"/"Инфо": восстанавливаем ТОЧНУЮ позицию скролла ДО
  // отрисовки (useLayoutEffect) — без моргания и без «прыжка наверх». Слоты к
  // этому моменту уже есть (префилл из памяти), высота карточек фиксирована
  // (minHeight), поэтому scrollTo сразу попадает в нужное место.
  const didRestoreRef = useRef(false)
  useLayoutEffect(() => {
    if (didRestoreRef.current) return
    if (loading || !slots.length) return

    const stateData = location.state || {}
    const returnedFrom = stateData.returnedFromOrderNum
    if (returnedFrom == null) return

    didRestoreRef.current = true
    const savedScrollY = stateData.scrollY
    if (typeof savedScrollY === 'number') {
      window.scrollTo(0, savedScrollY)
    } else {
      const cardEl = cardRefs.current.get(returnedFrom)
      if (cardEl) cardEl.scrollIntoView({ behavior: 'auto', block: 'center' })
    }
  }, [loading, slots.length, location.state])

  // Эффекты подсветки карточки, с которой уходил (press + glow + змейка свапа),
  // и очистка state из истории, чтобы повтор не сработал при свайпе дней.
  useEffect(() => {
    if (loading || !slots.length) return

    const stateData = location.state || {}
    const returnedFrom = stateData.returnedFromOrderNum
    if (returnedFrom == null) return

    const wasSwapped = stateData.wasSwapped

    setPressedOrderNum(returnedFrom)
    setTimeout(() => setPressedOrderNum(null), 350)

    setGlowedOrderNum(returnedFrom)
    setTimeout(() => setGlowedOrderNum(null), 1600)

    if (wasSwapped) {
      setSwappedOrderNum(returnedFrom)
      setTimeout(() => setSwappedOrderNum(null), 2600)
    }

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

  // Тап по «⋯» — компактное меню у кнопки. Подтягиваем наличие заметки, чтобы
  // показать «Добавить» / «Открыть заметку».
  const closeDots = () => { setDotsSlot(null); setDotsAnchor(null) }
  const handleDots = (slot, rect) => {
    if (showFinishedModal) return
    // Из кэша — мгновенно правильная надпись (без мигания «Добавить»→«Открыть»).
    const cached = getExerciseNoteCached(slot.exercise_id)
    setDotsHasNote(!!(cached && cached.trim()))
    setDotsSlot(slot)
    setDotsAnchor(rect)
    getExerciseNote(slot.exercise_id)
      .then(note => setDotsHasNote(!!(note && note.trim())))
      .catch(() => {})
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
  const goToInfo = (slot) => {
    if (!slot) return
    navigate(`/exercise/${slot.exercise_id}`, {
      state: {
        returnTo: `/workout/${programId}/${day}`,
        returnedFromOrderNum: slot.order_num,
        scrollY: getRealScrollY()
      }
    })
  }

  /**
   * Переход на страницу Сменить. Аналогично Инфо — сохраняем scrollY,
   * чтобы возврат был на ту же позицию (а не центрирование карточки).
   */
  const goToSwap = (slot) => {
    if (!slot) return
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
        place,
        scrollY: getRealScrollY()
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

  // Тап «Завершить» → сначала минимал-подтверждение (защита от случайного
  // раннего завершения). На «Завершить» в нём — праздничная модалка + сохранение.
  const handleFinishButtonTap = () => {
    if (activeOrderNums.size === 0) return
    haptic.medium()
    setFinishedSec(elapsedSec)
    setShowConfirm(true)
  }

  const handleConfirmFinishYes = () => {
    haptic.medium()
    setShowConfirm(false)
    setShowFinishedModal(true)
    runFinish()
  }

  const handleConfirmFinishCancel = () => {
    haptic.light()
    setShowConfirm(false)
  }

  const handleRetry = () => {
    haptic.light()
    setReloadTick(t => t + 1)
  }

  // Сохранение тренировки. Идёт СРАЗУ при открытии модалки завершения, а её вид
  // (награда / лимит / оффлайн / ошибка) определяется результатом — чтобы не
  // обещать +150 до того, как сервер подтвердит начисление.
  const runFinish = async () => {
    if (finishStatus === 'saving') return

    setFinishStatus('saving')
    setFinishErrorMsg('')
    setFinishedOffline(false)
    setAlreadyToday(false)

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

      // Тренировка засчитана локально в любом исходе (оффлайн / лимит / награда):
      // фиксируем день в цикле A/B/C и чистим галочки прогресса.
      await setLastCompletedDay(programId, day)
      clearWorkoutProgress(programId, day, place)

      // Оффлайн: ушло в очередь, синканётся при сети. Лимит «1 в день» оффлайн не
      // проверить — поэтому без обещания баллов, просто «сохранено локально».
      if (result.offline) {
        haptic.warning()
        setFinishedOffline(true)
        setFinishStatus('idle')
        return
      }

      // Онлайн: лимит «1 тренировка в день» держит сервер. already_completed_today
      // → баллы за сегодня уже были, +150 не показываем (поздравляем без баллов).
      setAlreadyToday(!!result.alreadyCompletedToday)
      haptic.success()
      setFinishStatus('idle')

    } catch (e) {
      console.error('[WorkoutDay] runFinish error:', e)
      setFinishStatus('error')
      setFinishErrorMsg(e?.message || 'Что-то пошло не так. Попробуй ещё раз.')
      haptic.error()
    }
  }

  const sections = groupByMuscleGroup(slots)
  const remaining = slots.length - activeOrderNums.size
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
            <span style={styles.timer}>{formatElapsedMin(elapsedSec)}</span>
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
              </div>
              {dayTags.length > 0 && (
                <div key={`tags-${day}`} style={styles.dayTagsRow}>
                  {dayTags.map((t, i) => (
                    <span key={t.key} style={styles.dayTagText}>
                      {i > 0 && ', '}
                      {t.label.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
              {/* Пейджер дней (день N из M): активный кружок — зелёный.
                  Показываем только при 2+ днях. */}
              {days.length > 1 && (
                <div style={styles.dayPager}>
                  {days.map((d, i) => (
                    <span
                      key={d}
                      style={{
                        ...styles.dayDot,
                        ...(i === currentDayIdx ? styles.dayDotActive : null)
                      }}
                    />
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
            <div style={styles.progressArea}>
              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${progressPct}%`
                  }}
                />
              </div>

              {/* Финал: счётчик 3-2-1, искра на голове, салют на 100%. */}
              {!loading && slots.length > 0 && (
                <ProgressFinale
                  pct={progressPct}
                  remaining={remaining}
                  sparkKey={sparkKey}
                  finishKey={finishKey}
                />
              )}
            </div>
          </div>
        </div>

        {/* Fade-scrim под блоком дня: контент уходит под шапку плавно. */}
        <div style={styles.stickyFade} aria-hidden="true" />
      </div>

      <div style={styles.body}>

        {error && (
          <div style={styles.errorBox}>
            <UiIcon name="network_off" size={42} color="var(--color-text-secondary)" />
            <div style={styles.errorBoxTitle}>Что-то пошло не так</div>
            <div style={styles.errorBoxText}>{error}</div>
            <button onClick={handleRetry} style={styles.retryButton} className="press-tile">
              Обновить
            </button>
          </div>
        )}

        {/* Скелетон на время загрузки — чтобы контент не «прыгал». */}
        {loading && !error && (
          <div style={styles.sectionsWrap}>
            <div style={styles.exerciseList}>
              {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
            </div>
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
                          onDots={handleDots}
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

      {/* Компактное меню «⋯» у упражнения: заметка / техника / замена. */}
      {dotsSlot && dotsAnchor && (
        <AnchorMenu
          anchorRect={dotsAnchor}
          onClose={closeDots}
          items={[
            {
              key: 'note',
              icon: <UiIcon name="notes" size={20} color="#FFA94D" />,
              label: dotsHasNote ? 'Открыть заметку' : 'Добавить заметку',
              onClick: () => { const s = dotsSlot; setTimeout(() => setActionSlot(s), 190) }
            },
            {
              key: 'info',
              icon: <UiIcon name="info" size={20} color="#3FA2F7" />,
              label: 'Техника упражнения',
              onClick: () => goToInfo(dotsSlot)
            },
            {
              key: 'swap',
              icon: <UiIcon name="change" size={20} color="#FF8C42" />,
              label: 'Заменить упражнение',
              onClick: () => goToSwap(dotsSlot)
            }
          ]}
        />
      )}

      {showConfirm && (
        <FinishConfirmModal
          done={activeOrderNums.size}
          total={slots.length}
          onConfirm={handleConfirmFinishYes}
          onCancel={handleConfirmFinishCancel}
        />
      )}

      {showFinishedModal && (
        <WorkoutFinishedModal
          reward={XP_REWARDS.WORKOUT_COMPLETE}
          durationLabel={formatElapsedMin(finishedSec)}
          status={finishStatus}
          errorMsg={finishErrorMsg}
          offline={finishedOffline}
          alreadyToday={alreadyToday}
          onConfirm={() => {
            // Ошибка → повторить сохранение. Иначе (награда / лимит / оффлайн) —
            // закрыть модалку и уйти на главную.
            if (finishStatus === 'error') {
              runFinish()
              return
            }
            setShowFinishedModal(false)
            navigate('/')
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

/**
 * Финал прогресс-бара: на финишной прямой (осталось 3/2/1) над «головой»
 * заливки стоит тусклый счётчик-обратный отсчёт, голова мягко светится и еле
 * заметно искрится. При каждом нажатии — одноразовая вспышка искр (sparkKey),
 * на 100% — микро-салют (finishKey). Всё лёгкое и не зацикленное (кроме очень
 * слабого твинкла), чтобы не отвлекать в закреплённой шапке.
 *
 * marker — нулевой по ширине якорь на позиции головы (left = pct%), частицы и
 * счётчик позиционируются от него. zIndex над дорожкой.
 */
function ProgressFinale({ pct, remaining, sparkKey, finishKey }) {
  const inZone = remaining >= 1 && remaining <= 3
  return (
    <div style={{ ...finaleStyles.marker, left: `${pct}%` }} aria-hidden="true">
      {inZone && <span style={finaleStyles.headGlow} />}
      {inZone && (
        <span
          className="prog-twinkle"
          style={{ ...finaleStyles.twinkle, animation: 'progTwinkle 1.9s ease-in-out infinite' }}
        />
      )}
      {inZone && <span key={remaining} style={finaleStyles.count}>{remaining}</span>}

      {sparkKey > 0 && <SparkBurst key={`s${sparkKey}`} />}
      {finishKey > 0 && <SparkBurst key={`f${finishKey}`} finale />}
    </div>
  )
}

/**
 * Вспышка искр из точки головы. Обычная (на нажатие) — 4 искры, узкий разлёт.
 * Финальная (на 100%) — 8 искр пошире/подольше + центральная вспышка-«пых».
 * Направления раскладываем по кругу, дистанцию пишем в CSS-переменные --tx/--ty,
 * keyframe progSparkFly разносит и гасит частицу за один проход (forwards).
 */
function SparkBurst({ finale = false }) {
  const n = finale ? 8 : 4
  const spread = finale ? 17 : 9
  const dur = finale ? 780 : 560
  const base = finale ? -Math.PI / 2 : -0.6
  const parts = Array.from({ length: n }, (_, i) => {
    const ang = base + (Math.PI * 2 * i) / n
    return {
      tx: (Math.cos(ang) * spread).toFixed(1),
      ty: (Math.sin(ang) * spread).toFixed(1)
    }
  })
  return (
    <span style={finaleStyles.burst}>
      {finale && <span style={finaleStyles.flash} />}
      {parts.map((p, i) => (
        <span
          key={i}
          style={{
            ...finaleStyles.particle,
            ...(finale ? finaleStyles.particleFinale : null),
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            animationDuration: `${dur}ms`
          }}
        />
      ))}
    </span>
  )
}

const finaleStyles = {
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0,
    pointerEvents: 'none',
    zIndex: 2
  },
  // Счётчик «осталось»: мельче и тусклее чем «7/9», читается как вторичный.
  count: {
    position: 'absolute',
    bottom: 'calc(100% + 4px)',
    left: 0,
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
    animation: 'progCountIn 280ms ease-out both'
  },
  headGlow: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '12px',
    height: '12px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(158, 209, 83, 0.55) 0%, rgba(158, 209, 83, 0) 70%)'
  },
  twinkle: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '4px',
    height: '4px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    boxShadow: '0 0 5px rgba(158, 209, 83, 0.7)'
  },
  burst: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 0
  },
  particle: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    boxShadow: '0 0 4px rgba(158, 209, 83, 0.8)',
    transform: 'translate(-50%, -50%)',
    animationName: 'progSparkFly',
    animationTimingFunction: 'cubic-bezier(0.2, 0.6, 0.3, 1)',
    animationFillMode: 'forwards'
  },
  particleFinale: {
    width: '3.5px',
    height: '3.5px',
    boxShadow: '0 0 6px rgba(158, 209, 83, 0.9)'
  },
  flash: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '16px',
    height: '16px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(158, 209, 83, 0.8) 0%, rgba(158, 209, 83, 0) 70%)',
    animation: 'progFlash 600ms ease-out forwards'
  }
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

/**
 * Скелетон карточки упражнения на время загрузки — повторяет силуэт реальной
 * карточки (картинка + строки), мягкий shimmer (класс .skel). Убирает «прыжок»
 * контента при подгрузке.
 */
function SkeletonCard() {
  return (
    <div style={skeletonStyles.card}>
      <div className="skel" style={skeletonStyles.thumb} />
      <div style={skeletonStyles.lines}>
        <div className="skel" style={{ ...skeletonStyles.line, width: '72%' }} />
        <div className="skel" style={{ ...skeletonStyles.line, width: '44%', height: '12px' }} />
        <div className="skel" style={{ ...skeletonStyles.line, width: '32%', height: '10px' }} />
      </div>
      <div className="skel" style={skeletonStyles.weight} />
    </div>
  )
}

const skeletonStyles = {
  card: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    minHeight: '150px',
    borderRadius: '33px',
    background: '#1C1C1C'
  },
  thumb: {
    flexShrink: 0,
    width: '118px',
    height: '118px',
    borderRadius: '33px'
  },
  lines: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  line: {
    height: '16px',
    borderRadius: '6px'
  },
  weight: {
    flexShrink: 0,
    width: '30px',
    height: '24px',
    borderRadius: '6px'
  }
}

function ArrowLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 5 L8 12 L15 19" stroke="rgba(255,255,255,0.62)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 5 L16 12 L9 19" stroke="rgba(255,255,255,0.62)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Реальная позиция скролла. ExerciseActionMenu на время открытого меню фиксирует
// body (position:fixed; top:-scrollY) — тогда window.scrollY === 0, а настоящая
// позиция спрятана в body.style.top. Иначе берём обычный window.scrollY.
function getRealScrollY() {
  const top = document.body.style.top
  if (document.body.style.position === 'fixed' && top) {
    return -parseInt(top, 10) || 0
  }
  return window.scrollY
}

// Длительность без секунд — для шапки и модалки завершения. До часа: минуты
// с подписью ("0 мин", "1 мин", "20 мин"); от часа: "ч + мин" ("1 ч", "1 ч 20 мин").
function formatElapsedMin(totalSec) {
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin < 60) return `${totalMin} мин`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
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
  // Пейджер дней под буквой+тегами: показывает позицию (день N из M).
  dayPager: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '2px'
  },
  dayDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.18)',
    transition: 'background 0.25s ease, transform 0.25s ease'
  },
  dayDotActive: {
    background: 'var(--color-primary)',
    transform: 'scale(1.15)'
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
  // Обёртка над дорожкой: держит абсолютный слой финала (искра/счётчик/салют),
  // который НЕ обрезается (в отличие от самой дорожки с overflow: hidden).
  progressArea: {
    flex: 1,
    position: 'relative'
  },
  progressTrack: {
    width: '100%',
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
  // Человеческий экран ошибки: иконка + короткий текст + кнопка «Обновить».
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '10px',
    padding: '48px 24px'
  },
  errorBoxTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '17px',
    letterSpacing: '1px',
    color: 'var(--color-text)',
    marginTop: '4px'
  },
  errorBoxText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
    maxWidth: '260px'
  },
  retryButton: {
    marginTop: '8px',
    padding: '11px 28px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
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
  }
}