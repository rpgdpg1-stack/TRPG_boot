import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { isPinned, togglePin, getActiveDay } from '../lib/storage'
import { spawnBurst } from './ParticlesBg'
import DayBadge from './DayBadge'

/**
 * Карточка программы внутри категории.
 * Содержит: иконку-закреп (бицепс), название, теги, значок активного дня.
 * При тапе → переход на /program/:id
 */
export default function ProgramCard({ id, title, tags = [], available = true, comingSoon = false }) {
  const navigate = useNavigate()
  const [pinned, setPinned] = useState(false)
  const [activeDay, setActiveDay] = useState(null)

  // Загружаем состояние из хранилища
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

  const handleCardTap = (e) => {
    if (!available) return
    haptic.light()
    const rect = e.currentTarget.getBoundingClientRect()
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 5)
    setTimeout(() => navigate(`/program/${id}`), 80)
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
      style={{
        ...styles.card,
        opacity: available ? 1 : 0.55,
        cursor: available ? 'pointer' : 'default'
      }}
    >
      {/* Иконка-закреп бицепс в углу */}
      <button
        onClick={handlePinTap}
        style={styles.pinButton}
        aria-label={pinned ? 'Открепить' : 'Закрепить'}
      >
        <BicepsIcon filled={pinned} />
      </button>

      {/* Контент */}
      <div style={styles.title}>{title}</div>

      {/* Теги */}
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

      {/* Значок активного дня (если есть) */}
      {activeDay && available && (
        <div style={styles.dayBadgeWrap}>
          <DayBadge day={activeDay} size={36} />
          <div style={styles.dayLabel}>СЕГОДНЯ</div>
        </div>
      )}
    </div>
  )
}

/**
 * Пиксельная иконка бицепса (16x16).
 * filled = false — контур
 * filled = true  — залит зелёным
 */
function BicepsIcon({ filled }) {
  const color = filled ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.25)'

  // Простая пиксельная форма бицепса (упрощённая)
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      {/* Кулак */}
      <rect x="11" y="2" width="3" height="3" fill={color} />
      {/* Предплечье */}
      <rect x="11" y="5" width="2" height="3" fill={color} />
      {/* Пик бицепса */}
      <rect x="3" y="6" width="2" height="2" fill={color} />
      {/* Основная масса */}
      <rect x="2" y="7" width="9" height="3" fill={color} />
      {/* Низ мышцы */}
      <rect x="3" y="10" width="6" height="1" fill={color} />
    </svg>
  )
}

/**
 * Цвет тега по названию
 */
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
    padding: '20px 16px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    textAlign: 'left',
    transition: 'transform 0.1s ease, opacity 0.2s ease',
    minHeight: '100px'
  },
  pinButton: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '10px',
    transition: 'background 0.2s ease',
    zIndex: 2
  },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '8px',
    paddingRight: '48px' // место для иконки-закрепа
  },
  tags: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
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
    bottom: '14px',
    right: '14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  },
  dayLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  }
}
