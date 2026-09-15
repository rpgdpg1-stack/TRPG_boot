import { getPlaceMeta } from '../features/programs/registry'
import UiIcon from './UiIcon'

/**
 * Сегмент-контрол мест тренировки (Зал/Дом/Улица) — ОДИН на проект:
 * конструктор программы и окно выбора места в меню карточки.
 *
 * Контейнер-пилюля (стекло таб-бара), внутри — места. Выбранное залито
 * `--color-surface-active`, его текст и иконка — АКЦЕНТНЫЙ зелёный и чуть
 * крупнее; невыбранные приглушены. Своего цвета у места НЕТ: раньше зал был
 * оранжевым, дом синим, улица зелёной, и цвет спорил с акцентом «выбрано».
 * Различаются места иконками, а выбор — единым акцентом.
 *
 * @param places   — какие места показать (порядок PLACES).
 * @param value    — выбранное.
 * @param onPick   — тап по месту.
 * @param bordered — хайрлайн контейнера (в модалке без него: край окна и так рядом).
 * @param stretch  — места делят ширину поровну (окно); иначе — по содержимому.
 */
export default function PlaceSegment({ places, value, onPick, bordered = true, stretch = false }) {
  return (
    <div
      style={{
        ...styles.group,
        width: stretch ? '100%' : 'auto',
        border: bordered ? '1px solid var(--color-border)' : 'none'
      }}
    >
      {places.map((loc, i) => {
        const meta = getPlaceMeta(loc)
        const active = value === loc
        return (
          <button
            key={loc}
            onClick={() => onPick(loc)}
            className="press-tile"
            style={{
              ...styles.item,
              ...(active ? styles.itemActive : null),
              flex: stretch ? 1 : '0 0 auto',
              marginLeft: i === 0 ? 0 : '-5px',
              zIndex: active ? 2 : 1,
              color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)',
              fontSize: active ? '15px' : '13px'
            }}
          >
            <UiIcon name={meta.icon} size={21} />
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  // Значения — один в один прежний сегмент конструктора (segGroup/segItem).
  group: {
    display: 'flex', alignItems: 'center', gap: 0, padding: 'var(--space-1)',
    background: 'var(--color-surface-dim)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)', WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    boxShadow: 'var(--shadow-dock)'
  },
  item: {
    minWidth: 0, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-15)',
    alignSelf: 'stretch', minHeight: '44px', padding: '0 var(--space-4)',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.18s ease, color 0.18s ease, font-size 0.18s ease'
  },
  itemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  }
}
