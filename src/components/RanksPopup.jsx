import { useEffect, useRef, useState } from 'react'
import { RANK_NAMES, IMMORTAL, IMMORTAL_START_LEVEL, LEVELS_PER_RANK, XP_PER_LEVEL } from '../lib/levels'
import RankIcon from './RankIcon'
import MuscleIcon from './MuscleIcon'

/**
 * Попап со всеми рангами.
 * Открывается при тапе по тексту ранга в PlayerCard.
 *
 * Позиционирование (исправление визуала):
 *  - Раньше попап был position: absolute внутри узкой кнопки ранга,
 *    из-за чего translateX(-50%) центрировал относительно кнопки,
 *    а не экрана → попап уезжал вправо за край.
 *  - Теперь position: fixed на уровне всего окна, центр по горизонтали = центр экрана.
 *  - Вертикально привязываем к низу кнопки ранга через measureRect.
 */
export default function RanksPopup({ currentLevel, onClose }) {
  const popupRef = useRef(null)

  // Координата top для fixed-попапа — позиция "под кнопкой ранга"
  const [topPx, setTopPx] = useState(null)

  // Замеряем позицию кнопки ранга (предок попапа) и ставим попап под неё
  useEffect(() => {
    // Ищем кнопку ранга — это ближайший родитель с data-rank-button.
    // Если не нашли (на всякий случай) — позиционируем относительно центра экрана.
    if (!popupRef.current) return

    const rankButton = popupRef.current.closest('[data-rank-button-wrap]')
    if (rankButton) {
      const rect = rankButton.getBoundingClientRect()
      // Чуть-чуть отступа от кнопки — 8px
      setTopPx(rect.bottom + 8)
    } else {
      // Запасной вариант — примерная позиция в верхней трети экрана
      setTopPx(window.innerHeight * 0.4)
    }
  }, [])

  

  // Закрытие по клику вне попапа.
  // Тап по самой кнопке ранга (родитель с data-rank-button-wrap) игнорируем —
  // её обрабатывает handleRankTap в PlayerCard (он и закроет попап). Иначе
  // получалось двойное срабатывание: этот хендлер закрывал, а тогл открывал снова.
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (popupRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-rank-button-wrap]')) return
      onClose()
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [onClose])

  // Какой ранг сейчас активен
  const isImmortal = currentLevel >= IMMORTAL_START_LEVEL
  const currentRankIdx = isImmortal ? -1 : Math.floor((currentLevel - 1) / LEVELS_PER_RANK)
  const currentSubLevel = isImmortal
    ? currentLevel - IMMORTAL_START_LEVEL + 1
    : ((currentLevel - 1) % LEVELS_PER_RANK) + 1

  // Собираем список рангов
  const rows = RANK_NAMES.map((rank, idx) => {
    const startLevel = idx * LEVELS_PER_RANK + 1
    const endLevel = startLevel + LEVELS_PER_RANK - 1
    const startXP = (startLevel - 1) * XP_PER_LEVEL
    const endXP = endLevel * XP_PER_LEVEL

    let state, filledDots = 0

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

    return { idx, rank, state, filledDots, xpRange: `${startXP}-${endXP}` }
  })

  const immortalRow = {
    rank: IMMORTAL,
    state: isImmortal ? 'current' : 'future',
    subLevel: isImmortal ? currentSubLevel : 0,
    xpStart: IMMORTAL_START_LEVEL - 1
  }

  return (
    <div
      ref={popupRef}
      style={{
        ...styles.popup,
        top: topPx !== null ? `${topPx}px` : '40%'
      }}
    >
      <div style={styles.list}>
        {rows.map(row => (
          <RankRow key={row.idx} row={row} onClose={onClose} />
        ))}
        <ImmortalRow row={immortalRow} onClose={onClose} />
      </div>

      <style>{`
        @keyframes ranksPopupShow {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.96); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

function RankRow({ row, onClose }) {
  const { idx, rank, state, filledDots, xpRange } = row
  const isPassed = state === 'passed'
  const isCurrent = state === 'current'

  const nameColor = isCurrent ? rank.color : isPassed ? 'rgba(255,255,255,0.35)' : 'var(--color-text)'
  const dotColor = isCurrent ? rank.color : isPassed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)'
  const xpColor = isCurrent ? rank.color : 'var(--color-text-secondary)'

  return (
    <div
      onClick={onClose}
      style={{
        ...styles.row,
        background: isCurrent ? `${rank.color}15` : 'transparent',
        borderColor: isCurrent ? `${rank.color}40` : 'transparent',
        cursor: 'pointer'
      }}
    >
      <span style={{ ...styles.emoji, opacity: isPassed ? 0.4 : 1 }}><RankIcon rankIndex={idx} size={14} color={rank.color} /></span>
      <span style={{ ...styles.rankName, color: nameColor }}>{rank.name}</span>
      <span style={styles.dots}>
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} style={{ ...styles.dot, color: i < filledDots ? dotColor : 'rgba(255,255,255,0.15)' }}>●</span>
        ))}
      </span>
      <span style={{ ...styles.xp, color: xpColor, opacity: isPassed ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
        {xpRange} <MuscleIcon size={18} earned={isCurrent || isPassed} />
      </span>
    </div>
  )
}

function ImmortalRow({ row, onClose }) {
  const { rank, state, subLevel } = row
  const isCurrent = state === 'current'

  return (
    <div
      onClick={onClose}
      style={{
        ...styles.row,
        ...styles.immortalRow,
        background: isCurrent ? `${rank.color}18` : 'transparent',
        borderColor: isCurrent ? `${rank.color}50` : 'rgba(255,215,0,0.15)',
        cursor: 'pointer'
      }}
    >
      <span style={styles.emoji}><RankIcon rankIndex={RANK_NAMES.length} size={14} color={rank.color} /></span>
      <span style={{
        ...styles.rankName,
        color: isCurrent ? rank.color : 'var(--color-text)',
        textShadow: isCurrent ? `0 0 8px ${rank.color}` : 'none'
      }}>
        {rank.name}
      </span>
      <span style={styles.dots}>
        <span style={{ ...styles.dot, color: isCurrent ? rank.color : 'rgba(255,255,255,0.25)' }}>∞</span>
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
    // fixed — относительно окна, не родителя. Поэтому центр = центр экрана.
    position: 'fixed',
    left: '50%',
    // transform делает translateX(-50%) — сдвигает попап влево на половину
    // своей ширины. Итог: левый и правый отступы от экрана одинаковые.
    transform: 'translateX(-50%)',
    minWidth: '280px',
    maxWidth: 'calc(100vw - 32px)',
    background: 'rgba(28, 28, 28, 0.96)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: '10px',
    zIndex: 60,
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
    animation: 'ranksPopupShow 0.2s ease-out forwards'
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
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
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
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '10px',
    letterSpacing: '0.5px',
    flexShrink: 0,
    minWidth: '78px',
    textAlign: 'right'
  }
}