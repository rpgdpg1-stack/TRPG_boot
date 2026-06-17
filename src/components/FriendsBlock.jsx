import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getFriendsList } from '../lib/friends-list'
import { EVENTS, on } from '../lib/events'
import { BACKUP_BONUS } from '../lib/backups'
import FriendRow from './FriendRow'
import PlayerProfileModal from './PlayerProfileModal'
import BackupSentToast from './rewards/BackupSentToast'

/**
 * Блок «Друзья» на главной (контент секции; заголовок рисует Home).
 *
 * Показываем ТОЛЬКО закреплённых друзей — вертикальным списком. Открепил →
 * друг исчезает из блока, список уменьшается. Растёт до лимита закрепов (6).
 * Тап по другу → карточка игрока (PlayerProfileModal) с подстраховкой.
 */
export default function FriendsBlock() {
  const navigate = useNavigate()
  const [pinned, setPinned] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(null)
  const [sentToast, setSentToast] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getFriendsList().then(list => {
        if (cancelled) return
        setPinned((list || []).filter(f => f.pinned_at))
        setLoaded(true)
      })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  const handleRowTap = (friend) => {
    haptic.light()
    setSelected(friend)
  }

  const handleBackupDone = (targetName) => {
    setSelected(null)
    setSentToast({ targetName })
  }

  if (!loaded) return <div style={styles.skeleton} />

  if (pinned.length === 0) {
    return (
      <button onClick={() => { haptic.light(); navigate('/friends') }} className="press-tile" style={styles.empty}>
        Закрепи друзей на странице «Друзья» — они появятся здесь
      </button>
    )
  }

  return (
    <div>
      <div style={styles.card}>
        {pinned.map((friend, idx) => (
          <div key={friend.user_id} style={idx === 0 ? undefined : styles.rowDivider}>
            <FriendRow friend={friend} onTap={handleRowTap} />
          </div>
        ))}
      </div>

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

const styles = {
  skeleton: {
    height: '72px',
    borderRadius: 'var(--radius-card)',
    background: 'rgba(255,255,255,0.04)'
  },
  empty: {
    width: '100%',
    minHeight: '64px',
    padding: '16px 18px',
    border: '1.5px dashed rgba(255,255,255,0.15)',
    borderRadius: 'var(--radius-card)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    lineHeight: 1.4,
    cursor: 'pointer'
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  rowDivider: { borderTop: '1px solid rgba(255,255,255,0.06)' }
}
