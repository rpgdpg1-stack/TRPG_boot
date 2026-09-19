/**
 * Модалка-подтверждение — тонкая обёртка над Dialog (19.09.2026).
 *
 * Раньше рисовала своё окно и серые пилюли ModalButton; теперь весь вид — в Dialog
 * (кнопки Large, роли primary / secondary / destructive / tertiary, ряд или столбик).
 * Обёртка оставлена, чтобы вызовы не переписывать: старый флаг `danger: true` = role 'destructive',
 * без роли — 'secondary'.
 *
 * <ConfirmModal
 *   title="Отменить тренировку?"
 *   text="Прогресс не сохранится и в историю не попадёт."
 *   actions={[{ label: 'Продолжить', onClick }, { label: 'Отменить', role: 'destructive', onClick }]}
 *   onClose={...}
 * />
 */
import Dialog from './Dialog'

export default function ConfirmModal({ actions = [], ...rest }) {
  const mapped = actions.map(a => ({ ...a, role: a.role || (a.danger ? 'destructive' : 'secondary') }))
  return <Dialog {...rest} actions={mapped} />
}
