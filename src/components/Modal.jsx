import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../lib/use-scroll-lock'
import CloseCross from './CloseCross'

/**
 * Единая модалка проекта. До неё оверлей копировался в 25 файлов, каждый раз
 * чуть по-своему: пять прозрачностей фона, два блюра, три радиуса панели, две
 * тени — и, главное, блокировка фона стояла лишь в 4 модалках из 15.
 *
 * Что берёт на себя:
 *  · портал в body и затемнение `--overlay-scrim` с блюром;
 *  · ЗАМОРОЗКУ фона (`useScrollLock`) — без неё страница под модалкой едет,
 *    когда палец попадает мимо прокручиваемой области. CSS `overscroll-behavior`
 *    эту дыру не закрывает: если контент помещается на экран, жест уходит
 *    странице. Поэтому хук обязателен, а не «по желанию»;
 *  · прокрутку ВНУТРИ панели (длинный список не тянет за собой экран);
 *  · закрытие тапом мимо панели и крестик под ней;
 *  · анимации появления (общие keyframes).
 *
 * @param onClose    — закрыть (тап мимо панели / крестик)
 * @param size       — 'md' (панель до 360px по центру) | 'full' (во всю ширину)
 * @param closeCross — показать крестик под панелью (по умолчанию да)
 * @param panelStyle / overlayStyle — точечные добивки, а не замена базы
 * @param bare       — только оверлей с заморозкой, без панели: для поповеров
 *                     и меню, которые рисуют свою геометрию сами
 */
export default function Modal({
  onClose,
  size = 'md',
  closeCross = true,
  panelStyle,
  overlayStyle,
  bare = false,
  children
}) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)

  const close = (e) => {
    e?.stopPropagation()
    onClose?.()
  }

  if (bare) {
    return createPortal(
      <div ref={overlayRef} style={{ ...s.overlay, ...s.bare, ...overlayStyle }} onClick={close}>
        {children}
      </div>,
      document.body
    )
  }

  return createPortal(
    <div ref={overlayRef} style={{ ...s.overlay, ...overlayStyle }} onClick={close}>
      <div
        style={{ ...s.panel, ...(size === 'full' ? s.panelFull : null), ...panelStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      {closeCross && <CloseCross onClose={onClose} style={{ marginTop: 'var(--space-4)' }} />}
    </div>,
    document.body
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    // Фон заморожен наглухо: сам оверлей не прокручивается и гасит жест —
    // прокрутка живёт только внутри панели.
    touchAction: 'none', overscrollBehavior: 'contain', overflow: 'hidden',
    padding: 'calc(env(safe-area-inset-top) + var(--space-6)) var(--space-5) calc(env(safe-area-inset-bottom) + var(--space-5))',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  // Поповеру нужна только заморозка фона — фон и блюр он рисует сам (или не рисует).
  bare: {
    background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none',
    display: 'block', padding: 0
  },
  panel: {
    position: 'relative', width: '100%', maxWidth: '360px',
    maxHeight: '100%', overflowY: 'auto', touchAction: 'pan-y', overscrollBehavior: 'contain',
    background: 'var(--surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-4)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
    boxShadow: 'var(--shadow-modal)',
    animation: 'menuPanelScaleIn 0.22s var(--ease-ios) forwards'
  },
  panelFull: { maxWidth: 'none' }
}
