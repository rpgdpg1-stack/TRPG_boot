// Единый скруглённый шеврон (iOS-стиль): мягкий угол, круглые концы, ровная толщина.
// По умолчанию смотрит ВНИЗ; поворот (вверх/вправо) — transform:rotate у родителя.
export default function ChevronIcon({ size = 16, color = 'currentColor', width = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9.5 L12 15.5 L18 9.5"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
