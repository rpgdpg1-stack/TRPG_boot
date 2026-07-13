import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getUserPublicProfile } from '../lib/friends-list'
import { getCachedProfile, setCachedProfile } from '../lib/profile-cache'
import { resolveWeeklyStreak } from '../utils/dates'
import ProfileHeader from './ProfileHeader'
import FavoritesBlock from './FavoritesBlock'

/**
 * Модалка профиля друга (открывается тапом по строке на странице «Друзья»).
 *
 * Соц-концепция без статусов: показываем только аватар, имя, последнюю
 * тренировку и серию за неделю (та же шапка, что в своём профиле).
 * Подстраховка/рейтинг/лига удалены.
 *
 * Пропсы:
 *   row     — строка игрока: { user_id, first_name, username, photo_url }
 *   onClose — закрыть модалку
 */
export default function PlayerProfileModal({ row, onClose }) {
  // Стартуем из кеша (если друг уже открывался) — данные показываются сразу.
  const [pub, setPub] = useState(() => getCachedProfile(row.user_id))

  useEffect(() => {
    let cancelled = false
    getUserPublicProfile(row.user_id).then(data => {
      if (data) setCachedProfile(row.user_id, data)
      if (cancelled) return
      setPub(data)
    })
    return () => { cancelled = true }
  }, [row.user_id])

  const userObj = {
    first_name: row.first_name,
    username: row.username,
    photo_url: row.photo_url
  }

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.inner} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Закрыть">
          <CrossIcon />
        </button>
        <ProfileHeader
          user={userObj}
          streak={pub ? resolveWeeklyStreak(pub.weekly_streak, pub.weekly_streak_week) : null}
          lastWorkout={pub?.last_workout || null}
          showLastWorkout={pub?.show_last_workout ?? true}
          statsLoading={pub === null}
        />
        {pub?.favorites?.length > 0 && <FavoritesBlock items={pub.favorites} />}
      </div>

      <style>{`
        @keyframes profileModalOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes profileModalPanel {
          0%   { opacity: 0; transform: scale(0.9) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
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
