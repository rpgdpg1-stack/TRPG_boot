import { useState } from 'react'
import { haptic } from '../../lib/telegram'
import { backupUser, markBackupsShown, BACKUP_REWARD, BACKUP_DAILY_LIMIT } from '../../lib/backups'
import { getLevelFromXP, getRankByLevel } from '../../lib/levels'
import RankIcon from '../RankIcon'
import MuscleIcon from '../MuscleIcon'

/**
 * Модалка "тебя подстраховали".
 *
 * Данные приходят из api_get_pending_backups УЖЕ СГРУППИРОВАННЫМИ по игроку:
 *   { backer_id, ids[], count, total_reward, reward, first_name, username,
 *     photo_url, total_muscles, rank_index, can_return }
 * Один игрок = одна карточка, даже если он подстраховал тебя много раз.
 *
 * Тап по карточке игрока → ответная подстраховка (+100 ему). Из центра карточки
 * крупно вылетает бицепс с "+100", потом на карточке зелёная галочка и она гаснет.
 * can_return=false (уже страховал сегодня) → галочка сразу.
 * Достигнут дневной лимit 5 → остальные карточки блокируются с подписью.
 *
 * Кнопка "Готово" помечает все подстраховки показанными и закрывает модалку.
 *
 * @param items     - сгруппированный массив из api_get_pending_backups
 * @param onConfirm - закрыть модалку (родитель)
 */
export default function BackupReceivedModal({ items, onConfirm }) {
  // Состояние ответа по backer_id: 'idle' | 'sending' | 'done' | 'already'
  const initial = {}
  for (const it of items) {
    initial[it.backer_id] = it.can_return ? 'idle' : 'already'
  }
  const [returnState, setReturnState] = useState(initial)
  const [flyers, setFlyers] = useState({})        // backer_id → key (улёт бицепса)
  const [limitReached, setLimitReached] = useState(false)

  const handleReturn = async (item) => {
    const id = item.backer_id
    if (returnState[id] !== 'idle' || limitReached) return

    haptic.success()
    setReturnState(prev => ({ ...prev, [id]: 'sending' }))

    const result = await backupUser(id)

    if (result.success) {
      // Бицепс вылетает из центра карточки только при реальном успехе
      const flyKey = Date.now()
      setFlyers(prev => ({ ...prev, [id]: flyKey }))
      setTimeout(() => {
        setFlyers(prev => {
          const next = { ...prev }
          if (next[id] === flyKey) delete next[id]
          return next
        })
      }, 1000)
      setReturnState(prev => ({ ...prev, [id]: 'done' }))
    } else if (result.error === 'already_today') {
      setReturnState(prev => ({ ...prev, [id]: 'already' }))
    } else if (result.error === 'daily_limit') {
      haptic.error()
      setLimitReached(true)
      setReturnState(prev => ({ ...prev, [id]: 'idle' }))
    } else {
      haptic.error()
      setReturnState(prev => ({ ...prev, [id]: 'idle' }))
    }
  }

  const handleConfirm = () => {
    // Помечаем показанными ВСЕ id всех групп (на случай если родитель берёт
    // только представительный id — здесь гарантированно закрываем все).
    const allIds = items.flatMap(it => it.ids || [it.id]).filter(Boolean)
    markBackupsShown(allIds)
    onConfirm?.()
  }

  const n = items.length
  const subtitle = n === 1
    ? '1 игрок подстраховал тебя. Подстрахуй в ответ — нажми на игрока.'
    : `${n} ${pluralPeople(n)} подстраховали тебя. Подстрахуй в ответ — нажми на игрока.`

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <div style={styles.scene}>
          <span style={styles.heroBiceps}>
            <MuscleIcon size={48} earned={true} flexTrigger={1} />
          </span>
        </div>

        <div style={styles.kicker}>ТЕБЯ ПОДСТРАХОВАЛИ</div>
        <div style={styles.subtitle}>{subtitle}</div>

        <div style={styles.list}>
          {items.map(item => {
            const level = getLevelFromXP(item.total_muscles || 0)
            const rank = getRankByLevel(level)
            const name = item.first_name || 'Игрок'
            const count = item.count || 1
            const state = returnState[item.backer_id]
            const flyKey = flyers[item.backer_id]
            const dim = state === 'done' || state === 'already'
            const tappable = state === 'idle' && !limitReached

            return (
              <div
                key={item.backer_id}
                onClick={() => { if (tappable) handleReturn(item) }}
                style={{
                  ...styles.row,
                  opacity: dim ? 0.6 : (limitReached && state === 'idle' ? 0.5 : 1),
                  cursor: tappable ? 'pointer' : 'default'
                }}
              >
                <div style={styles.avatarWrap}>
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" style={styles.avatarImg} draggable={false} />
                  ) : (
                    <div style={styles.avatarPlaceholder}>{name.charAt(0).toUpperCase()}</div>
                  )}
                </div>

                <div style={styles.nameBlock}>
                  <div style={styles.name}>{name}</div>
                  <div style={{ ...styles.rank, color: rank.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <RankIcon level={level} size={11} />
                    {rank.name} {rank.subLevel}
                  </div>
                  {count >= 2 && (
                    <div style={styles.countLine}>
                      Подстраховал {count} {pluralTimes(count)}
                    </div>
                  )}
                </div>

                {/* Справа: сколько закинул (инфо), после ответа — галочка */}
                <div style={styles.rightWrap}>
                  {dim ? (
                    <span style={styles.doneBadge}>✔</span>
                  ) : (
                    <span style={{ ...styles.giveBadge, opacity: state === 'sending' ? 0.5 : 1 }}>
                      +{item.total_reward} <MuscleIcon size={14} earned={true} />
                    </span>
                  )}
                </div>

                {/* Крупный бицепс из центра карточки */}
                {flyKey && (
                  <span key={flyKey} style={styles.flyerBig}>
                    <MuscleIcon size={38} earned={true} flexTrigger={flyKey} />
                    <span style={styles.flyerPlus}>+{BACKUP_REWARD}</span>
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {limitReached && (
          <div style={styles.limitNote}>
            Лимит подстраховок на сегодня — {BACKUP_DAILY_LIMIT}/{BACKUP_DAILY_LIMIT}
          </div>
        )}

        <button onClick={handleConfirm} style={styles.confirmButton}>
          ГОТОВО
        </button>
      </div>

      <style>{`
        @keyframes backupOverlayFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes backupPanelIn {
          0%   { opacity: 0; transform: scale(0.9) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes backupReturnFly {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          20%  { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
          35%  { opacity: 1; transform: translate(-50%, -60%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -190%) scale(0.95); }
        }
      `}</style>
    </div>
  )
}

function pluralPeople(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'игроков'
  if (last === 1) return 'игрок'
  if (last >= 2 && last <= 4) return 'игрока'
  return 'игроков'
}

function pluralTimes(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'раз'
  if (last === 1) return 'раз'
  if (last >= 2 && last <= 4) return 'раза'
  return 'раз'
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px',
    animation: 'backupOverlayFade 0.3s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '360px',
    maxHeight: '85vh',
    overflowY: 'auto',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(158, 209, 83, 0.25)',
    borderRadius: '28px',
    padding: '28px 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    animation: 'backupPanelIn 0.45s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(158, 209, 83, 0.12)'
  },
  scene: {
    width: '90px',
    height: '90px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroBiceps: {
    display: 'inline-flex',
    filter: 'drop-shadow(0 0 14px rgba(250, 223, 190, 0.4))'
  },
  kicker: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    color: 'var(--color-primary)',
    letterSpacing: '2px',
    textShadow: '0 0 12px rgba(158, 209, 83, 0.4)'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    marginBottom: '6px',
    padding: '0 8px'
  },
  list: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '8px'
  },
  row: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '14px',
    transition: 'opacity 0.3s ease',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none'
  },
  avatarWrap: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'var(--color-card)',
    flexShrink: 0,
    border: '1px solid rgba(255, 255, 255, 0.08)'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    color: 'var(--color-primary)'
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    letterSpacing: '1px',
    lineHeight: 1
  },
  countLine: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-primary)',
    opacity: 0.85,
    lineHeight: 1.2,
    marginTop: '1px'
  },
  rightWrap: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center'
  },
  giveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '7px 12px',
    background: 'rgba(158, 209, 83, 0.12)',
    border: '1px solid rgba(158, 209, 83, 0.4)',
    borderRadius: '999px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '0.5px',
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap'
  },
  doneBadge: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: 'var(--color-primary)',
    background: 'rgba(158, 209, 83, 0.12)',
    borderRadius: '50%'
  },
  flyerBig: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 5,
    textShadow: '0 0 10px rgba(158, 209, 83, 0.7)',
    filter: 'drop-shadow(0 0 10px rgba(250, 223, 190, 0.5))',
    animation: 'backupReturnFly 1s ease-out forwards'
  },
  flyerPlus: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    color: 'var(--color-primary)'
  },
  limitNote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    marginBottom: '2px'
  },
  confirmButton: {
    width: '100%',
    marginTop: '6px',
    padding: '14px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: '14px',
    border: 'none',
    cursor: 'pointer'
  }
}