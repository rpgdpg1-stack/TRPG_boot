import { useEffect, useRef, useState } from 'react'

/**
 * Вспышка изменения веса — общая механика для карточки упражнения (ExerciseCard)
 * и модалки долгого нажатия (ExerciseActionMenu).
 *
 * Число веса по умолчанию — в АКЦЕНТНОМ цвете основной группы (colors.accent),
 * как исторически (быстрое считывание). Изменение веса (после blur/Enter) даёт
 * КОРОТКУЮ вспышку ~2с, затем цвет возвращается к цвету группы:
 *  - ПОВЫШЕНИЕ (новое > старого) → слева зелёная стрелка ↑ + число зеленеет
 *    (--color-primary), с лёгким «подъёмом» стрелки (keyframes weightRaiseArrow).
 *  - ПОНИЖЕНИЕ (новое < старого) → слева стрелка ↓ + число В ЦВЕТЕ ГРУППЫ, но
 *    ПРИГЛУШЁННЫЕ до WEIGHT_DOWN_OPACITY (~45%) — читается как «сероватый акцент»,
 *    БЕЗ яркой анимации, мягкое появление (keyframes weightLowerArrow).
 * Равный/0 — без вспышки. Ничего не хранится.
 *
 * Хук: `trigger('up'|'down')`, `flash` ('up'|'down'|null), `colorFor(accent)`
 * (цвет числа) и `arrowFor(accent)` (готовая стрелка).
 */

// Транзишен числа — мягкий переход цвета и прозрачности к/от состояния группы.
export const WEIGHT_COLOR_TRANSITION = 'color 0.4s ease, opacity 0.4s ease'
// Понижение: акцент группы, приглушённый до ~45% (похоже на серый).
export const WEIGHT_DOWN_OPACITY = 0.45

const FLASH_MS = 2000 // стрелка + состояние держатся ~2с

export function useWeightRaiseFlash() {
  const [flash, setFlash] = useState(null) // 'up' | 'down' | null
  const [arrowNonce, setArrowNonce] = useState(0) // >0 = стрелка в DOM; ремаунт по значению
  const timersRef = useRef([])
  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  // dir: 'up' (повышение) | 'down' (понижение).
  const trigger = (dir = 'up') => {
    timersRef.current.forEach(clearTimeout)
    setFlash(dir)
    setArrowNonce(n => n + 1) // новый key → анимация перезапускается при повторе
    timersRef.current = [
      setTimeout(() => setFlash(null), FLASH_MS),
      setTimeout(() => setArrowNonce(0), FLASH_MS)
    ]
  }

  return {
    trigger,
    flash,
    // Цвет числа: повышение — зелёный; иначе (понижение/покой) — цвет группы
    // (понижение отличается прозрачностью, её накидывает компонент по `flash`).
    colorFor: (accent) => flash === 'up' ? 'var(--color-primary)' : accent,
    arrowFor: (accent) => arrowNonce > 0 ? <FlashArrow key={arrowNonce} dir={flash} accent={accent} /> : null
  }
}

/** Стрелка изменения слева от числа веса (по высоте цифры). Анимация в index.css. */
function FlashArrow({ dir, accent }) {
  const down = dir === 'down'
  return (
    <span
      style={{
        ...arrowStyles.wrap,
        color: down ? accent : 'var(--color-primary)',
        animation: `${down ? 'weightLowerArrow' : 'weightRaiseArrow'} 2s ease forwards`
      }}
      aria-hidden="true"
    >
      <svg width="12" height="15" viewBox="0 0 12 15" fill="none">
        <path
          d={down ? 'M6 2 V12.5 M2.2 9 L6 12.8 L9.8 9' : 'M6 13 V2.5 M2.2 6 L6 2.2 L9.8 6'}
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

const arrowStyles = {
  wrap: {
    position: 'absolute',
    right: '100%',
    top: '50%',
    transform: 'translateY(-50%)', // база; для ↑ keyframes добавляют лёгкий подъём
    marginRight: '3px',
    display: 'flex',
    lineHeight: 0,
    pointerEvents: 'none'
  }
}
