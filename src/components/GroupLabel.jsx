import MuscleGroupIcon from './MuscleGroupIcon'

/**
 * Заголовки-надписи над списками. Два РАЗНЫХ смысла, которые до этого писались
 * заново в каждом файле с разным кеглем и разрядкой (1.5 / 1.6 / 2 / 3px):
 *
 *  • `GroupLabel`   — группа мышц или категория ВНУТРИ списка. Цветная (цвет
 *    группы), акцентный шрифт, капс-разрядка. Цвет здесь работает как навигация:
 *    глаз находит «Грудь» по цвету, не читая.
 *  • `SectionLabel` — секция экрана («Профиль», «Система», «Сон»). Всегда
 *    нейтрально-серая: она структурирует экран, а не соревнуется с контентом.
 *
 * Правило: цветным бывает только GroupLabel. Если хочется покрасить секцию —
 * это значит, что она на самом деле группа.
 */
/**
 * @param muscleGroup — ключ группы (back/chest/legs/…). Передан → слева от текста
 * встаёт силуэт с подсвеченной мышцей, в том же цвете, что и надпись. Не передан
 * (напр. категории «Восстановления») — заголовок как раньше, без иконки.
 */
export function GroupLabel({ children, color, muscleGroup, style }) {
  return (
    <div style={{ ...s.group, ...(muscleGroup ? s.withIcon : null), ...(color ? { color } : null), ...style }}>
      {muscleGroup && <MuscleGroupIcon group={muscleGroup} />}
      {children}
    </div>
  )
}

/**
 * @param caps — капс-разрядка (лейблы полей формы: «НАЗВАНИЕ», «МЕСТО», «СОН»).
 * Разрядка ОДНА на проект — 1.5px; было 0.2 / 1 / 2 / 3px вразнобой.
 */
export function SectionLabel({ children, caps = false, style }) {
  return <div style={{ ...s.section, ...(caps ? s.caps : null), ...style }}>{children}</div>
}

export default GroupLabel

const s = {
  group: {
    fontFamily: 'var(--font-display)',
    fontWeight: 'var(--weight-label)',
    fontSize: 'var(--text-caption-size)',
    letterSpacing: '1.5px',
    lineHeight: 'var(--text-caption-lh)',
    color: 'var(--color-text-secondary)',
    paddingBottom: 'var(--space-05)'
  },
  // С иконкой заголовок становится строкой: силуэт и надпись по центру друг друга.
  withIcon: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  section: {
    fontFamily: 'var(--font-manrope)',
    fontWeight: 'var(--weight-label)',
    fontSize: 'var(--text-label-size)',
    letterSpacing: '0.2px',
    lineHeight: 'var(--text-label-lh)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-3)',
    paddingLeft: 'var(--space-1)'
  },
  caps: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-caption-size)',
    letterSpacing: '1.5px'
  }
}
