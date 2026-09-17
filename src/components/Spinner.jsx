/**
 * Кружок-спиннер — ОДИН на проект.
 *
 * Тот же вид, что у индикатора потягивания экрана («Друзья»): незамкнутая дуга
 * с круглыми концами, вращается равномерно (класс `ptr-spin`). Цвет наследуется
 * от родителя (`currentColor`) — внутри кнопки он сам становится цветом её
 * текста, и отдельных правил на каждый вариант кнопки не нужно.
 *
 * Не «Загрузка…» текстом: слово удлиняет кнопку и меняет её ширину, а кружок
 * занимает ровно центр и ничего не двигает.
 */
export default function Spinner({ size = 22, stroke = 2.4 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="ptr-spin" style={{ display: 'inline-flex', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          /* Показываем 28% окружности — как у индикатора потягивания. */
          strokeDasharray={c} strokeDashoffset={c * 0.72}
        />
      </svg>
    </span>
  )
}
