import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getFriendsList, togglePinFriend, PIN_LIMIT, invalidateFriendsListCache } from '../lib/friends-list'
import { shareReferralLink } from '../lib/friends'
import { EVENTS, on } from '../lib/events'
import FriendRow from '../components/FriendRow'
import BackupAllButton from '../components/BackupAllButton'
import PlayerProfileModal from '../components/PlayerProfileModal'
import BackupSentToast from '../components/rewards/BackupSentToast'
import UiIcon from '../components/UiIcon'
import { BACKUP_BONUS } from '../lib/backups'

/**
 * Страница «Друзья» (вкладка таб-бара вместо кубка).
 *
 * Список друзей (без меня), отсортированный сервером: закреплённые сверху →
 * по свежести последней тренировки. Долгое нажатие на друга → модалка
 * закрепа (📌, лимит 6). Тап → карточка игрока (PlayerProfileModal) с
 * возможностью подстраховки.
 *
 * Кубок справа в шапке → переход на страницу рейтинга (вкладка «Друзья»).
 */
export default function Friends() {
  const navigate = useNavigate()

  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)      // друг для карточки игрока
  const [pinTarget, setPinTarget] = useState(null)    // друг для модалки закрепа
  const [sentToast, setSentToast] = useState(null)
  const [pinError, setPinError] = useState(null)      // текст ошибки лимита

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate('/'))
    lockVerticalSwipes()
  }, [navigate])

  const load = () => {
    getFriendsList().then(list => {
      setFriends(list)
      setLoading(false)
    })
  }

  useEffect(() => {
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return off
  }, [])

  const pinnedFriends = friends.filter(f => f.pinned_at)
  const otherFriends = friends.filter(f => !f.pinned_at)
  const pinnedCount = pinnedFriends.length
  const eligiblePinnedCount = pinnedFriends.filter(f => !f.backed_today).length

  const handleBackupAllDone = () => {
    invalidateFriendsListCache()
    load()
  }

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  const handleCupTap = () => {
    haptic.light()
    navigate('/leaderboard?tab=friends', { state: { from: '/friends' } })
  }

  const handleRowTap = (friend) => {
    haptic.light()
    setSelected(friend)
  }

  const handleLongPress = (friend) => {
    haptic.medium()
    setPinError(null)
    setPinTarget(friend)
  }

  const handleTogglePin = async () => {
    if (!pinTarget) return
    const wasPinned = !!pinTarget.pinned_at

    // Если закрепляем (не открепляем) и уже лимит — не даём, показываем ошибку
    if (!wasPinned && pinnedCount >= PIN_LIMIT) {
      haptic.error()
      setPinError(`Максимум ${PIN_LIMIT} закреплённых`)
      return
    }

    haptic.light()
    const result = await togglePinFriend(pinTarget.user_id)
    if (result.success) {
      haptic.success()
      setPinTarget(null)
      load()
    } else if (result.error === 'limit') {
      haptic.error()
      setPinError(`Максимум ${PIN_LIMIT} закреплённых`)
    } else {
      haptic.error()
      setPinTarget(null)
    }
  }

  const handleBackupDone = (targetName) => {
    setSelected(null)
    setSentToast({ targetName })
  }

  return (
    <div className="page page-fade" style={styles.page}>

      <header style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>ДРУЗЬЯ</h1>
          <button onClick={handleCupTap} style={styles.cupButton} aria-label="Открыть рейтинг">
            <UiIcon name="leaderboard" size={24} color="#FFD700" />
          </button>
        </div>
        <div style={styles.subInfo}>
          {loading ? '' : friends.length === 0 ? '' : `Друзей: ${friends.length}`}
        </div>
      </header>

      {loading ? (
        <div style={styles.empty}>Загрузка...</div>
      ) : friends.length === 0 ? (
        <div style={styles.inviteBlock}>
          <div style={styles.inviteEmoji}>
            <UiIcon name="invite-friend" size={40} color="var(--color-primary)" />
          </div>
          <div style={styles.inviteTitle}>Друзей пока нет</div>
          <div style={styles.inviteSubtitle}>
            Пригласи друзей через Telegram, следите<br />
            за прогрессом друг друга
          </div>
          <button onClick={handleInviteTap} style={{ ...styles.inviteButton, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <UiIcon name="invite-friend" size={16} color="#0D0C0C" />
            ПРИГЛАСИТЬ ДРУГА
          </button>
        </div>
      ) : (
        <>
          <div style={styles.hint}>Удерживай друга, чтобы закрепить 📌</div>

          {/* Закреплённые сверху */}
          {pinnedFriends.length > 0 && (
            <div style={styles.list}>
              {pinnedFriends.map((friend, idx) => (
                <div key={friend.user_id} style={idx === 0 ? undefined : styles.rowDivider}>
                  <FriendRow friend={friend} onTap={handleRowTap} onLongPress={handleLongPress} />
                </div>
              ))}
            </div>
          )}

          {/* Подстраховать всех закреплённых — под закреплёнными */}
          {eligiblePinnedCount > 0 && <BackupAllButton onDone={handleBackupAllDone} />}

          {/* Остальные друзья */}
          {otherFriends.length > 0 && (
            <div style={{ ...styles.list, marginTop: pinnedFriends.length > 0 ? '12px' : 0 }}>
              {otherFriends.map((friend, idx) => (
                <div key={friend.user_id} style={idx === 0 ? undefined : styles.rowDivider}>
                  <FriendRow friend={friend} onTap={handleRowTap} onLongPress={handleLongPress} />
                </div>
              ))}
            </div>
          )}

          <div style={styles.bottomInvite}>
            <button onClick={handleInviteTap} className="press-tile" style={{ ...styles.inviteButtonSecondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <UiIcon name="invite-friend" size={16} color="var(--color-primary)" />
              Добавить друга
            </button>
          </div>
        </>
      )}

      {/* Модалка закрепа */}
      {pinTarget && (
        <PinModal
          friend={pinTarget}
          isPinned={!!pinTarget.pinned_at}
          errorText={pinError}
          onToggle={handleTogglePin}
          onClose={() => { setPinTarget(null); setPinError(null) }}
        />
      )}

      {/* Карточка игрока */}
      {selected && (
        <PlayerProfileModal
          row={selected}
          onClose={() => setSelected(null)}
          onBackupDone={handleBackupDone}
        />
      )}

      {sentToast && (
        <BackupSentToast
          targetName={sentToast.targetName}
          bonus={BACKUP_BONUS}
          onConfirm={() => setSentToast(null)}
        />
      )}
    </div>
  )
}

/**
 * Модалка закрепа: показывает имя друга и кнопку Закрепить/Открепить.
 * Если упёрся в лимит при закрепе — errorText подсвечивается.
 */
function PinModal({ friend, isPinned, errorText, onToggle, onClose }) {
  const name = friend.first_name || 'Игрок'
  return createPortal(
    <div style={pinStyles.overlay} onClick={onClose}>
      <div style={pinStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={pinStyles.icon}>📌</div>
        <div style={pinStyles.title}>{name}</div>
        <div style={pinStyles.subtitle}>
          {isPinned
            ? 'Этот друг закреплён вверху списка'
            : 'Закрепить друга вверху списка'}
        </div>

        {errorText && <div style={pinStyles.error}>{errorText}</div>}

        <button onClick={onToggle} style={isPinned ? pinStyles.unpinButton : pinStyles.pinButton}>
          {isPinned ? 'ОТКРЕПИТЬ' : '📌 ЗАКРЕПИТЬ'}
        </button>
        <button onClick={onClose} style={pinStyles.close}>ОТМЕНА</button>
      </div>

      <style>{`
        @keyframes pinOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pinPanel {
          0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}

const styles = {
  page: {},
  header: {
    marginBottom: '16px'
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    position: 'relative'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '32px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1,
    margin: 0
  },
  cupButton: {
    position: 'absolute',
    right: 0,
    width: '36px',
    height: '36px',
    background: 'transparent',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  subInfo: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    marginTop: '8px',
    fontWeight: 500,
    minHeight: '14px'
  },
  hint: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    marginBottom: '10px',
    fontWeight: 500,
    opacity: 0.7
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  rowDivider: {
    borderTop: '1px solid rgba(255, 255, 255, 0.06)'
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  },
  inviteBlock: {
    marginTop: '20px',
    padding: '32px 20px',
    textAlign: 'center',
    background: 'rgba(158, 209, 83, 0.05)',
    border: '1px dashed rgba(158, 209, 83, 0.25)',
    borderRadius: 'var(--radius-card)'
  },
  inviteEmoji: { fontSize: '40px', marginBottom: '8px' },
  inviteTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '16px',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    marginBottom: '8px'
  },
  inviteSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    marginBottom: '20px'
  },
  inviteButton: {
    padding: '12px 24px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: 'var(--radius-medium)',
    border: 'none',
    boxShadow: '0 4px 16px rgba(158, 209, 83, 0.3)'
  },
  bottomInvite: {
    marginTop: '20px',
    paddingTop: '12px',
    display: 'flex',
    justifyContent: 'center'
  },
  inviteButtonSecondary: {
    width: '100%',
    padding: '16px',
    background: 'rgba(158, 209, 83, 0.08)',
    color: 'var(--color-primary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: 'var(--radius-medium)',
    border: '1px solid rgba(158, 209, 83, 0.25)'
  }
}

const pinStyles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    animation: 'pinOverlay 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '300px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: '24px 22px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    animation: 'pinPanel 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  icon: { fontSize: '32px', lineHeight: 1, marginBottom: '2px' },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--color-text)',
    textAlign: 'center'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.4,
    marginBottom: '8px'
  },
  error: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: '#E84545',
    textAlign: 'center',
    fontWeight: 600,
    marginBottom: '4px'
  },
  pinButton: {
    width: '100%',
    padding: '14px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '1px',
    borderRadius: 'var(--radius-medium)',
    border: 'none'
  },
  unpinButton: {
    width: '100%',
    padding: '14px',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: 'var(--radius-medium)',
    border: '1px solid rgba(255, 255, 255, 0.08)'
  },
  close: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '1px',
    border: 'none'
  }
}