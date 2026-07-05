import { useEffect, useRef, useState } from 'react'

/**
 * Вспышка «повысил вес» — общая механика для карточки упражнения (ExerciseCard)
 * и модалки долгого нажатия (ExerciseActionMenu).
 *
 * Правило: цветом кодируем ТОЛЬКО факт «только что поднял вес». Число веса всегда
 * нейтральное (WEIGHT_NEUTRAL_COLOR — мягкий белый, как название упражнения).
 * При повышении (новое > старого, после blur/Enter): слева от числа проявляется
 * зелёная стрелка ↑, само число зеленеет (--color-primary); ~2с держится, затем
 * стрелка и зелёный ГАСНУТ ВМЕСТЕ → число возвращается в нейтральный.
 * Понижение / равный / 0 / первый раз — никакой индикации. НИЧЕГО не храним:
 * чисто мгновенная реакция, живёт в состоянии компонента.
 */

export const WEIGHT_NEUTRAL_COLOR = '#F0F0F0'
// Транзишен цвета цифры — гаснет синхронно с хвостом анимации стрелки.
export const WEIGHT_COLOR_TRANSITION = 'color 0.45s ease'

const FLASH_TOTAL_MS = 2500        // стрелка: полный цикл анимации (fade-out на 82→100%)
const GREEN_FADE_START_MS = 2050   // зелёный начинает гаснуть тут (0.45s → закончат вместе)

export function useWeightRaiseFlash() {
  const [green, setGreen] = useState(false)
  const [arrowNonce, setArrowNonce] = useState(0) // >0 = стрелка в DOM; ремаунт по значению
  const timersRef = useRef([])
  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const trigger = () => {
    timersRef.current.forEach(clearTimeout)
    setGreen(true)
    setArrowNonce(n => n + 1) // новый key → анимация перезапускается даже при повторном повышении
    timersRef.current = [
      setTimeout(() => setGreen(false), GREEN_FADE_START_MS),
      setTimeout(() => setArrowNonce(0), FLASH_TOTAL_MS)
    ]
  }

  return {
    trigger,
    color: green ? 'var(--color-primary)' : WEIGHT_NEUTRAL_COLOR,
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
    animation: 'weightRaiseArrow 2.5s ease forwards'
  }
}
