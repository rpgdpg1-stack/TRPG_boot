import UiIcon from './UiIcon'

/**
 * Статичный тег «Бассейн» для карточки заплыва — тот же вид, что тег места
 * (Зал/Дом) у силовой (`PlaceSwitcher` с `tag`): пилюля surface-active + blur,
 * шрифт display, иконка + подпись. Цвет — раздела плавания (--cat-pool).
 * У заплыва мест нет, поэтому это отдельный тег, а не PlaceSwitcher.
 *
 * Иконка пока `swimming` (общая с разделом) — временная, потом заменим на свою.
 */
export default function PoolTag() {
  return (
    <span style={styles.tag} onClick={(e) => e.stopPropagation()}>
      <UiIcon name="swimming" size={16} />
      Бассейн
    </span>
  )
}

const styles = {
  // Зеркалит PlaceSwitcher.staticTag (держать в синке), цвет — --cat-pool.
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
    minHeight: '26px', padding: '0 var(--space-3)',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-label-size)', letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    color: 'var(--cat-pool)'
  }
}
