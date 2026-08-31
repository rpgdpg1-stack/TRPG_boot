/**
 * Строка списка ДРУЗЕЙ (страница «Друзья»).
 *
 * Соц-концепция без статусов (см. память проекта): ни рангов, ни рейтинга —
 * только сам факт «тренировался на этой неделе».
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
 * Тап → onTap(friend). Долгое нажатие (550мс) → onLongPress(friend, rect строки)
 * — по rect страница вешает меню по центру под этой строкой.
 * Лонг-пресс не конфликтует со скроллом: сдвиг больше порога / раннее отпускание
 * трактуется как тап/скролл.
 */

import { memo, useRef, useState } from 'react'
import { formatRelative, periodRange } from '../utils/history'
import WeeklyMuscle from './WeeklyMuscle'
import Avatar from './Avatar'

const LONG_PRESS_MS = 550
const MOVE_TOLERANCE = 10 // px — сдвиг больше = это скролл, не лонг-пресс

function FriendRow({ friend, onTap, onLongPress, weekRange }) {
  const {
    first_name,
    is_training,
    photo_url,
    last_workout_at,
    pinned_at,
    week_workouts
  } = friend

  const displayName = first_name || 'Игрок'
  const isPinned = !!pinned_at

  const lastWorkoutText = last_workout_at ? formatRelative(last_workout_at) : null

  // Тренировался ли на этой неделе (МСК, Пн–Вс). Границы недели считаются ОДИН раз
  // в Friends и приходят пропсом (fallback — на случай прямого использования).
  const [weekStart, weekEnd] = weekRange || periodRange('week')
  const lastMs = last_workout_at ? new Date(last_workout_at).getTime() : 0
  const trainedThisWeek = lastMs >= weekStart && lastMs < weekEnd

  const [pressed, setPressed] = useState(false)
  const rowRef = useRef(null)
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
      setPressed(false)
      onLongPress?.(friend, rowRef.current?.getBoundingClientRect() || null)
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
      ref={rowRef}
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
          ? 'var(--layer-3)'
          : (isPinned ? 'var(--highlight-recent)' : 'transparent')
      }}
    >
      {/* Аватар — общий компонент: буква под фото, фото проявляется поверх. */}
      <Avatar src={photo_url} name={displayName} size={52} />

      {/* Имя + последняя тренировка */}
      <div style={styles.nameBlock}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{displayName}</span>
        </div>
        <div style={styles.metaRow}>
          {/* Тренируется прямо сейчас — ЗАМЕНЯЕТ строку «когда тренировался»,
              а не добавляется к ней точкой рядом с именем.
              Так честнее: строка под именем отвечает на вопрос «что у него
              с тренировками», и «прямо сейчас» — такой же ответ, как «3 дня
              назад», только свежайший. Точка же сообщала то же самое вторым
              способом и в другом месте, отчего строка ниже начинала врать:
              человек тренируется, а под именем «3 дня назад». */}
          <span style={is_training ? styles.trainingNow : styles.lastWorkout}>
            {is_training
              ? 'Тренируется сейчас'
              : (lastWorkoutText || 'Ещё не тренировался')}
          </span>
        </div>
      </div>

      {/* Индикатор недели: бицепс в силе, набранной другом за эту неделю.
          Не тренировался — не показываем вовсе: серый значок в списке читался
          бы как укор, а строка под именем и так говорит, когда он был в зале.
          Статистика у друга закрыта (week_workouts === null) — показываем
          первую стадию: факт активности виден, точное число нет. */}
      {trainedThisWeek && (
        <div style={styles.weekFlame} aria-label="Тренировался на этой неделе">
          <WeeklyMuscle count={week_workouts ?? 1} size={20} />
        </div>
      )}
    </div>
  )
}

export default memo(FriendRow)

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    transition: 'background 0.2s ease',
    cursor: 'pointer',
    touchAction: 'pan-y'
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)'
  },
  // «Тренируется сейчас» — та же строка, что «3 дня назад», но акцентным
  // цветом и жирнее. Отдельного значка не нужно: цвет в сером списке заметен
  // сам по себе, а лишний элемент пришлось бы выравнивать и объяснять.
  trainingNow: {
    fontFamily: 'var(--font-manrope)',
    // Тот же кегль, что у «3 дня назад»: строка подменяется, и прыгать
    // по высоте она не должна.
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    color: 'var(--color-primary)'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-1)',
    overflow: 'hidden'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
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
    gap: 'var(--space-15)',
    overflow: 'hidden'
  },
  lastWorkout: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
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