/**
 * Титул Бессмертного под именем: «#1» / «#2» / «#3» с цветом по достоинству
 * и редкими вылетающими пикселями в тон.
 *
 * Цвета: #1 золото, #2 серебро, #3 бронза.
 *
 * Рисуется ТОЛЬКО когда вызывающий уже проверил, что титул надет и валиден
 * (игрок на Бессмертном + титул открыт). Сам по себе ничего не проверяет —
 * получает готовое place (1/2/3). Если place невалидный — null.
 *
 * Пиксели: 4 штуки вылетают из области цифры, редко, по очереди
 * (анимация titlePixelFloat объявлена локально). transform/opacity — лёгкие.
 */

const TITLE_COLORS = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32'
}

export default function TitleTag({ place, size = 15 }) {
  const p = Number(place)
  if (![1, 2, 3].includes(p)) return null

  const color = TITLE_COLORS[p]

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: `${size}px`,
          letterSpacing: '1.5px',
          color,
          lineHeight: 1,
          position: 'relative',
          zIndex: 1
        }}
      >
        #{p}
      </span>

      {/* Пиксели — 4 штуки, вылетают редко по очереди.
          Стили .title-pixels и keyframes titlePixelFloat — в index.css. */}
      <span className="title-pixels" aria-hidden="true">
        <i style={{ background: color, left: '10%', animationDelay: '0s' }} />
        <i style={{ background: color, left: '38%', animationDelay: '1.4s' }} />
        <i style={{ background: color, left: '62%', animationDelay: '2.8s' }} />
        <i style={{ background: color, left: '85%', animationDelay: '4.2s' }} />
      </span>
    </span>
  )
}