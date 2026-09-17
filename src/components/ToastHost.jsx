import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Toast from './Toast'
import { EVENTS, on } from '../lib/events'

/**
 * Один держатель тостов на приложение (живёт в App).
 *
 * Место — низ по центру, над таб-баром: снизу его видно, и он не закрывает ни
 * шапку, ни то, с чем человек только что работал. Тост НЕ ловит касания
 * (pointer-events: none) — он сообщает, а не требует действия.
 *
 * Держатель общий именно потому, что подтверждение часто нужно уже на ДРУГОМ
 * экране: «Сохранить» в конструкторе уводит назад, и локальный тост уехал бы
 * вместе со страницей.
 */
const TOAST_MS = 1800

export default function ToastHost() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    const off = on(EVENTS.TOAST, (e) => {
      setToast(e.detail)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setToast(null), TOAST_MS)
    })
    return () => { off(); clearTimeout(timer.current) }
  }, [])

  if (!toast) return null

  return createPortal(
    <div style={styles.wrap}>
      <Toast key={toast.nonce} tone={toast.tone || 'success'} style={styles.toast}>
        {toast.text}
      </Toast>
    </div>,
    document.body
  )
}

const styles = {
  wrap: {
    position: 'fixed', left: 0, right: 0,
    bottom: 'calc(var(--tabbar-height) + var(--tabbar-bottom) + var(--space-4))',
    display: 'flex', justifyContent: 'center',
    zIndex: 'var(--z-banner)', pointerEvents: 'none'
  },
  toast: { animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) both' }
}
