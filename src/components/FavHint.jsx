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
    maxWidth: '224px',
    margin: '0 auto',
    height: '60px',
    pointerEvents: 'none'
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 11px',
    height: '40px',
    background: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '13px'
  },
  emoji: { fontSize: '15px', lineHeight: 1, flexShrink: 0 },
  lines: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 },
  line: { height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.18)' },
  dots: {
    position: 'absolute',
    top: '1px',
    right: '10px',
    color: '#9A9A9A',
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '1px'
  },
  menu: {
    position: 'absolute',
    top: '27px',
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 10px',
    background: 'rgba(28, 28, 30, 0.94)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    boxShadow: '0 8px 22px rgba(0,0,0,0.5)'
  },
  menuHeart: { display: 'inline-flex', flexShrink: 0 },
  menuLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap'
  }
}
