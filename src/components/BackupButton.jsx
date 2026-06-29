import MuscleIcon from './MuscleIcon'

/**
 * Единая кнопка подстраховки — серая капсула в одном стиле. Используется и в
 * модалке игрока («Подстраховать»), и на странице друзей («Подстраховать всех»).
 * Один вид: серый фон, обычный регистр текста, бицепс рядом с подписью.
 *
 * Пропсы:
 *   onClick   — действие (игнорируется, если disabled)
 *   disabled  — кнопка не тапается (загрузка/отправка/уже-подстрахован/лимит)
 *   dim       — приглушённый вид (серый текст) для статусов already/limit/sending
 *   pulse     — мягкая пульсация (плейсхолдер загрузки)
 *   flyer     — { bonus, key } | null: показать «улетающий» бицепс с +бонусом
 *   children  — подпись (текст и при желании <MuscleIcon/>)
 */
export default function BackupButton({ onClick, disabled = false, dim = false, pulse = false, flyer = null, children, style }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={disabled ? '' : 'press-tile'}
      style={{
        ...styles.btn,
        ...(dim ? styles.btnDim : {}),
        ...(pulse ? { animation: 'backupBtnPulse 1.2s ease-in-out infinite' } : {}),
        cursor: disabled ? 'default' : 'pointer',
        ...style
      }}
    >
      <span style={{ ...styles.label, ...(dim ? styles.labelDim : {}) }}>
        {children}
      </span>

      {flyer && (
        <span key={flyer.key} style={styles.flyer}>
          <MuscleIcon size={32} earned={true} flexTrigger={flyer.key} />
          <span style={styles.flyerPlus}>+{flyer.bonus}</span>
        </span>
      )}

      <style>{`
        @keyframes backupAllFly {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
          30%  { opacity: 1; transform: translate(-50%, -65%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -200%) scale(0.95); }
        }
        @keyframes backupBtnPulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.7 } }
      `}</style>
    </button>
  )
}

const styles = {
  // Серая капсула. Высота ~44px (на ~15–20% ниже прежней кнопки-акцента).
  btn: {
    position: 'relative',
    width: '100%',
    minHeight: '44px',
    padding: '11px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.10)',
    borderRadius: 'var(--radius-card)',
    cursor: 'pointer',
    overflow: 'visible',
    WebkitTapHighlightColor: 'transparent'
  },
  btnDim: { background: 'rgba(255, 255, 255, 0.04)' },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '13px',
    letterSpacing: '0.5px',
    color: 'var(--color-text)'
  },
  labelDim: { color: 'var(--color-text-secondary)' },
  flyer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    pointerEvents: 'none',
    zIndex: 5,
    textShadow: '0 0 10px rgba(158, 209, 83, 0.7)',
    filter: 'drop-shadow(0 0 10px rgba(250, 223, 190, 0.5))',
    animation: 'backupAllFly 1.8s ease-out forwards'
  },
  flyerPlus: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '18px',
    color: 'var(--color-primary)'
  }
}
