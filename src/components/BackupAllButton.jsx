import { useState } from 'react'
import { haptic } from '../lib/telegram'
import { backupAllPinned } from '../lib/backups'
import MuscleIcon from './MuscleIcon'
import BackupButton from './BackupButton'
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
        <BackupButton onClick={handleTap} flyer={flyer} style={{ marginTop: '10px' }}>
          {flyer
            ? `${flyer.count} ${pluralPins(flyer.count)} ${doneWord(flyer.count)}`
            : <>Подстраховать всех <MuscleIcon size={20} earned={true} /></>}
        </BackupButton>
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
