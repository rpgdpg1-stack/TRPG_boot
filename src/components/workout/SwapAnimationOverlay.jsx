import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Бегущая обводка по периметру карточки на время анимации замены упражнения.
 * Чистая графика без состояния — держать её в файле экрана незачем.
 *
 * viewBox строится по РЕАЛЬНОМУ размеру карточки (замер перед отрисовкой).
 * Раньше стояла фикс-сетка 700×150 + `preserveAspectRatio="none"`: SVG тянуло
 * по осям неравномерно, и круглые углы превращались в эллипсы — линия шла по
 * скруглениям не по форме карточки.
 */
// Радиус берём У САМОГО ТОКЕНА, а не копией числа: змейка обязана идти ровно по
// краю карточки, а копия однажды уже разошлась с ней (карточка стала 40, змейка
// осталась на 33 и срезала углы).
const FALLBACK_RADIUS = 40

function cardRadius() {
  if (typeof window === 'undefined') return FALLBACK_RADIUS
  const v = getComputedStyle(document.documentElement).getPropertyValue('--radius-day-card')
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : FALLBACK_RADIUS
}

export default function SwapAnimationOverlay() {
  const wrapRef = useRef(null)
  const [box, setBox] = useState(null)
  const [radius, setRadius] = useState(FALLBACK_RADIUS)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height })
    setRadius(cardRadius())
  }, [])

  if (!box) return <div ref={wrapRef} style={overlayStyles.wrap} aria-hidden="true" />

  const W = box.w
  const H = box.h
  const R = Math.min(radius, W / 2, H / 2)

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
    <div ref={wrapRef} style={overlayStyles.wrap} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} style={overlayStyles.svg}>
        <path
          d={path}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{
            strokeDasharray: `${SEGMENT} ${PERIMETER}`,
            filter: 'drop-shadow(0 0 6px var(--accent-strong))',
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
