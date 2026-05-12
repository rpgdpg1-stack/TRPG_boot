import { useEffect, useRef } from 'react'
import { RANK_NAMES, IMMORTAL, IMMORTAL_START_LEVEL, LEVELS_PER_RANK, XP_PER_LEVEL } from '../lib/levels'

/**
 * Попап со всеми рангами (Е3).
 * Открывается при тапе по тексту ранга в PlayerCard.
 *
 * Каждая строка:
 *   🟢  НОВОБРАНЕЦ  ●●○   0-900 💪
 *
 * - Точки: ● заполнена если подуровень пройден, ○ если нет
 * - Текущий ранг подсвечен (по своему цвету)
 * - Пройденные ранги затемнены
 * - Будущие — обычным цветом текста-secondary
 * - Авто-исчезновение через 4 сек
 * - Закрытие по клику вне
 */
export default function RanksPopup({ currentLevel, onClose }) {
  const popupRef = useRef(null)
  const autoCloseTimer = useRef(null)

  // Авто-закрытие через 4 сек
  useEffect(() => {
    autoCloseTimer.current = setTimeout(() => onClose(), 4000)
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current)
    }
  }, [onClose])

  // Закрытие по клику вне
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (popupRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [onClose])

  // Какой ранг сейчас активен (index в RANK_NAMES или 'immortal')
  const isImmortal = currentLevel >= IMMORTAL_START_LEVEL
  const currentRankIdx = isImmortal ? -1 : Math.floor((currentLevel - 1) / LEVELS_PER_RANK)
  const currentSubLevel = isImmortal
    ? currentLevel - IMMORTAL_START_LEVEL + 1
    : ((currentLevel - 1) % LEVELS_PER_RANK) + 1

  // Собираем список рангов для отображения
  const rows = RANK_NAMES.map((rank, idx) => {
    const startLevel = idx * LEVELS_PER_RANK + 1                    // 1, 4, 7...
    const endLevel = startLevel + LEVELS_PER_RANK - 1               // 3, 6, 9...
    const startXP = (startLevel - 1) * XP_PER_LEVEL                 // 0, 900, 1800
    const endXP = endLevel * XP_PER_LEVEL                           // 900, 1800, 2700

    let state // 'passed' | 'current' | 'future'
    let filledDots = 0

    if (idx < currentRankIdx || isImmortal) {
      state = 'passed'
      filledDots = LEVELS_PER_RANK
    } else if (idx === currentRankIdx) {
      state = 'current'
      filledDots = currentSubLevel
    } else {
      state = 'future'
      filledDots = 0
    }

    return {
      idx,
      rank,
      state,
      filledDots,
      xpRange: `${startXP}-${endXP}`
    }
  })

  // Бессмертный — отдельная строка снизу
  const immortalRow = {
    rank: IMMORTAL,
    state: isImmortal ? 'current' : 'future',
    subLevel: isImmortal ? currentSubLevel : 0,
    xpStart: IMMORTAL_START_LEVEL - 1
  }

  return (
    <div ref={popupRef} style={styles.popup}>
      <div style={styles.list}>
        {rows.map(row => (
          <RankRow key={row.idx} row={row} />
        ))}

        {/* БЕССМЕРТНЫЙ — особая строка, бесконечный ранг */}
        <ImmortalRow row={immortalRow} />
      </div>

      <style>{`
        @keyframes ranksPopupShow {
          0%   { opacity: 0; transform: translateY(-6px) scale(0.96); }
          8%   { opacity: 1; transform: translateY(0) scale(1); }
          92%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-4px) scale(0.98); }
        }
      `}</style>
    </div>
  )
}

function RankRow({ row }) {
  const { rank, state, filledDots, xpRange } = row
  const isPassed = state === 'passed'
  const isCurrent = state === 'current'

  const nameColor = isCurrent ? rank.color : isPassed ? 'rgba(255,255,255,0.35)' : 'var(--color-text)'
  const dotColor = isCurrent ? rank.color : isPassed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)'
  const xpColor = isCurrent ? rank.color : 'var(--color-text-secondary)'

  return (
    <div style={{
      ...styles.row,
      background: isCurrent ? `${rank.color}15` : 'transparent',
      borderColor: isCurrent ? `${rank.color}40` : 'transparent'
    }}>
      <span style={styles.emoji}>{rank.emoji}</span>

      <span style={{ ...styles.rankName, color: nameColor }}>
        {rank.name}
      </span>

      <span style={styles.dots}>
        {Array.from({ length: 3 }).map((_, i) => (
          <span
            key={i}
            style={{
              ...styles.dot,
              color: i < filledDots ? dotColor : 'rgba(255,255,255,0.15)'
            }}
          >
            ●
          </span>
        ))}
      </span>

      <span style={{ ...styles.xp, color: xpColor, opacity: isPassed ? 0.5 : 1 }}>
        {xpRange} 💪
      </span>
    </div>
  )
}

function ImmortalRow({ row }) {
  const { rank, state, subLevel } = row
  const isCurrent = state === 'current'

  return (
    <div style={{
      ...styles.row,
      ...styles.immortalRow,
      background: isCurrent ? `${rank.color}18` : 'transparent',
      borderColor: isCurrent ? `${rank.color}50` : 'rgba(255,215,0,0.15)'
    }}>
      <span style={styles.emoji}>{rank.emoji}</span>

      <span style={{
        ...styles.rankName,
        color: isCurrent ? rank.color : 'var(--color-text)',
        textShadow: isCurrent ? `0 0 8px ${rank.color}` : 'none'
      }}>
        {rank.name}
      </span>

      <span style={styles.dots}>
        <span style={{ ...styles.dot, color: isCurrent ? rank.color : 'rgba(255,255,255,0.25)' }}>
          ∞
        </span>
      </span>

      <span style={{
        ...styles.xp,
        color: isCurrent ? rank.color : 'var(--color-text-secondary)',
        opacity: isCurrent ? 1 : 0.6
      }}>
        {isCurrent ? `Ур. ${subLevel}` : '∞'}
      </span>
    </div>
  )
}

const styles = {
  popup: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: '280px',
    maxWidth: 'calc(100vw - 32px)',
    background: 'rgba(28, 28, 28, 0.96)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    padding: '10px',
    zIndex: 60,
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
    animation: 'ranksPopupShow 4.4s ease-out forwards'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderRadius: '10px',
    border: '1px solid transparent',
    transition: 'background 0.2s ease'
  },
  immortalRow: {
    marginTop: '4px',
    paddingTop: '7px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid'
  },
  emoji: {
    fontSize: '14px',
    flexShrink: 0,
    width: '18px',
    textAlign: 'center'
  },
  rankName: {
    flex: 1,
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  dots: {
    display: 'flex',
    gap: '2px',
    flexShrink: 0
  },
  dot: {
    fontSize: '9px',
    lineHeight: 1,
    transition: 'color 0.3s ease'
  },
  xp: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    letterSpacing: '0.5px',
    flexShrink: 0,
    minWidth: '78px',
    textAlign: 'right'
  }
}
