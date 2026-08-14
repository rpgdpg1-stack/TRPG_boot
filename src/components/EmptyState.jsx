import UiIcon from './UiIcon'

/**
 * Пустое состояние списка — иконка, короткий факт, подсказка что делать.
 *
 * Раньше пустые списки были просто строкой серого текста по центру, и каждый
 * раз своей: «Пусто. Добавь упражнения кнопкой ниже.», «Альтернатив для этой
 * подгруппы пока нет». Экран выглядел недогруженным, а не пустым.
 *
 * Правило текста: заголовок — ФАКТ («Пока пусто»), подсказка — ДЕЙСТВИЕ или
 * причина. Извинений и «упс» не пишем.
 *
 * `compact` — без собственных вертикальных отступов. Для пустого блока ВНУТРИ
 * экрана (пустой день в конструкторе), где расстояния задаёт соседний контент;
 * просторные отступы полноэкранной заглушки там отрывали текст от того, к чему
 * он относится.
 */
export default function EmptyState({ icon = 'muscles', title, hint, action, compact = false }) {
  return (
    <div style={{ ...s.wrap, ...(compact ? s.wrapCompact : null) }}>
      <span style={s.icon}>
        <UiIcon name={icon} size={32} color="var(--color-text-secondary)" />
      </span>
      <div style={s.title}>{title}</div>
      {hint && <div style={s.hint}>{hint}</div>}
      {action}
    </div>
  )
}

const s = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 'var(--space-2)', textAlign: 'center',
    padding: 'var(--space-10) var(--space-5)'
  },
  wrapCompact: { padding: '0 var(--space-5)' },
  icon: { display: 'inline-flex', opacity: 0.5, marginBottom: 'var(--space-1)' },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-label)', color: 'var(--color-text)'
  },
  hint: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-text)', color: 'var(--color-text-secondary)',
    lineHeight: 1.45, maxWidth: '260px'
  }
}
