import { useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { finishWorkout } from '../features/programs/api'
import { getProgramBySlug } from '../features/programs/registry'
import { setLastCompletedDay } from '../lib/storage'
import {
  getActiveWorkout,
  onActiveWorkoutChange,
  startActiveWorkout,
  clearActiveWorkout,
  elapsedSecFrom,
  formatWorkoutMin,
  workoutTimerColor
} from '../lib/active-workout'
import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import {
  SWIM_PROGRAM,
  SWIM_STROKES,
  strokeColor,
  poolsForMeters,
  pluralPools,
  swimMinutesForMeters
} from '../data/programs/swim'
import { getCurrentUser } from '../lib/auth'
import { EVENTS, on } from '../lib/events'
import { resolveWeeklyStreak } from '../utils/dates'
import ScreenTitle from '../components/ScreenTitle'
import CloseCross from '../components/CloseCross'
import UiIcon from '../components/UiIcon'
import ClockIcon from '../components/ClockIcon'
import ChevronIcon from '../components/ChevronIcon'
import StreakFlame from '../components/StreakFlame'
import ActionButton from '../components/ActionButton'
import WaterChrome from '../components/WaterChrome'
import ScrollTopButton from '../components/ScrollTopButton'
import BicepGesture from '../components/BicepGesture'
import { PlayGlyph } from '../components/PlayButton'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Экран «Заплыв» — ОЗНАКОМИТЕЛЬНАЯ памятка перед бассейном, по структуре как день
 * силовой (WorkoutDay): закреплённая шапка-карточка вверху (сужается на скролле),
 * блоки-карточки, закреплённая кнопка «Завершить» внизу.
 *
 * Никаких галочек: смотришь что и каким стилем плыть, крутишь длину бассейна
 * (25/50 — меняются только числа бассейнов, метраж тот же) и число кругов основы
 * (пересчитывает метры), в конце жмёшь «Завершить» → +150 💪.
 *
 * Этапы (разминка/основа/заминка) — сворачиваемые карточки: до старта раскрыты
 * (читаешь программу), по «Начать» схлопываются в шапки — на бортике нужен не
 * список, а одна плашка «Повторить N раз», её и крутишь по факту заплыва.
 * Советы свёрнуты всегда — кому надо, тот раскроет.
 *
 * Лимит на бонусы общий — держит api_finish_workout (одна засчитанная в сутки).
 */

const POOL_KEY = (slug) => `swim-pool:${slug}`
const REPS_KEY = (slug) => `swim-reps:${slug}`
const MAIN_ID = 'main'
const MIN_REPS = 1
const MAX_REPS = 12
const oneRoundMeters = (block) => block.swims.reduce((s, w) => s + w.meters, 0)

// Боковые вертикальные гирлянды: 3 флажка (красный / белый-центр / красный),
// обе остриём ВЛЕВО.

/** Флажок-финиш (Material-стиль) — для кнопки «Завершить» (как в дне силовой). */
function SwimFinishIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11.2a.7.7 0 0 1 .57 1.11L15.6 7l2.17 2.89A.7.7 0 0 1 17.2 11H7v9a1 1 0 0 1-1 1z" />
    </svg>
  )
}

/** Пауза (Material Symbols) — подсказка об отдыхе между кругами. */
function PauseIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 19q-.825 0-1.412-.587T6 17V7q0-.825.588-1.412T8 5t1.413.588T10 7v10q0 .825-.587 1.413T8 19m8 0q-.825 0-1.412-.587T14 17V7q0-.825.588-1.412T16 5t1.413.588T18 7v10q0 .825-.587 1.413T16 19" />
    </svg>
  )
}

/**
 * Сворачиваемая часть карточки: высота едет от реальной высоты содержимого
 * (замер по scrollHeight), поэтому анимация одинаково ровная и на трёх строках,
 * и на пяти советах — фиксированный max-height давал бы рывок в конце.
 */
function Collapse({ open, children }) {
  const innerRef = useRef(null)
  const firstRun = useRef(true)
  const [maxHeight, setMaxHeight] = useState(open ? 'none' : '0px')

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    const el = innerRef.current
    if (!el) return
    const target = `${el.scrollHeight}px`
    if (open) {
      setMaxHeight(target)
      // По окончании — снять ограничение, чтобы блок жил своей высотой.
      const t = setTimeout(() => setMaxHeight('none'), 340)
      return () => clearTimeout(t)
    }
    // Закрытие: сначала зафиксировать текущую высоту, потом уехать в ноль.
    setMaxHeight(target)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMaxHeight('0px')))
    return () => cancelAnimationFrame(raf)
  }, [open])

  return (
    <div style={{ ...styles.collapse, maxHeight, opacity: open ? 1 : 0 }}>
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

function formatDistance(m) {
  if (m >= 1000) {
    const km = (m / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
    return `${km} км`
  }
  return `${m} м`
}

// Крупная строка метража в шапке: до 1000 — «750 метров», от 1000 — «1 км» / «1 км 50 м».
function formatSwimMeters(m) {
  if (m < 1000) return `${m} метров`
  const km = Math.floor(m / 1000)
  const rest = m % 1000
  return rest === 0 ? `${km} км` : `${km} км ${rest} м`
}

export default function SwimWorkout() {
  const { programId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const program = useMemo(() => getProgramBySlug(programId), [programId])

  const [pool, setPool] = useState(() => {
    const saved = parseInt(localGet(POOL_KEY(programId)), 10)
    return SWIM_PROGRAM.pools.includes(saved) ? saved : SWIM_PROGRAM.defaultPool
  })

  const [modal, setModal] = useState(null)
  const [finishStatus, setFinishStatus] = useState('idle')
  const [compact, setCompact] = useState(false)

  // Сессия заплыва — та же общая на приложение, что у силовой (active-workout).
  // День один, поэтому 'main'. Пока сессия идёт, в шапке тикает таймер, а внизу
  // вместо «Начать» стоит «Завершить». Записывается РЕАЛЬНОЕ время сессии —
  // с переодеванием и душем, а не оценка «≈N мин» по метражу.
  const [active, setActive] = useState(getActiveWorkout)
  useEffect(() => onActiveWorkoutChange(() => setActive(getActiveWorkout())), [])
  const isThisActive = !!active && active.programId === programId
  const sessionBlocked = !!active && !isThisActive

  // Крестик «отменить заплыв» — та же логика, что в дне силовой: подтверждение,
  // затем сессия закрывается БЕЗ сохранения (в историю не идёт).
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const cancelOverlayRef = useRef(null)
  useScrollLock(cancelOverlayRef)

  // Тост «сначала заверши текущую» — по тапу на «Начать» при чужой сессии.
  const [startBlocked, setStartBlocked] = useState(false)
  const startBlockTimer = useRef(null)
  const autoStartedRef = useRef(false)
  useEffect(() => () => { if (startBlockTimer.current) clearTimeout(startBlockTimer.current) }, [])

  // Шапка складывается в пилюлю на скролле ИЛИ когда заплыв начат — та же
  // логика, что в дне силовой: запущенная тренировка не должна занимать пол-экрана.
  const pill = compact || isThisActive

  // ——— Свёрнутость этапов ———
  // До старта всё раскрыто (программу читают), с началом заплыва схлопывается:
  // на бортике нужна только плашка «Повторить N раз». Раскрыть можно тапом по
  // шапке этапа в любой момент. Советы свёрнуты всегда.
  const [openIds, setOpenIds] = useState(() => {
    const now = getActiveWorkout()
    const startedHere = !!now && now.programId === programId
    return startedHere ? [] : SWIM_PROGRAM.blocks.map(b => b.id)
  })
  const [tipsOpen, setTipsOpen] = useState(false)

  const isOpen = (id) => openIds.includes(id)
  const toggleOpen = (id) => {
    haptic.light()
    setOpenIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Старт заплыва (кнопкой или автостартом с карточки) сворачивает всё разом.
  const wasActiveRef = useRef(isThisActive)
  useEffect(() => {
    if (isThisActive && !wasActiveRef.current) setOpenIds([])
    wasActiveRef.current = isThisActive
  }, [isThisActive])

  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (!isThisActive) { setElapsedSec(0); return }
    const tick = () => setElapsedSec(elapsedSecFrom(active.startedAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isThisActive, active?.startedAt])

  // Число повторов основы — единственное редактируемое поле. Стартуем мгновенно
  // из localStorage, догоняем кросс-девайс из CloudStorage; пишем в оба (как вес).
  const [mainReps, setMainReps] = useState(() => {
    const saved = parseInt(localGet(REPS_KEY(programId)), 10)
    const def = SWIM_PROGRAM.blocks.find(b => b.id === MAIN_ID)?.repeat || 1
    return Number.isFinite(saved) && saved >= MIN_REPS && saved <= MAX_REPS ? saved : def
  })

  useEffect(() => {
    let cancelled = false
    cloudGet(REPS_KEY(programId)).then(v => {
      const n = parseInt(v, 10)
      if (!cancelled && Number.isFinite(n) && n >= MIN_REPS && n <= MAX_REPS) setMainReps(n)
    })
    return () => { cancelled = true }
  }, [programId])

  const totalMeters = useMemo(
    () => SWIM_PROGRAM.blocks.reduce(
      (s, b) => s + oneRoundMeters(b) * (b.id === MAIN_ID ? mainReps : (b.repeat || 1)),
      0
    ),
    [mainReps]
  )
  const totalPools = poolsForMeters(totalMeters, pool)

  // Круги основы — и план до заплыва, и факт после него: вернулся из бассейна,
  // выставил плюсом/минусом, сколько кругов реально проплыл, метраж пересчитался.
  const changeReps = (delta) => {
    setMainReps(prev => {
      const next = Math.min(MAX_REPS, Math.max(MIN_REPS, prev + delta))
      if (next !== prev) {
        haptic.selection()
        localSet(REPS_KEY(programId), String(next))
        cloudSet(REPS_KEY(programId), String(next))
      }
      return next
    })
  }

  useEffect(() => {
    const fromHome = location.state?.fromHome === true
    const categoryId = program?.category || 'pool'
    backButton.setHandler(() => {
      if (fromHome) navigate('/')
      else navigate(`/category/${categoryId}`)
    })
    lockVerticalSwipes()
    window.scrollTo(0, 0)
  }, [navigate, program, location.state])

  // Прячем нижний краевой скрим (у нас своя прибитая кнопка-док).
  useEffect(() => {
    document.body.classList.add('hide-app-scrim')
    return () => document.body.classList.remove('hide-app-scrim')
  }, [])

  // Сжатие шапки на скролле (как в дне силовой).
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setCompact(window.scrollY > 24) })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // Вход по кружку Play с карточки программы — заплыв стартует сам.
  // Стоит ДО раннего return «программа не найдена»: хук обязан вызываться
  // в одинаковом порядке на каждом рендере.
  useEffect(() => {
    if (!location.state?.autoStart || autoStartedRef.current) return
    if (!program || sessionBlocked || isThisActive) return
    autoStartedRef.current = true
    navigate(location.pathname, { replace: true, state: { ...location.state, autoStart: false } })
    haptic.success()
    startActiveWorkout(programId, 'main', 'pool')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.autoStart, program, sessionBlocked, isThisActive])

  if (!program || program.kind !== 'swim') {
    return (
      <div style={styles.page}>
        <div style={styles.errorBlock}>
          Программа не найдена.<br />Вернись назад.
        </div>
      </div>
    )
  }

  const handlePoolTap = (len) => {
    if (len === pool) return
    haptic.light()
    setPool(len)
    localSet(POOL_KEY(programId), String(len))
  }

  const runFinish = async () => {
    // Время заплыва = реальная длительность сессии (от «Начать» до «Завершить»),
    // ровно как в силовой: в него честно входят переодевание, душ и отдых.
    // Заплыв без сессии (старая запись/прямой финиш) — падаем на оценку по
    // метражу, ту же, что показана в шапке «≈N мин».
    // Показатели фиксируем ДО закрытия сессии — иначе таймер уже погашен.
    const swumMeters = totalMeters
    const spentSec = isThisActive
      ? elapsedSecFrom(active.startedAt)
      : swimMinutesForMeters(totalMeters) * 60
    const stats = { distance: swumMeters, seconds: spentSec }

    setFinishStatus('saving')
    setModal({ kind: 'pending', ...stats })

    try {
      const startedAt = isThisActive
        ? active.startedAt
        : new Date(Date.now() - spentSec * 1000).toISOString()
      const result = await finishWorkout(programId, 'main', [], 0, swumMeters, startedAt)

      if (!result) {
        setFinishStatus('error')
        setModal({ kind: 'error', ...stats })
        haptic.error()
        return
      }
      // Заплыв засчитан локально в любом исходе (оффлайн / лимит / награда):
      // фиксируем день и закрываем сессию — как в силовой.
      await setLastCompletedDay(programId, 'main')
      clearActiveWorkout()

      if (result.offline) {
        haptic.warning()
        setFinishStatus('idle')
        setModal({ kind: 'offline', ...stats })
        return
      }
      if (result.alreadyCompletedToday) {
        haptic.warning()
        setFinishStatus('idle')
        setModal({ kind: 'limit', ...stats })
        return
      }
      haptic.success()
      setFinishStatus('idle')
      setModal({ kind: 'reward', ...stats })
    } catch (e) {
      console.error('[SwimWorkout] finish error:', e)
      setFinishStatus('error')
      setModal({ kind: 'error', ...stats })
      haptic.error()
    }
  }

  const handleFinishTap = () => {
    haptic.medium()
    runFinish()
  }

  // «Начать заплыв» — открывает сессию, дальше в шапке тикает таймер.
  // Пока идёт ДРУГАЯ тренировка, начинать нельзя (одна за раз, как в силовой).
  const handleStartTap = () => {
    if (sessionBlocked) {
      haptic.error()
      setStartBlocked(true)
      if (startBlockTimer.current) clearTimeout(startBlockTimer.current)
      startBlockTimer.current = setTimeout(() => setStartBlocked(false), 2600)
      return
    }
    haptic.success()
    startActiveWorkout(programId, 'main', 'pool')
  }


  const handleModalConfirm = () => {
    if (modal?.kind === 'error') { runFinish(); return }
    setModal(null)
    navigate('/')
  }

  return (
    <div style={styles.page}>
      <ScreenTitle>Заплыв 45</ScreenTitle>

      {/* Закреплённая шапка-карточка: синяя волна + стеклянная обводка */}
      <div style={styles.stickyHeader}>
        <div style={{ ...styles.headerCard, ...(pill ? styles.headerCardCompact : {}) }}>
          {/* Волна и флажки оживают ТОЛЬКО когда заплыв идёт: движение означает
              «сейчас плывёшь», а не украшает экран. */}
          {/* Пунктирная дорожка — только в развёрнутой шапке: в пилюле она
              проходила ровно сквозь строку и перечёркивала текст. Из кода
              не убрана, вернётся вместе с высокой шапкой. */}
          <WaterChrome dashes={!pill} animate={isThisActive} />

          {/* Верхний ряд: тег бассейна слева, часы по центру */}
          <div style={{ ...styles.topRow, ...(pill ? styles.topRowCompact : {}) }}>
            <PoolLenSwitcher pool={pool} pools={SWIM_PROGRAM.pools} onPick={handlePoolTap} />
            {/* Пока заплыв не начат — оценка «≈45 мин» по метражу; после «Начать»
                на её месте живой таймер сессии с теми же порогами цвета, что в
                силовой (зелёный <1ч → оранжевый → красный). */}
            {isThisActive ? (
              <span style={styles.timerRow}>
                <span style={{ ...styles.clock, color: workoutTimerColor(elapsedSec), fontWeight: 800 }}>
                  <ClockIcon size={13} />{formatWorkoutMin(elapsedSec)}
                </span>
              </span>
            ) : (
              <span style={styles.clock}>
                <ClockIcon size={13} />≈{swimMinutesForMeters(totalMeters)} мин
              </span>
            )}
          </div>

          {/* Развёрнутая шапка: крупный метраж, под ним бассейны. */}
          <div style={{ ...styles.metersMain, opacity: pill ? 0 : 1 }}>
            {formatSwimMeters(totalMeters)}
          </div>
          <div style={{ ...styles.metersSub, opacity: pill ? 0 : 1 }}>
            {totalPools} {pluralPools(totalPools)}
          </div>

          {/* Пилюля: всё в одну строку — метраж, время, бассейны. Порядок и роли
              те же, что в дне силовой (буква · таймер · счётчик). */}
          <div style={{ ...styles.pillRow, opacity: pill ? 1 : 0, pointerEvents: pill ? 'auto' : 'none' }}>
            <span style={styles.pillMeters}>{formatDistance(totalMeters)}</span>
            {isThisActive ? (
              <span style={{ ...styles.pillTime, color: workoutTimerColor(elapsedSec) }}>
                <ClockIcon size={13} />{formatWorkoutMin(elapsedSec)}
              </span>
            ) : (
              <span style={styles.pillTime}>
                <ClockIcon size={13} />≈{swimMinutesForMeters(totalMeters)} мин
              </span>
            )}
            <span style={styles.pillPools}>{totalPools} {pluralPools(totalPools)}</span>
            {isThisActive && (
              <span style={styles.pillCross}>
                <CloseCross
                  onClose={() => setShowCancelConfirm(true)}
                  hitSize={44}
                  bubbleSize={32}
                  iconSize={16}
                />
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.body}>
        {SWIM_PROGRAM.blocks.map(block => {
          const bMeters = oneRoundMeters(block) * (block.id === MAIN_ID ? mainReps : (block.repeat || 1))
          const bPools = poolsForMeters(bMeters, pool)
          const editable = block.id === MAIN_ID
          const open = isOpen(block.id)
          return (
            <section key={block.id} style={styles.blockCard}>
              {/* Шапка этапа — она же кнопка «раскрыть/свернуть». Справа сводка
                  этапа через пробел: метры, время, бассейны — свёрнутый этап
                  должен читаться целиком, не раскрывая. */}
              <div
                style={styles.blockHead}
                onClick={() => toggleOpen(block.id)}
                role="button"
                aria-expanded={open}
              >
                <span style={styles.blockTitle}>{block.title}</span>
                <span style={styles.blockMetaRow}>
                  <span style={styles.blockMeta}>{bMeters} м</span>
                  <span style={styles.blockMetaTime}>
                    <ClockIcon size={12} />≈{swimMinutesForMeters(bMeters)} мин
                  </span>
                  <span style={styles.blockMeta}>{bPools} {pluralPools(bPools)}</span>
                  <span style={{ ...styles.chevron, transform: open ? 'rotate(180deg)' : 'none' }}>
                    <ChevronIcon size={16} />
                  </span>
                </span>
              </div>

              <Collapse open={open}>
                <div style={{ ...styles.blockBody, ...(editable ? styles.blockBodyMain : null) }}>
                  {block.swims.map((sw, i) => {
                    const meta = SWIM_STROKES[sw.stroke]
                    const pools = poolsForMeters(sw.meters, pool)
                    const color = strokeColor(sw.stroke)
                    return (
                      <div key={sw.id}>
                        {i > 0 && <div style={styles.rowDivider} />}
                        <div style={styles.swimRow}>
                          <span style={{ ...styles.swimIconWrap, color }}>
                            <SwimmerIcon stroke={sw.stroke} size={34} />
                          </span>
                          <div style={styles.swimContent}>
                            <div style={{ ...styles.swimName, color }}>{meta.label}</div>
                            <div style={styles.swimNote}>{sw.note}</div>
                          </div>
                          <span style={styles.swimPools}>{pools} {pluralPools(pools)}</span>
                        </div>
                      </div>
                    )
                  })}

                  {/* Пауза между кругами — такая же строка, как заплыв, только
                      с зелёным значком паузы: это часть программы, а не сноска. */}
                  {block.footnote && (
                    <>
                      <div style={styles.rowDivider} />
                      <div style={styles.swimRow}>
                        <span style={styles.pauseIconWrap}><PauseIcon size={20} /></span>
                        <div style={styles.pauseText}>{block.footnote}</div>
                      </div>
                    </>
                  )}
                </div>
              </Collapse>

              {/* Плашка кругов видна и в свёрнутом этапе: после бассейна человек
                  правит ей факт («проплыл 4 круга, а не 5»), а метраж и время в
                  шапке пересчитываются сами. */}
              {editable && (
                <div style={styles.stepperWrap}>
                  <div style={styles.stepper}>
                    <button
                      onClick={() => changeReps(-1)}
                      disabled={mainReps <= MIN_REPS}
                      style={{ ...styles.stepBtn, opacity: mainReps <= MIN_REPS ? 0.35 : 1 }}
                      className="press-tile"
                      aria-label="Меньше кругов"
                    >−</button>
                    <span style={styles.stepLabel}>
                      Повторить <span style={styles.stepNum}>{mainReps}</span> раз
                    </span>
                    <button
                      onClick={() => changeReps(1)}
                      disabled={mainReps >= MAX_REPS}
                      style={{ ...styles.stepBtn, opacity: mainReps >= MAX_REPS ? 0.35 : 1 }}
                      className="press-tile"
                      aria-label="Больше кругов"
                    >+</button>
                  </div>
                </div>
              )}
            </section>
          )
        })}

        {/* Советы — свёрнуты всегда: нужны один раз, а места занимают экран. */}
        <div style={styles.tipsBlock}>
          <div
            style={styles.tipsHead}
            onClick={() => { haptic.light(); setTipsOpen(o => !o) }}
            role="button"
            aria-expanded={tipsOpen}
          >
            <span style={styles.tipsTitleWrap}>
              <UiIcon name="info" size={16} color="var(--color-text-secondary)" />
              <span style={styles.tipsTitle}>Советы</span>
            </span>
            <span style={{ ...styles.chevron, transform: tipsOpen ? 'rotate(180deg)' : 'none' }}>
              <ChevronIcon size={16} />
            </span>
          </div>
          <Collapse open={tipsOpen}>
            <div style={styles.tipsList}>
              <Tip>Хочешь бодрее — повтори основу 6 раз (≈850 м). Мягче для старта — 4 раза (≈650 м).</Tip>
              <Tip>Дыши ритмично, не задерживай дыхание — выдох в воду, вдох в сторону.</Tip>
              <Tip>Между кругами 10–15 сек отдыха — восстанавливай дыхание, не гони.</Tip>
              <Tip>Перед водой покрути плечами 20–30 сек — бережёшь сустав.</Tip>
              <Tip>Держи бутылку воды на бортике — в воде тоже теряешь жидкость.</Tip>
            </div>
          </Collapse>
        </div>
      </div>

      {/* Док внизу: до старта — «Начать заплыв», после — «Завершить» (как в дне
          силовой: сначала запускаешь сессию, потом закрываешь её). */}
      <div style={styles.finishBar}>
        <div className="dock-scrim" />
        {startBlocked && (
          <div style={styles.startBlockWrap}>
            <div className="shake-error" style={styles.startBlockToast}>
              Сначала заверши текущую тренировку
            </div>
          </div>
        )}
        {/* Ровно те же две кнопки, что в дне силовой: «Начать» с треугольником
            (primary), «Завершить» с флажком (neutral). Заблокированный старт —
            вариант dim, как там же. */}
        {isThisActive ? (
          <ActionButton onClick={handleFinishTap} variant="neutral" hug>
            <SwimFinishIcon size={20} /> Завершить
          </ActionButton>
        ) : (
          <ActionButton
            onClick={handleStartTap}
            variant={sessionBlocked ? 'dim' : 'primary'}
            hug
            style={{ gap: 'var(--space-2)' }}
          >
            <PlayGlyph size={20} /> Начать
          </ActionButton>
        )}
      </div>

      {/* Кнопка «наверх» — при скролле вниз (как в дне силовой). */}
      <ScrollTopButton />

      {/* Подтверждение отмены — тот же текст и порядок кнопок, что в силовой. */}
      {showCancelConfirm && createPortal(
        <div ref={cancelOverlayRef} style={styles.cancelOverlay} onClick={() => setShowCancelConfirm(false)}>
          <div style={styles.cancelModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.cancelTitle}>Отменить заплыв?</div>
            <div style={styles.cancelText}>Время не сохранится и в историю не попадёт.</div>
            <div style={styles.cancelButtonsRow}>
              <button onClick={() => { haptic.light(); setShowCancelConfirm(false) }} style={styles.cancelKeepBtn} className="press-tile">
                Нет
              </button>
              <button
                onClick={() => { haptic.medium(); clearActiveWorkout(); setShowCancelConfirm(false) }}
                style={styles.cancelYesBtn}
                className="press-tile"
              >
                Да, отменить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modal && (
        <SwimFinishedModal
          kind={modal.kind}
          distance={modal.distance ?? totalMeters}
          seconds={modal.seconds ?? 0}
          status={finishStatus}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  )
}

/**
 * Переключатель длины бассейна (25/50) — вид как тег места (PlaceSwitcher):
 * свёрнуто одна пилюля (активная), тап раскрывает вторую справа, выбор — свёртка.
 */
/**
 * Длина бассейна — тег, как «Зал / Дом / Улица» в дне силовой: свёрнутый
 * показывает только выбранное («25 м»), тап выдвигает остальные варианты
 * вправо. Шеврона нет — сам тег и есть кнопка.
 */
function PoolLenSwitcher({ pool, pools, onPick }) {
  const [open, setOpen] = useState(false)
  const multi = pools.length > 1
  const ordered = open ? [pool, ...pools.filter(p => p !== pool)] : [pool]

  return (
    <div style={plsStyles.wrap} onClick={(e) => e.stopPropagation()}>
      <div style={plsStyles.group}>
        {ordered.map((len, i) => {
          const active = len === pool
          return (
            <button
              key={len}
              className="press-tile"
              onClick={(e) => {
                e.stopPropagation()
                if (i === 0) { if (multi) { haptic.light(); setOpen(o => !o) } }
                else { onPick(len); setOpen(false) }
              }}
              style={{
                ...plsStyles.item,
                ...(active ? plsStyles.itemActive : {}),
                marginLeft: i === 0 ? 0 : '-5px',
                zIndex: active ? 2 : 1,
                color: active ? 'var(--cat-pool)' : 'var(--color-text-inactive)'
              }}
            >
              <UiIcon name="swimming" size={15} />
              {len} м
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** «750 м» / «45 мин»: числа — крупно и цветом, единицы — мельче и серым. */
function MetricValue({ label, color }) {
  return (
    <>
      {String(label).split(' ').map((part, i) => (
        <span key={i} style={/^\d/.test(part) ? { ...modalStyles.statNum, color } : modalStyles.statUnit}>{part}</span>
      ))}
    </>
  )
}

function Tip({ children }) {
  return (
    <div style={styles.tipRow}>
      <span style={styles.tipMark}>•</span>
      <span style={styles.tipText}>{children}</span>
    </div>
  )
}

/**
 * Иконка пловца (crawl/breast/back) — координаты нормализованы под viewBox 30×26,
 * цвет через currentColor.
 */
function SwimmerIcon({ stroke, size = 34 }) {
  const common = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', fill: 'none' }
  const dot = { fill: 'currentColor', stroke: 'none' }
  return (
    <svg width={size} height={size} viewBox="0 0 30 26" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      {stroke === 'crawl' && (
        <g transform="translate(-73.5,-47.5)" {...common}>
          <circle cx="80" cy="62" r="2.6" {...dot} />
          <line x1="78" y1="62" x2="95" y2="62" />
          <path d="M84 62 Q88 53 93 55" />
          <line x1="86" y1="62" x2="91" y2="68" />
          <line x1="95" y1="62" x2="99" y2="59" />
          <line x1="95" y1="62" x2="99" y2="65" />
        </g>
      )}
      {stroke === 'breast' && (
        <g transform="translate(-172,-49)" {...common}>
          <circle cx="181" cy="62" r="2.6" {...dot} />
          <line x1="179" y1="62" x2="196" y2="62" />
          <path d="M184 62 Q177 58 174 60" />
          <path d="M184 62 Q177 66 174 64" />
          <line x1="196" y1="62" x2="200" y2="59" />
          <line x1="196" y1="62" x2="200" y2="65" />
        </g>
      )}
      {stroke === 'back' && (
        <g transform="translate(-274.5,-48.5)" {...common}>
          <circle cx="281" cy="62" r="2.6" {...dot} />
          <line x1="279" y1="62" x2="296" y2="62" />
          <line x1="285" y1="62" x2="283" y2="52" />
          <line x1="287" y1="62" x2="292" y2="67" />
          <line x1="296" y1="62" x2="300" y2="59" />
          <line x1="296" y1="62" x2="300" y2="65" />
          <path d="M280 71 Q284 68 288 71 T296 71" strokeWidth="1" opacity="0.6" />
        </g>
      )}
    </svg>
  )
}

const SWIM_CLOSE_MS = 220

/**
 * Финал заплыва. Приведён к той же композиции, что модалка силовой тренировки
 * (WorkoutFinishedModal): жест бицепса или иконка состояния → заголовок →
 * строка показателя → пояснение → кнопка. Раньше это были два разных финала
 * одного и того же действия.
 *
 * Отличие намеренное: показатель здесь — дистанция, и она подписана цветом
 * категории «бассейн», чтобы финал читался именно как заплыв.
 */
function SwimFinishedModal({ kind, distance, seconds, status, onConfirm }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const [closing, setClosing] = useState(false)

  // Серия за неделю — как в модалке силовой: тренировка сохраняется параллельно,
  // поэтому цифру досчитываем по USER_CHANGED.
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  useEffect(() => {
    const upd = () => {
      const u = getCurrentUser()
      setStreak(resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week))
    }
    const off = on(EVENTS.USER_CHANGED, upd)
    const off2 = on(EVENTS.USER_READY, upd)
    return () => { off(); off2() }
  }, [])

  const isError = kind === 'error'
  const offline = kind === 'offline'
  const isSaving = status === 'saving'
  const celebratory = !isError && !offline

  const title = isError ? 'НЕ УДАЛОСЬ СОХРАНИТЬ'
    : offline ? 'СОХРАНЕНО ЛОКАЛЬНО'
    : 'ЗАПЛЫВ ЗАВЕРШЁН'

  const buttonText = isSaving ? 'СОХРАНЕНИЕ...' : isError ? 'ПОВТОРИТЬ' : 'ОК'

  const handleClick = () => {
    if (isSaving || closing) return
    if (isError) { onConfirm?.(); return }
    setClosing(true)
    setTimeout(() => onConfirm?.(), SWIM_CLOSE_MS)
  }

  return (
    <div ref={overlayRef} style={{ ...modalStyles.overlay, opacity: closing ? 0 : 1 }}>
      <div style={{
        ...modalStyles.modal,
        ...(isError ? modalStyles.modalError : null),
        ...(closing ? modalStyles.modalClosing : null)
      }}>
        {celebratory
          ? <BicepGesture size={78} />
          : <div style={modalStyles.icon}><UiIcon name={isError ? 'alert' : 'network_off'} size={48} color="var(--color-offline)" /></div>}

        <div style={{
          ...modalStyles.title,
          color: (isError || offline) ? 'var(--color-offline)' : 'var(--cat-pool)'
        }}>
          {title}
        </div>

        {/* Строка показателей — как в модалке силовой: серия, затем дистанция
            (в цвете категории «бассейн» — она здесь главная) и время. */}
        {!isError && (
          <div style={modalStyles.statsRow}>
            <span style={modalStyles.stat}>
              <span style={streak >= 1 ? undefined : modalStyles.flameGrey}><StreakFlame streak={streak} /></span>
              <span style={{ ...modalStyles.statNum, color: streak >= 1 ? 'var(--color-streak)' : 'rgba(255,255,255,0.4)' }}>{streak}</span>
            </span>
            <span style={modalStyles.stat}>
              <UiIcon name="swimming" size={18} color="var(--cat-pool)" />
              <MetricValue label={formatDistance(distance)} color="var(--cat-pool)" />
            </span>
            <span style={modalStyles.stat}>
              <span style={modalStyles.statClock}><ClockIcon size={18} /></span>
              <MetricValue label={formatWorkoutMin(seconds)} color="var(--color-text)" />
            </span>
          </div>
        )}

        {isError ? (
          <div style={modalStyles.message}>Проверь подключение к интернету и попробуй ещё раз.</div>
        ) : offline ? (
          <div style={modalStyles.message}>Заплыв сохранён на телефоне.<br />Данные обновятся, как только появится интернет.</div>
        ) : kind === 'limit' ? (
          <div style={modalStyles.message}>Достигнут лимит — 1 тренировка в день.<br />Этот заплыв в статистику не войдёт.</div>
        ) : (
          <div style={modalStyles.praise}>Отличная работа!</div>
        )}

        <ActionButton
          variant="accent"
          size="sm"
          onClick={handleClick}
          disabled={isSaving}
          style={{
            marginTop: 'var(--space-1)', width: '100%',
            ...(isError
              ? { background: 'var(--color-offline)', borderColor: '#C46A28', color: 'var(--accent-on)' }
              : { background: 'var(--cat-pool)', borderColor: 'var(--cat-pool)', color: 'var(--accent-on)' })
          }}
        >
          {buttonText}
        </ActionButton>
      </div>

      <style>{`
        @keyframes swimModalFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes swimModalIn {
          0%   { opacity: 0; transform: scale(0.92) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  page: { position: 'relative', zIndex: 1, padding: '0 var(--space-4) 100px', minHeight: '100dvh' },
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    // Фон-заливки НЕТ — контент скроллится прямо под шапкой (как в дне силовой).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: 'var(--space-3)',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)'
  },
  // Синяя карточка-«вода» — теперь ПОЛУПРОЗРАЧНОЕ стекло: наш голубой остаётся, но
  // с прозрачностью + backdrop-blur, контент просвечивает размытым (как в силовой).
  headerCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-card)',
    // Развёрнутая — в высоту карточки упражнения (как шапка дня силовой),
    // пилюля — в высоту её схлопнутого состояния.
    minHeight: '132px',
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)',
    background: 'linear-gradient(180deg, rgba(46,127,196,0.38) 0%, rgba(28,92,151,0.46) 100%)',
    backdropFilter: 'blur(14px) saturate(180%)',
    WebkitBackdropFilter: 'blur(14px) saturate(180%)',
    border: '1px solid rgba(63, 162, 247, 0.45)',
    boxShadow: 'inset 0 0 22px rgba(0, 0, 0, 0.22), 0 6px 24px rgba(28, 92, 151, 0.25)',
    transition: 'min-height 0.42s var(--ease-ios), padding 0.42s var(--ease-ios)'
  },
  // Ровно та же высота, что у пилюли в дне силовой (54px).
  headerCardCompact: { minHeight: '54px' },
  topRow: {
    position: 'absolute',
    top: '12px',
    left: '16px',
    right: '16px',
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    transition: 'opacity 0.2s ease'
  },
  topRowCompact: { opacity: 0, pointerEvents: 'none' },
  clock: {
    // По центру карточки, независимо от ширины переключателя слева.
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    color: 'rgba(255, 255, 255, 0.72)',
    whiteSpace: 'nowrap'
  },
  // Крупный метраж — центр карточки (сквозь пунктир), белым.
  metersMain: {
    position: 'absolute',
    top: '50%',
    left: '16px',
    right: '16px',
    transform: 'translateY(-50%)',
    zIndex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 'var(--text-display-size)',
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    textShadow: '0 1px 6px rgba(0, 0, 0, 0.45)',
    transition: 'opacity 0.3s var(--ease-ios), transform 0.42s var(--ease-ios)'
  },
  // Бассейны — под метражом, шрифтом как часы.
  metersSub: {
    position: 'absolute',
    top: 'calc(50% + 20px)',
    left: '16px',
    right: '16px',
    zIndex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    color: 'rgba(255, 255, 255, 0.72)',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.3s var(--ease-ios)'
  },

  // Пилюля: метраж · время · бассейны в одну строку по центру карточки.
  // Порядок и роли — как в дне силовой (буква · таймер · счётчик).
  pillRow: {
    position: 'absolute', inset: 0, zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
    padding: '0 var(--space-4)',
    transition: 'opacity 0.3s var(--ease-ios)'
  },
  pillMeters: {
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)',
    color: 'var(--color-text)', whiteSpace: 'nowrap',
    textShadow: '0 1px 6px rgba(0, 0, 0, 0.45)'
  },
  pillTime: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: 'var(--text-body-size)',
    color: 'rgba(255, 255, 255, 0.72)', whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums'
  },
  pillPools: {
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: 'var(--text-button-size)',
    color: 'rgba(255, 255, 255, 0.72)', whiteSpace: 'nowrap'
  },
  // Крестик — тот же компонент и те же размеры, что в дне силовой.
  pillCross: { position: 'absolute', right: 'var(--space-2)', display: 'inline-flex' },

  body: { position: 'relative', zIndex: 1, paddingTop: 'var(--space-4)' },

  // Блок = одна карточка 33px: тёмная шапка + светлые упражнения + степпер.
  blockCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    // Между карточками воздуха больше, чем внутри них: этапы отделены друг от
    // друга, упражнения читаются как принадлежащие своему этапу.
    marginBottom: 'var(--space-5)'
  },
  // Шапка этапа: название слева, сводка + шеврон справа.
  blockHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'rgba(0, 0, 0, 0.22)',
    cursor: 'pointer'
  },
  blockTitle: {
    minWidth: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  // Сводка этапа — через пробел, без разделителей-точек.
  blockMetaRow: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)'
  },
  blockMeta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap'
  },
  blockMetaTime: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-05)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap'
  },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
    transition: 'transform 0.28s var(--ease-ios)'
  },
  collapse: {
    overflow: 'hidden',
    transition: 'max-height 0.32s var(--ease-ios), opacity 0.24s ease'
  },
  blockBody: { padding: 'var(--space-1) var(--space-4) var(--space-3)' },
  // У основы под телом стоит плашка кругов — нижний отступ отдаём ей.
  blockBodyMain: { paddingBottom: 'var(--space-1)' },
  rowDivider: { height: '1px', background: 'var(--border-hairline)', margin: '0 -4px' },
  // Вертикаль строки тише: программа целиком помещается на экран, а тесноты
  // не возникает — воздух держат разделители и отступ между карточками.
  swimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) 0'
  },
  swimContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-05)' },
  swimName: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 700
  },
  swimNote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },
  // Бассейны — справа строки, тихо: главное в строке стиль плавания.
  swimPools: {
    flexShrink: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap'
  },
  swimIconWrap: {
    flexShrink: 0,
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Пауза между кругами — значок в акценте, текст тихий.
  pauseIconWrap: {
    flexShrink: 0,
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-primary)'
  },
  pauseText: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },
  // Плашка кругов живёт вне сворачиваемой части — её видно всегда.
  stepperWrap: { padding: 'var(--space-3) var(--space-4)' },
  // Крупный степпер-пилюля во всю ширину блока (внизу «Основы»).
  stepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
    height: '48px',
    padding: '0 var(--space-2)',
    background: 'rgba(63, 162, 247, 0.12)',
    border: '1px solid rgba(63, 162, 247, 0.3)',
    borderRadius: 'var(--radius-pill)'
  },
  stepBtn: {
    width: '40px',
    height: '40px',
    flexShrink: 0,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(63, 162, 247, 0.22)',
    color: 'var(--cat-pool)',
    fontSize: 'var(--text-heading-size)',
    fontWeight: 700,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  stepLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 'var(--text-body-size)',
    letterSpacing: '0.5px',
    color: 'var(--cat-pool)',
    whiteSpace: 'nowrap'
  },
  // Само число кругов — акцентом: его и крутят плюсом/минусом.
  stepNum: { color: 'var(--color-primary)', fontFamily: 'var(--font-manrope)', fontWeight: 800 },

  tipsBlock: {
    marginTop: 'var(--space-3)',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  tipsHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
    padding: 'var(--space-4) var(--space-5)',
    cursor: 'pointer'
  },
  tipsTitleWrap: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 },
  tipsTitle: {
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-button-size)',
    color: 'var(--color-text)'
  },
  tipsList: { padding: '0 var(--space-5) var(--space-4)' },
  tipRow: { display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-1) 0', alignItems: 'flex-start' },
  tipMark: { color: 'var(--cat-pool)', fontSize: 'var(--text-button-size)', lineHeight: '18px', flexShrink: 0 },
  tipText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12.5px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  },

  // Прибитая кнопка-док (как «Завершить/Начать» в дне силовой).
  finishBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    padding: 'var(--space-12) var(--space-4) var(--tabbar-bottom)',
    pointerEvents: 'none',
    zIndex: 40
  },
  // Таймер + крестик отмены в одной группе (шапка активного заплыва).
  timerRow: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' },
  // Модалка отмены заплыва — вид один в один с днём силовой.
  cancelOverlay: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(13, 12, 12, 0.75)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top) + 30px) var(--space-5) var(--space-5)'
  },
  cancelModal: {
    width: '100%', maxWidth: '340px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  cancelTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)', fontWeight: 800,
    color: 'var(--color-text)', textAlign: 'center'
  },
  cancelText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 'var(--space-4)', lineHeight: 1.4
  },
  cancelButtonsRow: { display: 'flex', gap: 'var(--space-2)', width: '100%' },
  cancelKeepBtn: {
    flex: 1, padding: 'var(--space-4)', borderRadius: 'var(--radius-medium)',
    background: 'var(--highlight-recent)', border: '1px solid var(--layer-2)',
    color: 'var(--color-text)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 700, letterSpacing: '1px', cursor: 'pointer'
  },
  cancelYesBtn: {
    flex: 1, padding: 'var(--space-4)', borderRadius: 'var(--radius-medium)',
    background: 'rgba(232, 69, 69, 0.16)', border: '1px solid rgba(232, 69, 69, 0.5)',
    color: 'var(--color-error)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 800, letterSpacing: '1px', cursor: 'pointer'
  },
  // Тост «занято» над доком — тот же вид, что в дне силовой.
  startBlockWrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 'calc(100% - var(--space-8))',
    display: 'flex', justifyContent: 'center', pointerEvents: 'none'
  },
  startBlockToast: {
    maxWidth: '240px',
    padding: 'var(--space-3) var(--space-4)',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700, lineHeight: 1.35,
    color: 'var(--color-error)', textAlign: 'center'
  },

  errorBlock: {
    padding: 'var(--space-10) var(--space-5)',
    paddingTop: 'calc(var(--tg-safe-top) + 40px)',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  }
}

const plsStyles = {
  wrap: { display: 'inline-flex' },
  group: {
    display: 'flex', alignItems: 'center', gap: 0, padding: 'var(--space-1)', width: 'auto',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
  },
  item: {
    position: 'relative',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
    minHeight: '26px', padding: '0 var(--space-3)',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-label-size)', letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  itemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  }
}

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 'var(--z-modal)', padding: 'var(--space-5)',
    touchAction: 'none', overscrollBehavior: 'contain',
    transition: 'opacity 0.22s ease',
    animation: 'swimModalFade 0.3s ease-out forwards'
  },
  modal: {
    background: 'var(--surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-8) var(--space-6) var(--space-6)',
    width: '100%', maxWidth: '320px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
    animation: 'swimModalIn 0.4s var(--ease-ios) forwards',
    boxShadow: 'var(--shadow-modal)',
    transition: 'transform 0.22s var(--ease-ios), opacity 0.22s ease'
  },
  modalError: { borderColor: 'var(--color-offline)' },
  modalClosing: { transform: 'scale(0.94) translateY(8px)', opacity: 0 },
  icon: { display: 'inline-flex', lineHeight: 1 },
  title: {
    fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-label)',
    fontSize: 'var(--text-title-size)', letterSpacing: '2px', textAlign: 'center'
  },
  // Строка показателей — тот же приём, что в модалке силовой: серия · дистанция · время.
  statsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)' },
  stat: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' },
  statNum: {
    fontFamily: 'var(--font-manrope)', fontWeight: 'var(--weight-value)',
    fontSize: 'var(--text-title-size)', letterSpacing: '0.5px'
  },
  statUnit: {
    fontFamily: 'var(--font-manrope)', fontWeight: 'var(--weight-text)',
    fontSize: 'var(--text-label-size)', color: 'var(--color-text-secondary)'
  },
  statClock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  flameGrey: { display: 'inline-flex', opacity: 0.6, filter: 'grayscale(1)' },
  message: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.5
  },
  praise: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-label)', color: 'var(--text-label)', textAlign: 'center'
  }
}
