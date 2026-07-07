import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { finishWorkout } from '../features/programs/api'
import { getProgramBySlug } from '../features/programs/registry'
import { XP_REWARDS } from '../lib/levels'
import { setLastCompletedDay } from '../lib/storage'
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
import MuscleIcon from '../components/MuscleIcon'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import ClockIcon from '../components/ClockIcon'
import ActionButton from '../components/ActionButton'
import WaterChrome from '../components/WaterChrome'

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

function formatDistance(m) {
  if (m >= 1000) {
    const km = (m / 1000).toFixed(2).replace(/\.?0+$/, '')
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
      const result = await finishWorkout(programId, 'main', [], XP_REWARDS.WORKOUT_COMPLETE, totalMeters)

      if (!result) {
        setFinishStatus('error')
        setModal({ kind: 'error' })
        haptic.error()
        return
      }
      if (result.offline) {
        await setLastCompletedDay(programId, 'main')
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
      await setLastCompletedDay(programId, 'main')
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
            <span style={styles.clock}>
              <ClockIcon size={13} />≈{swimMinutesForMeters(totalMeters)} мин
            </span>
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

      {/* Закреплённая кнопка «Завершить» (как док в дне силовой), синяя */}
      <div style={styles.finishBar}>
        <div className="dock-scrim" />
        <ActionButton
          onClick={handleFinishTap}
          variant="accent"
          hug
          style={{ background: 'var(--cat-pool)', borderColor: '#1C5C97' }}
        >
          ЗАВЕРШИТЬ
        </ActionButton>
      </div>

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

function SwimFinishedModal({ kind, distance, status, onConfirm }) {
  const isError = kind === 'error'
  const isSaving = status === 'saving'

  const title = isError ? 'НЕ УДАЛОСЬ СОХРАНИТЬ'
    : kind === 'offline' ? 'СОХРАНЕНО ЛОКАЛЬНО'
    : 'ЗАПЛЫВ ЗАВЕРШЁН'

  const buttonText = isSaving ? 'СОХРАНЕНИЕ...' : isError ? 'ПОВТОРИТЬ' : 'ОК'

  return (
    <div style={modalStyles.overlay}>
      <div style={{ ...modalStyles.modal, ...(isError ? modalStyles.modalError : {}) }}>
        <div style={modalStyles.icon}>
          {isError ? '⚠️' : kind === 'offline' ? '📵' : '🏊'}
        </div>

        <div style={{
          ...modalStyles.title,
          color: isError || kind === 'offline' ? '#FF8C42' : 'var(--color-text)'
        }}>
          {title}
        </div>

        {!isError && (
          <div style={modalStyles.distanceBadge}>{formatDistance(distance)}</div>
        )}

        {isError ? (
          <div style={modalStyles.message}>
            Проверь подключение к интернету и попробуй ещё раз.
          </div>
        ) : kind === 'reward' ? (
          <div style={{ ...modalStyles.rewardBadge, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            +{XP_REWARDS.WORKOUT_COMPLETE} <MuscleIcon size={28} earned={true} flexTrigger={1} />
          </div>
        ) : kind === 'limit' ? (
          <div style={modalStyles.message}>
            Лимит: 1 тренировка в день.<br />
            Бицепсы за сегодня уже начислены за другую тренировку.
          </div>
        ) : (
          <div style={modalStyles.message}>
            Заплыв сохранён на телефоне.<br />
            Данные обновятся, как только появится интернет.
          </div>
        )}

        <button
          onClick={onConfirm}
          disabled={isSaving}
          style={{
            ...modalStyles.button,
            ...(isError ? modalStyles.buttonError : {}),
            opacity: isSaving ? 0.6 : 1,
            cursor: isSaving ? 'default' : 'pointer'
          }}
        >
          {buttonText}
        </button>
      </div>

      <style>{`
        @keyframes swimModalFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes swimModalIn {
          0%   { opacity: 0; transform: scale(0.85) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  page: { padding: '0 16px 100px', minHeight: '100dvh' },
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    // Фон-заливки НЕТ — контент скроллится прямо под шапкой (как в дне силовой).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: '12px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  // Синяя карточка-«вода» — теперь ПОЛУПРОЗРАЧНОЕ стекло: наш голубой остаётся, но
  // с прозрачностью + backdrop-blur, контент просвечивает размытым (как в силовой).
  headerCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-card)',
    minHeight: '112px',
    paddingLeft: '16px',
    paddingRight: '16px',
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
    gap: '5px',
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: '13px',
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
    fontSize: '26px',
    color: '#FFFFFF',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    textShadow: '0 1px 6px rgba(0, 0, 0, 0.45)',
    transition: 'font-size 0.28s var(--ease-ios)'
  },
  metersMainCompact: { fontSize: '19px' },
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
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.72)',
    whiteSpace: 'nowrap',
    transition: 'top 0.28s var(--ease-ios)'
  },
  metersSubCompact: { top: 'calc(50% + 15px)' },

  body: { paddingTop: '16px' },

  // Блок = одна карточка 33px: тёмная шапка + светлые упражнения + степпер.
  blockCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    marginBottom: '16px'
  },
  blockHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.22)'
  },
  blockTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  blockMeta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  blockBody: { padding: '6px 16px 14px' },
  rowDivider: { height: '1px', background: 'var(--border-hairline)', margin: '0 -4px' },
  swimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '11px 0'
  },
  swimContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' },
  swimName: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  swimDot: { color: 'var(--color-text-secondary)', fontWeight: 400 },
  swimNote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
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
    gap: '10px',
    height: '48px',
    marginTop: '12px',
    padding: '0 8px',
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
    fontSize: '22px',
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
    fontSize: '15px',
    letterSpacing: '0.5px',
    color: 'var(--cat-pool)',
    whiteSpace: 'nowrap'
  },
  footnote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    paddingTop: '10px',
    textAlign: 'center'
  },

  tipsBlock: {
    marginTop: '12px',
    padding: '16px 18px',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)'
  },
  tipsTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '12px'
  },
  tipRow: { display: 'flex', gap: '8px', padding: '5px 0', alignItems: 'flex-start' },
  tipMark: { color: 'var(--cat-pool)', fontSize: '14px', lineHeight: '18px', flexShrink: 0 },
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
    padding: '44px 16px var(--tabbar-bottom)',
    pointerEvents: 'none',
    zIndex: 40
  },

  errorBlock: {
    padding: '40px 20px',
    paddingTop: 'calc(var(--tg-safe-top) + 40px)',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  }
}

const plsStyles = {
  wrap: { display: 'inline-flex' },
  group: {
    display: 'flex', alignItems: 'center', gap: 0, padding: '3px', width: 'auto',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
  },
  item: {
    position: 'relative',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
    minHeight: '26px', padding: '0 11px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.5px',
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
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    animation: 'swimModalFade 0.3s ease-out forwards'
  },
  modal: {
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(63, 162, 247, 0.25)',
    borderRadius: 'var(--radius-card)',
    padding: '32px 24px 24px',
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    animation: 'swimModalIn 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(63, 162, 247, 0.15)'
  },
  modalError: {
    border: '1px solid rgba(255, 140, 66, 0.3)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 140, 66, 0.2)'
  },
  icon: { fontSize: '56px', lineHeight: 1, filter: 'drop-shadow(0 0 14px rgba(63, 162, 247, 0.5))' },
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', letterSpacing: '2px', textAlign: 'center' },
  distanceBadge: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '26px',
    color: 'var(--cat-pool)',
    letterSpacing: '1px',
    textShadow: '0 0 12px rgba(63, 162, 247, 0.4)'
  },
  rewardBadge: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '22px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  },
  message: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5
  },
  button: {
    marginTop: '4px',
    width: '100%',
    padding: '14px',
    background: 'var(--cat-pool)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: 'var(--radius-pill)',
    border: 'none',
    cursor: 'pointer'
  },
  buttonError: { background: '#FF8C42' }
}
