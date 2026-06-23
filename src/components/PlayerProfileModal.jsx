import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { getCurrentUser } from '../lib/auth'
import { backupUser, getUserPublicProfile, BACKUP_DAILY_LIMIT } from '../lib/backups'
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
  const [todayCount, setTodayCount] = useState(null)
  const [bicepsTick, setBicepsTick] = useState(0)
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
        setTodayCount(data.today_backup_count ?? null)
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
    setBackupState('sending')

    const result = await backupUser(row.user_id)
    if (result.success) {
      haptic.success()
      onBackupDone?.(row.first_name || 'Игрок')
    } else if (result.error === 'already_today') {
      setBackupState('already')
    } else if (result.error === 'daily_limit') {
      haptic.error()
      if (result.todayCount != null) setTodayCount(result.todayCount)
      setBackupState('limit')
    } else {
      haptic.error()
      setBackupState('idle')
      window.alert('Не удалось подстраховать. Проверь подключение.')
    }
  }

  const limitLabel = `Лимит на сегодня · ${BACKUP_DAILY_LIMIT}/${BACKUP_DAILY_LIMIT}`
  const buttonText = backupState === 'sending' ? 'ОТПРАВКА...'
                   : backupState === 'already' ? 'УЖЕ ПОДСТРАХОВАН СЕГОДНЯ'
                   : backupState === 'limit'   ? limitLabel
                   : null

  // Место рядом с кубком — ВСЕГДА место в ЛИГЕ игрока (не среди друзей).
  // Друзья и обе вкладки рейтинга кладут его в league_place; на старых
  // строках без league_place — фолбэк на place.
  const leaguePlace = row.league_place ?? row.place ?? 1
  const leagueTotal = row.total_in_league ?? null

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.inner} onClick={(e) => e.stopPropagation()}>
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
        />

        {!isSelf && (
          backupState === 'loading' ? (
            // Статус ещё не пришёл с сервера — нейтральный плейсхолдер той же
            // высоты, чтобы кнопка не прыгала «Подстраховать»→«Уже подстрахован».
            <div style={{ ...styles.backupButton, ...styles.backupButtonDisabled, ...styles.backupButtonSkeleton }} />
          ) : backupState === 'idle' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button onClick={handleBackup} className="press-tile" style={styles.backupButton}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  Подстраховать <MuscleIcon size={26} earned={true} flexTrigger={bicepsTick} />
                </span>
              </button>
              {todayCount != null && (
                <div style={styles.backupCounter}>
                  Сегодня {todayCount}/{BACKUP_DAILY_LIMIT}
                </div>
              )}
            </div>
          ) : (
            <button disabled style={{ ...styles.backupButton, ...styles.backupButtonDisabled }}>
              {buttonText}
            </button>
          )
        )}

        <button onClick={onClose} className="press-tile" style={styles.close}>ЗАКРЫТЬ</button>
      </div>

      <style>{`
        @keyframes profileModalOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes profileModalPanel {
          0%   { opacity: 0; transform: scale(0.9) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes profileSkeletonPulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.7; }
        }
      `}</style>
    </div>,
    document.body
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(13, 12, 12, 0.88)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 'calc(var(--tg-safe-top) - 10px) 20px calc(var(--tabbar-height) + 40px)',
    overflowY: 'auto',
    animation: 'profileModalOverlay 0.25s ease-out forwards'
  },
  inner: {
    width: '100%',
    maxWidth: '340px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    animation: 'profileModalPanel 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  backupButton: {
    width: '100%',
    minHeight: '56px',          // единая высота с close и disabled-вариантом
    boxSizing: 'border-box',    // padding не распирает высоту сверх minHeight
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(158, 209, 83, 0.16)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'var(--color-primary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '1px',
    borderRadius: 'var(--radius-medium)',
    border: '1px solid rgba(158, 209, 83, 0.35)',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(158, 209, 83, 0.12)'
  },
  backupButtonDisabled: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--color-text-secondary)',
    boxShadow: 'none',
    cursor: 'default',
    letterSpacing: '0.5px',
    fontSize: '12px'
  },
  backupButtonSkeleton: {
    border: '1px solid rgba(255, 255, 255, 0.06)',
    animation: 'profileSkeletonPulse 1.2s ease-in-out infinite'
  },
  backupCounter: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    letterSpacing: '0.5px'
  },
  close: {
    width: '100%',
    minHeight: '56px',          // единая высота со всеми кнопками подстраховки
    boxSizing: 'border-box',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    borderRadius: 'var(--radius-medium)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    cursor: 'pointer'
  }
}