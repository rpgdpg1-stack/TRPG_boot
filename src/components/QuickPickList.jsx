import { getMuscleGroupColors } from '../features/programs/colors'
import { isCustomExercise } from '../features/programs/userExercises'
import { haptic } from '../lib/telegram'
import { exerciseTagLabel } from '../features/programs/labels'
import ExercisePlaceholder from './ExercisePlaceholder'
import UiIcon from './UiIcon'
import PencilIcon from './PencilIcon'

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
 * Пояснение и счётчик рисует САМ компонент — так текст физически один и тот же
 * в обоих местах и не может разойтись при правке одного из экранов.
 *
 * @param items — [{ id, exercise }] в порядке дня. У `exercise` имя берётся
 *   из `name` ИЛИ `exercise_name`: каталог конструктора и слоты дня тренировки
 *   называют поле по-разному, а список один.
 * @param picked — массив id, отмеченных как важные.
 */
export const QUICK_HINT =
  'Отметь упражнения для быстрого режима тренировки. Не отмеченные не войдут в тренировку.'

export default function QuickPickList({ items, picked, onToggle, showHint = true }) {
  const isPicked = (id) => picked.includes(id)
  const count = picked.length
  const cut = items.length - count

  // Снять ВСЁ нельзя: пустая быстрая тренировка — это не тренировка, отжимать
  // будет нечего. Последняя отметка не снимается, тап по ней — вибро ошибки.
  const toggle = (id) => {
    if (isPicked(id) && count <= 1) { haptic.error(); return }
    onToggle(id)
  }

  return (
    <>
      {showHint && <div style={styles.hint}>{QUICK_HINT}</div>}

      <div style={styles.counter}>
        Останется <span style={styles.counterNum}>{count}</span> из {items.length}
        {cut > 0 && <span style={styles.counterCut}> · короче на {cut}</span>}
      </div>

      <div style={styles.list}>
      {items.map(({ id, exercise: ex }) => {
        const custom = isCustomExercise(id)
        const colors = getMuscleGroupColors(ex?.muscle_group, custom)
        const tag = exerciseTagLabel(ex?.muscle_group, ex?.sub_group)
        const on = isPicked(id)
        return (
          <div
            key={id}
            style={{ ...styles.card, ...(on ? null : styles.cardDimmed) }}
            onClick={() => toggle(id)}
            role="checkbox"
            aria-checked={on}
          >
            <div style={styles.preview}>
              {ex?.preview_url
                ? <img src={ex.preview_url} alt="" style={styles.previewImg} draggable={false} />
                : <ExercisePlaceholder size={24} />}
            </div>
            <div style={styles.content}>
              <div style={styles.name}>
                {ex?.name || ex?.exercise_name || id}
                {custom && <span style={styles.pencil}><PencilIcon size={12} color="var(--color-text-secondary)" /></span>}
              </div>
              {ex && tag && (
                <span style={{ ...styles.tag, background: colors.tag }}>{tag}</span>
              )}
            </div>
            {/* Не <button>: iOS рисует нативной кнопке свой нажатый вид поверх
                наших стилей — на круглой отметке он мигал серым квадратом
                с острыми углами. У span такой отрисовки нет вовсе. Тап по
                карточке и так переключает — доступность держит role/aria. */}
            <span
              style={{ ...styles.pick, ...(on ? styles.pickOn : null) }}
              aria-hidden="true"
            >
              {on && <UiIcon name="check" size={18} color="var(--accent-on)" />}
            </span>
          </div>
        )
      })}
      </div>
    </>
  )
}

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  card: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)',
    padding: 'var(--space-3)', minHeight: '90px', cursor: 'pointer',
    transition: 'opacity 0.18s ease',
    // Слой создаётся заранее: иначе iOS поднимает карточку в слой в момент
    // анимации прозрачности, и скругления детей кадр мигают квадратами.
    willChange: 'opacity',
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
  pencil: { display: 'inline-flex', verticalAlign: 'middle', marginLeft: 'var(--space-15)' },
  tag: {
    padding: 'var(--space-05) var(--space-2)', borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)', fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)', fontWeight: 700, opacity: 0.7, whiteSpace: 'nowrap'
  },
  // Круглая отметка — того же семейства, что икон-кнопки проекта (36px).
  pick: {
    width: '36px', height: '36px', flexShrink: 0, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--layer-2)', padding: 0,
    transition: 'background 0.18s ease',
    // Страховка от того же артефакта, если слой всё-таки будет создан.
    WebkitBackfaceVisibility: 'hidden',
    backfaceVisibility: 'hidden'
  },
  pickOn: { background: 'var(--color-primary)' },
  hint: {
    marginBottom: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)',
    background: 'var(--layer-1)', borderRadius: 'var(--radius-medium)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', lineHeight: 1.5
  },
  counter: {
    marginBottom: 'var(--space-3)', textAlign: 'center',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 700, color: 'var(--color-text-secondary)'
  },
  counterNum: { color: 'var(--color-primary)', fontWeight: 800 },
  counterCut: { color: 'var(--color-text-secondary)', fontWeight: 500 }
}
