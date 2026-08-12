import { getMuscleGroupColors } from '../features/programs/colors'
import { exerciseTagLabel } from '../features/programs/labels'
import ExercisePlaceholder from './ExercisePlaceholder'
import UiIcon from './UiIcon'

/**
 * Список упражнений с отметками «входит в быструю версию».
 *
 * ОДИН компонент на два места: вкладка «Быстрая» в конструкторе и отдельный
 * экран настройки (долгий тап по ракете в дне тренировки). Размеры карточек,
 * отметки и поведение обязаны совпадать — иначе два экрана про одно и то же
 * выглядели бы разными фичами.
 *
 * Ручки перетаскивания тут НЕТ намеренно: здесь только отмечают, а порядок
 * упражнений правится во вкладке «Все». Отметка снята — карточка гаснет, но
 * остаётся на месте: это не удаление.
 *
 * @param items — [{ id, exercise }] в порядке дня; `exercise` — строка каталога.
 * @param picked — массив id, отмеченных как важные.
 */
export default function QuickPickList({ items, picked, onToggle }) {
  const isPicked = (id) => picked.includes(id)

  return (
    <div style={styles.list}>
      {items.map(({ id, exercise: ex }) => {
        const colors = getMuscleGroupColors(ex?.muscle_group)
        const tag = exerciseTagLabel(ex?.muscle_group, ex?.sub_group)
        const on = isPicked(id)
        return (
          <div
            key={id}
            style={{ ...styles.card, ...(on ? null : styles.cardDimmed) }}
            onClick={() => onToggle(id)}
            role="checkbox"
            aria-checked={on}
          >
            <div style={styles.preview}>
              {ex?.preview_url
                ? <img src={ex.preview_url} alt="" style={styles.previewImg} draggable={false} />
                : <ExercisePlaceholder size={24} />}
            </div>
            <div style={styles.content}>
              <div style={styles.name}>{ex?.name || id}</div>
              {ex && tag && (
                <span style={{ ...styles.tag, background: colors.tag }}>{tag}</span>
              )}
            </div>
            <button
              type="button"
              className="press-tile"
              style={{ ...styles.pick, ...(on ? styles.pickOn : null) }}
              onClick={(e) => { e.stopPropagation(); onToggle(id) }}
              aria-label={on ? 'Убрать из быстрой' : 'Вернуть в быструю'}
            >
              {on && <UiIcon name="check" size={18} color="var(--accent-on)" />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  card: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)',
    padding: 'var(--space-3)', minHeight: '90px', cursor: 'pointer',
    transition: 'opacity 0.18s ease',
    WebkitTapHighlightColor: 'transparent'
  },
  // Снятое гаснет, но остаётся на месте — это не удаление.
  cardDimmed: { opacity: 0.4 },
  preview: {
    flexShrink: 0, width: '64px', height: '64px', borderRadius: 'var(--radius-medium)',
    overflow: 'hidden', background: 'var(--color-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  content: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-15)' },
  name: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    lineHeight: '16px', color: 'var(--color-text)'
  },
  tag: {
    padding: 'var(--space-05) var(--space-2)', borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)', fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)', fontWeight: 700, opacity: 0.7, whiteSpace: 'nowrap'
  },
  // Круглая отметка — того же семейства, что икон-кнопки проекта (36px).
  pick: {
    width: '36px', height: '36px', flexShrink: 0, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--layer-2)', border: 'none', cursor: 'pointer', padding: 0,
    transition: 'background 0.18s ease'
  },
  pickOn: { background: 'var(--color-primary)' }
}
