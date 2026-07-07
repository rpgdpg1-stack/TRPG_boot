/**
 * «Водяная» декорация — общий компонент для шапки заплыва и карточки заплыва в
 * избранном (один вид, не плодим захардкоженное). Рисует поверх РОДИТЕЛЯ (должен
 * быть `position:relative; overflow:hidden` + сам голубой стеклянный фон):
 *  - блик-волну слева-направо (анимация `poolShine`);
 *  - две боковые вертикальные гирлянды флажков (красный/белый), апексом влево,
 *    покачиваются ветром (`pennantSway`), обрезаются скруглением сверху/снизу;
 *  - опционально пунктирную дорожку по вертикальному центру (`dashes`).
 *
 * ВАЖНО: расстояние между флажками ФИКСИРОВАНО (gap), а не `space-around` — иначе
 * при сжатии/разной высоте зазор менялся. Флажки идут сверху вниз, лишние снизу
 * обрезаются overflow родителя. Так зазор одинаков на любой высоте.
 */

// Достаточно флажков на самую высокую карточку; лишние обрежет overflow.
const PENNANTS = Array.from({ length: 9 }, (_, i) => (i % 2 ? '#FFFFFF' : '#E84545'))

export default function WaterChrome({ dashes = false }) {
  const garland = (side) => (
    <div style={side === 'left' ? styles.garlandLeft : styles.garlandRight} aria-hidden="true">
      <div style={{ ...styles.stringVert, right: 0 }} />
      <div style={styles.col}>
        {PENNANTS.map((c, i) => (
          <span key={i} style={{ ...styles.pennant, borderRightColor: c, animationDelay: `${(i % 5) * 0.22}s` }} />
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div style={styles.wave} aria-hidden="true" />
      {garland('left')}
      {garland('right')}
      {dashes && <div style={styles.dashes} aria-hidden="true" />}
    </>
  )
}

const styles = {
  wave: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: '40%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)',
    animation: 'poolShine 3.7s linear infinite',
    pointerEvents: 'none',
    zIndex: 0
  },
  garlandLeft: {
    position: 'absolute', left: '2px', top: '-6px', bottom: '-6px', width: '11px',
    zIndex: 1, pointerEvents: 'none'
  },
  garlandRight: {
    position: 'absolute', right: '4px', top: '-6px', bottom: '-6px', width: '12px',
    zIndex: 1, pointerEvents: 'none'
  },
  stringVert: {
    position: 'absolute', top: 0, bottom: 0, width: '1px',
    background: 'rgba(255, 255, 255, 0.45)'
  },
  // Флажки прижаты к ниточке справа, идут СВЕРХУ ВНИЗ с ФИКС-зазором (gap).
  col: {
    position: 'absolute', right: '1px', top: 0, bottom: 0,
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
    alignItems: 'flex-end', gap: '13px'
  },
  // Флажок остриём ВЛЕВО: цветной правый бордер, база справа у ниточки.
  pennant: {
    flexShrink: 0,
    width: 0, height: 0,
    borderTop: '5px solid transparent',
    borderBottom: '5px solid transparent',
    borderRight: '8px solid #FFFFFF',
    transformOrigin: 'right center',
    animation: 'pennantSway 2.8s ease-in-out infinite'
  },
  dashes: {
    position: 'absolute',
    left: 0, right: 0,
    top: '50%',
    height: '2px',
    transform: 'translateY(-50%)',
    background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0 12px, transparent 12px 26px)',
    opacity: 0.7,
    zIndex: 0
  }
}
