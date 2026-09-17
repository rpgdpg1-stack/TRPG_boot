/**
 * Плей-треугольник со скруглёнными углами (моно-иконка).
 *
 * Источник формы — src/assets/ui/play.svg, рендер через общий UiIcon
 * (единый способ для всех иконок-картинок: цвет через currentColor).
 * Один на всё приложение: карточка программы (крупный) и кнопка «Начать».
 */
import UiIcon from './UiIcon'

export default function PlayIcon({ size = 24, color = 'currentColor' }) {
  return <UiIcon name="play" size={size} color={color} />
}
