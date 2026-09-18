/**
 * Кружок-спиннер — ОДИН на проект.
 *
 * Незамкнутая дуга с круглыми концами, вращается равномерно (класс `ptr-spin`).
 * Цвет наследуется от родителя (`currentColor`) — внутри кнопки становится
 * цветом её текста, отдельных правил на каждый вариант не нужно.
 *
 * По правилам нашей иконографики: обводка и радиус ПРОПОРЦИОНАЛЬНЫ размеру
 * (не фиксированные), и у кольца есть safe-zone — оно не упирается в край
 * бокса, как и глифы иконок. Поэтому спиннер одинаково аккуратен и на 18
 * (маленькая/средняя кнопка), и на 24 (большая).
 *
 * Не «Загрузка…» текстом: слово удлиняет кнопку и меняет её ширину, а кружок
 * занимает ровно центр и ничего не двигает.
 */
export default function Spinner({ size = 22, stroke }) {
  const sw = stroke ?? +(size * 0.11).toFixed(2) // обводка ~11% размера: 24→2.6, 18→2.0
  const pad = size * 0.1                          // safe-zone: кольцо не в край бокса
  const r = (size - sw) / 2 - pad
  const c = 2 * Math.PI * r
  return (
    <span className="ptr-spin" style={{ display: 'inline-flex', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
          /* Показываем 28% окружности — как у индикатора потягивания. */
          strokeDasharray={c} strokeDashoffset={c * 0.72}
        />
      </svg>
    </span>
  )
}
