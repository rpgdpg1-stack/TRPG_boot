/**
 * Бегущая обводка по периметру карточки на время анимации замены упражнения.
 * Чистая графика без состояния — держать её в файле экрана незачем.
 */
export default function SwapAnimationOverlay() {
  const W = 700
  const H = 150
  const R = 33

  const path = `
    M ${W / 2} 0
    H ${W - R}
    A ${R} ${R} 0 0 1 ${W} ${R}
    V ${H - R}
    A ${R} ${R} 0 0 1 ${W - R} ${H}
    H ${R}
    A ${R} ${R} 0 0 1 0 ${H - R}
    V ${R}
    A ${R} ${R} 0 0 1 ${R} 0
    Z
  `.trim()

  const PERIMETER = 2 * (W + H) - 8 * R + 2 * Math.PI * R
  const SEGMENT = PERIMETER * 0.14

  return (
    <div style={overlayStyles.wrap} aria-hidden="true">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={overlayStyles.svg}
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{
            strokeDasharray: `${SEGMENT} ${PERIMETER}`,
            filter: 'drop-shadow(0 0 6px rgba(158, 209, 83, 0.7))',
            animation: 'snakeRun 2.4s cubic-bezier(0.45, 0, 0.55, 1) forwards'
          }}
        />
      </svg>

      <style>{`
        @keyframes snakeRun {
          0%   { stroke-dashoffset: 0; opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
          100% { stroke-dashoffset: -${PERIMETER}; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

const overlayStyles = {
  wrap: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 10
  },
  svg: {
    width: '100%',
    height: '100%',
    overflow: 'visible'
  }
}

/**
 * Скелетон карточки упражнения на время загрузки — повторяет силуэт реальной
 * карточки (картинка + строки), мягкий shimmer (класс .skel). Убирает «прыжок»
 * контента при подгрузке.
 */
