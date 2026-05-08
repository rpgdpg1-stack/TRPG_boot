/**
 * Пиксельный чекбокс для daily quests.
 * Пустой — серая рамка-квадраты.
 * Заполненный — зелёная заливка с пиксельной галочкой.
 */
export default function PixelCheckbox({ checked = false, color = '#9ED153', size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      style={{
        flexShrink: 0,
        transition: 'transform 0.15s ease',
        transform: checked ? 'scale(1.05)' : 'scale(1)'
      }}
    >
      {/* РАМКА — квадратами по периметру */}
      <rect x="0" y="0" width="16" height="2" fill={checked ? color : 'rgba(255,255,255,0.25)'} />
      <rect x="0" y="14" width="16" height="2" fill={checked ? color : 'rgba(255,255,255,0.25)'} />
      <rect x="0" y="2" width="2" height="12" fill={checked ? color : 'rgba(255,255,255,0.25)'} />
      <rect x="14" y="2" width="2" height="12" fill={checked ? color : 'rgba(255,255,255,0.25)'} />

      {/* ЗАЛИВКА (только когда отмечен) */}
      {checked && (
        <rect x="2" y="2" width="12" height="12" fill={color} opacity="0.25" />
      )}

      {/* ПИКСЕЛЬНАЯ ГАЛОЧКА — только когда отмечен */}
      {checked && (
        <g fill={color}>
          {/* Левая палочка галочки (вниз-вправо) */}
          <rect x="3" y="7" width="2" height="2" />
          <rect x="5" y="9" width="2" height="2" />
          {/* Угол */}
          <rect x="7" y="9" width="2" height="2" />
          {/* Правая палочка (вверх-вправо) */}
          <rect x="9" y="7" width="2" height="2" />
          <rect x="11" y="5" width="2" height="2" />
        </g>
      )}
    </svg>
  )
}
