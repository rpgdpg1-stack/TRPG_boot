import PixelHeart from './PixelHeart'

/**
 * Онбординг-иллюстрация «как добавить в избранное»: мини-карточка программы с
 * «⋯» в углу и раскрытым из него меню с пунктом «Добавить в избранное». Чисто
 * картинка (без нажатий) — показывается в пустом избранном на главной
 * (Home.favEmpty) и в списке избранного (FavoritesList.EmptyCard).
 */
export default function FavHint() {
  return (
    <div style={styles.wrap} aria-hidden="true">
      {/* Мини-карточка программы; «⋯» в правом верхнем углу */}
      <div style={styles.card}>
        <span style={styles.emoji}>💪</span>
        <div style={styles.lines}>
          <span style={{ ...styles.line, width: '62%' }} />
          <span style={{ ...styles.line, width: '40%', opacity: 0.5 }} />
        </div>
        <span style={styles.dots}>⋯</span>
      </div>

      {/* Раскрытое из «⋯» меню — пункт «Добавить в избранное» */}
      <div style={styles.menu}>
        <span style={styles.menuHeart}><PixelHeart filled={false} size={14} /></span>
        <span style={styles.menuLabel}>Добавить в избранное</span>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    position: 'relative',
    width: '100%',
    maxWidth: '232px',
    margin: '0 auto',
    height: '92px',
    pointerEvents: 'none'
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '10px 12px',
    height: '54px',
    background: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '16px'
  },
  emoji: { fontSize: '18px', lineHeight: 1, flexShrink: 0 },
  lines: { display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: 0 },
  line: { height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.18)' },
  dots: {
    position: 'absolute',
    top: '3px',
    right: '11px',
    color: '#9A9A9A',
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '1px'
  },
  menu: {
    position: 'absolute',
    top: '40px',
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '9px 12px',
    background: 'rgba(28, 28, 30, 0.94)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '14px',
    boxShadow: '0 10px 26px rgba(0,0,0,0.5)'
  },
  menuHeart: { display: 'inline-flex', flexShrink: 0 },
  menuLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap'
  }
}
