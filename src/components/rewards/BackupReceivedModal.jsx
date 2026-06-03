import { useState } from 'react'
import { haptic } from '../../lib/telegram'
import { backupUser } from '../../lib/backups'
import { getLevelFromXP, getRankByLevel } from '../../lib/levels'
import RankIcon from '../RankIcon'
import MuscleIcon from '../MuscleIcon'

/**
 * Модалка "тебя подстраховали".
 *
 * Список строк (фото + имя + ранг), у каждой компактная кнопка "+100 в ответ".
 * Тап по кнопке → начисление в БД, галочка + улёт бицепса (как в дневных
 * миссиях), строка гаснет, кнопка → "✔". Экран НЕ закрывается.
 * Внизу одна кнопка "Готово" закрывает всё и помечает показанными.
 *
 * can_return=false (уже страховал в ответ сегодня) → кнопка сразу "✔".
 *
 * @param items     - массив подстраховок из api_get_pending_backups
 * @param onConfirm - закрыть модалку (родитель пометит показанными)
 */
export default function BackupReceivedModal({ items, onConfirm }) {
  // Состояние ответных подстраховок по backer_id:
  //   'idle' | 'sending' | 'done' | 'already'
  const initial = {}
  for (const it of items) {
    initial[it.backer_id] = it.can_return ? 'idle' : 'already'
  }
  const [returnState, setReturnState] = useState(initial)
  const [flyers, setFlyers] = useState({}) // backer_id → key для улёта бицепса

  const handleReturn = async (item) => {
    const id = item.backer_id
    if (returnState[id] !== 'idle') return

    haptic.success()
    setReturnState(prev => ({ ...prev, [id]: 'sending' }))

    // Улёт бицепса
    const flyKey = Date.now()
    setFlyers(prev => ({ ...prev, [id]: flyKey }))
    setTimeout(() => {
      setFlyers(prev => {
        const next = { ...prev }
        if (next[id] === flyKey) delete next[id]
        return next
      })
    }, 1100)

    const result = await backupUser(id)
    if (result.success) {
      setReturnState(prev => ({ ...prev, [id]: 'done' }))
    } else if (result.error === 'already_today') {
      setReturnState(prev => ({ ...prev, [id]: 'already' }))
    } else {
      haptic.error()
      setReturnState(prev => ({ ...prev, [id]: 'idle' }))
    }
  }

  const isSingle = items.length === 1

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <div style={styles.scene}>
          <span style={styles.heroBiceps}>
            <MuscleIcon size={48} earned={true} flexTrigger={1} />
          </span>
        </div>

        <div style={styles.kicker}>ТЕБЯ ПОДСТРАХОВАЛИ</div>
        <div style={styles.subtitle}>
          {isSingle
            ? 'Тебе закинули мускулы. Можешь поддержать в ответ.'
            : `${items.length} ${pluralPeople(items.length)} поддержали тебя. Ответь тем же.`}
        </div>

        <div style={styles.list}>
          {items.map(item => {
            const level = getLevelFromXP(item.total_muscles || 0)
            const rank = getRankByLevel(level)
            const name = item.first_name || 'Игрок'
            const state = returnState[item.backer_id]
            const flyKey = flyers[item.backer_id]

            return (
              <div key={item.id} style={{
                ...styles.row,
                opacity: state === 'done' || state === 'already' ? 0.6 : 1
              }}>
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
                </div>

                {/* Кнопка ответа */}
                <div style={styles.returnWrap}>
                  {state === 'done' || state === 'already' ? (
                    <span style={styles.doneBadge}>✔</span>
                  ) : (
                    <button
                      onClick={() => handleReturn(item)}
                      disabled={state === 'sending'}
                      style={{
                        ...styles.returnButton,
                        opacity: state === 'sending' ? 0.5 : 1
                      }}
                    >
                      +100 <MuscleIcon size={14} earned={true} />
                    </button>
                  )}

                  {flyKey && (
                    <span key={flyKey} style={styles.flyer}>
                      +100 <MuscleIcon size={14} earned={true} />
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={onConfirm} style={styles.confirmButton}>
          ГОТОВО
        </button>
      </div>

      <style>{`
        @keyframes backupOverlayFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes backupPanelIn {
          0%   { opacity: 0; transform: scale(0.9) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes backupFlyUp {
          0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.8); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
          85%  { opacity: 1; transform: translateX(-50%) translateY(-40px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-52px) scale(0.9); }
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
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '14px',
    transition: 'opacity 0.3s ease'
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
  returnWrap: {
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center'
  },
  returnButton: {
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
    cursor: 'pointer',
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
  flyer: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textShadow: '0 0 8px rgba(158, 209, 83, 0.7)',
    animation: 'backupFlyUp 1.1s ease-out forwards'
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