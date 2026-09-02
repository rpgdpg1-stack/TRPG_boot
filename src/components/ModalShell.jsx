import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Оболочка модального окна — ОДНА на проект (DS-007).
 *
 * Раньше каждое всплывающее окно рисовало перекрытие само: портал, скрим,
 * заморозку фона, закрытие по тапу мимо. Четырнадцать мест, и в ЧЕТЫРЁХ из них
 * `useScrollLock` забыли (`AdoptExercisesModal`, `FriendInviteModal`,
 * `CustomExerciseForm`, меню браузера) — под открытой модалкой прокручивался
 * фон. Баг, который ищут долго, а причина одна: правило соблюдалось руками.
 *
 * Оболочка берёт на себя ТОЛЬКО каркас — содержимое у каждой модалки своё:
 *  - портал в `document.body` (иначе `overflow` родителя обрежет окно);
 *  - скрим `--overlay-scrim` с блюром и `--z-modal`;
 *  - заморозка фона через `useScrollLock` — без неё под окном едет страница;
 *  - тап мимо окна закрывает, тап по окну — нет (`stopPropagation`).
 *
 * Сводить сюда ВНЕШНИЙ ВИД окон не нужно: подтверждение, барабан, календарь
 * и лист упражнений выглядят по-разному намеренно. Общий здесь только каркас.
 *
 * <ModalShell onClose={close}>
 *   <div style={{ ... }}>содержимое</div>
 * </ModalShell>
 *
 * @param onClose   — закрыть (тап мимо окна). Не передан → тап мимо не закрывает.
 * @param align     — 'center' (по умолчанию) | 'bottom' — прижать окно к низу.
 * @param overlayStyle — доп. стили перекрытия (паддинги под конкретное окно).
 * @param contentStyle — доп. стили обёртки содержимого.
 */
export default function ModalShell({
  children,
  onClose,
  align = 'center',
  overlayStyle,
  contentStyle
}) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)

  return createPortal(
    <div
      ref={overlayRef}
      style={{
        ...styles.overlay,
        alignItems: align === 'bottom' ? 'flex-end' : 'center',
        ...overlayStyle
      }}
      onClick={onClose}
    >
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    display: 'flex', justifyContent: 'center',
    // Верхний отступ учитывает вырез: окно не должно уезжать под чёлку.
    padding: 'calc(env(safe-area-inset-top) + var(--space-8)) var(--space-5) var(--space-5)'
  }
}
