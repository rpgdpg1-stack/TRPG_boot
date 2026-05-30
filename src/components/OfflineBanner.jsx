import { useEffect, useState, useRef } from 'react'
import { isOnline, onNetworkChange } from '../lib/network-status'
import { getQueueSize } from '../lib/offline-queue'
import { SYNC_EVENTS, onSyncEvent } from '../lib/sync-engine'

/**
 * Плашка статуса сети и синхронизации.
 *
 * Состояния (приоритет сверху вниз):
 *  - syncing → "🔄 Синхронизация..."
 *  - justSynced → "✅ Синхронизировано N" (показывается ~2.5с и прячется)
 *  - offline → "📵 Офлайн — изменения сохранятся и отправятся позже"
 *  - online + пустая очередь → ничего (баннер скрыт)
 *
 * Позиционируется fixed сверху, поверх sticky-шапок (zIndex высокий).
 * Сама подписывается на network-status и sync-engine — родителю не нужно
 * ничего прокидывать, просто отрендерить <OfflineBanner /> один раз.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(isOnline())
  const [syncing, setSyncing] = useState(false)
  const [justSyncedCount, setJustSyncedCount] = useState(null)
  const [pendingCount, setPendingCount] = useState(getQueueSize())

  const justSyncedTimer = useRef(null)

  useEffect(() => {
    const offNet = onNetworkChange((isOn) => {
      setOnline(isOn)
      // При смене статуса обновляем счётчик очереди
      setPendingCount(getQueueSize())
    })

    const offStart = onSyncEvent(SYNC_EVENTS.STARTED, () => {
      setSyncing(true)
      setJustSyncedCount(null)
    })

    const offDone = onSyncEvent(SYNC_EVENTS.DONE, (detail) => {
      setSyncing(false)
      setPendingCount(getQueueSize())
      const n = detail?.synced || 0
      if (n > 0) {
        setJustSyncedCount(n)
        if (justSyncedTimer.current) clearTimeout(justSyncedTimer.current)
        justSyncedTimer.current = setTimeout(() => setJustSyncedCount(null), 2500)
      }
    })

    const offFailed = onSyncEvent(SYNC_EVENTS.FAILED, (detail) => {
      setSyncing(false)
      setPendingCount(getQueueSize())
      // Часть могла уйти — если что-то синканулось, покажем коротко
      const n = detail?.synced || 0
      if (n > 0) {
        setJustSyncedCount(n)
        if (justSyncedTimer.current) clearTimeout(justSyncedTimer.current)
        justSyncedTimer.current = setTimeout(() => setJustSyncedCount(null), 2500)
      }
    })

    return () => {
      offNet()
      offStart()
      offDone()
      offFailed()
      if (justSyncedTimer.current) clearTimeout(justSyncedTimer.current)
    }
  }, [])

  // Решаем что показывать
  let content = null
  let bg = 'rgba(255, 140, 66, 0.95)' // оранжевый по умолчанию (оффлайн)

  if (syncing) {
    content = '🔄 Синхронизация...'
    bg = 'rgba(63, 162, 247, 0.95)' // синий
  } else if (justSyncedCount !== null) {
    content = `✅ Синхронизировано: ${justSyncedCount}`
    bg = 'rgba(158, 209, 83, 0.95)' // зелёный
  } else if (!online) {
    content = pendingCount > 0
      ? `📵 Офлайн · ${pendingCount} ${pluralChanges(pendingCount)} ждёт отправки`
      : '📵 Офлайн · изменения сохранятся локально'
    bg = 'rgba(255, 140, 66, 0.95)' // оранжевый
  }

  // Нечего показывать — баннер скрыт полностью (не занимает место)
  if (!content) return null

  return (
    <div style={{ ...styles.banner, background: bg }} aria-live="polite">
      <span style={styles.text}>{content}</span>
    </div>
  )
}

/**
 * "1 изменение", "2 изменения", "5 изменений"
 */
function pluralChanges(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'изменений'
  if (last === 1) return 'изменение'
  if (last >= 2 && last <= 4) return 'изменения'
  return 'изменений'
}

const styles = {
  banner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998, // ниже модалок (9999/10000), выше sticky-шапок (30) и частиц (200 — но баннер сверху по позиции)
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    paddingTop: 'max(8px, env(safe-area-inset-top))',
    minHeight: '34px',
    transition: 'background 0.3s ease',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)'
  },
  text: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 700,
    color: '#0D0C0C',
    letterSpacing: '0.3px',
    textAlign: 'center',
    lineHeight: 1.3
  }
}