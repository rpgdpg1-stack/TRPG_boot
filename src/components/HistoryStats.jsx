import { formatDuration, formatMeters } from '../utils/history'

/**
 * Три показателя сводки тренировок за период: Тренировок / Время / Проплыл.
 * Единый вид для карточки «История» на главной и блока статистики на /history —
 * один смысл, один вид везде. `summary` — результат `summarizeWorkouts`.
 */
export default function HistoryStats({ summary }) {
  const tiles = [
    { key: 'count', value: String(summary.count), label: 'Тренировок' },
    { key: 'time', value: formatDuration(summary.minutes), label: 'Время' },
    { key: 'dist', value: formatMeters(summary.distance), label: 'Проплыл', accent: 'var(--cat-pool)' }
  ]
  return (
    <div style={styles.tiles}>
      {tiles.map(t => (
        <div key={t.key} style={styles.tile}>
          <span style={{ ...styles.value, color: t.accent || 'var(--color-text)' }}>{t.value}</span>
          <span style={styles.label}>{t.label}</span>
        </div>
      ))}
    </div>
  )
}

const styles = {
  tiles: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around', gap: '8px' },
  tile: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 },
  value: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px',
    letterSpacing: '0.3px', whiteSpace: 'nowrap'
  },
  label: {
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center'
  }
}
