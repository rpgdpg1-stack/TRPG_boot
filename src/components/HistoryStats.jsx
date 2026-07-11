import UiIcon from './UiIcon'
import ClockIcon from './ClockIcon'
import { formatDuration, formatMeters } from '../utils/history'

/**
 * Сводка тренировок за период — иконка + число + мелкая серая подпись.
 * Всегда: Тренировок · Время. Дальше (если есть) — разбивка через тонкий
 * разделитель: Силовая (счёт, если были силовые) и/или Плавание (метры, если
 * плавал). Позиции центрируются. Нет тренировок за период → мотивирующая заглушка.
 * Единый вид на главной (блок «История») и на `/history`. `summary` —
 * результат `summarizeWorkouts`.
 */
export default function HistoryStats({ summary }) {
  if (!summary || summary.count === 0) {
    return <div style={styles.empty}>Начни тренировку — здесь появится статистика</div>
  }

  const hasStrength = summary.strengthCount > 0
  const hasSwim = summary.distance > 0

  return (
    <div style={styles.row}>
      <Stat
        icon={<UiIcon name="muscles" size={15} color="var(--color-text-secondary)" />}
        value={String(summary.count)}
        label="Тренировок"
      />
      <Stat
        icon={<span style={styles.clock}><ClockIcon size={14} /></span>}
        value={formatDuration(summary.minutes)}
        label="Время"
      />

      {(hasStrength || hasSwim) && <div style={styles.divider} aria-hidden="true" />}

      {hasStrength && (
        <Stat
          icon={<UiIcon name="power" size={15} color="var(--color-primary)" />}
          value={String(summary.strengthCount)}
          label="Силовая"
        />
      )}
      {hasSwim && (
        <Stat
          icon={<UiIcon name="swimming" size={15} color="var(--cat-pool)" />}
          value={formatMeters(summary.distance)}
          label="Плавание"
          accent="var(--cat-pool)"
        />
      )}
    </div>
  )
}

function Stat({ icon, value, label, accent }) {
  return (
    <div style={styles.stat}>
      <span style={styles.top}>
        {icon}
        <span style={{ ...styles.value, color: accent || 'var(--color-text)' }}>{value}</span>
      </span>
      <span style={styles.label}>{label}</span>
    </div>
  )
}

const styles = {
  row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '18px' },
  stat: {
    flex: '0 1 auto', minWidth: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
  },
  top: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  value: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px',
    letterSpacing: '0.2px', whiteSpace: 'nowrap'
  },
  label: {
    fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 500,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  },
  // Тонкий еле видимый вертикальный разделитель между итогами и разбивкой.
  divider: {
    width: '1px', height: '30px', alignSelf: 'center', flexShrink: 0,
    background: 'var(--border-hairline)'
  },
  empty: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', padding: '4px 0'
  }
}
