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
 *
 * filled (bool) — та же контурная иконка (muscles-line), но с заливкой внутри
 * (muscles-fill). Именно та же, а не отдельная «сплошная» muscles: у неё другая
 * геометрия — тоньше линия, другой силуэт, — и при переключении таба значок
 * заметно менялся в форме, а не просто наливался цветом.
 */
export default function MuscleIcon({ size = 16, color, earned = true, flex = false, flexTrigger = 0, filled = false, style }) {
  const finalColor = color || (earned ? 'var(--color-icon-muscle)' : 'var(--color-text-secondary)')

  // Анимация "флекса" — та же что на лоадере (flexBiceps): лёгкий поворот,
  // подъём и увеличение. flex=true → зацикленно раз в 15 сек. flexTrigger
  // (меняется при тапе) → разовое проигрывание.
  return (
    <span
      key={`flex-${flexTrigger}`}
      style={{
        display: 'inline-flex',
        // Вращение вокруг плеча (низ-лево) — плечо на месте, локоть/кулак вверх.
        transformOrigin: '20% 90%',
        animation: flexTrigger
          ? 'muscleFlexOnce 0.7s ease-in-out'
          : flex
            ? 'muscleFlexLoop 15s ease-in-out infinite'
            : 'none',
        ...style
      }}
    >
      <UiIcon name={filled ? 'muscles-fill' : 'muscles-line'} size={size} color={finalColor} />
      <style>{`
        @keyframes muscleFlexOnce {
          0%   { transform: rotate(0deg) scale(1); }
          45%  { transform: rotate(9deg) scale(1.22); }
          55%  { transform: rotate(9deg) scale(1.22); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes muscleFlexLoop {
          0%, 88%, 100% { transform: rotate(0deg) scale(1); }
          93%  { transform: rotate(9deg) scale(1.22); }
          96%  { transform: rotate(9deg) scale(1.22); }
        }
      `}</style>
    </span>
  )
}