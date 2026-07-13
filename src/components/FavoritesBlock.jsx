import { formatFavoriteValue } from '../lib/favorite-exercises'

/**
 * Компактный блок «Любимые упражнения» для профиля (своего и друга).
 * items: [{ name, weight_kg }] — вес может быть null (не задан или скрыт приватностью).
 */
export default function FavoritesBlock({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={styles.card}>
      <div style={styles.title}>ЛЮБИМЫЕ УПРАЖНЕНИЯ</div>
      <div style={styles.list}>
        {items.map((f, i) => {
          const val = formatFavoriteValue(f.weight_kg)
          return (
            <div key={i} style={styles.row}>
              <span style={styles.dot} />
              <span style={styles.name}>{cap(f.name)}</span>
              {val && <span style={styles.val}>{val}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const styles = {
  card: {
    background: 'var(--surface)', border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)', padding: '14px 16px', marginBottom: '20px'
  },
  title: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '11px',
    color: 'var(--color-text-secondary)', letterSpacing: '2px', marginBottom: '10px'
  },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  row: { display: 'flex', alignItems: 'center', gap: '10px' },
  dot: { flexShrink: 0, width: '6px', height: '6px', borderRadius: '2px', background: 'var(--color-primary)' },
  name: {
    flex: 1, minWidth: 0, fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  val: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px',
    color: 'var(--color-text-secondary)'
  }
}
