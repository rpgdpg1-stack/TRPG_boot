import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { programCountLabel } from '../features/programs/registry'
import UiIcon from './UiIcon'

/**
 * Список разделов (категорий) — единый источник для главной и страницы «Разделы».
 * Карточка-группа со строками: иконка раздела, название, динамичная подпись
 * с числом программ, стрелка. Тап → экран категории.
 */
export default function CategoryList() {
  const navigate = useNavigate()

  const categories = [
    { id: 'gym',     iconName: 'power',      title: 'Силовая',  subtitle: programCountLabel('gym'),  color: 'var(--color-primary)', comingSoon: false },
    { id: 'pool',    iconName: 'swimming',   title: 'Плавание', subtitle: programCountLabel('pool'), color: 'var(--cat-pool)',      comingSoon: false },
    { id: 'cardio',  iconName: 'cardio',     title: 'Кардио',   subtitle: 'Бег · HIIT',              color: 'var(--cat-cardio)',    comingSoon: true },
    { id: 'stretch', iconName: 'stretching', title: 'Растяжка', subtitle: 'Йога · Пилатес',          color: 'var(--cat-stretch)',   comingSoon: true }
  ]

  const handleTap = (cat) => {
    haptic.light()
    setTimeout(() => navigate(`/category/${cat.id}`), 80)
  }

  return (
    <div style={styles.group}>
      {categories.map((cat, idx) => (
        <button
          key={cat.id}
          onClick={() => handleTap(cat)}
          className="tg-row"
          style={{ ...styles.row, borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
        >
          <span style={styles.icon}>
            <UiIcon name={cat.iconName} size={26} color={cat.color} />
          </span>

          <div style={styles.content}>
            <div style={styles.title}>{cat.title}</div>
            <div style={styles.subtitle}>
              {cat.subtitle}
              {cat.comingSoon && <span style={styles.soonTag}>Скоро</span>}
            </div>
          </div>

          <div style={styles.arrow}>›</div>
        </button>
      ))}
    </div>
  )
}

const styles = {
  group: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '0 18px',
    width: '100%',
    height: '68px',
    textAlign: 'left',
    border: 'none'
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    flexShrink: 0,
    width: '34px'
  },
  content: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' },
  title: { fontFamily: 'var(--font-manrope)', fontSize: '17px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '0.3px', lineHeight: 1.1 },
  subtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' },
  soonTag: { display: 'inline-block', padding: '2px 6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '9px', color: 'var(--color-text-secondary)', letterSpacing: '1px' },
  arrow: { fontSize: '24px', color: 'var(--color-text-secondary)', flexShrink: 0 }
}
