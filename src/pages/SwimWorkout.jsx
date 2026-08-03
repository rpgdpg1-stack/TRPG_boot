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
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import ClockIcon from '../components/ClockIcon'
import ChevronIcon from '../components/ChevronIcon'
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
    setFinishStatus('saving')
    setModal({ kind: 'pending' })

    try {
      // Время заплыва = реальная длительность сессии (от «Начать» до «Завершить»),
      // ровно как в силовой: в него честно входят переодевание, душ и отдых.
      // Заплыв без сессии (старая запись/прямой финиш) — падаем на оценку по
      // метражу, ту же, что показана в шапке «≈N мин».
      const startedAt = isThisActive
        ? active.startedAt
        : new Date(Date.now() - swimMinutesForMeters(totalMeters) * 60000).toISOString()
      const result = await finishWorkout(programId, 'main', [], 0, totalMeters, startedAt)

      if (!result) {
        setFinishStatus('error')
        setModal({ kind: 'error' })
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
        setModal({ kind: 'offline' })
        return
      }
      if (result.alreadyCompletedToday) {
        haptic.warning()
        setFinishStatus('idle')
        setModal({ kind: 'limit' })
        return
      }
      haptic.success()
      setFinishStatus('idle')
      setModal({ kind: 'reward' })
    } catch (e) {
      console.error('[SwimWorkout] finish error:', e)
      setFinishStatus('error')
      setModal({ kind: 'error' })
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
        <div style={{ ...styles.headerCard, ...(compact ? styles.headerCardCompact : {}) }}>
          {/* Волна + боковые гирлянды флажков + пунктир — общий компонент */}
          <WaterChrome dashes />

          {/* Верхний ряд: тег бассейна слева, часы по центру */}
          <div style={{ ...styles.topRow, ...(compact ? styles.topRowCompact : {}) }}>
            <PoolLenSwitcher pool={pool} pools={SWIM_PROGRAM.pools} onPick={handlePoolTap} />
            {/* Пока заплыв не начат — оценка «≈45 мин» по метражу; после «Начать»
                на её месте живой таймер сессии с теми же порогами цвета, что в
                силовой (зелёный <1ч → оранжевый → красный). */}
            {isThisActive ? (
              <span style={styles.timerRow}>
                <span style={{ ...styles.clock, color: workoutTimerColor(elapsedSec), fontWeight: 800 }}>
                  <ClockIcon size={13} />{formatWorkoutMin(elapsedSec)}
                </span>
                {/* Крестик отмены — как в дне силовой: «передумал / начал случайно». */}
                <button
                  onClick={() => { haptic.light(); setShowCancelConfirm(true) }}
                  style={styles.cancelCross}
                  className="press-tile"
                  aria-label="Отменить заплыв"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            ) : (
              <span style={styles.clock}>
                <ClockIcon size={13} />≈{swimMinutesForMeters(totalMeters)} мин
              </span>
            )}
          </div>

          {/* Крупный метраж по центру (сквозь пунктир) + бассейны под ним */}
          <div style={{ ...styles.metersMain, ...(compact ? styles.metersMainCompact : {}) }}>
            {formatSwimMeters(totalMeters)}
          </div>
          <div style={{ ...styles.metersSub, ...(compact ? styles.metersSubCompact : {}) }}>
            {totalPools} {pluralPools(totalPools)}
          </div>
        </div>
      </div>

      <div style={styles.body}>
        {SWIM_PROGRAM.blocks.map(block => {
          const bMeters = oneRoundMeters(block) * (block.id === MAIN_ID ? mainReps : (block.repeat || 1))
          const editable = block.id === MAIN_ID
          return (
            <section key={block.id} style={styles.blockCard}>
              <div style={styles.blockHead}>
                <span style={styles.blockTitle}>{block.index} · {block.title}</span>
                <span style={styles.blockMeta}>≈{swimMinutesForMeters(bMeters)} мин · {bMeters} м</span>
              </div>

              <div style={styles.blockBody}>
                {block.swims.map((sw, i) => {
                  const meta = SWIM_STROKES[sw.stroke]
                  const pools = poolsForMeters(sw.meters, pool)
                  const color = strokeColor(sw.stroke)
                  return (
                    <div key={sw.id}>
                      {i > 0 && <div style={styles.rowDivider} />}
                      <div style={styles.swimRow}>
                        <div style={styles.swimContent}>
                          <div style={styles.swimName}>
                            <span style={{ color }}>{meta.label}</span>
                            <span style={styles.swimDot}> · </span>
                            {pools} {pluralPools(pools)}
                          </div>
                          <div style={styles.swimNote}>{sw.note}</div>
                        </div>
                        <span style={{ ...styles.swimIconWrap, color }}>
                          <SwimmerIcon stroke={sw.stroke} size={34} />
                        </span>
                      </div>
                    </div>
                  )
                })}

                {editable && (
                  <div style={styles.stepper}>
                    <button
                      onClick={() => changeReps(-1)}
                      disabled={mainReps <= MIN_REPS}
                      style={{ ...styles.stepBtn, opacity: mainReps <= MIN_REPS ? 0.35 : 1 }}
                      className="press-tile"
                      aria-label="Меньше повторов"
                    >−</button>
                    <span style={styles.stepLabel}>Повторить {mainReps} раз</span>
                    <button
                      onClick={() => changeReps(1)}
                      disabled={mainReps >= MAX_REPS}
                      style={{ ...styles.stepBtn, opacity: mainReps >= MAX_REPS ? 0.35 : 1 }}
                      className="press-tile"
                      aria-label="Больше повторов"
                    >+</button>
                  </div>
                )}

                {block.footnote && <div style={styles.footnote}>{block.footnote}</div>}
              </div>
            </section>
          )
        })}

        {/* Советы */}
        <div style={styles.tipsBlock}>
          <div style={styles.tipsTitle}>СОВЕТЫ</div>
          <Tip>Хочешь бодрее — повтори основу 6 раз (≈850 м). Мягче для старта — 4 раза (≈650 м).</Tip>
          <Tip>Дыши ритмично, не задерживай дыхание — выдох в воду, вдох в сторону.</Tip>
          <Tip>Между кругами 10–15 сек отдыха — восстанавливай дыхание, не гони.</Tip>
          <Tip>Перед водой покрути плечами 20–30 сек — бережёшь сустав.</Tip>
          <Tip>Держи бутылку воды на бортике — в воде тоже теряешь жидкость.</Tip>
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
          distance={totalMeters}
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
              {i === 0 && multi && (
                <span style={{ display: 'inline-flex', marginLeft: '1px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s var(--ease-ios)' }}>
                  <ChevronIcon size={13} color="currentColor" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
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
function SwimFinishedModal({ kind, distance, status, onConfirm }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const [closing, setClosing] = useState(false)
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

        {/* Строка показателя — как в модалке силовой, только показатель здесь
            дистанция, в цвете категории «бассейн». */}
        {!isError && (
          <div style={modalStyles.statsRow}>
            <UiIcon name="swimming" size={18} color="var(--cat-pool)" />
            <span style={modalStyles.statNum}>{formatDistance(distance)}</span>
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
    minHeight: '112px',
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)',
    background: 'linear-gradient(180deg, rgba(46,127,196,0.38) 0%, rgba(28,92,151,0.46) 100%)',
    backdropFilter: 'blur(14px) saturate(180%)',
    WebkitBackdropFilter: 'blur(14px) saturate(180%)',
    border: '1px solid rgba(63, 162, 247, 0.45)',
    boxShadow: 'inset 0 0 22px rgba(0, 0, 0, 0.22), 0 6px 24px rgba(28, 92, 151, 0.25)',
    transition: 'min-height 0.28s var(--ease-ios)'
  },
  headerCardCompact: { minHeight: '76px' },
  topRow: {
    position: 'absolute',
    top: '14px',
    left: '16px',
    right: '16px',
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    transition: 'opacity 0.2s ease'
  },
  topRowCompact: { opacity: 0, pointerEvents: 'none' },
  clock: {
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
    transition: 'font-size 0.28s var(--ease-ios)'
  },
  metersMainCompact: { fontSize: 'var(--text-title-size)' },
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
    transition: 'top 0.28s var(--ease-ios)'
  },
  metersSubCompact: { top: 'calc(50% + 15px)' },

  body: { position: 'relative', zIndex: 1, paddingTop: 'var(--space-4)' },

  // Блок = одна карточка 33px: тёмная шапка + светлые упражнения + степпер.
  blockCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    marginBottom: 'var(--space-4)'
  },
  blockHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: 'var(--space-3) var(--space-4)',
    background: 'rgba(0, 0, 0, 0.22)'
  },
  blockTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  blockMeta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },
  blockBody: { padding: 'var(--space-15) var(--space-4) var(--space-4)' },
  rowDivider: { height: '1px', background: 'var(--border-hairline)', margin: '0 -4px' },
  swimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) 0'
  },
  swimContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-05)' },
  swimName: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  swimDot: { color: 'var(--color-text-secondary)', fontWeight: 500 },
  swimNote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },
  swimIconWrap: {
    flexShrink: 0,
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Крупный степпер-пилюля во всю ширину блока (внизу «Основы»).
  stepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
    height: '48px',
    marginTop: 'var(--space-3)',
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
  footnote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    paddingTop: 'var(--space-3)',
    textAlign: 'center'
  },

  tipsBlock: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-5)',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)'
  },
  tipsTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: 'var(--space-3)'
  },
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
  cancelCross: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '22px', height: '22px', flexShrink: 0,
    background: 'var(--layer-2)', border: 'none', borderRadius: '50%',
    color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 0,
    WebkitTapHighlightColor: 'transparent'
  },
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
  // Строка показателя — тот же приём, что в модалке силовой.
  statsRow: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' },
  statNum: {
    fontFamily: 'var(--font-manrope)', fontWeight: 'var(--weight-value)',
    fontSize: 'var(--text-heading-size)', color: 'var(--cat-pool)', letterSpacing: '0.5px'
  },
  message: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.5
  },
  praise: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-label)', color: 'var(--text-label)', textAlign: 'center'
  }
}
