import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { finishWorkout } from '../features/programs/api'
import { getProgramBySlug } from '../features/programs/registry'
import { XP_REWARDS } from '../lib/levels'
import { setLastCompletedDay } from '../lib/storage'
import { localGet, localSet } from '../utils/storage'
import {
  SWIM_PROGRAM,
  SWIM_STROKES,
  strokeColor,
  swimTotalMeters,
  blockMeters,
  poolsForMeters,
  pluralPools
} from '../data/programs/swim'
import MuscleIcon from '../components/MuscleIcon'

/**
 * Экран «Заплыв» — ОЗНАКОМИТЕЛЬНАЯ памятка перед бассейном.
 *
 * Никаких галочек: человек смотрит что и каким стилем плыть, переключает
 * длину бассейна (25/50 м — меняются только числа бассейнов, метраж тот же),
 * и по факту в конце жмёт «Завершить заплыв» → +150 💪 (как за тренировку).
 *
 * Лимит на бонусы общий со всеми разделами — держит api_finish_workout
 * (одна засчитанная тренировка в сутки). Если за сегодня уже была любая
 * тренировка — заплыв завершится, но мускулы не начислятся, модалка скажет
 * про лимит.
 */

const POOL_KEY = (slug) => `swim-pool:${slug}`

function formatDistance(m) {
  if (m >= 1000) {
    const km = (m / 1000).toFixed(2).replace(/\.?0+$/, '')
    return `${km} км`
  }
  return `${m} м`
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

  const [modal, setModal] = useState(null)            // null | { kind }
  const [finishStatus, setFinishStatus] = useState('idle') // 'idle' | 'saving' | 'error'

  const totalMeters = useMemo(() => swimTotalMeters(), [])
  const totalPools = poolsForMeters(totalMeters, pool)

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
      const result = await finishWorkout(programId, 'main', [], XP_REWARDS.WORKOUT_COMPLETE)

      if (!result) {
        setFinishStatus('error')
        setModal({ kind: 'error' })
        haptic.error()
        return
      }
      if (result.offline) {
        // Фиксируем дату последней тренировки заплыва (CloudStorage), как в зале —
        // иначе карточка показывает «Ещё не начинали».
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
    if (modal?.kind === 'error') {
      runFinish()
      return
    }
    setModal(null)
    navigate('/')
  }

  return (
    <div style={styles.page}>

      {/* Закреплённая шапка: заголовок + переключатель бассейна + дорожка */}
      <div style={styles.stickyHeader}>
        <header style={styles.header}>
          <h1 style={styles.title}>ЗАПЛЫВ 45</h1>
          <div style={styles.subtitle}>{SWIM_PROGRAM.durationMin} мин · {totalMeters} м</div>
        </header>

        <div style={styles.poolSwitch}>
          {SWIM_PROGRAM.pools.map(len => (
            <button
              key={len}
              onClick={() => handlePoolTap(len)}
              style={{
                ...styles.poolButton,
                background: pool === len ? 'var(--cat-pool)' : 'transparent',
                color: pool === len ? '#0D0C0C' : 'var(--color-text-secondary)',
                fontWeight: pool === len ? 800 : 600
              }}
            >
              Бассейн {len} м
            </button>
          ))}
        </div>

        <PoolLane label={`${totalMeters} м · ${totalPools} ${pluralPools(totalPools)}`} />
      </div>

      <div style={styles.body}>

        {SWIM_PROGRAM.blocks.map(block => {
          const bMeters = blockMeters(block)
          return (
            <section key={block.id} style={styles.block}>
              <div style={styles.blockHeader}>
                <span style={styles.blockTitle}>{block.index} · {block.title}</span>
                <span style={styles.blockMeta}>{block.hint} · {bMeters} м</span>
              </div>

              {block.repeat > 1 && (
                <div style={styles.repeatBadge}>↻ ПОВТОРИТЬ {block.repeat} РАЗ</div>
              )}

              <div style={styles.swimList}>
                {block.swims.map(sw => {
                  const meta = SWIM_STROKES[sw.stroke]
                  const pools = poolsForMeters(sw.meters, pool)
                  const color = strokeColor(sw.stroke)
                  return (
                    <div key={sw.id} style={styles.swimRow}>
                      <div style={styles.swimContent}>
                        <div style={styles.swimName}>
                          <span style={{ color }}>{meta.label}</span>
                          <span style={styles.swimDot}> · </span>
                          {pools} {pluralPools(pools)}
                        </div>
                        <div style={styles.swimNote}>{sw.note}</div>
                      </div>

                      {/* Иконка стиля справа — в цвете стиля */}
                      <span style={{ ...styles.swimIconWrap, color }}>
                        <SwimmerIcon stroke={sw.stroke} size={34} />
                      </span>
                    </div>
                  )
                })}
              </div>

              {block.footnote && <div style={styles.footnote}>{block.footnote}</div>}
            </section>
          )
        })}

        {/* Итого */}
        <div style={styles.totalRow}>
          <span style={styles.totalLabel}>Итого</span>
          <span style={styles.totalValue}>{totalMeters} м · {totalPools} {pluralPools(totalPools)}</span>
        </div>

        {/* Завершить */}
        <div style={styles.finishWrap}>
          <button onClick={handleFinishTap} style={styles.finishButton}>
            ЗАВЕРШИТЬ ЗАПЛЫВ
          </button>
        </div>

        {/* Рекомендации */}
        <div style={styles.tipsBlock}>
          <div style={styles.tipsTitle}>СОВЕТЫ</div>
          <Tip>Хочешь бодрее — повтори основу 6 раз (≈850 м). Мягче для старта — 4 раза (≈650 м).</Tip>
          <Tip>Дыши ритмично, не задерживай дыхание — выдох в воду, вдох в сторону.</Tip>
          <Tip>Между кругами 10–15 сек отдыха — восстанавливай дыхание, не гони.</Tip>
          <Tip>Перед водой покрути плечами 20–30 сек — бережёшь сустав.</Tip>
          <Tip>Держи бутылку воды на бортике — в воде тоже теряешь жидкость.</Tip>
        </div>
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

function Tip({ children }) {
  return (
    <div style={styles.tipRow}>
      <span style={styles.tipMark}>•</span>
      <span style={styles.tipText}>{children}</span>
    </div>
  )
}

/**
 * Декоративная «дорожка бассейна» — чисто визуал (галочек/прогресса нет).
 * Синяя вода + пунктирная разметка дорожки + плавный блик слева направо.
 */
function PoolLane({ label }) {
  return (
    <div style={laneStyles.wrap}>
      <div style={laneStyles.water}>
        <div style={laneStyles.dashes} />
        <div style={laneStyles.shine} />
        <span style={laneStyles.label}>{label}</span>
      </div>
      <style>{`
        @keyframes poolShine {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  )
}

/**
 * Иконка пловца — взята из исходного SVG-памятки, координаты нормализованы
 * под общий viewBox 30×26, цвет через currentColor (красится цветом стиля).
 *  - crawl  — кроль (рука в гребке вверх)
 *  - breast — брасс (руки вперёд)
 *  - back   — спина (рука назад + волна снизу)
 */
function SwimmerIcon({ stroke, size = 34 }) {
  const common = {
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    fill: 'none'
  }
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

/**
 * Модалка завершения. reward / limit / offline / error.
 */
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
  page: { padding: '0 16px 40px', minHeight: '100dvh' },
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'var(--color-bg)',
    // Верх шапки — ровно 16px ниже кнопок Telegram (зашито в var).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: '14px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  header: { textAlign: 'center', marginBottom: '14px' },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '32px',
    color: 'var(--cat-pool)',
    letterSpacing: '3px',
    lineHeight: 1,
    margin: 0,
    textShadow: '0 0 12px rgba(63, 162, 247, 0.3)'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginTop: '6px'
  },
  poolSwitch: {
    display: 'flex',
    gap: '6px',
    padding: '4px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '14px',
    marginBottom: '12px'
  },
  poolButton: {
    flex: 1,
    padding: '10px',
    borderRadius: '10px',
    border: 'none',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    letterSpacing: '0.5px',
    transition: 'background 0.2s ease, color 0.2s ease',
    cursor: 'pointer'
  },
  body: { paddingTop: '16px' },
  block: { marginBottom: '22px' },
  blockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '8px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 'var(--radius-medium)',
    marginBottom: '10px'
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
  repeatBadge: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '1.5px',
    color: 'var(--cat-pool)',
    background: 'rgba(63, 162, 247, 0.1)',
    border: '1px solid rgba(63, 162, 247, 0.25)',
    borderRadius: 'var(--radius-small)',
    padding: '6px 12px',
    textAlign: 'center',
    marginBottom: '10px'
  },
  swimList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  swimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-medium)'
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
  footnote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    padding: '8px 14px 0'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'rgba(63, 162, 247, 0.06)',
    border: '1px solid rgba(63, 162, 247, 0.2)',
    borderRadius: 'var(--radius-card)',
    marginTop: '4px'
  },
  totalLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--color-text)',
    letterSpacing: '1px'
  },
  totalValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--cat-pool)',
    letterSpacing: '0.5px'
  },
  finishWrap: { marginTop: '24px' },
  finishButton: {
    width: '100%',
    padding: '18px',
    background: 'var(--cat-pool)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: 'var(--radius-medium)',
    border: '1px solid var(--cat-pool)',
    boxShadow: '0 4px 20px rgba(63, 162, 247, 0.3)',
    cursor: 'pointer'
  },
  tipsBlock: {
    marginTop: '28px',
    padding: '16px 18px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
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

const laneStyles = {
  wrap: { padding: '0 2px' },
  water: {
    position: 'relative',
    height: '40px',
    borderRadius: 'var(--radius-medium)',
    overflow: 'hidden',
    background: 'linear-gradient(180deg, #2E7FC4 0%, #1C5C97 100%)',
    border: '1px solid rgba(63, 162, 247, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 0 18px rgba(0, 0, 0, 0.25)'
  },
  dashes: {
    position: 'absolute',
    left: 0, right: 0,
    top: '50%',
    height: '2px',
    transform: 'translateY(-50%)',
    background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.55) 0 12px, transparent 12px 26px)',
    opacity: 0.7
  },
  shine: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: '40%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
    animation: 'poolShine 3.2s ease-in-out infinite'
  },
  label: {
    position: 'relative',
    zIndex: 2,
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: '#FFFFFF',
    letterSpacing: '1px',
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.5)'
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
    letterSpacing: '1px',
    padding: '8px 16px',
    background: 'rgba(158, 209, 83, 0.1)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: 'var(--radius-medium)',
    textShadow: '0 0 10px rgba(158, 209, 83, 0.5)'
  },
  message: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    padding: '0 4px'
  },
  button: {
    marginTop: '8px',
    width: '100%',
    padding: '14px',
    background: 'var(--cat-pool)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    borderRadius: 'var(--radius-medium)',
    border: 'none'
  },
  buttonError: { background: '#FF8C42' }
}