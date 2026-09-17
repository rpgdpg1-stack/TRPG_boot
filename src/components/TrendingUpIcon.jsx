/**
 * Иконка «прогресс/рост» (моно-иконка, Material trending_up). Источник —
 * src/assets/ui/trending-up.svg, рендер через UiIcon. Общая: меню упражнения
 * (вход в график веса) и заголовок «Мой прогресс» на главной.
 */
import UiIcon from './UiIcon'

export default function TrendingUpIcon({ size = 20, color = 'currentColor' }) {
  return <UiIcon name="trending-up" size={size} color={color} />
}
