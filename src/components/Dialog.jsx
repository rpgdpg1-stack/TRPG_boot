/**
 * Dialog — ОДИН каркас всех модалок-решений (подтверждения, сообщения, выбор).
 * Зеркало компонента Dialog в Figma (секция 💬 Dialog).
 *
 * Порядок: иконка (по желанию) → заголовок → серое пояснение → кнопки Large.
 *
 * actions: [{ label, role, onClick, loading, disabled }]. Роль → вид кнопки:
 *  - 'primary'     — рекомендуемый путь («Сохранить», «Завершить», «Засчитать»);
 *  - 'secondary'   — уйти / передумать («Назад», «Отмена», «Продолжить»);
 *  - 'destructive' — теряет данные: серая кнопка, красный текст («Отменить», «Удалить»);
 *  - 'tertiary'    — тихий запасной выход («Позже», «Всё равно начать»).
 *
 * layout: 'row' — две короткие подписи в ряд («уйти» слева, действие справа, как переданы);
 *         'column' — столбиком, primary всегда сверху; 'auto' (по умолчанию) — ряд, если кнопок
 *         две и обе подписи короткие, иначе столбик.
 *
 * Подпись кнопки — глагол («Продолжить / Отменить», а не «Нет / Да, отменить»), без капса.
 * Тап мимо окна = выход (onClose). required — решение обязательно: тап мимо не закрывает.
 *
 * Фон окна — --color-card (surface/default), НЕ surface-raised: серая кнопка (surface-tonal)
 * на raised растворяется.
 */
import ModalShell from './ModalShell'
import ActionButton from './ActionButton'
import UiIcon from './UiIcon'

const ROLE = {
  primary: { variant: 'primary' },
  secondary: { variant: 'secondary' },
  destructive: { variant: 'secondary', tone: 'destructive' },
  tertiary: { variant: 'tertiary' }
}

// Подпись до ~11 знаков влезает в половину окна 340 на Large.
const SHORT = 11

export function resolveLayout(actions, layout) {
  if (layout === 'row' || layout === 'column') return layout
  return actions.length === 2 && actions.every(a => String(a.label).length <= SHORT) ? 'row' : 'column'
}

export function DialogCard({ icon, title, text, children, actions = [], layout = 'auto', style }) {
  const mode = resolveLayout(actions, layout)
  // В столбике главное — сверху; в ряду порядок как передан (слева «уйти», справа действие).
  const ordered = mode === 'column'
    ? [...actions.filter(a => a.role === 'primary'), ...actions.filter(a => a.role !== 'primary')]
    : actions
  return (
    <div style={{ ...styles.card, ...style }}>
      {icon && (
        <div style={styles.iconWrap}>
          {typeof icon === 'string' ? <UiIcon name={icon} size={28} /> : icon}
        </div>
      )}
      {title && <div style={styles.title}>{title}</div>}
      {text && <div style={styles.text}>{text}</div>}
      {children}
      {ordered.length > 0 && (
        <div style={{ ...styles.actions, ...(mode === 'row' ? styles.row : styles.column) }}>
          {ordered.map(a => (
            <ActionButton
              key={a.label}
              {...(ROLE[a.role] || ROLE.secondary)}
              onClick={a.onClick}
              loading={a.loading}
              disabled={a.disabled}
              style={mode === 'row' ? styles.rowBtn : null}
            >
              {a.label}
            </ActionButton>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dialog({ required = false, onClose, ...card }) {
  return (
    <ModalShell onClose={required ? () => {} : onClose} contentStyle={styles.shell}>
      <DialogCard {...card} />
    </ModalShell>
  )
}

const styles = {
  shell: { width: '100%', maxWidth: '340px' },
  card: {
    width: '100%',
    background: 'var(--color-card)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-modal)',
    padding: '28px var(--space-5) var(--space-5)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'var(--highlight-recent)', color: 'var(--color-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14
  },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)',
    fontWeight: 'var(--text-title-weight)', lineHeight: 1.25, color: 'var(--color-text)'
  },
  // Пояснение всегда тише заголовка — иначе в окне два «главных» текста.
  text: {
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 500, lineHeight: 1.45,
    color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)'
  },
  actions: { display: 'flex', gap: 'var(--space-2)', width: '100%', marginTop: '22px' },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  rowBtn: { flex: 1, minWidth: 0 }
}
