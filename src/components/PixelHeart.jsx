/**
 * Пиксельное сердце. Используется:
 *  - в карточках программ (избранное) — filled когда в избранном
 *  - в заголовке "Избранное" на главной — filled если есть избранное
 *
 * Симметричное, ровные стыки пикселей. Рисуется в сетке 16x16.
 */
export default function PixelHeart({ filled = false, size = 22, color }) {
  const c = color || (filled ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.3)')

  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" style={{ flexShrink: 0 }}>
        {/* Верхние два бугорка */}
        <rect x="3" y="2" width="3" height="1" fill={c} />
        <rect x="10" y="2" width="3" height="1" fill={c} />
        <rect x="2" y="3" width="5" height="1" fill={c} />
        <rect x="9" y="3" width="5" height="1" fill={c} />
        {/* Срастаются в одно тело */}
        <rect x="2" y="4" width="12" height="1" fill={c} />
        <rect x="2" y="5" width="12" height="1" fill={c} />
        <rect x="2" y="6" width="12" height="1" fill={c} />
        {/* Сужение книзу */}
        <rect x="3" y="7" width="10" height="1" fill={c} />
        <rect x="4" y="8" width="8" height="1" fill={c} />
        <rect x="5" y="9" width="6" height="1" fill={c} />
        <rect x="6" y="10" width="4" height="1" fill={c} />
        <rect x="7" y="11" width="2" height="1" fill={c} />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" style={{ flexShrink: 0 }}>
      {/* Контур — верхние бугорки */}
      <rect x="3" y="2" width="3" height="1" fill={c} />
      <rect x="10" y="2" width="3" height="1" fill={c} />
      <rect x="2" y="3" width="1" height="1" fill={c} />
      <rect x="6" y="3" width="1" height="1" fill={c} />
      <rect x="9" y="3" width="1" height="1" fill={c} />
      <rect x="13" y="3" width="1" height="1" fill={c} />
      {/* Боковые стенки */}
      <rect x="2" y="4" width="1" height="3" fill={c} />
      <rect x="13" y="4" width="1" height="3" fill={c} />
      {/* Серединный стык впадины */}
      <rect x="7" y="4" width="2" height="1" fill={c} />
      {/* Скос книзу — левая и правая грани */}
      <rect x="3" y="7" width="1" height="1" fill={c} />
      <rect x="12" y="7" width="1" height="1" fill={c} />
      <rect x="4" y="8" width="1" height="1" fill={c} />
      <rect x="11" y="8" width="1" height="1" fill={c} />
      <rect x="5" y="9" width="1" height="1" fill={c} />
      <rect x="10" y="9" width="1" height="1" fill={c} />
      <rect x="6" y="10" width="1" height="1" fill={c} />
      <rect x="9" y="10" width="1" height="1" fill={c} />
      <rect x="7" y="11" width="2" height="1" fill={c} />
    </svg>
  )
}