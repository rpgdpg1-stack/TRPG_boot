import { useEffect, useState, useRef } from 'react'
import { isOnline, onNetworkChange } from './network-status'
import { getQueueSize } from './offline-queue'
import { SYNC_EVENTS, onSyncEvent } from './sync-engine'
import { EVENTS, on } from './events'
import { isAuthBroken } from './session'

/**
 * Состояние плашки статуса сети — общий источник для ДВУХ компонентов:
 * `OfflineBanner` (что рисовать) и `ScreenTitle` (прятать ли заголовок).
 *
 * Оба сидят в одном месте экрана — на линии системных кнопок Telegram, — и
 * должны меняться синхронно: заголовок затухает ровно тогда, когда проявляется
 * плашка. Держать эту логику в двух местах нельзя: рассинхрон дал бы либо
 * наложение, либо пустую полосу.
 *
 * Возвращает `{ iconName, iconColor, text, spin }` либо `null`, когда показывать
 * нечего (онлайн и очередь пуста).
 *
 * Приоритет состояний: синхронизация → только что синхронизировано (~2.5с) →
 * офлайн → нет связи с сервером.
 *
 * Последнее состояние отдельное и важное: связь у телефона есть, а войти не
 * получилось (Telegram не смог обменять подпись на сессию — VPN, слабый
 * сигнал). Сервер тогда не узнаёт человека и на любой запрос отвечает
 * пустотой, поэтому экраны показывают сохранённые данные. Без плашки это
 * читалось как «заметки исчезли, вес обнулился».
 */
export function useNetworkBadge() {
  const [online, setOnline] = useState(isOnline())
  const [syncing, setSyncing] = useState(false)
  const [justSyncedCount, setJustSyncedCount] = useState(null)
  const [pendingCount, setPendingCount] = useState(getQueueSize())
  const [authBroken, setAuthBroken] = useState(isAuthBroken())

  const justSyncedTimer = useRef(null)

  useEffect(() => {
    const offNet = onNetworkChange((isOn) => {
      setOnline(isOn)
      setPendingCount(getQueueSize())
    })

    // Состояние входа: сорвался — покажем «Нет связи», восстановился — уберём.
    const offAuth = on(EVENTS.AUTH_STATE, () => setAuthBroken(isAuthBroken()))

    // Очередь пополнилась прямо сейчас (правка веса/заметки без сети).
    // Внимание: `on` из events.js отдаёт САМО событие, а `onSyncEvent` ниже —
    // уже развёрнутый detail. Контракты разные, поэтому здесь `e.detail`.
    const offQueue = on(EVENTS.QUEUE_CHANGED, (e) => {
      setPendingCount(e?.detail?.size ?? getQueueSize())
    })

    const offStart = onSyncEvent(SYNC_EVENTS.STARTED, () => {
      setSyncing(true)
      setJustSyncedCount(null)
    })

    const flashSynced = (detail) => {
      setSyncing(false)
      setPendingCount(getQueueSize())
      const n = detail?.synced || 0
      if (n > 0) {
        setJustSyncedCount(n)
        if (justSyncedTimer.current) clearTimeout(justSyncedTimer.current)
        justSyncedTimer.current = setTimeout(() => setJustSyncedCount(null), 2500)
      }
    }

    const offDone = onSyncEvent(SYNC_EVENTS.DONE, flashSynced)
    const offFailed = onSyncEvent(SYNC_EVENTS.FAILED, flashSynced)

    return () => {
      offNet()
      offAuth()
      offQueue()
      offStart()
      offDone()
      offFailed()
      if (justSyncedTimer.current) clearTimeout(justSyncedTimer.current)
    }
  }, [])

  if (syncing) {
    return { iconName: 'cloud_sync', iconColor: 'var(--cat-pool)', text: 'Синхронизация', spin: true }
  }
  if (justSyncedCount !== null) {
    return { iconName: 'cloud_done', iconColor: 'var(--color-primary)', text: `Синхронизировано: ${justSyncedCount}`, spin: false }
  }
  if (!online) {
    return {
      iconName: 'network_off',
      iconColor: 'var(--color-error)',
      text: pendingCount > 0 ? `Офлайн · ${pendingCount} ${pluralChanges(pendingCount)}` : 'Офлайн',
      spin: false
    }
  }
  if (authBroken) {
    return {
      iconName: 'network_off',
      iconColor: 'var(--color-error)',
      text: pendingCount > 0 ? `Нет связи · ${pendingCount} ${pluralChanges(pendingCount)}` : 'Нет связи',
      spin: false
    }
  }
  return null
}

function pluralChanges(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'изменений'
  if (last === 1) return 'изменение'
  if (last >= 2 && last <= 4) return 'изменения'
  return 'изменений'
}
