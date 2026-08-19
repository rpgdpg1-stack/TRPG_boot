/**
 * Плей-треугольник со скруглёнными углами.
 *
 * Один на всё приложение: карточка программы (крупный, 28) и кнопка «Начать»
 * в дне тренировки (мелкий, 17). Раньше жил двумя одинаковыми копиями в этих
 * двух файлах — отличались только значением size по умолчанию.
 *
 * Скругление даёт не радиус, а обводка тем же цветом (fill + round join):
 * у треугольника нет свойства «радиус угла», и рисовать его дугами пришлось бы
 * вручную.
 */
export default function PlayIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M8 5.6 L18 12 L8 18.4 Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
