import { useEffect, useRef, useState } from 'react'

/**
 * Вспышка «повысил вес» — общая механика для карточки упражнения (ExerciseCard)
 * и модалки долгого нажатия (ExerciseActionMenu).
 *
 * Число веса по умолчанию — в АКЦЕНТНОМ цвете основной группы (colors.accent),
 * как и было исторически (быстрое считывание, привычный вид). Повышение веса
 * (новое > старого, после blur/Enter) даёт КОРОТКУЮ вспышку прогресса: слева от
 * числа появляется зелёная стрелка ↑ и само число зеленеет (--color-primary) на
 * ~2с, затем автоматически возвращается к цвету группы. Ничего не хранится —
 * ощущение прогресса яркое, но экран не захламляется.
 *
 * Хук возвращает `active` (идёт ли вспышка) — цвет числа выбирает компонент:
 * active ? var(--color-primary) : colors.accent. Понижение/равный/0 — без вспышки.
 */

// Транзишен цвета цифры — мягкий возврат зелёного к цвету группы.
export const WEIGHT_COLOR_TRANSITION = 'color 0.4s ease'

const FLASH_MS = 2000 // зелёная стрелка + зелёное число держатся ~2с

export function useWeightRaiseFlash() {
  const [active, setActive] = useState(false)
  const [arrowNonce, setArrowNonce] = useState(0) // >0 = стрелка в DOM; ремаунт по значению
  const timersRef = useRef([])
  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const trigger = () => {
    timersRef.current.forEach(clearTimeout)
    setActive(true)
    setArrowNonce(n => n + 1) // новый key → анимация перезапускается при повторном повышении
    timersRef.current = [
      setTimeout(() => setActive(false), FLASH_MS),
      setTimeout(() => setArrowNonce(0), FLASH_MS)
    ]
  }

  return {
    trigger,
    active,
    arrow: arrowNonce > 0 ? <RaiseArrow key={arrowNonce} /> : null
  }
}

/** Зелёная стрелка ↑ слева от числа веса (по высоте цифры). Анимация в index.css. */
function RaiseArrow() {
  return (
    <span style={arrowStyles.wrap} aria-hidden="true">
      <svg width="12" height="15" viewBox="0 0 12 15" fill="none">
        <path
          d="M6 13 V2.5 M2.2 6 L6 2.2 L9.8 6"
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
    marginRight: '3px',
    display: 'flex',
    lineHeight: 0,
    color: 'var(--color-primary)',
    pointerEvents: 'none',
    animation: 'weightRaiseArrow 2s ease forwards'
  }
}
