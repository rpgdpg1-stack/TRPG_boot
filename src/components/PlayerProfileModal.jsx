import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { getCurrentUser } from '../lib/auth'
import { backupUser, getUserPublicProfile, BACKUP_DAILY_LIMIT, BACKUP_BONUS } from '../lib/backups'
import { getCachedProfile, setCachedProfile } from '../lib/profile-cache'
import { resolveWeeklyStreak } from '../utils/dates'
import ProfileHeader from './ProfileHeader'
import MuscleIcon from './MuscleIcon'

/**
 * Модалка профиля игрока. Переиспользуется из Рейтинга и из страницы Друзья.
 *
 * ProfileHeader в режиме просмотра (interactive=false, логин скрыт).
 * Подгружает публичный профиль (последняя тренировка, стрик, тренировки).
 * Для чужого игрока — кнопка «Подстраховать +100 💪» со статусами
 * already / limit (показываются сразу при открытии).
 *
 * Пропсы:
 *   row          — строка игрока: { user_id, first_name, username, photo_url,
 *                  total_muscles, rank_index, place | league_place, ... }
 *   onClose      — закрыть модалку
 *   onBackupDone(name) — успешная подстраховка (родитель покажет тост)
 *
 * Место в карточке (🏆 #N) берётся из row.place — Рейтинг и Друзья кладут
 * туда нужное значение (место в лиге).
 */
export default function PlayerProfileModal({ row, onClose, onBackupDone }) {
  const me = getCurrentUser()
  const isSelf = me && row.user_id === me.id

  // Стартуем pub из кеша (если друг уже открывался) — тогда тренировки/стрик/
  // последняя тренировка показываются сразу, без мелькания «—». Для чужих из
  // лиги кеша обычно нет → pub=null → покажем скелетон.
  const [pub, setPub] = useState(() => getCachedProfile(row.user_id))
  // backupState стартует 'loading' — кнопку подстраховки не рисуем, пока сервер
  // не сказал реальный статус (иначе мигает «Подстраховать» → «Уже подстрахован»).
  const [backupState, setBackupState] = useState('loading') // loading|idle|sending|already|limit
  const [bicepsTick, setBicepsTick] = useState(0)
  const [fly, setFly] = useState(0) // тик «полёта» мускула +20 (по тапу подстраховки)
  const bicepsTimers = useRef([])

  useEffect(() => {
    let cancelled = false
    getUserPublicProfile(row.user_id).then(data => {
      // Кеш пишем ВСЕГДА, даже если модалку уже закрыли (cancelled) — данные
      // с сервера пришли, незачем их терять. Иначе при быстром закрытии профиль
      // не кешируется и в след. раз снова мигает. Гейт cancelled — только для setState.
      if (data) setCachedProfile(row.user_id, data)

      if (cancelled) return
      setPub(data)
      if (data) {
        if (data.already_backed_today) {
          setBackupState('already')
        } else if ((data.today_backup_count ?? 0) >= (data.daily_backup_limit ?? BACKUP_DAILY_LIMIT)) {
          setBackupState('limit')
        } else {
          setBackupState('idle')
        }
      } else {
        // Сервер не ответил — снимаем loading, даём попробовать подстраховать
        setBackupState('idle')
      }
    })
    return () => { cancelled = true }
  }, [row.user_id])

  useEffect(() => {
    const start = setTimeout(() => {
      setBicepsTick(t => t + 1)
      const interval = setInterval(() => setBicepsTick(t => t + 1), 5000)
      bicepsTimers.current.push(interval)
    }, 3000)
    bicepsTimers.current.push(start)
    return () => {
      bicepsTimers.current.forEach(id => {
        clearTimeout(id)
        clearInterval(id)
      })
      bicepsTimers.current = []
    }
  }, [])

  const userObj = {
    first_name: row.first_name,
    username: row.username,
    photo_url: row.photo_url,
    // active_title из публичного профиля (api_get_user_public_profile его отдаёт).
    // Нужен, чтобы у чужого игрока показывался надетый титул #1/#2/#3 под именем.
    // row.active_title — на случай если родитель уже положил его в строку.
    active_title: pub?.active_title ?? row.active_title ?? null
  }

  const handleBackup = async () => {
    if (backupState !== 'idle') return
    haptic.medium()
    setFly(f => f + 1) // мускул +20 летит вверх сразу (оптимистично)
    setBackupState('sending')

    const result = await backupUser(row.user_id)
    if (result.success) {
      haptic.success()
      setBackupState('already') // строка станет «Сегодня уже помог», если модалка осталась
      onBackupDone?.(row.first_name || 'Игрок')
    } else if (result.error === 'already_today') {
      setBackupState('already')
    } else if (result.error === 'daily_limit') {
      haptic.error()
      setBackupState('limit')
    } else {
      haptic.error()
      setBackupState('idle')
      window.alert('Не удалось подстраховать. Проверь подключение.')
    }
  }

  // Строка действия ВНУТРИ карточки профиля (Apple Card): разделитель сверху даёт
  // ProfileHeader, тут — тапабельный текст «Подстраховать» + мускул / статус.
  const tappable = backupState === 'idle'
  const backupRow = isSelf ? null : (
    <div
      onClick={tappable ? handleBackup : undefined}
      className={tappable ? 'tg-row' : undefined}
      style={{
        ...styles.actionRow,
        color: tappable ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        cursor: tappable ? 'pointer' : 'default'
      }}
    >
      {backupState === 'loading' ? <span style={{ opacity: 0 }}>—</span>
        : backupState === 'sending' ? 'Отправляю…'
        : backupState === 'already' ? 'Сегодня уже помог'
        : backupState === 'limit'   ? `Лимит ${BACKUP_DAILY_LIMIT}/${BACKUP_DAILY_LIMIT} — возвращайся завтра`
        : (<>Подстраховать <MuscleIcon size={20} earned={true} flexTrigger={bicepsTick} /></>)}

      {/* Мускул +20 улетает вверх по тапу (как при «подстраховать всех»). */}
      {fly > 0 && (
        <span key={fly} style={styles.flyer}>
          <MuscleIcon size={30} earned={true} flexTrigger={fly} />
          <span style={styles.flyerPlus}>+{BACKUP_BONUS}</span>
        </span>
      )}
    </div>
  )

  // Место рядом с кубком — ВСЕГДА место в ЛИГЕ игрока (не среди друзей).
  // Друзья и обе вкладки рейтинга кладут его в league_place; на старых
  // строках без league_place — фолбэк на place.
  const leaguePlace = row.league_place ?? row.place ?? 1
  const leagueTotal = row.total_in_league ?? null

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.inner} onClick={(e) => e.stopPropagation()}>
        {/* Серый крестик в верхнем правом углу — как принято в модалках. Тап по
            фону тоже закрывает (overlay onClick). */}
        <button onClick={onClose} style={styles.closeBtn} aria-label="Закрыть">
          <CrossIcon />
        </button>
        <ProfileHeader
          user={userObj}
          xp={row.total_muscles || 0}
          streak={pub ? resolveWeeklyStreak(pub.weekly_streak, pub.weekly_streak_week) : null}
          totalWorkouts={pub?.total_workouts ?? null}
          friendsPlace={leaguePlace}
          rankIndex={row.rank_index}
          placeInLeague={true}
          totalInLeague={leagueTotal}
          lastWorkout={pub?.last_workout || null}
          statsLoading={pub === null}
          interactive={false}
          bottomAction={backupRow}
        />

      </div>

      <style>{`
        @keyframes profileModalOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes profileModalPanel {
          0%   { opacity: 0; transform: scale(0.9) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes backupFlyUp {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          15%  { opacity: 1; transform: translate(-50%, -70%) scale(1.2); }
          100% { opacity: 0; transform: translate(-50%, -240%) scale(0.95); }
        }
      `}</style>
    </div>,
    document.body
  )
}

/** Серый крестик-закрытие (тонкие линии, currentColor). */
function CrossIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M3.5 3.5 L11.5 11.5 M11.5 3.5 L3.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

const styles = {
  // Строка «Подстраховать» — часть карточки (Apple Card): не кнопка, а тапабельный
  // текст; высота ~54px, снизу скруглённые углы под карточку, press-подсветка .tg-row.
  actionRow: {
    position: 'relative',
    minHeight: '54px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '14px',
    letterSpacing: '0.5px',
    borderBottomLeftRadius: 'calc(var(--radius-card) - 1px)',
    borderBottomRightRadius: 'calc(var(--radius-card) - 1px)',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none'
  },
  // Улетающий вверх мускул +20 (по центру строки).
  flyer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    pointerEvents: 'none',
    zIndex: 5,
    filter: 'drop-shadow(0 0 10px rgba(250, 223, 190, 0.5))',
    animation: 'backupFlyUp 1.6s ease-out forwards'
  },
  flyerPlus: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '18px',
    color: 'var(--color-primary)'
  },
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(13, 12, 12, 0.88)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 'var(--tg-safe-top) 16px calc(var(--tabbar-height) + 40px)',
    overflowY: 'auto',
    animation: 'profileModalOverlay 0.25s ease-out forwards'
  },
  inner: {
    position: 'relative',
    width: '100%',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    animation: 'profileModalPanel 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  // Крестик в правом верхнем углу модалки — нейтральный серый кружок, ВНУТРИ
  // карточки с отступом (не на скруглении угла).
  closeBtn: {
    position: 'absolute',
    top: '14px',
    right: '14px',
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.06)',
    border: 'none',
    borderRadius: '50%',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    zIndex: 5,
    WebkitTapHighlightColor: 'transparent'
  }
}