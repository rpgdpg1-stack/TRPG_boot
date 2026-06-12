import { haptic } from '../lib/telegram'

/**
 * Меню действий над пользовательской программой (long-press на карточке).
 * Стиль — нижний лист с кнопками, как меню действий у упражнений.
 */
export default function ProgramActionMenu({ editable, onEdit, onShare, onDelete, onClose }) {
  const tap = (fn) => (e) => { e.stopPropagation(); haptic.light(); fn() }

  return (
    <div
      style={styles.overlay}
      onClick={(e) => { e.stopPropagation(); onClose() }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        {editable && <button style={styles.btn} onClick={tap(onEdit)}>Редактировать</button>}
        {editable && <button style={styles.btn} onClick={tap(onShare)}>Поделиться</button>}
        <button style={{ ...styles.btn, ...styles.danger }} onClick={tap(onDelete)}>Удалить</button>
        <button style={{ ...styles.btn, ...styles.close }} onClick={tap(onClose)}>Закрыть</button>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px'
  },
  sheet: {
    width: '100%', maxWidth: '420px',
    display: 'flex', flexDirection: 'column', gap: '10px',
    marginBottom: 'calc(var(--tabbar-height, 72px) + 8px)'
  },
  btn: {
    width: '100%', padding: '18px',
    background: 'var(--color-card)', color: 'var(--color-text)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px',
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700
  },
  danger: { color: '#E84545' },
  close: { color: 'var(--color-text-secondary)', fontWeight: 600 }
}