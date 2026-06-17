/**
 * Строка списка ДРУЗЕЙ (страница «Друзья»).
 *
 * Отличается от LeaderboardRow (рейтинг): без нумерации/медалей, аватар
 * меньше, между именем и бицепсом — относительное время последней тренировки
 * ("2 дня назад") серым. Закреплённые помечены 📌.
 *
 * Состав слева направо:
 *   [АВАТАР 36]  Имя @ник            123 💪
 *                Ранг · был N дней    (📌 если закреплён)
 *
 * Тап → onTap(friend) (открыть карточку игрока).
 * Долгое нажатие (550мс) → onLongPress(friend) (модалка закрепа).
 *
 * Долгое нажатие не должно конфликтовать со скроллом: если палец сдвинулся
 * больше порога ИЛИ отпустили раньше — это не лонг-пресс, а тап/скролл.
 */

import { useRef, useState } from 'react'
import { getLevelFromXP, getRankByLevel } from '../lib/levels'
import { getLeagueByRankIndex } from '../lib/leagues'
import { formatRelative } from '../utils/history'
import RankIcon from './RankIcon'
import MuscleIcon from './MuscleIcon'

const LONG_PRESS_MS = 550
const MOVE_TOLERANCE = 10 // px — сдвиг больше = это скролл, не лонг-пресс

export default function FriendRow({ friend, onTap, onLongPress }) {
  const {
    first_name,
    photo_url,
    total_muscles,
    rank_index,
    last_workout_at,
    pinned_at
  } = friend

  const level = getLevelFromXP(total_muscles)
  const rank = getRankByLevel(level)
  const leagueColor = getLeagueByRankIndex(rank_index).color

  const displayName = first_name || 'Игрок'
  const isPinned = !!pinned_at

  const lastWorkoutText = last_workout_at ? formatRelative(last_workout_at) : null

  const [pressed, setPressed] = useState(false)
  const longTimer = useRef(null)
  const startPos = useRef({ x: 0, y: 0 })
  const firedLong = useRef(false)

  const clearLong = () => {
    if (longTimer.current) {
      clearTimeout(longTimer.current)
      longTimer.current = null
    }
  }

  const handleDown = (e) => {
    setPressed(true)
    firedLong.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    longTimer.current = setTimeout(() => {
      firedLong.current = true
      onLongPress?.(friend)
    }, LONG_PRESS_MS)
  }

  const handleMove = (e) => {
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      clearLong()
      setPressed(false)
    }
  }

  const handleUp = () => {
    clearLong()
    setPressed(false)
    // Если только что сработал лонг-пресс — не вызываем тап
    if (firedLong.current) {
      firedLong.current = false
      return
    }
    onTap?.(friend)
  }

  const handleLeave = () => {
    clearLong()
    setPressed(false)
  }

  return (
    <div
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
      style={{
        ...styles.row,
        // Нажатие — ярче-зелёный (как тап по себе в рейтинге); закреплённый —
        // мягкий зелёный в покое; обычный — прозрачный. При скролле (не тап) —
        // pressed сбрасывается, так что подсветки нет.
        background: pressed
          ? 'rgba(158, 209, 83, 0.20)'
          : (isPinned ? 'rgba(158, 209, 83, 0.10)' : 'transparent')
      }}
    >
      {/* Аватар — рамка в цвет лиги */}
      <div style={{ ...styles.avatarWrap, borderColor: leagueColor }}>
        {photo_url ? (
          <img src={photo_url} alt="" style={styles.avatarImg} draggable={false} />
        ) : (
          <div style={styles.avatarPlaceholder}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Имя + (ранг · последняя тренировка) */}
      <div style={styles.nameBlock}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{displayName}</span>
        </div>
        <div style={styles.metaRow}>
          <span style={{ ...styles.rank, color: rank.color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <RankIcon level={level} size={11} />
            {rank.name} {rank.subLevel}
          </span>
          {lastWorkoutText && (
            <>
              <span style={styles.dot}>·</span>
              <span style={styles.lastWorkout}>{lastWorkoutText}</span>
            </>
          )}
        </div>
      </div>

      {/* Бицепсы справа — число в цвет ранга */}
      <div style={{ ...styles.muscles, color: rank.color }}>
        {total_muscles} <MuscleIcon size={18} earned={true} />
      </div>
    </div>
  )
}

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '11px 14px',
    transition: 'background 0.2s ease',
    cursor: 'pointer',
    touchAction: 'pan-y'
  },
  avatarWrap: {
    width: '52px',
    height: '52px',
    borderRadius: '16px',
    overflow: 'hidden',
    background: 'var(--color-card)',
    flexShrink: 0,
    border: '2px solid',
    transition: 'border-color 0.3s ease'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '22px',
    color: 'var(--color-primary)'
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '5px',
    overflow: 'hidden'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    overflow: 'hidden'
  },
  rank: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '10px',
    letterSpacing: '1px',
    lineHeight: 1,
    flexShrink: 0
  },
  dot: {
    color: 'var(--color-text-secondary)',
    fontSize: '10px',
    flexShrink: 0
  },
  lastWorkout: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  muscles: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    letterSpacing: '0.5px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  }
}