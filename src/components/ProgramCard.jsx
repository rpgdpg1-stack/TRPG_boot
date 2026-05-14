import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { isPinned, togglePin, getActiveDay } from '../lib/storage'
import DayBadge from './DayBadge'

/**
 * Карточка программы внутри категории.
 *
 * Тап → сразу на день тренировки (минуя удалённый экран выбора дня).
 * Активный день определяется через getActiveDay (цикл A→B→C).
 * Если пользователь ещё не тренировался — стартуем с дня A.
 */
export default function ProgramCard({ id, title, tags = [], available = true, comingSoon = false }) {
  const navigate = useNavigate()
  const [pinned, setPinned] = useState(false)
  const [activeDay, setActiveDay] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([isPinned(id), getActiveDay(id)]).then(([p, d]) => {
      if (!cancelled) {
        setPinned(p)
        setActiveDay(d)
      }
    })
    return () => { cancelled = true }
  }, [id])

  const handleCardTap = async () => {
    if (!available) return
    haptic.light()
    // Если getActiveDay вернул null (никогда не тренировался) — стартуем с A.
    // Иначе — день, рекомендованный логикой цикла.
    const day = activeDay || 'A'
    setTimeout(() => navigate(`/workout/${id}/${day}`), 80)
  }

  const handlePinTap = async (e) => {
    e.stopPropagation()
    haptic.medium()
    const newState = await togglePin(id)
    setPinned(newState)
  }

  return (
    <div
      onClick={handleCardTap}
      className={available ? 'press-tile' : ''}
      style={{
        ...styles.card,
        opacity: available ? 1 : 0.55,
        cursor: available ? 'pointer' : 'default'
      }}
    >
      <button
        onClick={handlePinTap}
        style={styles.pinButton}
        aria-label={pinned ? 'Открепить' : 'Закрепить'}
      >
        <HeartIcon filled={pinned} />
      </button>

      <div style={styles.title}>{title}</div>

      {tags.length > 0 && (
        <div style={styles.tags}>
          {tags.map(tag => (
            <span key={tag} style={{ ...styles.tag, background: getTagColor(tag) }}>
              {tag.toUpperCase()}
            </span>
          ))}
          {comingSoon && <span style={styles.soonTag}>СКОРО</span>}
        </div>
      )}

      {activeDay && available && (
        <div style={styles.dayBadgeWrap}>
          <DayBadge day={activeDay} size={32} />
          <div style={styles.dayLabel}>СЕГОДНЯ</div>
        </div>
      )}
    </div>
  )
}

function HeartIcon({ filled }) {
  const color = filled ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.3)'

  if (filled) {
    return (
      <svg width="22" height="22" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
        <rect x="2" y="3" width="3" height="2" fill={color} />
        <rect x="11" y="3" width="3" height="2" fill={color} />
        <rect x="1" y="5" width="5" height="2" fill={color} />
        <rect x="10" y="5" width="5" height="2" fill={color} />
        <rect x="6" y="5" width="4" height="2" fill={color} />
        <rect x="1" y="7" width="14" height="2" fill={color} />
        <rect x="2" y="9" width="12" height="2" fill={color} />
        <rect x="3" y="11" width="10" height="1" fill={color} />
        <rect x="4" y="12" width="8" height="1" fill={color} />
        <rect x="5" y="13" width="6" height="1" fill={color} />
        <rect x="6" y="14" width="4" height="1" fill={color} />
        <rect x="7" y="15" width="2" height="1" fill={color} />
      </svg>
    )
  }

  return (
    <svg width="22" height="22" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <rect x="2" y="3" width="3" height="1" fill={color} />
      <rect x="11" y="3" width="3" height="1" fill={color} />
      <rect x="1" y="4" width="1" height="1" fill={color} />
      <rect x="5" y="4" width="1" height="1" fill={color} />
      <rect x="10" y="4" width="1" height="1" fill={color} />
      <rect x="14" y="4" width="1" height="1" fill={color} />
      <rect x="1" y="5" width="1" height="2" fill={color} />
      <rect x="14" y="5" width="1" height="2" fill={color} />
      <rect x="6" y="5" width="1" height="1" fill={color} />
      <rect x="9" y="5" width="1" height="1" fill={color} />
      <rect x="7" y="6" width="2" height="1" fill={color} />
      <rect x="1" y="7" width="1" height="1" fill={color} />
      <rect x="14" y="7" width="1" height="1" fill={color} />
      <rect x="2" y="8" width="1" height="1" fill={color} />
      <rect x="13" y="8" width="1" height="1" fill={color} />
      <rect x="3" y="9" width="1" height="1" fill={color} />
      <rect x="12" y="9" width="1" height="1" fill={color} />
      <rect x="3" y="10" width="1" height="1" fill={color} />
      <rect x="12" y="10" width="1" height="1" fill={color} />
      <rect x="4" y="11" width="1" height="1" fill={color} />
      <rect x="11" y="11" width="1" height="1" fill={color} />
      <rect x="5" y="12" width="1" height="1" fill={color} />
      <rect x="10" y="12" width="1" height="1" fill={color} />
      <rect x="6" y="13" width="1" height="1" fill={color} />
      <rect x="9" y="13" width="1" height="1" fill={color} />
      <rect x="7" y="14" width="2" height="1" fill={color} />
    </svg>
  )
}

function getTagColor(tag) {
  const t = tag.toLowerCase()
  if (t === 'зал') return 'var(--tag-gym)'
  if (t === 'дом') return 'var(--tag-home)'
  if (t === 'улица') return 'var(--tag-outdoor)'
  return 'var(--color-text-secondary)'
}

const styles = {
  card: {
    position: 'relative',
    padding: '18px 16px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '88px',
    textAlign: 'left'
  },
  pinButton: {
    position: 'absolute',
    top: '14px',
    right: '14px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    transition: 'transform 0.15s ease',
    zIndex: 2,
    padding: 0
  },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '8px',
    paddingRight: '40px'
  },
  tags: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' },
  tag: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '6px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    color: 'var(--color-bg)',
    letterSpacing: '1px',
    fontWeight: 600
  },
  soonTag: {
    display: 'inline-block',
    padding: '3px 8px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  dayBadgeWrap: {
    position: 'absolute',
    bottom: '12px',
    right: '14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px'
  },
  dayLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  }
}