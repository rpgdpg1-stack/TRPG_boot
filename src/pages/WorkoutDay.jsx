import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getCurrentUser } from '../lib/auth'
import { getWorkoutDay, finishWorkout } from '../features/programs/api'
import { getProgramBySlug, getProgramDaySlots, getProgramPlaces } from '../features/programs/registry'
import { useProgramPlace } from '../lib/program-place'
import PlaceSwitcher from '../components/PlaceSwitcher'
import RocketToggle from '../components/RocketToggle'
import RocketIcon from '../components/RocketIcon'
import { getQuickSet, getQuickSetSync, isQuickOn, setQuickOn, syncQuickOn, applyQuickSet } from '../lib/quick-workout'

import { hasWorkoutTodayOfType, HISTORY_FETCH_LIMIT } from '../utils/history'
import { setLastCompletedDay, getActiveDaySync, getRecentWorkoutsSync } from '../lib/storage'
import {
  getActiveWorkout,
  startActiveWorkout,
  clearActiveWorkout,
  onActiveWorkoutChange,
  elapsedSecFrom,
  formatWorkoutMin,
  TIMER_ORANGE_SEC,
  TIMER_RED_SEC,
  WORKOUT_TIMER_COLORS,
  workoutTimerColor
} from '../lib/active-workout'
import {
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress
} from '../utils/workout-progress'
import ExerciseCard from '../components/ExerciseCard'
import EmptyState from '../components/EmptyState'
import AdoptExercisesModal from '../components/AdoptExercisesModal'
import ExerciseActionMenu from '../components/ExerciseActionMenu'
import CloseCross from '../components/CloseCross'
import ScrollTopButton from '../components/ScrollTopButton'
import { getExerciseNote, getExerciseNoteCached } from '../lib/notes'
import WorkoutFinishedModal from '../components/WorkoutFinishedModal'
import FinishConfirmModal, { CONFIRM_EXIT_MS } from '../components/FinishConfirmModal'
import ActionButton from '../components/ActionButton'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import ClockIcon from '../components/ClockIcon'
import { pluralizeExercises } from '../utils/plural'
import ConfirmModal from '../components/ConfirmModal'
import ReturnHighlight from '../components/workout/ReturnHighlight'
import SwapAnimationOverlay from '../components/workout/SwapAnimationOverlay'
import SkeletonCard from '../components/workout/SkeletonCard'
import DayPicker from '../components/workout/DayPicker'
import { getRealScrollY, groupByMuscleGroup } from '../utils/workout-day'

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

// Память позиции скролла ЗАПУЩЕННОГО дня — localStorage, поэтому переживает не
// только уход/возврат по приложению, но и полный перезапуск Telegram (вылет).
// Ключ по programId/day/place. Только активная сессия: на неё возвращаемся в то же
// место (через главную «Продолжить», свайп на активный день, назад из настроек и т.п.);
// неактивные дни (другой день/программа) всегда открываются сверху. Чистится на
// старте/завершении/отмене тренировки — чтобы старое значение не всплыло в новой сессии.
const SCROLL_KEY = 'workout-scroll'
function saveActiveScroll(programId, day, place, y) {
  try { localStorage.setItem(`${SCROLL_KEY}:${programId}/${day}/${place}`, String(Math.round(y))) } catch { /* ignore */ }
}
function loadActiveScroll(programId, day, place) {
  try {
    const v = localStorage.getItem(`${SCROLL_KEY}:${programId}/${day}/${place}`)
    if (v == null) return null
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  } catch { return null }
}
function clearActiveScroll(programId, day, place) {
  try { localStorage.removeItem(`${SCROLL_KEY}:${programId}/${day}/${place}`) } catch { /* ignore */ }
}

// Цвета таймера: пороги/цвета общие (active-workout.js), 'off' (неактивный
// день) — серый локально. С 1ч30 (red) — ещё поп-ап «пора завершать».
const TIMER_COLORS = {
  off: 'var(--color-text-secondary)',
  ...WORKOUT_TIMER_COLORS
}

// Оценка длительности силовой тренировки: одно упражнение ≈ 3 рабочих подхода
// (8–12 повторов) с ~2 мин отдыха между подходами + подход/переход к снаряду.
// ~2 мин работы (3×~40с) + ~4 мин отдых (2×~120с) + ~1 мин переход ≈ 7 мин/упр.
// Общая оценка дня = число упражнений × это значение (напр. 8 → ~56 мин, 10 → ~1 ч 10 мин).
const EST_MIN_PER_EXERCISE = 7
// Сколько висит поп-ап переключения режима. Короткий: это подтверждение тапа,
// а не сообщение — на переключателях принято ~1.5-2с, чтобы частые нажатия
// не упирались в предыдущий показ.
const QUICK_POPUP_MS = 1800

// Источник входа в тренировку (true = с главной, false = из раздела). Модульная Map
// переживает очистку location.state (после возврата с Инфо/Замены) и перемонтирование —
// «Назад» всегда ведёт туда, откуда зашли. Ключ — programId.
const workoutEntryFromHome = new Map()
// Вход из «Любимых упражнений» (по «+») — «Назад» возвращает шагом истории туда.
const workoutEntryFromFav = new Map()

/** Плей-треугольник (как на главной) — для кнопки «Начать». */
function PlayIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.6 L18 12 L8 18.4 Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Флажок-финиш (Material-стиль) — для кнопки «Завершить». */
function FinishIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11.2a.7.7 0 0 1 .57 1.11L15.6 7l2.17 2.89A.7.7 0 0 1 17.2 11H7v9a1 1 0 0 1-1 1z" />
    </svg>
  )
}

export default function WorkoutDay() {
  const { programId, day } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [allSlots, setAllSlots] = useState([])
  // «Быстрая тренировка»: набор — что входит в короткую версию (настраивается
  // в конструкторе), quickOn — горит ли ракета сейчас.
  const [quickIds, setQuickIds] = useState(null)
  const [quickOn, setQuickOnState] = useState(false)
  const [quickPopup, setQuickPopup] = useState(null)   // null | { on, nonce }
  const [quickIntro, setQuickIntro] = useState(false)
  const quickPopupTimer = useRef(null)
  const quickPopupNonce = useRef(0)
  useEffect(() => () => { if (quickPopupTimer.current) clearTimeout(quickPopupTimer.current) }, [])

  // Видимый список дня. Ракета горит и набор настроен → показываем короткую
  // версию. Всё, что ниже считает прогресс, секции и счётчики, работает уже
  // с ЭТИМ списком — поэтому «12 упражнений» само превращается в «6».
  // Тумблер ракеты. Включили — короткий поп-ап с объяснением (один раз на тап,
  // не на каждый заход), выключили — молча.
  // Тап по ракете. Набор для этого дня не настроен — включать нечего: вместо
  // мёртвого тумблера показываем, что это за режим, и зовём настроить.
  const handleRocketTap = (next) => {
    if (next && !quickAvailable) { setQuickIntro(true); return }
    toggleQuick(next)
  }

  const openQuickSetup = () => {
    navigate(`/quick/${programId}/${day}`, { state: { place, from: location.pathname } })
  }

  const toggleQuick = (next) => {
    setQuickOnState(next)
    setQuickOn(programId, place, day, next)
    // Поп-ап и на включение, и на выключение: тумблер в углу мелкий, и без
    // подтверждения непонятно, что именно сейчас произошло.
    // Нонс обязателен: без него повторный тап в пределах показа НЕ перезапускал
    // бы анимацию — элемент остаётся смонтированным, анимация уже доиграна
    // (forwards → прозрачность 0), и поп-ап просто не появлялся.
    quickPopupNonce.current += 1
    setQuickPopup({ on: next, nonce: quickPopupNonce.current })
    if (quickPopupTimer.current) clearTimeout(quickPopupTimer.current)
    quickPopupTimer.current = setTimeout(() => setQuickPopup(null), QUICK_POPUP_MS)
  }

  const slots = useMemo(
    () => (quickOn ? applyQuickSet(allSlots, quickIds) : allSlots),
    [allSlots, quickOn, quickIds]
  )
  // Ракету показываем только когда есть что сокращать: набор настроен и он
  // реально короче дня. Иначе тумблер обещал бы то, чего нет.
  const quickAvailable = !!quickIds && quickIds.length > 0 && quickIds.length < allSlots.length
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Тик повторной загрузки (кнопка «Обновить» на экране ошибки).
  const [reloadTick, setReloadTick] = useState(0)

  // Прогресс грузится в эффекте ниже (после того как известно место) —
  // у каждого места (Зал/Дом/Улица) свой набор отжатых упражнений.
  const [activeOrderNums, setActiveOrderNums] = useState(() => new Set())

  // Подтверждение завершения (минимал-модалка перед «праздничной»).
  const [showConfirm, setShowConfirm] = useState(false)
  const [showLimitWarn, setShowLimitWarn] = useState(false)   // предупреждение о 2-й силовой за день
  const [confirmClosing, setConfirmClosing] = useState(false)   // панель подтверждения уезжает
  const [showFinishedModal, setShowFinishedModal] = useState(false)
  const [finishStatus, setFinishStatus] = useState('idle')
  const [finishErrorMsg, setFinishErrorMsg] = useState('')
  const [finishedOffline, setFinishedOffline] = useState(false)
  // true, если за сегодня награда уже была (лимит 1 тренировка/день) — тогда
  // модалка поздравляет, но +150 не показывает.
  const [alreadyToday, setAlreadyToday] = useState(false)

  const [actionSlot, setActionSlot] = useState(null)
  // Момент закрытия модалки заметки — гасим «призрачный» тап по упражнению под ней.
  const actionClosedAtRef = useRef(0)
  // Меню «⋯» у упражнения: заметка / техника / замена (привязано к кнопке).

  const [slideDir, setSlideDir] = useState('right')

  // Таймер тренировки: тикает с захода на день, сбрасывается при смене дня.
  // finishedSec фиксирует длительность на момент «Завершить» — для модалки.
  const [elapsedSec, setElapsedSec] = useState(0)
  const [finishedSec, setFinishedSec] = useState(0)

  // Пульсы (.pop-scale) — transient-флаги. На СТАРТЕ и при СВАЙПЕ на активный день
  // пульсируют вместе: время + счётчик + крестик. Буква НЕ пульсирует никогда.
  // Время — ещё на реальном пересечении порога.
  const [startedPulse, setStartedPulse] = useState(false)  // счётчик N/M
  const [timePulse, setTimePulse] = useState(false)        // время
  const [crossPulse, setCrossPulse] = useState(false)      // крестик
  // Сжатие шапки по состоянию (0=большая, 1=пилюля). Морф на старте/завершении.
  // Инициализация без мигания: активный день сразу пилюля.
  const [collapse, setCollapse] = useState(() => {
    const a = getActiveWorkout()
    if (a && a.programId === programId && a.day === day) return 1
    // Возврат с Инфо/Замены на прокрученную позицию — шапка СРАЗУ пилюля, чтобы
    // список не уезжал вверх морфом после восстановления скролла.
    return (location.state?.scrollY || 0) > 30 ? 1 : 0
  })
  const collapseRef = useRef(0)
  collapseRef.current = collapse
  const collapseRafRef = useRef(0)
  const prevDayKeyRef = useRef(null)
  const [btnMorph, setBtnMorph] = useState(false) // squish-морф кнопки Начать→Завершить
  const pulseTimers = useRef({})
  const firePulse = (setter, key, ms = 700) => {
    setter(true)
    if (pulseTimers.current[key]) clearTimeout(pulseTimers.current[key])
    pulseTimers.current[key] = setTimeout(() => setter(false), ms)
  }
  // Крестик отмены — общий компонент CloseCross. Ref на обёртке нужен, чтобы
  // pill-жест шапки не срабатывал при нажатии на крестик (см. pillDown).
  const cancelBtnRef = useRef(null)
  const prevTierRef = useRef(null)
  const [showOverload, setShowOverload] = useState(false)
  const overloadShownRef = useRef(false)                 // поп-ап перегрузки — один раз за сессию
  const overloadTimer = useRef(null)                     // авто-скрытие поп-апа через 45 сек
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Скрыть поп-ап перегрузки и снять таймер авто-скрытия.
  const hideOverload = () => {
    setShowOverload(false)
    if (overloadTimer.current) { clearTimeout(overloadTimer.current); overloadTimer.current = null }
  }
  // Снять таймер авто-скрытия при размонтировании.
  useEffect(() => () => { if (overloadTimer.current) clearTimeout(overloadTimer.current) }, [])

  // Эффекты возврата с других экранов:
  //   glowedOrderNum  — карточка подсвечивается светло-серой заливкой и плавно гаснет
  //   swappedOrderNum — карточка играет анимацию "змейки" (только swap)
  const [glowedOrderNum, setGlowedOrderNum] = useState(null)
  // Тап по пилюле (сжатая шапка): «растущее» нажатие + цикл по неотжатым.
  const [pillArmed, setPillArmed] = useState(false)
  const pillCycleRef = useRef(0)
  // Пульс «появления значений» после «Начать» отложен до конца морфа большая→пилюля.
  // Если шапка уже пилюля (пролистано) — играем сразу в handleStart, ref не ставим.
  const startPulseRef = useRef(false)
  const headerCardRef = useRef(null)
  const [swappedOrderNum, setSwappedOrderNum] = useState(null)

  // Открыта ли клавиатура (ввод веса на карточке). Пока true — прибитую к низу
  // кнопку «Завершить» прячем, чтобы она не липла к клавиатуре.
  const [kbOpen, setKbOpen] = useState(false)

  const cardRefs = useRef(new Map())

  // Начальное позиционирование скролла отработало (один раз за монтирование). Пока
  // false — НЕ сохраняем позицию (иначе первый заход перезатёр бы сохранённое место
  // нулём до того, как восстановление успеет его прочитать). Ставится в restore-эффекте.
  const didInitialScrollRef = useRef(false)
  // Отложенное позиционирование при свайпе/пикере дней (см. goToDay + эффект ниже).
  const pendingScrollRef = useRef(null)

  // Пикер дней (мини-модалка из центра буквы). letterRef — якорь для позиции,
  // dayPickerRect != null → открыт.
  const letterRef = useRef(null)
  const [dayPickerRect, setDayPickerRect] = useState(null)

  // Две высоты шапки НЕактивного дня: наверху высокая, при скролле вниз — компактная
  // (но НЕ пилюля). Булев со ЗНАЧИТЕЛЬНЫМ гистерезисом (вход >30px, выход <10px),
  // чтобы не мигало на границе. Апдейтит скролл-лисенер.
  // Стартовое «компактно» — по восстанавливаемому скроллу (возврат с Инфо/Замены),
  // чтобы шапка сразу была пилюлей и морф не дёргал список.
  const [headerMin, setHeaderMin] = useState(() => (location.state?.scrollY || 0) > 30)
  const headerMinRef = useRef((location.state?.scrollY || 0) > 30)
  const sectionsRef = useRef([])              // текущие секции
  const stickyHeaderRef = useRef(null)        // шапка дня — её низ = линия появления/смены

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

  // Буква дня — ВСЕГДА фирменный акцент (зелёный), а не цвет первой группы мышц.
  // Раньше день A мог быть красным, B розовым, C зелёным — шапка пестрила, и
  // цвет не значил ничего полезного (группы и так написаны в тегах карточек).
  // Теперь цвет тут значит одно: «этот день — твой сегодняшний».
  const dayGroupAccent = 'var(--color-primary)'
  const accentForDay = () => 'var(--color-primary)'

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
  // Фокус-день (буква 100% + свечение): запущенная сессия ЭТОЙ программы →
  // запущенный день; иначе рекомендованный по циклу; если истории ещё нет
  // (getActiveDaySync=null, свежая программа) — первый день, чтобы «рекомендованный»
  // всегда был подсвечен, а не все дни разом opacity. Прочие дни — opacity.
  const focusDay = sessionDayForProgram || getActiveDaySync(programId) || days[0]
  // Тост «сначала заверши текущую» — показываем ТОЛЬКО по тапу на заблокированную
  // «Начать», авто-скрытие через 2.6с (nonce перезапускает шейк на каждый тап).
  const [startBlockNonce, setStartBlockNonce] = useState(0)
  const [startBlockHint, setStartBlockHint] = useState(false)
  const startBlockTimer = useRef(null)
  useEffect(() => () => { if (startBlockTimer.current) clearTimeout(startBlockTimer.current) }, [])

  useEffect(() => {
    // Запоминаем источник входа ТОЛЬКО при свежем входе (с главной/раздела или свайпе
    // дня). Возврат с Инфо/Замены (returnedFromOrderNum) не трогает — источник хранится
    // в Map и переживает очистку state. Кнопка "Назад" ведёт туда, откуда зашли.
    const returningFromSub = location.state?.returnedFromOrderNum != null
    if (!returningFromSub) {
      workoutEntryFromHome.set(programId, location.state?.fromHome === true)
      workoutEntryFromFav.set(programId, location.state?.from === '/favorite-exercises')
    }
    const categoryId = program?.category || 'gym'
    backButton.setHandler(() => {
      if (workoutEntryFromHome.get(programId)) navigate('/')
      else if (workoutEntryFromFav.get(programId)) navigate(-1)  // шаг истории → на «Любимые»
      else navigate(`/category/${categoryId}`)
    })
    lockVerticalSwipes()
  }, [navigate, program, location.state, programId])

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
    // Пульс времени — ТОЛЬКО на реальном пересечении порога (green→orange→red).
    // Заход на активный день (off→green) не пульсирует время (пульсирует буква).
    if (prev === null || prev === 'off' || timerTier === prev) return
    if (timerTier !== 'off') firePulse(setTimePulse, 'time')
    if (timerTier === 'red' && !overloadShownRef.current) {
      overloadShownRef.current = true
      setShowOverload(true)
      haptic.warning()
      // Сам исчезает через 45 сек, если не нажали ОК — он информирующий, не блокирующий.
      if (overloadTimer.current) clearTimeout(overloadTimer.current)
      overloadTimer.current = setTimeout(() => { setShowOverload(false); overloadTimer.current = null }, 45 * 1000)
    }
  }, [timerTier])

  // Свежий заход на день открываем сверху. Возврат с «Сменить»/«Инфо» сюда не
  // относится — там восстанавливается прежняя позиция скролла (см. эффект ниже).
  // Глобальный ScrollToTop в App для /workout/ выключен (день рулит скроллом сам).
  useLayoutEffect(() => {
    if (location.state?.returnedFromOrderNum != null) return
    // Активный день — не гнать наверх: его позицию выставит restore-эффект ниже
    // (вернёт на сохранённое место). Неактивный — открываем сверху.
    if (isThisActive) return
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

  // Набор быстрой версии — свой для каждой пары место+день; состояние ракеты —
  // одно на программу. Оба стартуют мгновенно из localStorage, облако догоняет.
  useEffect(() => {
    setQuickIds(getQuickSetSync(programId, place, day))
    let alive = true
    getQuickSet(programId, place, day).then(v => { if (alive) setQuickIds(v) })
    return () => { alive = false }
  }, [programId, place, day])

  // Ракета — на каждый день своя: включил в A, в B она серая, пока не нажмёшь там.
  useEffect(() => {
    setQuickOnState(isQuickOn(programId, place, day))
    let alive = true
    syncQuickOn(programId, place, day).then(v => { if (alive) setQuickOnState(v) })
    return () => { alive = false }
  }, [programId, place, day])

  // Префилл из памяти ДО отрисовки (на каждую смену дня/места): если слоты уже
  // загружались — показываем их сразу, без скелетона (возврат с Инфо/Смены,
  // свайп на ранее открытый день). useLayoutEffect → успеваем до paint, скролл
  // восстановится без моргания. Если в памяти пусто — скелетон.
  useLayoutEffect(() => {
    const cached = slotsMemory.get(`${programId}/${day}/${place}`)
    if (cached && cached.length) {
      setAllSlots(cached)
      setLoading(false)
    } else {
      setAllSlots([])
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
          setAllSlots(arr)
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

  // При СМЕНЕ дня/места прячем пилюлю и раскрываем шапку (новый день открывается
  // сверху). Первый маунт НЕ трогаем — там init уже верный (возврат с Инфо/Замены
  // на прокрученную позицию должен остаться пилюлей, без раскрытия и уезда списка).
  const dayResetMountRef = useRef(false)
  useLayoutEffect(() => {
    if (!dayResetMountRef.current) { dayResetMountRef.current = true; return }
    setHeaderMin(false)
    headerMinRef.current = false
    pillCycleRef.current = 0
  }, [day, place])

  // Компактная шапка (для ЛЮБОГО дня — активного и нет) + память скролла активного
  // дня: следим за scrollY всегда, шапка сжимается на скролле вниз одинаково.
  // Сохранение позиции в localStorage (троттл 250мс) — ТОЛЬКО для активного дня
  // (флаш при сворачивании/закрытии и при уходе с дня).
  useEffect(() => {
    let raf = 0
    let lastSave = 0
    const liveY = () => window.scrollY || document.scrollingElement?.scrollTop || 0
    const compute = () => {
      raf = 0
      const y = liveY()
      // Две высоты шапки с гистерезисом: компактная при y>30, высокая при y<10.
      let min = headerMinRef.current
      if (min && y < 10) min = false
      else if (!min && y > 30) min = true
      if (min !== headerMinRef.current) { headerMinRef.current = min; setHeaderMin(min) }
      // Сохраняем ТОЛЬКО для активного дня и только после того, как восстановление
      // позиции отработало — иначе первый заход перезатёр бы место нулём.
      if (isThisActive && didInitialScrollRef.current) {
        const now = Date.now()
        if (now - lastSave > 250) { lastSave = now; saveActiveScroll(programId, day, placeRef.current, y) }
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute) }
    // flush читает ЖИВУЮ позицию (не захваченную) — на случай ухода сразу после
    // восстановления, когда scroll-событие ещё не успело обновить состояние.
    const flush = () => { if (isThisActive && didInitialScrollRef.current) saveActiveScroll(programId, day, placeRef.current, liveY()) }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
      if (raf) cancelAnimationFrame(raf)
      flush() // уход с дня/размонтирование — сохранить финальную позицию (активный день)
    }
  }, [isThisActive, programId, day])


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

  // Заход НА активный день (свежий вход, «Продолжить» с главной после вылета
  // Telegram, назад из настроек/друзей) — восстановить сохранённую позицию скролла,
  // как только слоты дня в DOM. Один раз за монтирование (didInitialScrollRef).
  // Возврат с Инфо/Смены сюда не относится (у него свой эффект выше).
  useLayoutEffect(() => {
    if (didInitialScrollRef.current) return
    if (location.state?.returnedFromOrderNum != null) { didInitialScrollRef.current = true; return }
    if (!isThisActive) { if (!loading) didInitialScrollRef.current = true; return }
    if (loading || !slots.length) return
    didInitialScrollRef.current = true
    const y = loadActiveScroll(programId, day, placeRef.current)
    if (y != null && y > 0) {
      window.scrollTo(0, y)
      document.scrollingElement?.scrollTo(0, y)
    }
  }, [loading, slots.length, location.state, isThisActive, programId, day])

  // Свайп/пикер дней внутри страницы (goToDay): позиционируем ПОСЛЕ подстановки
  // слотов целевого дня. pendingScrollRef = { day, y }: 'top' — сверху (неактивный
  // день); число — восстановить (свайп обратно на активный день). Ждём, пока slots
  // станут именно слотами целевого дня (slots === кэш этого ключа) — иначе спозиционируем
  // по слотам предыдущего дня (промежуточный рендер) и промахнёмся по высоте.
  useLayoutEffect(() => {
    const p = pendingScrollRef.current
    if (p == null || p.day !== day) return
    if (loading || !slots.length) return
    if (slots !== slotsMemory.get(`${programId}/${day}/${place}`)) return
    pendingScrollRef.current = null
    const y = p.y === 'top' ? 0 : p.y
    window.scrollTo(0, y)
    document.scrollingElement?.scrollTo(0, y)
  }, [day, place, loading, slots, programId])

  // Эффекты подсветки карточки, с которой уходил (press + glow + змейка свапа),
  // и очистка state из истории, чтобы повтор не сработал при свайпе дней.
  useEffect(() => {
    if (loading || !slots.length) return

    const stateData = location.state || {}
    const returnedFrom = stateData.returnedFromOrderNum
    if (returnedFrom == null) return

    const wasSwapped = stateData.wasSwapped

    setGlowedOrderNum(returnedFrom)
    setTimeout(() => setGlowedOrderNum(null), 1600)

    if (wasSwapped) {
      setSwappedOrderNum(returnedFrom)
      setTimeout(() => setSwappedOrderNum(null), 2600)
    }

    // Чистим returnedFromOrderNum (чтобы подсветка не повторялась при свайпе дней),
    // но СОХРАНЯЕМ источник входа — иначе «Назад» после Инфо/Замены уводил не туда.
    navigate(location.pathname, {
      replace: true,
      state: workoutEntryFromHome.get(programId) ? { fromHome: true } : null
    })
  }, [loading, slots.length, location.state, location.pathname, navigate, programId])

  const handleCardTap = (slot) => {
    if (showFinishedModal) return
    if (actionSlot) return
    // Только что закрыли модалку заметки — не считаем «призрачный» тап по упражнению.
    if (Date.now() - actionClosedAtRef.current < 400) return
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

  // Вес отредактировали в модалке действий — обновляем слоты, чтобы карточка
  // под модалкой сразу показала новую цифру (без перезахода на экран).
  const handleWeightSaved = (exerciseId, weight) => {
    setAllSlots(prev => prev.map(s =>
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
    // Уходим с активного дня — зафиксировать его позицию (вернёмся сюда — откроем тут же).
    if (isThisActive) saveActiveScroll(programId, day, placeRef.current, getRealScrollY())
    setSlideDir(direction === 'next' ? 'right' : 'left')
    const targetIsActive = active && active.programId === programId && active.day === targetDay
    // Свайп НА запущенный день сессии — та же анимация, что при старте: пульсируют
    // время + счётчик + крестик (буква НЕ пульсирует). «Вот он, активный день».
    if (targetIsActive) {
      firePulse(setTimePulse, 'time')
      firePulse(setStartedPulse, 'count')
      firePulse(setCrossPulse, 'cross')
    }
    // Активный целевой день — восстановить сохранённую позицию; прочие — сверху.
    // Ставит restore-эффект по слотам целевого дня (не гоним scrollToTop сразу).
    pendingScrollRef.current = {
      day: targetDay,
      y: targetIsActive ? (loadActiveScroll(programId, targetDay, placeRef.current) ?? 'top') : 'top'
    }
    // Пробрасываем источник входа дальше, чтобы после переключения дней кнопка
    // "Назад" всё ещё вела туда же (главная / любимые).
    navigate(`/workout/${programId}/${targetDay}`, {
      replace: true,
      state: location.state?.fromHome ? { fromHome: true }
        : location.state?.from ? { from: location.state.from } : null
    })
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
  // Вторая силовая за день: сервер её не засчитает (лимит 1/сутки). Предупреждаем
  // ДО старта, чтобы человек решал осознанно, а не узнавал после тренировки.
  const strengthDoneToday = () => {
    if (program?.kind === 'swim') return false
    const recent = getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || []
    return hasWorkoutTodayOfType(recent, 'strength')
  }

  const handleStartTap = () => {
    if (strengthDoneToday()) {
      haptic.medium()
      setShowLimitWarn(true)
      return
    }
    handleStart()
  }

  const handleStart = () => {
    haptic.success()
    clearWorkoutProgress(programId, day, place)
    clearActiveScroll(programId, day, place) // свежий старт — без старой позиции скролла
    setActiveOrderNums(new Set())
    overloadShownRef.current = false
    hideOverload()
    startActiveWorkout(programId, day, place)
    // Начал из середины/низа (шапка-пилюля) — плавно поднимаем к верху тренировки.
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.scrollingElement?.scrollTo({ top: 0, behavior: 'smooth' })
    // Появление значений (время/счётчик/крестик) на старте:
    //  • шапка была большой → пилюля соберётся морфом, пульс сыграем в конце морфа;
    //  • шапка уже пилюля (пролистано вниз) → морфа не будет, играем появление сразу.
    // Буква на старте НЕ пульсирует — только когда потом свайпнешь на активный день.
    if (collapseRef.current >= 0.999) {
      firePulse(setTimePulse, 'time')
      firePulse(setStartedPulse, 'count')
      firePulse(setCrossPulse, 'cross')
    } else {
      startPulseRef.current = true
    }
    setBtnMorph(true)
    setTimeout(() => setBtnMorph(false), 460)
  }

  // Вход по кружку Play с карточки программы: день открывается уже запущенным —
  // жать «Начать» второй раз не нужно, анимация схлопывания шапки играет сама.
  // Стартуем ОДИН раз за монтирование (ref-предохранитель) и только если сессии
  // ещё нет: иначе возврат на экран перезапустил бы тренировку и снёс прогресс.
  // Предупреждение о второй силовой за день не обходим — при нём вместо старта
  // покажется тот же диалог, что и по обычному тапу.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!location.state?.autoStart || autoStartedRef.current) return
    if (!program || sessionBlocked || isThisActive) return
    autoStartedRef.current = true
    // Снимаем флаг из истории, чтобы «Назад→Вперёд» не стартовало заново.
    navigate(location.pathname, { replace: true, state: { ...location.state, autoStart: false } })
    handleStartTap()
    // Намеренно узкий список: handleStartTap/navigate пересоздаются каждый рендер,
    // с ними эффект гонялся бы вхолостую (ref всё равно пропустит повторы).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.autoStart, program, sessionBlocked, isThisActive])

  // Целевое сжатие: пилюля (1) — на активном дне ИЛИ при скролле вниз (headerMin);
  // высокая шапка (0) — только наверху. Промежуточного «второго состояния» больше нет:
  // как начал листать — сразу собирается в пилюлю (как при «Начать»).
  // Пока открыта модалка завершения — экран под ней ЗАМОРОЖЕН: держим шапку
  // в текущем виде (иначе после сохранения isThisActive гаснет, шапка
  // разворачивается, страница меняет высоту и уезжает под затемнением).
  const collapseTarget = (isThisActive || headerMin || showFinishedModal) ? 1 : 0

  // Морф шапки к целевому сжатию: навигация/первый заход — мгновенно; смена цели
  // (снап между двумя высотами ИЛИ старт/завершение) — плавный твин ИЗ ТЕКУЩЕГО
  // значения (из компактной сразу в пилюлю, без скачка в высокую). По достижении
  // пилюли (target=1) — grow-пульс времени/счётчика/крестика.
  useEffect(() => {
    const dayKey = `${programId}:${day}:${place}`
    const first = prevDayKeyRef.current === null
    const dayChanged = prevDayKeyRef.current !== dayKey
    prevDayKeyRef.current = dayKey

    if (collapseRafRef.current) { cancelAnimationFrame(collapseRafRef.current); collapseRafRef.current = 0 }

    // Первый заход / смена дня-места — сразу в нужное состояние, без анимации.
    if (first || dayChanged) { setCollapse(collapseTarget); return }

    const start = collapseRef.current
    const target = collapseTarget
    if (Math.abs(target - start) < 0.001) return
    const t0 = performance.now()
    // К пилюле / от пилюли (старт/финиш) — 480мс; переключение двух высот — 260мс.
    const dur = (target >= 0.999 || start >= 0.999) ? 480 : 260
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur)
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2 // easeInOutQuad
      setCollapse(start + (target - start) * e)
      if (p < 1) { collapseRafRef.current = requestAnimationFrame(step) }
      else {
        collapseRafRef.current = 0
        if (target >= 0.999 && startPulseRef.current) {
          // Пилюля собралась ПОСЛЕ «Начать» (не от скролла) — проиграть появление значений.
          startPulseRef.current = false
          firePulse(setTimePulse, 'time')
          firePulse(setStartedPulse, 'count')
          firePulse(setCrossPulse, 'cross')
        }
      }
    }
    collapseRafRef.current = requestAnimationFrame(step)
    return () => { if (collapseRafRef.current) cancelAnimationFrame(collapseRafRef.current) }
  }, [collapseTarget, day, place, programId])

  // Крестик «отменить тренировку» (только для активной): тап → подтверждение →
  // закрываем сессию БЕЗ сохранения (в историю не идёт, баллы не начисляются).
  // Для «передумал / случайно начал / тестирую».
  const handleCancelTap = () => { haptic.light(); setShowCancelConfirm(true) }
  const handleCancelConfirm = () => {
    haptic.medium()
    clearWorkoutProgress(programId, day, place)
    clearActiveScroll(programId, day, place)
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

  // Пока открыта любая из модалок завершения — страница под ними стоит на месте:
  // жест гасит touchAction на оверлее, а этот сторож возвращает позицию, если её
  // сдвинуло изменение вёрстки (шапка, галочки, исчезнувшая кнопка).
  useEffect(() => {
    if (!showConfirm && !showFinishedModal) return
    const y = window.scrollY || document.scrollingElement?.scrollTop || 0
    const keep = () => {
      const now = window.scrollY || document.scrollingElement?.scrollTop || 0
      if (Math.abs(now - y) > 1) {
        window.scrollTo(0, y)
        document.scrollingElement?.scrollTo(0, y)
      }
    }
    window.addEventListener('scroll', keep, { passive: true })
    return () => window.removeEventListener('scroll', keep)
  }, [showConfirm, showFinishedModal])

  // Тап «Завершить» → сначала минимал-подтверждение (защита от случайного
  // раннего завершения). На «Завершить» в нём — праздничная модалка + сохранение.
  const handleFinishButtonTap = () => {
    if (activeOrderNums.size === 0) return
    haptic.medium()
    setFinishedSec(elapsedSec)
    setShowConfirm(true)
  }

  const handleConfirmFinishYes = () => {
    if (confirmClosing) return
    haptic.medium()
    // Сначала уводим панель подтверждения (затемнение остаётся), и только потом
    // ставим модалку завершения — иначе смена читается как рывок/мигание.
    setConfirmClosing(true)
    setTimeout(() => {
      setShowConfirm(false)
      setConfirmClosing(false)
      // Модалка появляется целиком, жест «+1 мускул» играет уже внутри неё.
      setShowFinishedModal(true)
      runFinish()
    }, CONFIRM_EXIT_MS)
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
      // ВАЖНО: из allSlots, а не из slots. «Быстрая» — режим ПОКАЗА: если
      // человек отжал упражнение, а потом включил ракету и оно скрылось,
      // в отчёт оно всё равно должно попасть.
      const exerciseIds = allSlots
        .filter(s => activeOrderNums.has(s.order_num))
        .map(s => s.exercise_id)
        .filter(Boolean)

      const result = await finishWorkout(programId, day, exerciseIds, 0)

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
      clearActiveScroll(programId, day, place)
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
  // Пока не отмечено ни одного упражнения — «Завершить» показываем в disabled-виде
  // («ещё рано»), но кнопка остаётся нажимаемой (тап → подтверждение раннего конца).
  const canFinish = activeOrderNums.size > 0

  const totalSlots = slots.length || 1
  // Считаем отжатое СРЕДИ ВИДИМЫХ: в «быстрой» часть отмеченных скрыта, и
  // общий размер счётчика давал бы «5/4» и прогресс за 100%.
  const doneVisible = slots.filter(s => activeOrderNums.has(s.order_num)).length
  const progressPct = Math.min(100, (doneVisible / totalSlots) * 100)

  // Всё сжатие идёт от анимированного `collapse` (к целевому `collapseTarget`):
  //  • 0 — высокая шапка; 1 — пилюля (строка). letterShrink 0→1 при collapse 0→0.6
  //    (большая буква мельчает), rowCollapse 0→1 при collapse 0.5→1 (буква/счётчик
  //    въезжают в строку, большой блок и место сворачиваются). Одинаково для
  //    активного и неактивного дня — разница только в содержимом строки.
  const letterShrink = Math.min(1, Math.max(0, collapse / 0.6))
  const dayLetterSize = 45 - letterShrink * 21
  const rowCollapse = Math.min(1, Math.max(0, (collapse - 0.5) / 0.5))

  // Тап по пилюле (шапка полностью сжата, активная сессия, осталось 1–3 упражнения):
  // плавный скролл к следующему НЕотжатому (по кругу сверху вниз) + зелёная
  // подсветка-обводка. Нажатие «растущее» с отменой при уводе пальца (как крестик).
  const remainingCount = slots.length - doneVisible
  const pillTapEnabled = isThisActive && rowCollapse >= 0.95 && remainingCount >= 1 && remainingCount <= 3
  const pillDown = (e) => {
    if (!pillTapEnabled) return
    if (cancelBtnRef.current && cancelBtnRef.current.contains(e.target)) return
    setPillArmed(true)
  }
  const pillMove = (e) => {
    if (!pillArmed) return
    const el = headerCardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      setPillArmed(false)
    }
  }
  const pillUp = () => {
    if (!pillArmed) return
    setPillArmed(false)
    const remaining = slots.filter(s => !activeOrderNums.has(s.order_num))
    if (remaining.length === 0) return
    const target = remaining[pillCycleRef.current % remaining.length]
    pillCycleRef.current += 1
    const cardEl = cardRefs.current.get(target.order_num)
    const headEl = stickyHeaderRef.current
    if (!cardEl || !headEl) return
    haptic.selection()
    // Центрируем карточку в зоне МЕЖДУ низом закрепа и низом экрана.
    const headBottom = headEl.getBoundingClientRect().bottom
    const zoneCenter = headBottom + (window.innerHeight - headBottom) / 2
    const cr = cardEl.getBoundingClientRect()
    const top = (window.scrollY || 0) + (cr.top + cr.height / 2) - zoneCenter
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    setGlowedOrderNum(target.order_num)
    setTimeout(() => setGlowedOrderNum(null), 1600)
  }

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

        {/* Один целиковый блок: место+таймер сверху, буква дня с группами, счётчик.
            Фон/строук как у карточки игрока на главной. Во время тренировки ФОН
            карточки плавно заполняется светло-серым по мере отжатых упражнений
            (весь прогресс дня — тут, а не полоской). */}
        <div
          ref={headerCardRef}
          onPointerDown={pillDown}
          onPointerMove={pillMove}
          onPointerUp={pillUp}
          onPointerCancel={() => setPillArmed(false)}
          style={{
            ...styles.headerCard,
            padding: `${14 - rowCollapse * 6}px 16px`,
            transform: pillArmed ? 'scale(1.03)' : 'scale(1)',
            transition: 'transform 0.16s var(--ease-ios)'
          }}
        >
          {isThisActive && (
            <div style={{ ...styles.headerFill, width: `${progressPct}%` }} aria-hidden="true" />
          )}
          {/* Ракета «быстрой» — левый край карточки-шапки (тег места сверху слева).
              Лежит ВНЕ headerCardInner: та колонка центрирует содержимое, а ракете
              нужен угол. Видна и РАБОТАЕТ везде — в раскрытой шапке, в пилюле,
              во время тренировки: ускориться решают как раз посреди неё. */}
          {!loading && slots.length > 0 && (
            <div style={styles.rocketSlot}>
              <RocketToggle
                on={quickOn}
                active={isThisActive}
                onToggle={handleRocketTap}
                onLongPress={openQuickSetup}
              />
            </div>
          )}

          <div style={styles.headerCardInner}>

          <div style={styles.topMetaRow}>
            {/* Место тренировки (Зал/Дом/Улица) — переключатель; смена места
                подгружает упражнения этого места из конструктора. В своём слое
                выше таймера: раскрытые пилюли налезают на центр и должны быть
                ПОВЕРХ цифры часы:минуты, а не под ней. */}
            <div style={{ ...styles.placeSlot, opacity: 1 - rowCollapse, pointerEvents: rowCollapse > 0.5 ? 'none' : 'auto' }}>
              {/* Место можно менять даже во время активной сессии (по просьбе). */}
              <PlaceSwitcher program={program} value={place} onChange={(loc) => { setPlace(loc); scrollToTop() }} />
            </div>
            {/* Центр строки: активна — таймер (зелёный→оранжевый→красный, пульс на
                смене цвета); до старта — часы + примерная длительность (баланс
                строки + подсказка «сколько займёт»). */}
            {(isThisActive || (!loading && slots.length > 0)) && (
              <div style={styles.timerCenter}>
                {/* Буква дня — въезжает слева при полном сжатии в строку */}
                <span style={{
                  ...styles.rowLetter,
                  color: dayGroupAccent,
                  opacity: rowCollapse,
                  maxWidth: `${rowCollapse * 26}px`,
                  marginRight: `${rowCollapse * 13}px`
                }}>{day}</span>

                {isThisActive ? (
                  <span
                    className={timePulse ? 'pop-scale' : undefined}
                    style={{ ...styles.timer, ...styles.timerWithClock, color: TIMER_COLORS[timerTier] }}
                  >
                    <ClockIcon size={14} />{formatWorkoutMin(elapsedSec)}
                  </span>
                ) : (
                  <span style={styles.estimate}>
                    <ClockIcon size={13} /> ≈ {formatWorkoutMin(slots.length * EST_MIN_PER_EXERCISE * 60)}
                  </span>
                )}

                {/* Счётчик — въезжает справа при полном сжатии. Размер/вес — как у
                    времени рядом (активно 16/700, до старта 13/600). Пульс на старте. */}
                <span
                  className={startedPulse ? 'pop-scale' : undefined}
                  style={{
                    ...styles.rowCount,
                    fontSize: isThisActive ? '16px' : '13px',
                    fontWeight: isThisActive ? 700 : 600,
                    opacity: rowCollapse,
                    maxWidth: `${rowCollapse * 80}px`,
                    marginLeft: `${rowCollapse * 13}px`
                  }}
                >
                  {isThisActive
                    ? `${doneVisible}/${slots.length}`
                    : `${slots.length} упр`}
                </span>
              </div>
            )}
            {/* Крестик «отменить тренировку» — только для активной сессии. Absolute
                справа (не раздувает строку). Общий компонент CloseCross; обёртка с
                ref нужна для исключения из pill-жеста шапки. «Поп» на появление —
                через проп pulse. */}
            {isThisActive && (
              <div ref={cancelBtnRef} style={styles.cancelSlot}>
                <CloseCross
                  onClose={handleCancelTap}
                  pulse={crossPulse}
                  hitSize={44}
                  bubbleSize={32}
                  iconSize={16}
                />
              </div>
            )}
          </div>

          {/* Поп-ап перегрузки (1ч30) — ПЛАВАЮЩИЙ поверх карточки (перекрывает букву),
              не раздувает блок. Только на активном дне; сам исчезает через 45 сек или
              по тапу ОК. */}
          {isThisActive && showOverload && (
            <div style={styles.overloadPopup}>
              <span style={styles.overloadText}>Чтобы не перегрузить организм — пора завершать.</span>
              <button onClick={() => { haptic.light(); hideOverload() }} style={styles.overloadOk} className="press-tile">ОК</button>
            </div>
          )}

          <div
            style={{
              ...styles.headerRow,
              maxHeight: `${(1 - rowCollapse) * 150}px`,
              opacity: 1 - rowCollapse,
              marginTop: `${-6 - 6 * rowCollapse}px`,
              overflow: 'hidden',
              pointerEvents: rowCollapse > 0.5 ? 'none' : 'auto'
            }}
            onTouchStart={handleHeaderTouchStart}
            onTouchEnd={handleHeaderTouchEnd}
          >
            {/* Стрелки и пейджер убраны — переключение дней свайпом. Тап по букве
                открывает мини-пикер дней (A/B/C) из центра буквы. Буква строго по
                центру (группы дня ушли в строку-описание ниже). */}
            <div style={styles.dayCol}>
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
                    // Фокусный (рекомендованный/активный) день — акцентным цветом,
                    // прочие серым. Свечения НЕТ: на крупной букве ореол читался
                    // как пересвет, а цвета и так достаточно.
                    ...(day === focusDay
                      ? { color: dayGroupAccent }
                      : { color: 'var(--color-text-secondary)' }),
                    fontSize: `${dayLetterSize}px`
                  }}
                >
                  {day}
                </span>
              </div>
              {/* Чипы групп под буквой убраны (по просьбе): шапка чище. */}
            </div>
          </div>

          {/* Счётчик по центру: до старта «N упражнений»; в тренировке — «N/M»
              (без слова, прогресс показывает заливка фона карточки). */}
          <div style={{
            ...styles.countRow,
            height: `${(1 - rowCollapse) * 22}px`,
            opacity: 1 - rowCollapse,
            marginTop: `${-12 * rowCollapse}px`,
            overflow: 'hidden'
          }}>
            <span
              className={startedPulse ? 'pop-scale' : undefined}
              style={{ ...styles.dayDescLabel, ...(isThisActive ? styles.dayCountActive : null) }}
            >
              {loading ? '...'
                : isThisActive ? `${doneVisible}/${slots.length}`
                : `${slots.length} ${pluralizeExercises(slots.length)}`}
            </span>
          </div>
          </div>{/* headerCardInner */}
        </div>

        {/* Затемнение-скрим под шапкой убран — шапка сама стеклянная (блюр), контент
            скроллится прямо под ней. */}
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

        {/* Программа от друга ещё не «присвоена»: в ней личные упражнения автора,
            в которые нельзя вести свой вес. Открыть день можно было бы и так, но
            это была бы витрина без работы — поэтому объяснение поверх и выход. */}
        {program?.pendingCustom > 0 && (
          <AdoptExercisesModal
            program={program}
            onClose={() => navigate(-1)}
            onAdopted={() => window.location.reload()}
          />
        )}

        {/* Скелетон на время загрузки — чтобы контент не «прыгал». */}
        {loading && !error && (
          <div style={styles.sectionsWrap}>
            <div style={styles.exerciseList}>
              {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
            </div>
          </div>
        )}

        {/* День может опустеть на ровном месте: человек удалил своё упражнение,
            и оно ушло из всех программ, где стояло. Поэтому не сухая серая
            строка, а состояние с выходом — у своей программы сразу в конструктор. */}
        {!loading && !error && slots.length === 0 && (
          <EmptyState
            title="В этом дне пусто"
            hint={program?.editable
              ? 'Все упражнения из него удалены. Собери день заново в конструкторе.'
              : 'Упражнения для этого дня не настроены.'}
            action={program?.editable ? (
              <ActionButton onClick={() => { haptic.light(); navigate('/constructor') }} variant="neutral" hug>
                Открыть конструктор
              </ActionButton>
            ) : null}
          />
        )}

        {!loading && sections.length > 0 && (
          <div style={styles.sectionsWrap}>
            {sections.map((section, sIdx) => (
              <section
                key={`${section.muscleGroup}-${sIdx}`}
                style={styles.section}
              >
                <div style={styles.exerciseList}>
                  {section.slots.map(slot => {
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
                          // Пресс-эффект при подсветке — как везде (вжим и обратно, один раз).
                          ...(isGlowed ? { animation: 'returnPress 0.36s var(--press-ease)' } : null)
                        }}
                      >
                        <ExerciseCard
                          slot={slot}
                          isActive={activeOrderNums.has(slot.order_num)}
                          // Тренировка идёт — тег перестаёт быть кликабельным:
                          // палец занят отметками, и зона-ловушка посреди
                          // карточки только мешает. Многоточие остаётся.
                          tagStatic={isThisActive}
                          onTap={handleCardTap}
                          onLongPress={handleCardLongPress}
                          onInfo={goToInfo}
                          onSwap={goToSwap}
                          onWeightSaved={handleWeightSaved}
                        />

                        {/* «Недавно тронутое» — светло-серая заливка карточки:
                            вернулся к ней / тапнул по прогресс-бару. Плавно гаснет. */}
                        {isGlowed && <ReturnHighlight />}

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

          {/* «Начать» — зелёная заливка + белый текст + плей (как на главной).
              «Завершить»: отмечено хоть одно упражнение → tonal (полный акцентный
              зелёный, как заливка «Начать»); ещё ничего → disabled-вид «ещё рано». */}
          {isThisActive ? (
            <ActionButton
              onClick={handleFinishButtonTap}
              variant={canFinish ? 'tonal' : 'dim'}
              bordered
              hug
              className={btnMorph ? 'btn-morph' : ''}
            >
              <FinishIcon size={24} />Завершить
            </ActionButton>
          ) : (
            <ActionButton
              onClick={sessionBlocked ? handleBlockedStart : handleStartTap}
              variant={sessionBlocked ? 'dim' : 'primary'}
              hug
              className={btnMorph ? 'btn-morph' : ''}
            >
              {/* Иконка кнопки НЕ зависит от режима: «Начать» — это всегда старт,
                  и подменять плей ракетой значит менять смысл кнопки. Про режим
                  говорит сама ракета в шапке — там ей и место. */}
              <PlayIcon size={24} />Начать
            </ActionButton>
          )}
        </div>
      )}

      {/* Кнопка «наверх» — появляется при скролле вниз (длинный список дня). */}
      {!error && !kbOpen && <ScrollTopButton />}

      {actionSlot && (
        <ExerciseActionMenu
          slot={actionSlot}
          onWeightSaved={handleWeightSaved}
          onClose={() => {
            const orderNum = actionSlot.order_num
            actionClosedAtRef.current = Date.now() // гасим призрачный тап по карточке под крестиком
            setActionSlot(null)
            // Тот же эффект что при возврате с Инфо/Смены: пресс-эффект + светло-серая
            // заливка карточки, которую долго тапнули.
            setGlowedOrderNum(orderNum)
            setTimeout(() => setGlowedOrderNum(null), 1600)
          }}
        />
      )}

      {showConfirm && (
        <FinishConfirmModal
          done={doneVisible}
          total={slots.length}
          closing={confirmClosing}
          onConfirm={handleConfirmFinishYes}
          onCancel={handleConfirmFinishCancel}
        />
      )}

      {/* Подтверждение отмены тренировки (крестик): закрыть без сохранения. */}
      {/* Ракету нажали, а набор для этого дня не настроен: включать нечего.
          Вместо мёртвого тумблера — что это за режим и предложение настроить. */}
      {quickIntro && (
        <ConfirmModal
          title="Быстрый режим"
          text="Короткая версия дня — только самое важное. Для этого дня она ещё не настроена: отметь упражнения, без которых тренировка не считается."
          onClose={() => setQuickIntro(false)}
          actions={[
            { label: 'Отмена', onClick: () => { haptic.light(); setQuickIntro(false) } },
            { label: 'Настроить', onClick: () => { setQuickIntro(false); openQuickSetup() } }
          ]}
        />
      )}

      {/* Поп-ап «включена быстрая» — по центру экрана, гаснет сам. Не модалка:
          он ничего не спрашивает, только объясняет, и не должен перехватывать тап. */}
      {quickPopup && createPortal(
        <div key={quickPopup.nonce} style={styles.quickPopup}>
          <span style={styles.quickPopupIcon}>
            <RocketIcon size={26} lit={quickPopup.on} />
          </span>
          {/* Состояние ВСЕГДА на второй строке: «выключён» длиннее и переносился
              сам, а «включён» влезал в строку — два поп-апа выглядели по-разному. */}
          <div style={styles.quickPopupTitle}>Быстрый режим</div>
          <div style={{
            ...styles.quickPopupState,
            color: quickPopup.on ? 'var(--color-primary)' : 'var(--color-error)'
          }}>
            {quickPopup.on ? 'включён' : 'выключён'}
          </div>
        </div>,
        document.body
      )}

      {showCancelConfirm && (
        <ConfirmModal
          title="Отменить тренировку?"
          text="Прогресс не сохранится и в историю не попадёт."
          onClose={() => setShowCancelConfirm(false)}
          actions={[
            { label: 'Нет', onClick: () => { haptic.light(); setShowCancelConfirm(false) } },
            { label: 'Да, отменить', onClick: handleCancelConfirm, danger: true }
          ]}
        />
      )}

      {/* Предупреждение о лимите ДО старта второй силовой за день. */}
      {showLimitWarn && (
        <ConfirmModal
          title="Сегодня силовая уже была"
          text="Лимит — 1 силовая в день. Вторая тренировка не попадёт в статистику и серию."
          onClose={() => setShowLimitWarn(false)}
          actions={[
            { label: 'Отмена', onClick: () => { haptic.light(); setShowLimitWarn(false) } },
            { label: 'Всё равно начать', onClick: () => { setShowLimitWarn(false); handleStart() } }
          ]}
        />
      )}

      {showFinishedModal && (
        <WorkoutFinishedModal
          durationLabel={formatWorkoutMin(finishedSec)}
          durationColor={workoutTimerColor(finishedSec)}
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
            // Модалку НЕ снимаем перед навигацией — иначе на кадр мелькает
            // список упражнений. Она уйдёт вместе с размонтированием страницы.
            navigate('/')
          }}
        />
      )}

      {/* Мини-пикер дней — выскакивает из центра буквы дня. */}
      {dayPickerRect && (
        <DayPicker
          days={days}
          currentDay={day}
          sessionDay={sessionDayForProgram}
          colorForDay={accentForDay}
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
const styles = {
  // marginBottom гасит таб-баровский padding-bottom у .app (тут таб-бара нет) —
  // иначе под последней карточкой копится двойной отступ («пропасть») + лишний
  // скролл на коротком дне. Без min-height:100dvh страница ровно по контенту:
  // мало упражнений → не скроллится; много → у низа фикс-зазор (как везде).
  page: {
    // relative + z-index 1 — свой контекст наложения (как класс .page на главной/разделе):
    // свечение (SectionGlow) правильно ложится за контент и в зону нативного оттяга.
    position: 'relative',
    zIndex: 1,
    padding: '0 var(--space-4)',
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
    // Фон-заливки НЕТ — контент скроллится прямо под шапкой; сама карточка стеклянная.
    // Верх карточки-шапки — ровно 16px ниже кнопок Telegram (зашито в var).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: 0,
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)'
  },
  // Ряд для центрирования челки — абсолютный, сразу под карточкой дня (top:100%),
  // НЕ в потоке (отступы списка не трогает). Контент скроллится под челкой.
  groupPillRow: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 31
  },
  // «Челка» — текст группы под карточкой дня. Своего фона нет — сплошная чёрная
  // полоска (stickySolid) и stickyFade ниже дают затемнение; текст поверх них.
  groupTabText: {
    paddingTop: 'var(--space-1)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    letterSpacing: '2px',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    animation: 'groupPillIn 0.22s ease-out'
  },
  // Сплошная чёрная полоска в зазоре сразу под карточкой дня — контент не
  // просвечивает в промежутке до фейда. Всегда есть (даже без заголовка).
  stickySolid: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: '6px',
    background: 'var(--color-bg)',
    pointerEvents: 'none',
    zIndex: 30
  },
  // Fade-переход под блоком дня: контент уходит под шапку плавно (градиент + blur).
  // Опущен на 6px (100% + 6px) — под сплошной полоской; заголовок читается чётче.
  stickyFade: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    height: '24px',
    pointerEvents: 'none',
    zIndex: 29,
    background: 'var(--scrim-sticky)'
  },
  // Один целиковый блок — фон и строук как у карточки игрока на главной.
  // position:relative + overflow:hidden — под заливку-прогресс (headerFill),
  // клип по скруглению. Раскладку контента держит headerCardInner.
  headerCard: {
    position: 'relative',
    overflow: 'hidden',
    padding: 'var(--space-4) var(--space-4)',
    // Матовое стекло (как таб-бар / кнопка с блюром): контент скроллится под шапкой
    // и просвечивает размытым. Полупрозрачный фон + backdrop-blur + бордер + тень.
    background: 'rgba(28, 28, 30, 0.55)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border: '1px solid var(--layer-3)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.28)'
  },
  // Заливка-прогресс: светло-серый фон растёт слева по мере отжатых упражнений
  // (весь прогресс дня). Плавно, за текстом (zIndex 0). Клипается overflow карточки.
  headerFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    background: 'var(--layer-2)',
    transition: 'width 0.55s cubic-bezier(0.32, 0.72, 0, 1)',
    pointerEvents: 'none',
    zIndex: 0
  },
  // Контент карточки поверх заливки.
  // ВНИМАНИЕ: gap задаёт высоту и схлопнутой пилюли — между тремя детьми он
  // применяется дважды даже когда их высота нулевая. Уменьшив его «чтобы ужать
  // высокую шапку», заодно просаживаешь пилюлю. Менять только осознанно.
  headerCardInner: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)'
  },
  // Верхний ряд: место слева (в потоке), таймер и крестик — absolute (не влияют
  // на высоту ряда → блок не растёт при появлении крестика). Высота = высота тега.
  topMetaRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minHeight: '32px',
    padding: 0
  },
  // Слой переключателя места: выше таймера, чтобы раскрытые пилюли
  // (зал/дом/улица) ложились ПОВЕРХ цифры часы:минуты, а не под ней.
  placeSlot: {
    position: 'relative',
    zIndex: 2
  },
  // Ракета — левый нижний угол карточки-шапки (место остаётся сверху слева).
  // Поп-ап режима: по центру экрана, сквозной для тапов (pointerEvents:none) —
  // он информирует, а не спрашивает.
  quickPopup: {
    position: 'fixed', left: '50%', top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 'var(--z-modal)', pointerEvents: 'none',
    width: 'min(280px, calc(100vw - 64px))',
    padding: 'var(--space-5) var(--space-5) var(--space-4)',
    background: 'var(--surface-raised)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-modal)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-15)',
    textAlign: 'center',
    animation: `quickPopIn ${QUICK_POPUP_MS}ms var(--ease-ios) forwards`
  },
  quickPopupIcon: { display: 'inline-flex', marginBottom: 'var(--space-1)' },
  // «Быстрый режим» белым, состояние цветом: вкл — акцент, выкл — красный.
  quickPopupTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-text)'
  },
  quickPopupState: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)',
    fontWeight: 'var(--weight-value)'
  },
  // Ракета — левый край карточки-шапки. Привязана к НИЗУ: в раскрытой шапке это
  // нижний угол (тег места сверху), а в низкой пилюле те же 4px от низа ставят
  // её ровно по центру строки.
  rocketSlot: {
    position: 'absolute',
    left: 'var(--space-1)',
    bottom: 'var(--space-1)',
    zIndex: 3
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
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-body-size)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    fontVariantNumeric: 'tabular-nums',
    transition: 'color 0.3s ease',
    display: 'inline-block'
  },
  // Таймер с иконкой часов — inline-flex.
  timerWithClock: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' },
  // Буква дня в сжатой строке (въезжает слева от времени).
  rowLetter: {
    display: 'inline-block',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 'var(--text-title-size)',
    lineHeight: 1
  },
  // Счётчик в сжатой строке (въезжает справа от времени).
  rowCount: {
    display: 'inline-block',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-button-size)',
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums'
  },
  // Обёртка крестика «отменить»: absolute справа (не раздувает ряд). right:-7 →
  // кружок ровно у правого края (симметрия с тегом места). Сам крестик — CloseCross.
  cancelSlot: {
    position: 'absolute',
    right: '-7px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 3,
    display: 'flex'
  },
  // Оценка длительности до старта (часы + «≈ N мин»), серым по центру строки.
  estimate: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap'
  },
  // Поп-ап перегрузки (1ч30) — под временем, красноватый, с кнопкой ОК. Отступ
  // задаёт flex-gap карточки, своего marginTop не добавляем.
  // Поп-ап перегрузки — ПЛАВАЮЩИЙ поверх карточки (не раздувает блок): absolute,
  // по центру над буквой, лёгкий блюр-подложка, выше контента. Появляется «попом».
  overloadPopup: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-3)',
    background: 'rgba(232, 69, 69, 0.28)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45)',
    animation: 'overloadPopIn 0.22s cubic-bezier(0.2, 0.7, 0.3, 1)'
  },
  overloadText: {
    flex: 1,
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    lineHeight: 1.35,
    color: 'var(--color-error)'
  },
  overloadOk: {
    flexShrink: 0,
    padding: 'var(--space-2) var(--space-5)',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--layer-2)',
    border: 'none',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    letterSpacing: '1px',
    cursor: 'pointer'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
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
    gap: 'var(--space-15)'
  },
  // Буква дня строго по центру. Кликабельна — тап открывает пикер дней.
  dayLetterWrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none'
  },
  dayLetter: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 'var(--text-hero-size)',
    color: 'var(--color-primary)',
    letterSpacing: '0',
    lineHeight: 1,
    display: 'inline-block'
  },
  // Не-фокусный день (не сегодняшний по плану и не активный) — серая буква.
  dayLetterMuted: {
    color: 'var(--color-text-secondary)',
    textShadow: 'none'
  },
  // Чипы групп дня — по центру под буквой, в цвете группы, белый текст.
  // Всегда слегка приглушены (opacity), как и подгруппы на карточках упражнений.
  dayChips: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 'var(--space-15)',
    opacity: 0.7
  },
  dayChip: {
    display: 'inline-block',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-caption-size)',
    letterSpacing: '0.4px',
    lineHeight: 1.3,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap'
  },
  // Счётчик упражнений («N упражнений») — по центру (баланс с буквой/чипами).
  // Фикс. высота — чтобы блок не рос от увеличения шрифта (13→16 при старте):
  // шрифт растёт «из геометрического центра», высота строки та же.
  countRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '22px',
    padding: '0 var(--space-2)'
  },
  // Числовая подпись — Manrope, как все числа проекта и как счётчик «N/M»
  // в схлопнутой пилюле: при морфе шрифт не должен подменяться.
  dayDescLabel: {
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
  },
  // «N/M» в тренировке — крупнее и жирнее, как активный таймер (растёт из центра).
  dayCountActive: {
    fontWeight: 700,
    fontSize: 'var(--text-body-size)',
    fontVariantNumeric: 'tabular-nums'
  },
  body: {
    // Над свечением (zIndex 0), которое лежит за шапкой у верхней кромки.
    position: 'relative',
    zIndex: 1,
    paddingTop: 'var(--space-5)'
  },
  // Заголовков групп нет — список сплошной, шаг между всеми карточками один
  // и тот же (группа теперь написана в теге внутри карточки).
  sectionsWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)'
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)'
  },
  exerciseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)'
  },
  empty: {
    textAlign: 'center',
    padding: 'var(--space-10) var(--space-5)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)'
  },
  // Человеческий экран ошибки: иконка + короткий текст + кнопка «Обновить».
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-12) var(--space-6)'
  },
  errorBoxTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-title-size)',
    letterSpacing: '1px',
    color: 'var(--color-text)',
    marginTop: 'var(--space-1)'
  },
  errorBoxText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
    maxWidth: '260px'
  },
  retryButton: {
    marginTop: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-6)',
    background: 'var(--highlight-recent)',
    border: '1px solid var(--layer-3)',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
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
    padding: 'var(--space-12) var(--space-4) var(--tabbar-bottom)',
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
    padding: 'var(--space-3) var(--space-4)',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    lineHeight: 1.35,
    color: 'var(--color-error)',
    textAlign: 'center'
  },
}