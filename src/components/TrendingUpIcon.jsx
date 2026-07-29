/**
 * Иконка «прогресс/рост» (Material trending_up) — ломаная со стрелкой вверх.
 * Общая: меню упражнения (вход в график веса) и заголовок «Мой прогресс» на главной.
 */
export default function TrendingUpIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
    </svg>
  )
}
