import { useEffect, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic, confirm as tgConfirm } from '../lib/telegram'
import { getFriendsList, getFriendsListSync, togglePinFriend, removeFriend, PIN_LIMIT } from '../lib/friends-list'
import { shareReferralLink } from '../lib/friends'
import { periodRange } from '../utils/history'
import { EVENTS, on } from '../lib/events'
import FriendRow from '../components/FriendRow'
import ActionButton from '../components/ActionButton'
import ScreenTitle from '../components/ScreenTitle'
import PlayerProfileModal from '../components/PlayerProfileModal'
import UiIcon from '../components/UiIcon'
import PinIcon from '../components/PinIcon'

/**
 * Страница «Друзья» (вкладка таб-бара).
 *
 * Соц-концепция без соревновательности: список друзей (без меня), отсортированный
 * сервером — закреплённые сверху → по свежести последней тренировки.
 * Тап по другу → карточка игрока (PlayerProfileModal, с учётом приватности).
 * Долгое нажатие → модалка: закрепить/открепить (лимит 6) или убрать из друзей.
 */
export default function Friends() {
  const navigate = useNavigate()

  const [friends, setFriends] = useState(() => getFriendsListSync() || [])
  const [loading, setLoading] = useState(() => getFriendsListSync() === null)
  const [selected, setSelected] = useState(null)      // друг для карточки игрока
  const [pinTarget, setPinTarget] = useState(null)    // друг для модалки закрепа
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

  // Границы текущей недели — считаем ОДИН раз на экран и прокидываем в строки
  // (в FriendRow больше не пересчитывается на каждую строку).
  const weekRange = useMemo(() => periodRange('week'), [])

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  const handleRowTap = useCallback((friend) => {
    haptic.light()
    setSelected(friend)
  }, [])

  const handleLongPress = useCallback((friend) => {
    haptic.medium()
    setPinError(null)
    setPinTarget(friend)
  }, [])

  const handleRemoveFriend = async () => {
    if (!pinTarget) return
    const name = pinTarget.first_name || 'этого друга'
    const ok = await tgConfirm(`Убрать ${name} из друзей?`)
    if (!ok) return
    haptic.medium()
    const res = await removeFriend(pinTarget.user_id)
    if (res.success) {
      haptic.success()
      setPinTarget(null)
      load()
    } else {
      haptic.error()
      setPinError('Не удалось убрать. Попробуй позже.')
    }
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

  return (
    <div className="page page-fade" style={styles.page}>

      <header style={styles.header}>
        <ScreenTitle>Друзья</ScreenTitle>
        {/* Под заголовком: счётчик друзей по центру. */}
        <div style={styles.subRow}>
          <span style={styles.subInfo}>
            {loading ? '' : friends.length === 0 ? '' : `Друзей: ${friends.length}`}
          </span>
        </div>
      </header>

      {loading ? (
        <div style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={i === 0 ? styles.skRow : { ...styles.skRow, ...styles.rowDivider }}>
              <div style={styles.skAvatar} />
              <div style={styles.skText}>
                <div style={{ ...styles.skLine, width: '45%' }} />
                <div style={{ ...styles.skLine, width: '65%', height: '10px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : friends.length === 0 ? (
        <div style={styles.inviteBlock}>
          <div style={styles.inviteEmoji}>
            <UiIcon name="invite-friend" size={40} color="var(--color-primary)" />
          </div>
          <div style={styles.inviteTitle}>Друзей пока нет</div>
          <div style={styles.inviteSubtitle}>
            Пригласи друзей через Telegram<br />
            и следи за прогрессом друг друга
          </div>
          <ActionButton onClick={handleInviteTap} variant="primary" hug style={{ gap: '8px' }}>
            <UiIcon name="invite-friend" size={16} color="var(--color-text)" />
            Пригласить друга
          </ActionButton>
        </div>
      ) : (
        <>
          {/* Подсказка про закреп — только пока нет ни одного закреплённого. */}
          {pinnedFriends.length === 0 && (
            <div style={styles.hint}>
              Удерживай друга, чтобы закрепить
              <span style={styles.hintPin}><PinIcon filled size={12} /></span>
            </div>
          )}

          {/* Закреплённые сверху — без подписи (сами выделены фоном строки). */}
          {pinnedFriends.length > 0 && (
            <>
              <div style={styles.list}>
                {pinnedFriends.map((friend, idx) => (
                  <div key={friend.user_id} style={idx === 0 ? undefined : styles.rowDivider}>
                    <FriendRow friend={friend} onTap={handleRowTap} onLongPress={handleLongPress} weekRange={weekRange} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Остальные друзья */}
          {otherFriends.length > 0 && (
            <div style={{ ...styles.list, marginTop: pinnedFriends.length > 0 ? '12px' : 0 }}>
              {otherFriends.map((friend, idx) => (
                <div key={friend.user_id} style={idx === 0 ? undefined : styles.rowDivider}>
                  <FriendRow friend={friend} onTap={handleRowTap} onLongPress={handleLongPress} weekRange={weekRange} />
                </div>
              ))}
            </div>
          )}

          <div style={styles.bottomInvite}>
            <ActionButton onClick={handleInviteTap} variant="primary" hug style={{ gap: '8px' }}>
              <UiIcon name="invite-friend" size={16} color="var(--color-text)" />
              Пригласить друга
            </ActionButton>
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
          onRemove={handleRemoveFriend}
          onClose={() => { setPinTarget(null); setPinError(null) }}
        />
      )}

      {/* Карточка игрока */}
      {selected && (
        <PlayerProfileModal
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/**
 * Модалка долгого нажатия: имя друга + закрепить/открепить + убрать из друзей.
 * Если упёрся в лимит при закрепе — errorText подсвечивается.
 */
function PinModal({ friend, isPinned, errorText, onToggle, onRemove, onClose }) {
  const name = friend.first_name || 'Игрок'
  return createPortal(
    <div style={pinStyles.overlay} onClick={onClose}>
      <div style={pinStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={pinStyles.icon}><PinIcon filled={isPinned} size={40} /></div>
        <div style={pinStyles.title}>{name}</div>
        <div style={pinStyles.subtitle}>
          {isPinned
            ? 'Этот друг закреплён вверху списка'
            : 'Закрепить друга вверху списка'}
        </div>

        {errorText && <div style={pinStyles.error}>{errorText}</div>}

        <ActionButton
          variant={isPinned ? 'ghost' : 'gray'}
          size="sm"
          onClick={onToggle}
          style={{ width: '100%' }}
        >
          {isPinned ? 'ОТКРЕПИТЬ' : 'ЗАКРЕПИТЬ'}
        </ActionButton>
        {/* Убрать из друзей — рядом с закрепом, приглушённо-красным (с подтверждением). */}
        <button onClick={onRemove} style={pinStyles.remove}>Убрать из друзей</button>
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
  // Строка под заголовком: счётчик друзей по центру.
  subRow: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '36px'
  },
  subInfo: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    fontWeight: 500,
    minHeight: '14px'
  },
  hint: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    marginBottom: '10px',
    fontWeight: 500,
    opacity: 0.7
  },
  hintPin: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  // Микро-лейбл группы «Закреплённые» (когда есть и обычные друзья).
  groupLabel: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '10px',
    letterSpacing: '1.5px', color: 'var(--color-text-secondary)',
    padding: '0 4px 6px', textTransform: 'uppercase'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  rowDivider: {
    borderTop: '1px solid var(--border-hairline)'
  },
  // Скелетон строки друга (только самый первый заход без кеша).
  skRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px' },
  skAvatar: { width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 },
  skText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '7px' },
  skLine: { height: '12px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)' },
  inviteBlock: {
    marginTop: '20px',
    padding: '32px 20px',
    textAlign: 'center',
    background: 'rgba(158, 209, 83, 0.05)',
    border: '1px dashed rgba(158, 209, 83, 0.25)',
    borderRadius: 'var(--radius-card)'
  },
  inviteEmoji: { marginBottom: '8px' },
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
  bottomInvite: {
    marginTop: '20px',
    paddingTop: '12px',
    display: 'flex',
    justifyContent: 'center'
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
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)',
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
  remove: {
    width: '100%',
    marginTop: '4px',
    padding: '10px',
    background: 'transparent',
    color: '#E84545',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer'
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
    border: 'none',
    cursor: 'pointer'
  }
}