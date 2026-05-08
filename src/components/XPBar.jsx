/**
 * XP-бар (для мускулов 💪).
 *
 * Структура:
 * [💪]  ▓▓▓▓▓░░░░░░ 180/300
 *
 * Слева эмодзи бицепса (потом заменишь на иконку).
 * Полоса сплошная (без сегментов), с заполнением и свечением.
 * Цифры справа внутри полосы.
 */
export default function XPBar({ progress = 0, color = '#9ED153', current = 0, needed = 300 }) {
  return (
    <div style={styles.wrapper}>
      {/* Иконка-валюта (бицепс). Потом заменим на SVG */}
      <span style={styles.icon}>💪</span>

      {/* Сама полоса */}
      <div style={styles.track}>
        {/* Заливка прогресса */}
        <div
          style={{
            ...styles.fill,
            width: `${Math.min(100, Math.max(0, progress))}%`,
            background: `linear-gradient(90deg, ${color}, ${color})`,
            boxShadow: `0 0 12px ${color}, 0 0 6px ${color}`,
            transition: 'width 0.6s ease'
          }}
        />

        {/* Цифры справа поверх полосы */}
        <div style={styles.numbers}>
          <span style={styles.current}>{current}</span>
          <span style={styles.slash}>/</span>
          <span style={styles.needed}>{needed}</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%'
  },
  icon: {
    fontSize: '20px',
    lineHeight: 1,
    flexShrink: 0
  },
  track: {
    position: 'relative',
    flex: 1,
    height: '20px',
    background: 'rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    overflow: 'hidden'
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: '10px'
  },
  numbers: {
    position: 'absolute',
    top: 0,
    right: '10px',
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontFamily: 'var(--font-tiny5)',
    zIndex: 2,
    textShadow: '0 0 4px rgba(0,0,0,0.8)'
  },
  current: {
    fontSize: '12px',
    color: '#FFFFFF',
    letterSpacing: '1px'
  },
  slash: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.7)'
  },
  needed: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: '1px'
  }
}
