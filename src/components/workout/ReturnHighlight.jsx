/**
 * Подсветка карточки, к которой вернулись с экрана упражнения/замены —
 * короткая вспышка, чтобы глаз нашёл нужную строку без поиска.
 * Вынесено из WorkoutDay: файл разросся до 2300 строк и любая правка там
 * задевала соседнюю логику.
 */
export default function ReturnHighlight() {
  return <div style={glowStyles.wrap} aria-hidden="true" />
}

const glowStyles = {
  // «Недавно тронутое»: светло-серая заливка ВСЕЙ карточки (как закреплённый друг),
  // плавно появляется и затухает. Без обводки/свечения/пресс-эффекта.
  wrap: {
    position: 'absolute',
    inset: 0,
    borderRadius: 'var(--radius-card)',
    background: 'var(--highlight-recent)',
    pointerEvents: 'none',
    animation: 'returnGlowFade 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
    zIndex: 9
  }
}

/**
 * Анимация "змейки" — один зелёный сегмент-полоса проходит по контуру
 * карточки по часовой стрелке ровно один круг и исчезает.
 */
