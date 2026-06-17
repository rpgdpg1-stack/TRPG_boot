import { useEffect, useRef, useState } from 'react'
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
 * Друзья показаны как на странице, но компактно: по 3 в «окне», свайп влево/вправо
 * между окнами. Максимум 2 окна = 6 друзей; снизу — точки-индикаторы (как в избранном).
 * Тап по другу → карточка игрока (PlayerProfileModal) с подстраховкой.
 * Закрепление (long-press) тут не делаем — оно живёт на странице «Друзья».
 */

const PER_PAGE = 3
const MAX_FRIENDS = 6

export default function FriendsBlock() {
  const navigate = useNavigate()
  const [friends, setFriends] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)
  const [sentToast, setSentToast] = useState(null)
  const swipeRef = useRef({ x: null, swiped: false })

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getFriendsList().then(list => {
        if (cancelled) return
        setFriends((list || []).slice(0, MAX_FRIENDS))
        setLoaded(true)
      })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  // Разбиваем на окна по 3.
  const pages = []
  for (let i = 0; i < friends.length; i += PER_PAGE) pages.push(friends.slice(i, i + PER_PAGE))
  const pageIdx = Math.min(page, Math.max(0, pages.length - 1))

  const goPage = (i) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, i))
    if (clamped !== pageIdx) { haptic.light(); setPage(clamped) }
  }

  const handleTouchStart = (e) => {
    swipeRef.current.x = e.touches[0].clientX
    swipeRef.current.swiped = false
  }
  const handleTouchEnd = (e) => {
    const startX = swipeRef.current.x
    swipeRef.current.x = null
    if (startX === null || pages.length < 2) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) < 50) return // это тап, не свайп
    swipeRef.current.swiped = true
    goPage(dx < 0 ? pageIdx + 1 : pageIdx - 1)
    setTimeout(() => { swipeRef.current.swiped = false }, 120)
  }

  const handleRowTap = (friend) => {
    if (swipeRef.current.swiped) return
    haptic.light()
    setSelected(friend)
  }

  const handleBackupDone = (targetName) => {
    setSelected(null)
    setSentToast({ targetName })
  }

  if (!loaded) return <div style={styles.skeleton} />

  if (friends.length === 0) {
    return (
      <button onClick={() => { haptic.light(); navigate('/friends') }} className="press-tile" style={styles.empty}>
        Пока нет друзей — пригласи и следите за прогрессом друг друга
      </button>
    )
  }

  const current = pages[pageIdx] || []

  return (
    <div>
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={styles.swipeArea}>
        <div style={styles.card}>
          {current.map((friend, idx) => (
            <div key={friend.user_id} style={idx === 0 ? undefined : styles.rowDivider}>
              <FriendRow friend={friend} onTap={handleRowTap} />
            </div>
          ))}
        </div>
      </div>

      {pages.length > 1 && (
        <div style={styles.dots}>
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => goPage(i)}
              style={{
                ...styles.dot,
                background: i === pageIdx ? 'var(--color-primary)' : 'rgba(255,255,255,0.2)',
                width: i === pageIdx ? '16px' : '6px'
              }}
              aria-label={`Окно ${i + 1}`}
            />
          ))}
        </div>
      )}

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
    height: '88px',
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
  swipeArea: { touchAction: 'pan-y' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  rowDivider: { borderTop: '1px solid rgba(255,255,255,0.06)' },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '10px'
  },
  dot: {
    height: '6px',
    borderRadius: '999px',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    transition: 'width 0.2s ease, background 0.2s ease'
  }
}
