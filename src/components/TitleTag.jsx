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
          fontFamily: 'var(--font-tiny5)',
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

      {/* Пиксели — 4 штуки, вылетают редко по очереди */}
      <span className="title-pixels" aria-hidden="true">
        <i style={{ background: color, left: '10%', animationDelay: '0s' }} />
        <i style={{ background: color, left: '38%', animationDelay: '1.4s' }} />
        <i style={{ background: color, left: '62%', animationDelay: '2.8s' }} />
        <i style={{ background: color, left: '85%', animationDelay: '4.2s' }} />
      </span>

      <style>{`
        .title-pixels {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .title-pixels i {
          position: absolute;
          top: 30%;
          width: 2.5px;
          height: 2.5px;
          border-radius: 1px;
          opacity: 0;
          animation: titlePixelFloat 5.6s ease-out infinite;
        }
        @keyframes titlePixelFloat {
          0%   { opacity: 0; transform: translate(0, 0) scale(1); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translate(2px, -12px) scale(0.3); }
        }
        @media (prefers-reduced-motion: reduce) {
          .title-pixels i { animation: none; opacity: 0; }
        }
      `}</style>
    </span>
  )
}