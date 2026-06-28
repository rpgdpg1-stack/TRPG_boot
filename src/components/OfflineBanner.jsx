import { useEffect, useState, useRef } from 'react'
import { isOnline, onNetworkChange } from '../lib/network-status'
import { getQueueSize } from '../lib/offline-queue'
import { SYNC_EVENTS, onSyncEvent } from '../lib/sync-engine'
import UiIcon from './UiIcon'

/**
 * Пилюля статуса сети и синхронизации.
 *
 * Аккуратная капсула по центру над контентом (не плашка на всю ширину).
 * Внутри: наша SVG-иконка (цветная) + текст. Цветом меняется ТОЛЬКО иконка,
 * сама пилюля — нейтральная серо-тёмная.
 *
 * Состояния (приоритет сверху вниз):
 *  - syncing    → cloud_sync,  иконка синяя,    "Синхронизация"
 *  - justSynced → cloud_done,  иконка зелёная,  "Синхронизировано N" (~2.5с)
 *  - offline    → network_off, иконка красная,  "Офлайн" (+ счётчик очереди)
 *  - online + пустая очередь → ничего (пилюля скрыта)
 *
 * Позиционируется fixed по центру сверху, с отступом 16px от системной зоны
 * Telegram — одинаково на всех экранах. zIndex ниже модалок, выше шапок.
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

  // Определяем что показывать: иконка (имя SVG), её цвет и текст.
  let iconName = null
  let iconColor = null
  let text = null
  let spin = false

  if (syncing) {
    iconName = 'cloud_sync'
    iconColor = '#3FA2F7'   // синий
    text = 'Синхронизация'
    spin = true
  } else if (justSyncedCount !== null) {
    iconName = 'cloud_done'
    iconColor = '#9ED153'   // зелёный
    text = `Синхронизировано: ${justSyncedCount}`
  } else if (!online) {
    iconName = 'network_off'
    iconColor = '#E84545'   // красный
    text = pendingCount > 0
      ? `Офлайн · ${pendingCount} ${pluralChanges(pendingCount)}`
      : 'Офлайн'
  }

  // Нечего показывать — пилюля скрыта полностью
  if (!iconName) return null

  return (
    <div style={styles.wrap} aria-live="polite">
      <div style={styles.pill}>
        <span style={{
          ...styles.iconWrap,
          animation: spin ? 'offlineIconSpin 1.2s linear infinite' : 'none'
        }}>
          <UiIcon name={iconName} size={16} color={iconColor} />
        </span>
        <span style={styles.text}>{text}</span>
      </div>

      <style>{`
        @keyframes offlinePillIn {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes offlineIconSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function pluralChanges(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'изменений'
  if (last === 1) return 'изменение'
  if (last >= 2 && last <= 4) return 'изменения'
  return 'изменений'
}

const styles = {
  // Контейнер во всю ширину, центрирует пилюлю. Пилюлю опускаем в 16px-отступ
  // между системными кнопками Telegram и контентом: её ЦЕНТР — в середине этого
  // отступа (низ зоны --tg-safe-top минус 8px), translateY(-50%) центрирует по высоте.
  wrap: {
    position: 'fixed',
    top: 'calc(var(--tg-safe-top) - 8px)',
    transform: 'translateY(-50%)',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',  // пилюля не перехватывает тапы по контенту под ней
    zIndex: 9998
  },
  // Сама пилюля — нейтральная серо-тёмная с блюром, цветная только иконка.
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 14px 7px 11px',
    background: 'rgba(34, 34, 34, 0.92)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '999px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
    animation: 'offlinePillIn 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  iconWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    flexShrink: 0
  },
  text: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap'
  }
}