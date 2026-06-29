import { getFrameByRankIndex } from '../lib/frames'

/**
 * Аватар в рамке ранга — единый компонент для профиля, списков друзей/рейтинга
 * и модалок. Внутрь передаётся содержимое (фото/буква-заглушка) через children.
 *
 * Главное правило: рамка (обводка + свечение) НЕ влияет на фото.
 *  - Толщина обводки ПОСТОЯННА (фото не «дышит»). Пульсирует только свечение
 *    снаружи (box-shadow: glow + кольцо), оно растёт наружу и не трогает контент.
 *  - Цвет обводки задаём inline (frame.color) — иначе inline-shorthand `border`
 *    сбрасывал бы цвет в currentColor (белый) и перебивал бы класс.
 *  - Легенда (9): conic-обводка живёт в CSS-классе (frame-legend) — свой фон и
 *    border не задаём, иначе перебьют conic-градиент.
 *  - Бессмертный (10): сверху слой пепла (.imm-ash) внутри рамки.
 *
 * Анимация рангов 8/9/10 — в index.css (frame-titan/legend/immortal). Ранги 0–7
 * получают статичную обводку цветом ранга (+ мягкое свечение, если glow).
 */
export default function RankFrame({
  rankIndex,
  size,
  radius,
  borderWidth = 2,
  background = 'var(--color-card)',
  glow = false,
  style,
  children
}) {
  const frame = getFrameByRankIndex(rankIndex)

  const box = {
    position: 'relative',
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: radius,
    overflow: 'hidden',
    boxSizing: 'border-box',
    background,
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
    ...style
  }

  if (frame.className === 'frame-legend') {
    // conic-обводка из CSS — свой фон перебил бы её
    delete box.background
  } else {
    // border-shorthand ставим ДО borderColor, чтобы цвет (longhand) выиграл
    box.border = `${borderWidth}px solid`
    box.borderColor = frame.color
    // Статичное свечение — только для неанимированных рангов (0–7); у 8/9/10
    // свечение даёт сама CSS-анимация, inline его не задаём (не конфликтуем).
    if (!frame.animated && glow) {
      box.boxShadow = `0 0 14px ${frame.color}40`
    }
  }

  return (
    <div className={frame.className} style={box}>
      {children}
      {frame.hasAsh && <span className="imm-ash"><i /><i /><i /><i /></span>}
    </div>
  )
}
