/**
 * Строка списка ДРУЗЕЙ (страница «Друзья»).
 *
 * Соц-концепция без статусов (см. память проекта): никаких рангов/лиг/мускулов.
 * Строка отвечает только на вопрос «кто сейчас активен?».
 *
 * Состав слева направо:
 *   [АВАТАР 52]  Имя                     🔥
 *                была последняя тренировка
 *
 * Справа — огонёк 1-го уровня как индикатор недели: есть 🔥 → тренировался хотя
 * бы раз на этой неделе (МСК, Пн–Вс), нет 🔥 → на этой неделе не занимался.
 * Без цифры. Тип последней тренировки (иконка+название) добавим, когда бэкенд
 * начнёт его отдавать в api_get_friends_list.
 *
 * Тап → onTap(friend). Долгое нажатие (550мс) → onLongPress(friend).
 * Лонг-пресс не конфликтует со скроллом: сдвиг больше порога / раннее отпускание
 * трактуется как тап/скролл.
 */

import { useRef, useState } from 'react'
import { formatRelative, periodRange } from '../utils/history'
import StreakFlame from './StreakFlame'

const LONG_PRESS_MS = 550
const MOVE_TOLERANCE = 10 // px — сдвиг больше = это скролл, не лонг-пресс

export default function FriendRow({ friend, onTap, onLongPress }) {
  const {
    first_name,
    photo_url,
    last_workout_at,
    pinned_at
  } = friend

  const displayName = first_name || 'Игрок'
  const isPinned = !!pinned_at

  const lastWorkoutText = last_workout_at ? formatRelative(last_workout_at) : null

  // Тренировался ли на этой неделе (МСК, Пн–Вс) — по времени последней тренировки.
  const [weekStart, weekEnd] = periodRange('week')
  const lastMs = last_workout_at ? new Date(last_workout_at).getTime() : 0
  const trainedThisWeek = lastMs >= weekStart && lastMs < weekEnd

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
        // Нажатие — ярче-серый; закреплённый — мягкий серый в покое; обычный —
        // прозрачный. При скролле (не тап) pressed сбрасывается → подсветки нет.
        background: pressed
          ? 'rgba(255, 255, 255, 0.12)'
          : (isPinned ? 'rgba(255, 255, 255, 0.06)' : 'transparent')
      }}
    >
      {/* Аватар — просто фото в скруглённом квадрате (без рамки ранга). */}
      <div style={styles.avatar}>
        {photo_url ? (
          <img src={photo_url} alt="" style={styles.avatarImg} draggable={false} />
        ) : (
          <div style={styles.avatarPlaceholder}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Имя + последняя тренировка */}
      <div style={styles.nameBlock}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{displayName}</span>
        </div>
        <div style={styles.metaRow}>
          <span style={styles.lastWorkout}>
            {lastWorkoutText || 'Ещё не тренировался'}
          </span>
        </div>
      </div>

      {/* Индикатор недели: 🔥 если тренировался на этой неделе, иначе пусто. */}
      {trainedThisWeek && (
        <div style={styles.weekFlame} aria-label="Тренировался на этой неделе">
          <StreakFlame streak={1} />
        </div>
      )}
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
  avatar: {
    width: '52px',
    height: '52px',
    borderRadius: '16px',
    overflow: 'hidden',
    flexShrink: 0,
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)'
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
  lastWorkout: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  weekFlame: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
}