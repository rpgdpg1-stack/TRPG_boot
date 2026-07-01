import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
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
import { setLastCompletedDay, getActiveDaySync } from '../lib/storage'
import { XP_REWARDS } from '../lib/levels'
import {
  getActiveWorkout,
  startActiveWorkout,
  clearActiveWorkout,
  onActiveWorkoutChange,
  elapsedSecFrom,
  formatWorkoutMin,
  TIMER_ORANGE_SEC,
  TIMER_RED_SEC,
  WORKOUT_TIMER_COLORS
} from '../lib/active-workout'
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
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import { pluralizeExercises } from '../utils/plural'

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

// Цвета таймера: пороги/цвета общие (active-workout.js), 'off' (неактивный
// день) — серый локально. С 1ч30 (red) — ещё поп-ап «пора завершать».
const TIMER_COLORS = {
  off: 'var(--color-text-secondary)',
  ...WORKOUT_TIMER_COLORS
}

/** Серый крестик-закрытие/отмена (тонкие линии, currentColor). */
function CrossIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

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

  // Цвет/пульс таймера по порогам + поп-ап перегрузки (1ч30) + крестик-отмена.
  const [timerPulseKey, setTimerPulseKey] = useState(0)  // ремаунт span → пульс на смене тира
  const prevTierRef = useRef(null)
  const [showOverload, setShowOverload] = useState(false)
  const overloadShownRef = useRef(false)                 // поп-ап перегрузки — один раз за сессию
  const overloadTimer = useRef(null)                     // авто-скрытие поп-апа через 5 мин
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Скрыть поп-ап перегрузки и снять таймер авто-скрытия.
  const hideOverload = () => {
    setShowOverload(false)
    if (overloadTimer.current) { clearTimeout(overloadTimer.current); overloadTimer.current = null }
  }
  // Снять таймер авто-скрытия при размонтировании.
  useEffect(() => () => { if (overloadTimer.current) clearTimeout(overloadTimer.current) }, [])

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

  // Пикер дней (мини-модалка из центра буквы). letterRef — якорь для позиции,
  // dayPickerRect != null → открыт.
  const letterRef = useRef(null)
  const [dayPickerRect, setDayPickerRect] = useState(null)

  // Стеклянная пилюля текущей группы. Заголовки групп в контенте — обычные (как
  // всегда). Когда листаешь вниз и заголовок секции уходит под карточку дня —
  // появляется закреплённая пилюля с этой группой (стекло+блюр как у кнопок, без
  // обводки), её текст сменяется на следующую группу. -1 = пилюли нет (мы вверху).
  const [activeSection, setActiveSection] = useState(-1)
  const activeSectionRef = useRef(-1)
  const sectionHeaderRefs = useRef(new Map()) // sIdx -> элемент h2 (замер позиции)
  const sectionsRef = useRef([])              // текущие секции (для замера последней карточки)
  const stickyHeaderRef = useRef(null)        // шапка дня — её низ = линия появления/смены

  // Финал прогресса: только микро-салют на 100% (8/8). Счётчик 3-2-1 и искры на
  // каждое нажатие убраны — мельтешили. finishKey — ремаунт частиц для повтора.
  const prevDoneRef = useRef(0)
  const [finishKey, setFinishKey] = useState(0)

  const program = useMemo(() => getProgramBySlug(programId), [programId])
  const days = useMemo(() => (program ? Object.keys(program.data.days) : ['A']), [program])
  // Имя программы для навбара: кастомную/от друга показываем как ввёл юзер,
  // встроенную — нормализуем регистр (СПЛИТ → Сплит), как на карточках.
  const programTitle = program
    ? (program.source === 'custom'
        ? program.title
        : program.title.charAt(0).toUpperCase() + program.title.slice(1).toLowerCase())
    : ''

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

  // Активная сессия (одна на всё приложение). День «тренируется» (таймер тикает,
  // галочки ставятся) только после тапа «Начать». isThisActive — этот ли день
  // активен; sessionBlocked — активна ДРУГАЯ тренировка (тут «Начать» нельзя).
  const [active, setActive] = useState(getActiveWorkout)
  useEffect(() => onActiveWorkoutChange(() => setActive(getActiveWorkout())), [])
  const isThisActive = !!active && active.programId === programId && active.day === day
  const sessionBlocked = !!active && !isThisActive
  // День «в фокусе» — зелёная буква и точка пейджера: активная сессия ЭТОЙ
  // программы, иначе рекомендованный по циклу день. Совпадает с подсветкой дня
  // на карточках главной/избранного.
  const sessionDayForProgram = active && active.programId === programId ? active.day : null
  const focusDay = sessionDayForProgram || getActiveDaySync(programId)
  // Тост «сначала заверши текущую» — показываем ТОЛЬКО по тапу на заблокированную
  // «Начать», авто-скрытие через 2.6с (nonce перезапускает шейк на каждый тап).
  const [startBlockNonce, setStartBlockNonce] = useState(0)
  const [startBlockHint, setStartBlockHint] = useState(false)
  const startBlockTimer = useRef(null)
  useEffect(() => () => { if (startBlockTimer.current) clearTimeout(startBlockTimer.current) }, [])

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

  // Галочки показываем/грузим только для активного дня. Неактивный день (другой
  // или сессия не начата) — всегда пустой (0 отжатых), отмечать нельзя.
  useEffect(() => {
    setActiveOrderNums(isThisActive ? new Set(loadWorkoutProgress(programId, day, place)) : new Set())
  }, [programId, day, place, isThisActive])

  // Таймер — только пока этот день активная сессия: elapsed = now − startedAt
  // (переживает уход/возврат и смену дня). Неактивный день → 0, без тика.
  useEffect(() => {
    if (!isThisActive) { setElapsedSec(0); return }
    const tick = () => setElapsedSec(elapsedSecFrom(active.startedAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isThisActive, active?.startedAt])

  // Тир таймера по порогам времени. Неактивный день — 'off' (серый, без пульса).
  const timerTier = !isThisActive ? 'off'
    : elapsedSec >= TIMER_RED_SEC ? 'red'
    : elapsedSec >= TIMER_ORANGE_SEC ? 'orange'
    : 'green'

  // На СМЕНЕ тира — пульс таймера (увеличение+возврат); на 'red' (1ч30) — поп-ап
  // «пора завершать» (один раз за сессию). Первый рендер не пульсирует.
  useEffect(() => {
    const prev = prevTierRef.current
    prevTierRef.current = timerTier
    if (prev === null || timerTier === prev) return
    if (timerTier !== 'off') setTimerPulseKey(k => k + 1)
    if (timerTier === 'red' && !overloadShownRef.current) {
      overloadShownRef.current = true
      setShowOverload(true)
      haptic.warning()
      // Сам исчезает через 5 мин, если не нажали ОК — чтоб не мозолил глаза.
      if (overloadTimer.current) clearTimeout(overloadTimer.current)
      overloadTimer.current = setTimeout(() => { setShowOverload(false); overloadTimer.current = null }, 5 * 60 * 1000)
    }
  }, [timerTier])

  // Свежий заход на день открываем сверху. Возврат с «Сменить»/«Инфо» сюда не
  // относится — там восстанавливается прежняя позиция скролла (см. эффект ниже).
  // Глобальный ScrollToTop в App для /workout/ выключен (день рулит скроллом сам).
  useLayoutEffect(() => {
    if (location.state?.returnedFromOrderNum != null) return
    window.scrollTo(0, 0)
    document.scrollingElement?.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (!isThisActive) return
    saveWorkoutProgress(programId, day, placeRef.current, Array.from(activeOrderNums))
  }, [programId, day, activeOrderNums, isThisActive])

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

  // При смене дня/места прячем пилюлю (день открывается сверху).
  useLayoutEffect(() => {
    activeSectionRef.current = -1
    setActiveSection(-1)
  }, [day, place])

  // Какая группа в пилюле. Секция активна, когда её заголовок УШЁЛ под карточку
  // дня (верх ≤ линии), НО мы ещё не прошли середину её ПОСЛЕДНЕЙ карточки. Как
  // только линия опускается ниже середины последней карточки группы — пилюля
  // исчезает (даже если следующий заголовок ещё не доехал), и подхватится уже
  // когда доедет следующий. Пока ни один не ушёл (мы вверху) — -1, пилюли нет.
  useLayoutEffect(() => {
    if (loading || slots.length === 0) { setActiveSection(-1); return }
    let raf = 0
    const compute = () => {
      raf = 0
      const sticky = stickyHeaderRef.current
      if (!sticky) return
      const line = sticky.getBoundingClientRect().bottom
      const secs = sectionsRef.current
      let active = -1
      for (let idx = 0; idx < secs.length; idx++) {
        const headerEl = sectionHeaderRefs.current.get(idx)
        if (!headerEl || headerEl.getBoundingClientRect().top > line) continue
        // Заголовок ушёл под шапку. Прошли ли середину последней карточки группы?
        const slotsOfSec = secs[idx].slots
        const lastSlot = slotsOfSec[slotsOfSec.length - 1]
        const cardEl = lastSlot ? cardRefs.current.get(lastSlot.order_num) : null
        if (cardEl) {
          const r = cardEl.getBoundingClientRect()
          if (line >= r.top + r.height / 2) continue // ниже середины → пилюля пропадает
        }
        active = idx
      }
      if (active !== activeSectionRef.current) {
        activeSectionRef.current = active
        setActiveSection(active)
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute) }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [loading, slots])

  // Триггер финального салюта. Только когда отжали ровно одно упражнение (now -
  // prev === 1) и это последнее (осталось 0) — так не срабатывает на загрузке
  // прогресса (скачок 0→N) и на снятии галочки.
  useEffect(() => {
    const prev = prevDoneRef.current
    const now = activeOrderNums.size
    prevDoneRef.current = now
    if (loading) return
    if (now - prev !== 1) return
    if (slots.length - now === 0) setFinishKey(k => k + 1)
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
    // Галочки доступны только когда тренировка начата (этот день активен).
    // Иначе тап ничего не делает (долгое нажатие — заметки — работает отдельно).
    if (!isThisActive) { haptic.light(); return }

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

  // Открыть день/набор места с самого верха. Зовём при намеренной смене дня
  // (свайп/стрелки) и места — чтобы новый список начинался сверху, а не оставался
  // на прежней позиции скролла. Возврат с Инфо/Смены сюда не попадает (там своя
  // логика восстановления позиции).
  const scrollToTop = () => {
    window.scrollTo(0, 0)
    document.scrollingElement?.scrollTo(0, 0)
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
    scrollToTop()
  }

  // Тап по букве дня — открыть пикер (только если дней 2+). Якорь — рект буквы.
  const openDayPicker = () => {
    if (days.length <= 1) return
    haptic.light()
    const el = letterRef.current
    if (el) setDayPickerRect(el.getBoundingClientRect())
  }
  // Выбор дня в пикере: закрыть и перейти (направление по порядку дней).
  const pickDay = (d) => {
    setDayPickerRect(null)
    if (d === day) return
    const from = days.indexOf(day)
    const to = days.indexOf(d)
    goToDay(d, to > from ? 'next' : 'prev')
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

  // «Начать тренировку»: стартуем сессию для этого дня/места, обнуляем галочки
  // (свежий старт), таймер пойдёт от startedAt (через эффект).
  const handleStart = () => {
    haptic.success()
    clearWorkoutProgress(programId, day, place)
    setActiveOrderNums(new Set())
    overloadShownRef.current = false
    hideOverload()
    startActiveWorkout(programId, day, place)
  }

  // Крестик «отменить тренировку» (только для активной): тап → подтверждение →
  // закрываем сессию БЕЗ сохранения (в историю не идёт, баллы не начисляются).
  // Для «передумал / случайно начал / тестирую».
  const handleCancelTap = () => { haptic.light(); setShowCancelConfirm(true) }
  const handleCancelConfirm = () => {
    haptic.medium()
    clearWorkoutProgress(programId, day, place)
    setActiveOrderNums(new Set())
    overloadShownRef.current = false
    hideOverload()
    clearActiveWorkout()
    setShowCancelConfirm(false)
  }

  // Тап по заблокированной «Начать» (активна другая тренировка) — подсказка
  // (показ + шейк, авто-скрытие через 2.6с).
  const handleBlockedStart = () => {
    haptic.error()
    setStartBlockHint(true)
    setStartBlockNonce(n => n + 1)
    if (startBlockTimer.current) clearTimeout(startBlockTimer.current)
    startBlockTimer.current = setTimeout(() => setStartBlockHint(false), 2600)
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
      // фиксируем день в цикле A/B/C, чистим галочки и закрываем активную сессию.
      await setLastCompletedDay(programId, day)
      clearWorkoutProgress(programId, day, place)
      clearActiveWorkout()

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
  sectionsRef.current = sections
  // Группа в пилюле — только когда есть «ушедшая под шапку» секция (activeSection ≥ 0);
  // иначе пилюли нет (мы вверху).
  const pillGroup = activeSection >= 0 && sections[activeSection]
    ? sections[activeSection].muscleGroup
    : null
  const canFinish = activeOrderNums.size > 0
  const isAllDone = slots.length > 0 && activeOrderNums.size === slots.length

  const totalSlots = slots.length || 1
  const progressPct = Math.min(100, (activeOrderNums.size / totalSlots) * 100)

  const dayLetterAnimClass = slideDir === 'right'
    ? 'day-letter-slide-in-right'
    : 'day-letter-slide-in-left'

  return (
    <div style={styles.page}>

      {/* Имя программы в навбаре (по центру системных кнопок Telegram). */}
      <ScreenTitle>{programTitle}</ScreenTitle>

      {/* Шапка дня закреплена сверху (sticky) — то же устройство, что карточка
          игрока на главной: сплошной фон зоны + фейд-переход под блоком. */}
      <div ref={stickyHeaderRef} style={styles.stickyHeader}>

        {/* Один целиковый блок: место+таймер сверху, стрелки + день с группами,
            прогресс. Фон/строук как у карточки игрока на главной. */}
        <div style={styles.headerCard}>

          <div style={styles.topMetaRow}>
            {/* Место тренировки (Зал/Дом/Улица) — переключатель; смена места
                подгружает упражнения этого места из конструктора. В своём слое
                выше таймера: раскрытые пилюли налезают на центр и должны быть
                ПОВЕРХ цифры часы:минуты, а не под ней. */}
            <div style={styles.placeSlot}>
              <PlaceSwitcher program={program} value={place} onChange={(loc) => { setPlace(loc); scrollToTop() }} />
            </div>
            {/* Таймер по центру — только когда тренировка начата (этот день активен).
                До старта таймера нет вовсе (не «0 мин» серым). Зелёный (активна) →
                оранжевый (1ч) → красный (1ч30), пульс на смене цвета (timerPulseKey). */}
            {isThisActive && (
              <div style={styles.timerCenter}>
                <span
                  key={timerPulseKey}
                  style={{
                    ...styles.timer,
                    color: TIMER_COLORS[timerTier],
                    animation: timerPulseKey > 0 ? 'timerPulse 0.45s ease-out' : 'none'
                  }}
                >
                  {formatWorkoutMin(elapsedSec)}
                </span>
              </div>
            )}
            {/* Крестик «отменить тренировку» — только для активной сессии. */}
            {isThisActive && (
              <button onClick={handleCancelTap} style={styles.cancelBtn} className="press-tile" aria-label="Отменить тренировку">
                <CrossIcon size={16} />
              </button>
            )}
          </div>

          {/* Поп-ап перегрузки (1ч30) — под временем. Только на активном дне (где
              идёт таймер): листая на другие дни, он не висит. Сам исчезает через
              5 мин, либо по тапу ОК. */}
          {isThisActive && showOverload && (
            <div style={styles.overloadPopup}>
              <span style={styles.overloadText}>Чтобы не перегрузить организм — пора завершать.</span>
              <button onClick={() => { haptic.light(); hideOverload() }} style={styles.overloadOk} className="press-tile">ОК</button>
            </div>
          )}

          <div
            style={styles.headerRow}
            onTouchStart={handleHeaderTouchStart}
            onTouchEnd={handleHeaderTouchEnd}
          >
            {/* Стрелки и пейджер убраны — переключение дней свайпом. Тап по букве
                открывает мини-пикер дней (A/B/C) из центра буквы. */}
            <div style={styles.dayCol}>
              {/* Буква дня строго по центру; «флажок» групп — абсолютно справа от
                  буквы (не сдвигает её с центра), стопкой по высоте буквы. */}
              <div
                ref={letterRef}
                style={styles.dayLetterWrap}
                onClick={openDayPicker}
                role={days.length > 1 ? 'button' : undefined}
                aria-label={days.length > 1 ? 'Выбрать день' : undefined}
              >
                <span
                  key={day}
                  className={dayLetterAnimClass}
                  style={{
                    ...styles.dayLetter,
                    ...(day === focusDay ? null : styles.dayLetterMuted)
                  }}
                >
                  {day}
                </span>
                {dayTags.length > 0 && (
                  <div key={`tags-${day}`} style={styles.dayFlag}>
                    {dayTags.map(t => (
                      <span key={t.key} style={styles.dayTagText}>{t.label.toUpperCase()}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Прогресс-полоса и «N / M» — только когда тренировка НАЧАТА (этот день
              активен). Пока не нажал «Начать» — просто «N упражнений» по левому краю. */}
          {isThisActive ? (
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

                {/* Финал: только салют на 100% (8/8). */}
                {!loading && slots.length > 0 && (
                  <ProgressFinale
                    pct={progressPct}
                    finishKey={finishKey}
                  />
                )}
              </div>
            </div>
          ) : (
            <div style={styles.progressRow}>
              <span style={styles.progressLabel}>
                {loading ? '...' : `${slots.length} ${pluralizeExercises(slots.length)}`}
              </span>
            </div>
          )}
        </div>

        {/* Закреплённый заголовок текущей группы — сплошная чёрная полоса (без
            градиента) во всю ширину: заголовок с отступом от карточки дня, контент
            заезжает ПОД полосу. Абсолютн (отступы списка не меняет), появляется при
            скролле, текст сменяется на границе групп. */}
        {!loading && pillGroup && (
          <div style={styles.groupStickyBand} aria-hidden="true">
            <span key={pillGroup} style={{ ...styles.groupTabText, color: getMuscleGroupColors(pillGroup).accent }}>
              {MUSCLE_GROUP_LABELS[pillGroup] || pillGroup.toUpperCase()}
            </span>
          </div>
        )}
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
                <h2
                  ref={(el) => { if (el) sectionHeaderRefs.current.set(sIdx, el); else sectionHeaderRefs.current.delete(sIdx) }}
                  style={{
                    ...styles.muscleHeader,
                    color: getMuscleGroupColors(section.muscleGroup).accent
                  }}
                >
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
          <div className="dock-scrim" />

          {/* Подсказка только по тапу на заблокированную «Начать» (с названием
              запущенного дня), сама прячется через пару секунд. */}
          {sessionBlocked && startBlockHint && (
            <div style={styles.startBlockWrap}>
              <div key={startBlockNonce} className="shake-error" style={styles.startBlockToast}>
                Сначала заверши тренировку — день {active.day}
              </div>
            </div>
          )}

          {isThisActive ? (
            <ActionButton
              onClick={handleFinishButtonTap}
              disabled={!canFinish}
              variant={isAllDone ? 'accent' : 'neutral'}
              progress={isAllDone ? null : progressPct}
              hug
            >
              {isAllDone ? '✓ ЗАВЕРШИТЬ ТРЕНИРОВКУ' : 'ЗАВЕРШИТЬ ТРЕНИРОВКУ'}
            </ActionButton>
          ) : sessionBlocked ? (
            <ActionButton onClick={handleBlockedStart} variant="dim" hug>
              НАЧАТЬ ТРЕНИРОВКУ
            </ActionButton>
          ) : (
            <ActionButton onClick={handleStart} variant="accent" hug>
              НАЧАТЬ ТРЕНИРОВКУ
            </ActionButton>
          )}
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

      {/* Подтверждение отмены тренировки (крестик): закрыть без сохранения. */}
      {showCancelConfirm && createPortal(
        <div style={styles.cancelOverlay} onClick={() => setShowCancelConfirm(false)}>
          <div style={styles.cancelModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.cancelTitle}>Отменить тренировку?</div>
            <div style={styles.cancelText}>Прогресс не сохранится и в историю не попадёт.</div>
            <div style={styles.cancelButtonsRow}>
              <button onClick={() => { haptic.light(); setShowCancelConfirm(false) }} style={styles.cancelKeepBtn} className="press-tile">
                Нет
              </button>
              <button onClick={handleCancelConfirm} style={styles.cancelYesBtn} className="press-tile">
                Да, отменить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showFinishedModal && (
        <WorkoutFinishedModal
          reward={XP_REWARDS.WORKOUT_COMPLETE}
          durationLabel={formatWorkoutMin(finishedSec)}
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

      {/* Мини-пикер дней — выскакивает из центра буквы дня. */}
      {dayPickerRect && (
        <DayPicker
          days={days}
          currentDay={day}
          focusDay={focusDay}
          anchorRect={dayPickerRect}
          onPick={pickDay}
          onClose={() => setDayPickerRect(null)}
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
 * Финал прогресс-бара: только микро-салют на 100% (finishKey). Счётчик 3-2-1 и
 * искры на каждое нажатие убраны — мельтешили.
 *
 * marker — нулевой по ширине якорь на позиции головы (left = pct%), частицы
 * позиционируются от него. zIndex над дорожкой.
 */
function ProgressFinale({ pct, finishKey }) {
  return (
    <div style={{ ...finaleStyles.marker, left: `${pct}%` }} aria-hidden="true">
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

/**
 * Пикер дней — стеклянная мини-модалка, выскакивает из ЦЕНТРА буквы дня (растёт
 * из неё, перекрывает её). Показывает все дни программы (A/B/C) по порядку:
 * «фокусный» день зелёный (рекомендованный/активный), текущий — подсвечен. Тап по
 * дню — переключение; тап по фону — закрытие (уезжает обратно в центр). Портал
 * в body; позиция fixed по центру буквы (anchorRect).
 */
function DayPicker({ days, currentDay, focusDay, anchorRect, onPick, onClose }) {
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => onClose?.(), 170)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cx = anchorRect.left + anchorRect.width / 2
  const cy = anchorRect.top + anchorRect.height / 2
  const shown = entered && !closing

  return createPortal(
    <div style={pickerStyles.overlay} onClick={requestClose}>
      <div
        style={{
          ...pickerStyles.panel,
          left: `${cx}px`,
          top: `${cy}px`,
          opacity: shown ? 1 : 0,
          transform: `translate(-50%, -50%) scale(${shown ? 1 : 0.5})`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {days.map(d => {
          const isFocus = d === focusDay
          const isCurrent = d === currentDay
          // Текущий день — серый кружок (нейтральная подсветка «мы тут»); буква
          // зелёная, только если этот день ещё и фокусный. Фокусный день, когда мы
          // НЕ на нём, — без кружка, тусклый серый, но слегка пульсирует («вернись»).
          const pulse = isFocus && !isCurrent
          return (
            <button
              key={d}
              onClick={() => { haptic.light(); onPick(d) }}
              className={`press-tile${pulse ? ' day-picker-pulse' : ''}`}
              style={{
                ...pickerStyles.cell,
                ...(isCurrent ? pickerStyles.cellCurrent : null),
                ...(isCurrent && isFocus ? pickerStyles.cellCurrentFocus : null)
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

const pickerStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'transparent',
    touchAction: 'none'
  },
  panel: {
    position: 'fixed',
    display: 'flex',
    gap: '6px',
    padding: '7px',
    background: 'rgba(28, 28, 30, 0.72)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 'var(--radius-pill)',
    boxShadow: '0 14px 44px rgba(0, 0, 0, 0.55)',
    transformOrigin: 'center',
    transition: 'opacity 0.16s ease, transform 0.19s cubic-bezier(0.2, 0.7, 0.3, 1)'
  },
  cell: {
    width: '46px',
    height: '46px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: '50%',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '22px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  // Текущий (просматриваемый) день — серый кружок (нейтральная подсветка).
  cellCurrent: {
    color: 'var(--color-text)',
    background: 'rgba(255, 255, 255, 0.10)'
  },
  // Если текущий день ещё и фокусный — буква зелёная (кружок остаётся серым).
  cellCurrentFocus: {
    color: 'var(--color-primary)'
  }
}

const styles = {
  // marginBottom гасит таб-баровский padding-bottom у .app (тут таб-бара нет) —
  // иначе под последней карточкой копится двойной отступ («пропасть») + лишний
  // скролл на коротком дне. Без min-height:100dvh страница ровно по контенту:
  // мало упражнений → не скроллится; много → у низа фикс-зазор (как везде).
  page: {
    padding: '0 16px',
    paddingBottom: '100px',
    marginBottom: 'calc(-1 * (var(--tabbar-height) + var(--tabbar-bottom) + 60px))'
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
  // Закреплённый заголовок группы — сплошная чёрная полоса во всю ширину экрана
  // (left/right −16 гасят боковой паддинг шапки), сразу под карточкой дня (top:100%).
  // paddingTop даёт отступ заголовка от карточки; paddingBottom — сплошную зону,
  // под которую заезжает контент. НЕ в потоке (отступы списка не трогает).
  groupStickyBand: {
    position: 'absolute',
    top: '100%',
    left: '-16px',
    right: '-16px',
    paddingTop: '18px',
    paddingBottom: '14px',
    background: 'var(--color-bg)',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 31
  },
  // Текст заголовка группы в закреплённой полосе. key={pillGroup} ремаунтит →
  // мягкая смена/появление (отступ задаёт полоса, своего paddingTop нет).
  groupTabText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    letterSpacing: '2px',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    animation: 'groupPillIn 0.22s ease-out'
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
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: '30px',
    padding: '0 2px'
  },
  // Слой переключателя места: выше таймера, чтобы раскрытые пилюли
  // (зал/дом/улица) ложились ПОВЕРХ цифры часы:минуты, а не под ней.
  placeSlot: {
    position: 'relative',
    zIndex: 2
  },
  // Таймер строго по центру строки (место слева, крестик справа разной ширины).
  timerCenter: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  },
  timer: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    fontVariantNumeric: 'tabular-nums',
    transition: 'color 0.3s ease',
    display: 'inline-block'
  },
  // Крестик «отменить тренировку» — нейтральный серый, в правом углу строки.
  cancelBtn: {
    width: '30px',
    height: '30px',
    flexShrink: 0,
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.06)',
    border: 'none',
    borderRadius: '50%',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  // Поп-ап перегрузки (1ч30) — под временем, красноватый, с кнопкой ОК. Отступ
  // задаёт flex-gap карточки, своего marginTop не добавляем.
  overloadPopup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    background: 'rgba(232, 69, 69, 0.14)',
    border: '1px solid rgba(232, 69, 69, 0.4)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)'
  },
  overloadText: {
    flex: 1,
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.35,
    color: '#FF8C7A'
  },
  overloadOk: {
    flexShrink: 0,
    padding: '7px 18px',
    borderRadius: 'var(--radius-pill)',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: '12px',
    letterSpacing: '1px',
    cursor: 'pointer'
  },
  // Модалка отмены тренировки.
  cancelOverlay: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(13, 12, 12, 0.75)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top) + 30px) 20px 20px'
  },
  cancelModal: {
    width: '100%', maxWidth: '340px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: '24px 18px 18px',
    display: 'flex', flexDirection: 'column', gap: '8px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  cancelTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 800,
    color: 'var(--color-text)', textAlign: 'center'
  },
  cancelText: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '14px', lineHeight: 1.4
  },
  cancelButtonsRow: { display: 'flex', gap: '10px', width: '100%' },
  cancelKeepBtn: {
    flex: 1, padding: '14px', borderRadius: 'var(--radius-medium)',
    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)',
    color: 'var(--color-text)', fontFamily: 'var(--font-manrope)', fontSize: '13px',
    fontWeight: 700, letterSpacing: '1px', cursor: 'pointer'
  },
  cancelYesBtn: {
    flex: 1, padding: '14px', borderRadius: 'var(--radius-medium)',
    background: 'rgba(232, 69, 69, 0.16)', border: '1px solid rgba(232, 69, 69, 0.5)',
    color: '#FF6B6B', fontFamily: 'var(--font-manrope)', fontSize: '13px',
    fontWeight: 800, letterSpacing: '1px', cursor: 'pointer'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    // Подтягиваем букву дня ближе к строке «Зал / минуты» (−6px к гэпу 12px).
    marginTop: '-6px',
    touchAction: 'pan-y'
  },
  dayCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px'
  },
  // Буква дня по центру; флажок групп позиционируется абсолютно от неё.
  // Кликабельна — тап открывает пикер дней.
  dayLetterWrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none'
  },
  // Группы дня стопкой абсолютно справа от буквы (не двигают её с центра):
  // верхняя у верха буквы, нижняя у низа (space-between по высоте буквы), без
  // запятых, выравнивание по левому краю.
  dayFlag: {
    position: 'absolute',
    left: '100%',
    top: 0,
    bottom: 0,
    marginLeft: '8px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: '4px',
    paddingBottom: '4px',
    maxWidth: '110px'
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
  // Не-фокусный день (не сегодняшний по плану и не активный) — серая буква.
  dayLetterMuted: {
    color: 'var(--color-text-secondary)',
    textShadow: 'none'
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
    height: '9px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '5px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: '5px',
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
  // Заголовок группы в контенте — по центру (как в конструкторе). Обычный, в потоке;
  // уезжая вверх, прячется под карточкой дня, а его группу подхватывает пилюля.
  muscleHeader: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    padding: '4px 4px',
    margin: 0,
    textAlign: 'center'
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
    // Отступ от низа — как у таб-бара (var(--tabbar-bottom)), а не +safe-inset,
    // иначе кнопка висит заметно выше таб-бара.
    padding: '44px 16px var(--tabbar-bottom)',
    pointerEvents: 'none',
    zIndex: 40
  },
  // Подсказка над «Начать», когда идёт другая тренировка.
  startBlockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 'calc(100% + 4px)',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none'
  },
  startBlockToast: {
    maxWidth: '240px',
    padding: '10px 14px',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.35,
    color: '#FF6B6B',
    textAlign: 'center'
  },
  dayTagText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    lineHeight: 1.1,
    textAlign: 'left',
    whiteSpace: 'nowrap'
  }
}