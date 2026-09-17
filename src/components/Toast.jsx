/**
 * Тост — короткое сообщение поверх содержимого (DS-009).
 *
 * Появился из дубля: одинаковая плашка «Сначала заверши тренировку» была
 * скопирована в день силовой и в заплыв — двадцать строк стилей слово в слово
 * в двух файлах. Разъехались бы при первой же правке одного из них.
 *
 * Тон задаёт смысл, а не вид:
 *  - error   — недопустимое действие (лимит, блокировка). Красный.
 *  - offline — сохранено локально, синхронизируется позже. Оранжевый, мягче ошибки.
 *  - success — действие получилось (сохранено). Зелёный, с галочкой.
 *  - neutral — просто уведомление.
 *
 * `shake` подрагивает плашку при появлении — для повторного тапа по
 * заблокированному действию: человек уже видел текст, и нужно показать,
 * что система ответила, а не молчит. Дрожь запускается заново при смене
 * `key` у элемента (см. startBlockNonce в WorkoutDay).
 *
 * <Toast tone="error" shake>Сначала заверши тренировку</Toast>
 */
export default function Toast({ children, tone = 'error', shake = false, style }) {
  return (
    <div
      className={shake ? 'shake-error' : undefined}
      style={{ ...styles.base, ...TONES[tone], ...style }}
    >
      {/* У «получилось» — галочка перед текстом: она читается быстрее слова. */}
      {tone === 'success' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={styles.icon}>
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
    </div>
  )
}

const TONES = {
  success: {
    background: 'var(--accent-soft)',
    border: '1px solid var(--color-primary)',
    color: 'var(--color-primary)'
  },
  error: {
    background: 'var(--color-error-soft)',
    border: '1px solid var(--color-error-strong)',
    color: 'var(--color-error)'
  },
  offline: {
    background: 'var(--color-note-surface)',
    border: '1px solid var(--color-note-border)',
    color: 'var(--color-offline)'
  },
  neutral: {
    background: 'var(--surface-glass)',
    border: '1px solid var(--layer-2)',
    color: 'var(--color-text)'
  }
}

const styles = {
  icon: { flexShrink: 0 },
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    maxWidth: '260px',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(var(--blur-sm))',
    WebkitBackdropFilter: 'blur(var(--blur-sm))',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-label)',
    lineHeight: 1.35,
    textAlign: 'center'
  }
}
