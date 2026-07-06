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
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    minHeight: '26px', padding: '0 10px',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    color: 'var(--cat-pool)'
  }
}
