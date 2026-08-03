import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { usePullToRefresh, PullIndicator } from '../components/PullToRefresh'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic, confirm as tgConfirm } from '../lib/telegram'
import { getFriendsList, getFriendsListSync, togglePinFriend, removeFriend, invalidateFriendsListCache, PIN_LIMIT } from '../lib/friends-list'
import { shareReferralLink } from '../lib/friends'
import { periodRange } from '../utils/history'
import { pluralizeFriends } from '../utils/plural'
import { EVENTS, on } from '../lib/events'
import FriendRow from '../components/FriendRow'
import ActionButton from '../components/ActionButton'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import PlayerProfileModal from '../components/PlayerProfileModal'
import UiIcon from '../components/UiIcon'
import PinIcon from '../components/PinIcon'
import AnchorMenu from '../components/AnchorMenu'

/**
 * Страница «Друзья» (вкладка таб-бара).
 *
 * Соц-концепция без соревновательности: список друзей (без меня), отсортированный
 * сервером — закреплённые сверху → по свежести последней тренировки.
 * Тап по другу → карточка игрока (PlayerProfileModal, с учётом приватности).
 * Долгое нажатие → меню по центру под строкой (AnchorMenu, как у карточки
 * программы): закрепить/открепить (лимит 6) или убрать из друзей.
 */
export default function Friends() {
  const navigate = useNavigate()

  const [friends, setFriends] = useState(() => getFriendsListSync() || [])
  const [loading, setLoading] = useState(() => getFriendsListSync() === null)
  const [selected, setSelected] = useState(null)      // друг для карточки игрока
  const [menuFor, setMenuFor] = useState(null)        // { friend, rect } — меню long-press
  const [pinError, setPinError] = useState(null)      // текст ошибки лимита (гаснет сам)
  const pinErrorTimer = useRef(null)

  // Ошибка лимита закрепов — короткой строкой над списком (меню к тому моменту закрыто).
  const flashPinError = (text) => {
    setPinError(text)
    if (pinErrorTimer.current) clearTimeout(pinErrorTimer.current)
    pinErrorTimer.current = setTimeout(() => setPinError(null), 2600)
  }
  useEffect(() => () => { if (pinErrorTimer.current) clearTimeout(pinErrorTimer.current) }, [])

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

  // Pull-to-refresh живёт именно здесь: список друзей — единственные данные,
  // которые меняются БЕЗ участия пользователя (друзья тренируются сами).
  // Сбрасываем кеш и перечитываем — иначе TTL.SHORT отдаст прежний список.
  const handleRefresh = useCallback(async () => {
    invalidateFriendsListCache()
    await getFriendsList().then(list => setFriends(list)).catch(() => {})
  }, [])
  const { pull, refreshing } = usePullToRefresh(handleRefresh)

  // FLIP-переезд строк при закрепе/откреплении: снимаем позиции ДО перестройки
  // списка, после неё сдвигаем строку обратно на старое место и отпускаем —
  // браузер доигрывает путь сам. Анимируется только transform, поэтому это
  // дёшево даже на длинном списке.
  const rowRefs = useRef(new Map())
  const flipPrev = useRef(null)

  const snapshotRows = () => {
    const snap = new Map()
    rowRefs.current.forEach((el, id) => { if (el) snap.set(id, el.getBoundingClientRect().top) })
    flipPrev.current = snap
  }

  useLayoutEffect(() => {
    const prev = flipPrev.current
    if (!prev) return
    flipPrev.current = null
    rowRefs.current.forEach((el, id) => {
      if (!el) return
      const oldTop = prev.get(id)
      if (oldTop == null) return
      const delta = oldTop - el.getBoundingClientRect().top
      if (!delta) return
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.34s var(--ease-ios)'
        el.style.transform = ''
      })
    })
  }, [friends])

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

  const handleLongPress = useCallback((friend, rect) => {
    haptic.medium()
    setPinError(null)
    setMenuFor({ friend, rect })
  }, [])

  const handleRemoveFriend = async (friend) => {
    const name = friend.first_name || 'этого друга'
    const ok = await tgConfirm(`Убрать ${name} из друзей?`)
    if (!ok) return
    haptic.medium()
    const res = await removeFriend(friend.user_id)
    if (res.success) {
      haptic.success()
      load()
    } else {
      haptic.error()
      flashPinError('Не удалось убрать. Попробуй позже.')
    }
  }

  const handleTogglePin = async (friend) => {
    const wasPinned = !!friend.pinned_at
    snapshotRows()

    // Если закрепляем (не открепляем) и уже лимит — не даём, показываем ошибку
    if (!wasPinned && pinnedCount >= PIN_LIMIT) {
      haptic.error()
      flashPinError(`Максимум ${PIN_LIMIT} закреплённых`)
      return
    }

    const result = await togglePinFriend(friend.user_id)
    if (result.success) {
      haptic.success()
      load()
    } else if (result.error === 'limit') {
      haptic.error()
      flashPinError(`Максимум ${PIN_LIMIT} закреплённых`)
    } else {
      haptic.error()
    }
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Индикатор оттяга — портал в body, поверх нативного отскока. */}
      <PullIndicator pull={pull} refreshing={refreshing} />

      <header style={styles.header}>
        <ScreenTitle>Друзья</ScreenTitle>
        {/* Под заголовком: счётчик друзей по центру. */}
        <div style={styles.subRow}>
          <span style={styles.subInfo}>
            {loading || friends.length === 0 ? '' : `${friends.length} ${pluralizeFriends(friends.length)}`}
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
          <div style={styles.inviteTitle}>Пока нет друзей</div>
          <div style={styles.inviteSubtitle}>
            Пригласи друга через Telegram<br />
            и следите за прогрессом друг друга
          </div>
          <ActionButton onClick={handleInviteTap} variant="primary" size="sm" hug>
            <UiIcon name="invite-friend" size={20} color="var(--accent-on)" />
            Пригласить друга
          </ActionButton>
        </div>
      ) : (
        <>
          {/* Ошибка лимита закрепов — короткой строкой, гаснет сама. */}
          {pinError && <div style={styles.limitMsg}>{pinError}</div>}

          {/* Подсказка про закреп — только пока нет ни одного закреплённого. */}
          {pinnedFriends.length === 0 && (
            <div style={styles.hint}>
              Удерживай друга, чтобы закрепить
              <span style={styles.hintPin}><PinIcon filled size={12} /></span>
            </div>
          )}

          {/* Заголовки — только когда есть что разделять: пока никто не закреплён,
              это просто список друзей. */}
          {pinnedFriends.length > 0 && (
            <SectionLabel>Закреплённые</SectionLabel>
          )}
          {pinnedFriends.length > 0 && (
            <div style={styles.list}>
              {pinnedFriends.map((friend, idx) => (
                <div
                  key={friend.user_id}
                  ref={el => { if (el) rowRefs.current.set(friend.user_id, el); else rowRefs.current.delete(friend.user_id) }}
                  style={idx === 0 ? undefined : styles.rowDivider}
                >
                  <FriendRow friend={friend} onTap={handleRowTap} onLongPress={handleLongPress} weekRange={weekRange} />
                </div>
              ))}
            </div>
          )}

          {/* Остальные друзья */}
          {pinnedFriends.length > 0 && otherFriends.length > 0 && (
            <SectionLabel style={{ marginTop: 'var(--space-6)' }}>Все</SectionLabel>
          )}
          {otherFriends.length > 0 && (
            <div style={styles.list}>
              {otherFriends.map((friend, idx) => (
                <div
                  key={friend.user_id}
                  ref={el => { if (el) rowRefs.current.set(friend.user_id, el); else rowRefs.current.delete(friend.user_id) }}
                  style={idx === 0 ? undefined : styles.rowDivider}
                >
                  <FriendRow friend={friend} onTap={handleRowTap} onLongPress={handleLongPress} weekRange={weekRange} />
                </div>
              ))}
            </div>
          )}

          <div style={styles.bottomInvite}>
            <ActionButton onClick={handleInviteTap} variant="primary" size="sm" hug>
              <UiIcon name="invite-friend" size={20} color="var(--accent-on)" />
              Пригласить друга
            </ActionButton>
          </div>
        </>
      )}

      {/* Меню долгого нажатия — по центру под строкой друга (3px), выезд сверху вниз. */}
      {menuFor && (
        <AnchorMenu
          anchorRect={menuFor.rect}
          onClose={() => setMenuFor(null)}
          align="left"
          gap={3}
          motion="drop"
          items={[
            {
              key: 'pin',
              icon: <PinIcon filled={!!menuFor.friend.pinned_at} size={20} />,
              label: menuFor.friend.pinned_at ? 'Открепить' : 'Закрепить',
              haptic: 'medium',
              onClick: () => handleTogglePin(menuFor.friend)
            },
            {
              key: 'remove',
              icon: <RemoveFriendIcon />,
              label: 'Убрать из друзей',
              labelColor: 'var(--color-error)',
              onClick: () => handleRemoveFriend(menuFor.friend)
            }
          ]}
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

// Иконка пункта «Убрать из друзей» — человечек с минусом, в красном цвете пункта.
function RemoveFriendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke="var(--color-error)" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <circle cx="8.5" cy="6.5" r="3" />
        <path d="M3 16c0-2.8 2.5-4.5 5.5-4.5 1.2 0 2.3.27 3.2.76" />
        <path d="M13 14.5H18" />
      </g>
    </svg>
  )
}

const styles = {
  page: {},
  header: {
    marginBottom: 'var(--space-4)'
  },
  // Строка под заголовком: счётчик друзей по центру.
  subRow: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '36px'
  },
  // Кегль как у строки недели на главной; количество — акцентом.
  subCount: { color: 'var(--color-primary)', fontWeight: 700 },
  subInfo: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    fontWeight: 700,
    minHeight: '16px'
  },
  hint: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    marginBottom: 'var(--space-3)',
    fontWeight: 500,
    opacity: 0.7
  },
  hintPin: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  // Строка «Максимум N закреплённых» — вместо ошибки в бывшей модалке.
  limitMsg: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-error)', textAlign: 'center', marginBottom: 'var(--space-3)'
  },
  // Микро-лейбл группы «Закреплённые» (когда есть и обычные друзья).
  groupLabel: {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-caption-size)',
    letterSpacing: '1.5px', color: 'var(--color-text-secondary)',
    padding: '0 var(--space-1) var(--space-15)', textTransform: 'uppercase'
  },
  // Метка группы закреплённых: только иконка, без подписи — пин уже читается
  // как «закреплено», текст был бы шумом.
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
  skRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' },
  skAvatar: { width: '52px', height: '52px', borderRadius: 'var(--radius-medium)', background: 'var(--highlight-recent)', flexShrink: 0 },
  skText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  skLine: { height: '12px', borderRadius: 'var(--radius-xs)', background: 'var(--layer-1)' },
  // Обычная карточка, как везде: тёмная заливка, без пунктира и без контура.
  inviteBlock: {
    marginTop: 'var(--space-5)',
    padding: 'var(--space-8) var(--space-5)',
    textAlign: 'center',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)'
  },
  inviteEmoji: { marginBottom: 'var(--space-2)' },
  inviteTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-body-size)',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    marginBottom: 'var(--space-2)'
  },
  inviteSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    marginBottom: 'var(--space-5)'
  },
  bottomInvite: {
    marginTop: 'var(--space-5)',
    paddingTop: 'var(--space-3)',
    display: 'flex',
    justifyContent: 'center'
  }
}
