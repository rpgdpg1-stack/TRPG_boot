/**
 * Сердечко — гладкое (без пикселизации), та же форма и толщина контура, что была
 * у пиксельного. Состояния: filled (залитое) и контур (незалитое).
 *
 *  - filled  — сплошная заливка цветом.
 *  - контур  — fill none + обводка (strokeWidth 2 в сетке 24 ≈ прежняя толщина).
 */
export default function HeartIcon({ filled = false, size = 18, color }) {
  const c = color || (filled ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.3)')
  const d = 'M12 20.8 C 6.2 16.4, 2.6 13.1, 2.6 8.7 C 2.6 5.8, 4.8 3.7, 7.5 3.7 C 9.2 3.7, 10.8 4.6, 12 6.1 C 13.2 4.6, 14.8 3.7, 16.5 3.7 C 19.2 3.7, 21.4 5.8, 21.4 8.7 C 21.4 13.1, 17.8 16.4, 12 20.8 Z'

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path
        d={d}
        fill={filled ? c : 'none'}
        stroke={c}
        strokeWidth={filled ? 0 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
