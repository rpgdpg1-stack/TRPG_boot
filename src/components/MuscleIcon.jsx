import UiIcon from './UiIcon'

/**
 * Иконка мускулов (бицепс) — замена эмодзи 💪 во всём приложении.
 * Файл лежит в src/assets/ui/muscles.svg, рендерится через UiIcon (currentColor).
 *
 * Цвет:
 *  - earned → бежевый #FADFBE
 *  - не earned → серый
 *  - или явный color (цвет ранга/лиги)
 *
 * flex (bool) — зацикленная анимация "сжатия" бицепса раз в 15 сек.
 * flexTrigger (любое значение) — при его смене проигрывает разовое сжатие
 * (например при тапе на прогресс-бар). Меняй значение чтобы триггернуть.
 */
export default function MuscleIcon({ size = 16, color, earned = true, flex = false, flexTrigger = 0, style }) {
  const finalColor = color || (earned ? '#FADFBE' : 'var(--color-text-secondary)')

  // Ключ для разового проигрывания при смене flexTrigger — пересоздаёт span,
  // CSS-анимация запускается заново.
  return (
    <span
      key={`flex-${flexTrigger}`}
      style={{
        display: 'inline-flex',
        transformOrigin: 'center 70%',
        animation: flexTrigger
          ? 'muscleFlexOnce 0.5s ease-in-out'
          : flex
            ? 'muscleFlexLoop 15s ease-in-out infinite'
            : 'none',
        ...style
      }}
    >
      <UiIcon name="muscles" size={size} color={finalColor} />
      <style>{`
        @keyframes muscleFlexLoop {
          0%, 92%, 100% { transform: scale(1); }
          95%  { transform: scale(0.82) translateY(1px); }
          98%  { transform: scale(1.04); }
        }
        @keyframes muscleFlexOnce {
          0%   { transform: scale(1); }
          45%  { transform: scale(0.82) translateY(1px); }
          75%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </span>
  )
}