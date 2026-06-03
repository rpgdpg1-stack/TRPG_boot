import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getCurrentUser } from '../lib/auth'
import { finishWorkout } from '../features/programs/api'
import { getProgramBySlug } from '../features/programs/registry'
import { XP_REWARDS } from '../lib/levels'
import { localGet, localSet, localRemove } from '../utils/storage'
import {
  SWIM_PROGRAM,
  SWIM_STROKES,
  strokeColor,
  swimTotalMeters,
  blockMeters,
  poolsForMeters,
  pluralPools,
  swimFormatLabel
} from '../data/programs/swim'
import PixelCheckbox from '../components/PixelCheckbox'
import MuscleIcon from '../components/MuscleIcon'

/**
 * Экран тренировки плавания «Заплыв».
 *
 * Отличия от силовой (WorkoutDay):
 *  - нет дней A/B/C, нет весов и свапов
 *  - единица — метры; переключатель 25/50 м меняет только число бассейнов,
 *    итог по метрам не меняется
 *  - при завершении показываем проплытую дистанцию + 150 💪 (как за тренировку)
 *
 * Лимит на бонусы общий со всеми разделами — его держит api_finish_workout
 * (одна засчитанная тренировка в сутки). Если сегодня уже была любая
 * тренировка, заплыв завершится, но мускулы не начислятся — модалка покажет
 * текст про лимит вместо «+150».
 */

const POOL_KEY = (slug) => `swim-pool:${slug}`
const PROGRESS_KEY = (slug) => `swim-progress:${slug}`

function loadProgress(slug) {
  const raw = localGet(PROGRESS_KEY(slug))
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveProgress(slug, set) {
  if (set.size === 0) {
    localRemove(PROGRESS_KEY(slug))
    return
  }
  localSet(PROGRESS_KEY(slug), JSON.stringify(Array.from(set)))
}

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

  const [doneIds, setDoneIds] = useState(() => loadProgress(programId))

  const [modal, setModal] = useState(null) // null | { status, distance, kind }
  const [finishStatus, setFinishStatus] = useState('idle') // 'idle' | 'saving' | 'error'

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

  useEffect(() => {
    saveProgress(programId, doneIds)
  }, [programId, doneIds])

  const totalMeters = useMemo(() => swimTotalMeters(), [])

  const doneMeters = useMemo(() => {
    let sum = 0
    for (const block of SWIM_PROGRAM.blocks) {
      for (const sw of block.swims) {
        if (doneIds.has(sw.id)) sum += sw.meters
      }
    }
    return sum
  }, [doneIds])

  const allCount = useMemo(
    () => SWIM_PROGRAM.blocks.reduce((n, b) => n + b.swims.length, 0),
    []
  )
  const isAllDone = doneIds.size === allCount
  const canFinish = doneIds.size > 0
  const progressPct = Math.min(100, (doneMeters / totalMeters) * 100)

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

  const handleSwimTap = (swimId) => {
    setDoneIds(prev => {
      const next = new Set(prev)
      if (next.has(swimId)) {
        next.delete(swimId)
        haptic.light()
      } else {
        next.add(swimId)
        haptic.success()
      }
      return next
    })
  }

  const handleFinishTap = () => {
    if (!canFinish) return
    haptic.medium()
    runFinish()
  }

  const runFinish = async () => {
    setFinishStatus('saving')
    setModal({ status: 'saving', distance: doneMeters, kind: 'pending' })

    try {
      const result = await finishWorkout(programId, 'main', [], XP_REWARDS.WORKOUT_COMPLETE)

      if (!result) {
        setFinishStatus('error')
        setModal({ status: 'error', distance: doneMeters, kind: 'error' })
        haptic.error()
        return
      }

      if (result.offline) {
        haptic.warning()
        setFinishStatus('idle')
        setModal({ status: 'done', distance: doneMeters, kind: 'offline' })
        return
      }

      if (result.alreadyCompletedToday) {
        haptic.warning()
        setFinishStatus('idle')
        setModal({ status: 'done', distance: doneMeters, kind: 'limit' })
        return
      }

      haptic.success()
      setFinishStatus('idle')
      setModal({ status: 'done', distance: doneMeters, kind: 'reward' })
    } catch (e) {
      console.error('[SwimWorkout] finish error:', e)
      setFinishStatus('error')
      setModal({ status: 'error', distance: doneMeters, kind: 'error' })
      haptic.error()
    }
  }

  const handleModalConfirm = () => {
    if (modal?.kind === 'error') {
      runFinish()
      return
    }
    // reward / offline / limit — закрываем, чистим прогресс, уходим на главную
    saveProgress(programId, new Set())
    setDoneIds(new Set())
    setModal(null)
    navigate('/')
  }

  return (
    <div style={styles.page}>

      <div style={styles.stickyHeader}>
        <header style={styles.header}>
          <h1 style={styles.title}>ЗАПЛЫВ</h1>
          <div style={styles.subtitle}>{SWIM_PROGRAM.durationMin} мин · {totalMeters} м</div>
        </header>

        {/* Переключатель длины бассейна */}
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

        <div style={styles.progressWrap}>
          <div style={styles.progressLabel}>{doneMeters} / {totalMeters} м</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div style={styles.body}>

        {/* Легенда стилей */}
        <div style={styles.legend}>
          {Object.entries(SWIM_STROKES).map(([key, s]) => (
            <span key={key} style={styles.legendItem}>
              <StrokeDot stroke={key} size={9} />
              {s.label}
            </span>
          ))}
        </div>

        {/* Блоки */}
        {SWIM_PROGRAM.blocks.map(block => {
          const bMeters = blockMeters(block)
          const bPools = poolsForMeters(bMeters, pool)
          return (
            <section key={block.id} style={styles.block}>
              <div style={styles.blockHeader}>
                <span style={styles.blockTitle}>{block.index} · {block.title}</span>
                <span style={styles.blockMeta}>
                  {block.hint} · {bMeters} м · {bPools} {pluralPools(bPools)}
                </span>
              </div>

              <div style={styles.swimList}>
                {block.swims.map(sw => {
                  const done = doneIds.has(sw.id)
                  const meta = SWIM_STROKES[sw.stroke]
                  const pools = poolsForMeters(sw.meters, pool)
                  return (
                    <button
                      key={sw.id}
                      onClick={() => handleSwimTap(sw.id)}
                      className="tg-row"
                      style={{
                        ...styles.swimRow,
                        opacity: done ? 0.6 : 1
                      }}
                    >
                      <div style={styles.swimCheck}>
                        <PixelCheckbox checked={done} size={20} color={strokeColor(sw.stroke)} />
                      </div>

                      <StrokeDot stroke={sw.stroke} size={11} />

                      <div style={styles.swimContent}>
                        <div style={{
                          ...styles.swimName,
                          textDecoration: done ? 'line-through' : 'none'
                        }}>
                          {meta.label} · {swimFormatLabel(sw)}
                        </div>
                        <div style={styles.swimSub}>
                          {pools} {pluralPools(pools)}
                        </div>
                      </div>

                      <div style={styles.swimNote}>{sw.note}</div>
                    </button>
                  )
                })}
              </div>

              {block.footnote && (
                <div style={styles.footnote}>{block.footnote}</div>
              )}
            </section>
          )
        })}

        {/* Итого */}
        <div style={styles.totalRow}>
          <span style={styles.totalLabel}>Итого</span>
          <span style={styles.totalValue}>
            {totalMeters} м · {poolsForMeters(totalMeters, pool)} {pluralPools(poolsForMeters(totalMeters, pool))}
          </span>
        </div>

        {/* Кнопка завершить */}
        <div style={styles.finishWrap}>
          <button
            onClick={handleFinishTap}
            disabled={!canFinish}
            style={{
              ...styles.finishButton,
              ...(isAllDone ? styles.finishButtonReady : {}),
              opacity: canFinish ? 1 : 0.35,
              cursor: canFinish ? 'pointer' : 'default'
            }}
          >
            {isAllDone ? '✓ ЗАВЕРШИТЬ ЗАПЛЫВ' : 'ЗАВЕРШИТЬ ЗАПЛЫВ'}
          </button>
        </div>
      </div>

      {modal && (
        <SwimFinishedModal
          kind={modal.kind}
          distance={modal.distance}
          status={finishStatus}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  )
}

/**
 * Цветная точка стиля. Для mixed — две половинки разных цветов.
 */
function StrokeDot({ stroke, size = 10 }) {
  const meta = SWIM_STROKES[stroke]
  if (!meta) return null

  if (meta.color2) {
    return (
      <span style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: `linear-gradient(90deg, ${meta.color} 0 50%, ${meta.color2} 50% 100%)`
      }} />
    )
  }
  return (
    <span style={{
      width: size,
      height: size,
      borderRadius: '50%',
      flexShrink: 0,
      background: meta.color
    }} />
  )
}

/**
 * Модалка завершения заплыва.
 *  - reward  → «+150 💪» + дистанция
 *  - limit   → лимит 1 тренировка в день (мускулы уже взяты сегодня)
 *  - offline → сохранено локально
 *  - error   → ошибка, кнопка «Повторить»
 */
function SwimFinishedModal({ kind, distance, status, onConfirm }) {
  const isError = kind === 'error'
  const isSaving = status === 'saving'

  const title = isError ? 'НЕ УДАЛОСЬ СОХРАНИТЬ'
    : kind === 'offline' ? 'СОХРАНЕНО ЛОКАЛЬНО'
    : kind === 'limit' ? 'ЗАПЛЫВ ЗАВЕРШЁН'
    : 'ЗАПЛЫВ ЗАВЕРШЁН'

  const buttonText = isSaving ? 'СОХРАНЕНИЕ...'
    : isError ? 'ПОВТОРИТЬ'
    : 'ОК'

  return (
    <div style={modalStyles.overlay}>
      <div style={{
        ...modalStyles.modal,
        ...(isError ? modalStyles.modalError : {})
      }}>
        <div style={modalStyles.icon}>
          {isError ? '⚠️' : kind === 'offline' ? '📵' : '🏊'}
        </div>

        <div style={{
          ...modalStyles.title,
          color: isError || kind === 'offline' ? '#FF8C42' : 'var(--color-text)'
        }}>
          {title}
        </div>

        {/* Дистанция — всегда показываем сколько проплыл */}
        {!isError && (
          <div style={modalStyles.distanceBadge}>
            {formatDistance(distance)}
          </div>
        )}

        {/* Награда / лимит / оффлайн / ошибка */}
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
            +{XP_REWARDS.WORKOUT_COMPLETE} <MuscleIcon size={15} earned={true} /> начислятся,
            как появится интернет (если это первая тренировка за день).
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
  header: { textAlign: 'center', marginBottom: '14px' },
  title: {
    fontFamily: 'var(--font-tiny5)',
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
    marginBottom: '14px'
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
  progressWrap: { padding: '0 4px' },
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
    background: 'var(--cat-pool)',
    borderRadius: '2px',
    transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
  },
  body: { paddingTop: '16px' },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '14px',
    justifyContent: 'center',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 'var(--radius-card)',
    marginBottom: '20px'
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)'
  },
  block: {
    marginBottom: '22px'
  },
  blockHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    padding: '8px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '12px',
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
  swimList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  swimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    background: 'var(--color-card)',
    borderRadius: '14px',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: 'opacity 0.3s ease'
  },
  swimCheck: {
    flexShrink: 0,
    width: '20px',
    height: '20px'
  },
  swimContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  swimName: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)'
  },
  swimSub: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
  },
  swimNote: {
    flexShrink: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'right',
    maxWidth: '40%'
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
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--color-text)',
    letterSpacing: '1px'
  },
  totalValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--cat-pool)',
    letterSpacing: '0.5px'
  },
  finishWrap: {
    marginTop: '24px',
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
    background: 'var(--cat-pool)',
    color: '#0D0C0C',
    border: '1px solid var(--cat-pool)',
    boxShadow: '0 4px 20px rgba(63, 162, 247, 0.3)'
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
    borderRadius: '24px',
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
  icon: {
    fontSize: '56px',
    lineHeight: 1,
    filter: 'drop-shadow(0 0 14px rgba(63, 162, 247, 0.5))'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    letterSpacing: '2px',
    textAlign: 'center'
  },
  distanceBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '26px',
    color: 'var(--cat-pool)',
    letterSpacing: '1px',
    textShadow: '0 0 12px rgba(63, 162, 247, 0.4)'
  },
  rewardBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '22px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    padding: '8px 16px',
    background: 'rgba(158, 209, 83, 0.1)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: '12px',
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
    borderRadius: '14px',
    border: 'none'
  },
  buttonError: {
    background: '#FF8C42'
  }
}