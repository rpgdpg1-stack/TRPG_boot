import { useState } from 'react'
import { haptic } from '../lib/telegram'
import { backupAllPinned } from '../lib/backups'
import MuscleIcon from './MuscleIcon'
import BackupSentToast from './rewards/BackupSentToast'

/**
 * Кнопка «Подстраховать всех» — разом страхует всех закреплённых друзей,
 * кого ещё не страховал сегодня (в пределах дневного лимита).
 *
 * Показывается, только когда есть кого страховать (eligible > 0 — считает родитель).
 * По тапу: сервер страхует разом, в кнопке улетает бицепс с твоим суммарным
 * бонусом (+20×N), подпись меняется на «N закрепов застраховано», затем кнопка
 * исчезает (до завтра — пока не сбросятся лимиты). Модалки нет — как при ответной
 * подстраховке: просто улетающий бицепс.
 */

function pluralPins(n) {
  const last = n % 10, lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'закрепов'
  if (last === 1) return 'закреп'
  if (last >= 2 && last <= 4) return 'закрепа'
  return 'закрепов'
}

function doneWord(n) {
  return n === 1 ? 'застрахован' : 'застрахованы'
}

export default function BackupAllButton({ onDone }) {
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [flyer, setFlyer] = useState(null) // { bonus, count, key }
  const [result, setResult] = useState(null) // { count, bonus, reward } — для модалки

  const handleTap = async () => {
    if (busy) return
    setBusy(true)
    haptic.medium()

    const res = await backupAllPinned()

    if (!res.success || res.count === 0) {
      // Некого страховать (всех уже застраховал / лимит) — мягко убираем кнопку.
      haptic.error()
      setHidden(true)
      onDone?.()
      return
    }

    haptic.success()
    setFlyer({ bonus: res.totalBonus, count: res.count, key: Date.now() })

    // Бицепс не спеша улетает, затем прячем кнопку и показываем модалку-итог.
    setTimeout(() => {
      setHidden(true)
      setResult({ count: res.count, bonus: res.totalBonus, reward: res.totalReward })
    }, 1900)
  }

  return (
    <>
      {!hidden && (
        <button onClick={handleTap} className="press-tile" style={styles.btn}>
          <span style={styles.label}>
            {flyer
              ? `${flyer.count} ${pluralPins(flyer.count)} ${doneWord(flyer.count)}`
              : 'Подстраховать всех'}
            {!flyer && <MuscleIcon size={20} earned={true} />}
          </span>

          {flyer && (
            <span key={flyer.key} style={styles.flyer}>
              <MuscleIcon size={32} earned={true} flexTrigger={flyer.key} />
              <span style={styles.flyerPlus}>+{flyer.bonus}</span>
            </span>
          )}

          <style>{`
            @keyframes backupAllFly {
              0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
              15%  { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
              30%  { opacity: 1; transform: translate(-50%, -65%) scale(1.1); }
              100% { opacity: 0; transform: translate(-50%, -200%) scale(0.95); }
            }
          `}</style>
        </button>
      )}

      {result && (
        <BackupSentToast
          count={result.count}
          reward={result.reward}
          bonus={result.bonus}
          onConfirm={() => { setResult(null); onDone?.() }}
        />
      )}
    </>
  )
}

const styles = {
  btn: {
    position: 'relative',
    width: '100%',
    minHeight: '52px',
    marginTop: '10px',
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.10)',
    borderRadius: 'var(--radius-card)',
    cursor: 'pointer',
    overflow: 'visible'
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '13px',
    letterSpacing: '0.5px',
    color: 'var(--color-text)'
  },
  flyer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    pointerEvents: 'none',
    zIndex: 5,
    textShadow: '0 0 10px rgba(158, 209, 83, 0.7)',
    filter: 'drop-shadow(0 0 10px rgba(250, 223, 190, 0.5))',
    animation: 'backupAllFly 1.8s ease-out forwards'
  },
  flyerPlus: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '18px',
    color: 'var(--color-primary)'
  }
}
