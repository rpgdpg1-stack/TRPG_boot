import { formatFavoriteValue } from '../lib/favorite-exercises'
import HeartIcon from './HeartIcon'

/**
 * Компактный блок «Любимые упражнения» для профиля (своего и друга).
 * items: [{ name, weight_kg }] — вес может быть null (не задан или скрыт приватностью).
 */
export default function FavoritesBlock({ items, bare = false }) {
  if (!items || items.length === 0) return null
  const inner = (
    <>
      <div style={styles.title}>
        <HeartIcon filled size={14} />
        <span>Любимые упражнения</span>
      </div>
      <div style={styles.list}>
        {items.map((f, i) => {
          const val = formatFavoriteValue(f.weight_kg, f.counts_reps)
          return (
            <div key={i} style={styles.row}>
              <span style={styles.name}>{cap(f.name)}</span>
              {val && <span style={styles.val}>{val}</span>}
            </div>
          )
        })}
      </div>
    </>
  )
  // bare — без своей карточки (для вставки секцией в общий блок профиля).
  return bare ? inner : <div style={styles.card}>{inner}</div>
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const styles = {
  card: {
    background: 'var(--surface)', border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)', padding: '14px 16px', marginBottom: '20px'
  },
  // Заголовок: сердечко + текст обычным регистром. Цвет — токен --text-info
  // (secondary-подпись, ≈ прежние 60% белого), а не сырое rgba.
  title: {
    display: 'flex', alignItems: 'center', gap: '7px',
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700,
    color: 'var(--text-info)', letterSpacing: '0.2px', marginBottom: '12px'
  },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  row: { display: 'flex', alignItems: 'baseline', gap: '10px' },
  name: {
    flex: 1, minWidth: 0, fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  // Вес — серым с лёгким опасити (как в дне тренировки).
  val: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px',
    color: 'var(--color-text-secondary)', opacity: 0.75
  }
}
