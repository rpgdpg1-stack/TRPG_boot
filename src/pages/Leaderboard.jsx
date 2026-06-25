import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getFriendsLeaderboard, getLeagueLeaderboard } from '../lib/leaderboard'
import { getLeagueByMuscles } from '../lib/leagues'
import { getCurrentUser } from '../lib/auth'
import { shareReferralLink } from '../lib/friends'
import { BACKUP_BONUS } from '../lib/backups'
import { getCurrentSeason, getDaysUntilSeasonEnd, getNextSeason } from '../utils/season'
import { EVENTS, on } from '../lib/events'
import LeaderboardRow from '../components/LeaderboardRow'
import PlayerProfileModal from '../components/PlayerProfileModal'
import BackupSentToast from '../components/rewards/BackupSentToast'
import RankIcon from '../components/RankIcon'
import UiIcon from '../components/UiIcon'
import ModalButton from '../components/ModalButton'

/**
 * Экран рейтинга.
 *
 * Тап по строке → модалка профиля игрока (ProfileHeader в режиме просмотра):
 * крупный аватар, ранг, место, мускулы, последняя тренировка (серым).
 * Логин телеги скрыт, капсулы без попапов.
 *
 * Внизу модалки для ЧУЖОГО игрока — кнопка "Подстраховать +100 💪".
 * После успеха — BackupSentToast (+20 тебе за поддержку).
 *
 * У строк рейтинга аватар обведён рамкой в цвет лиги (rank_index).
 */

const TAB_FRIENDS = 'friends'
const TAB_LEAGUE = 'league'

export default function Leaderboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  // Откуда пришли в рейтинг — туда и вернёт кнопка «назад».
  // Если зашли напрямую (с главной или по ссылке) — на главную.
  const backTo = location.state?.from || '/'

  const initialTab = searchParams.get('tab') === TAB_LEAGUE ? TAB_LEAGUE : TAB_FRIENDS
  const [activeTab, setActiveTab] = useState(initialTab)

  const [friendsRows, setFriendsRows] = useState([])
  const [leagueData, setLeagueData] = useState({ rows: [], totalInLeague: 0 })
  const [loading, setLoading] = useState(true)
  const [showRules, setShowRules] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [sentToast, setSentToast] = useState(null) // { targetName } | null

  const user = getCurrentUser()
  const myLeague = user ? getLeagueByMuscles(user.total_muscles || 0) : null

  const season = getCurrentSeason()
  const nextSeason = getNextSeason()
  const daysLeft = getDaysUntilSeasonEnd()

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(backTo))
    lockVerticalSwipes()
  }, [navigate, backTo])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      if (activeTab === TAB_FRIENDS) {
        const rows = await getFriendsLeaderboard()
        if (!cancelled) {
          setFriendsRows(rows)
          setLoading(false)
        }
      } else {
        const data = await getLeagueLeaderboard(100)
        if (!cancelled) {
          setLeagueData(data)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeTab])

  useEffect(() => {
    const reload = () => {
      if (activeTab === TAB_FRIENDS) getFriendsLeaderboard().then(setFriendsRows)
      else getLeagueLeaderboard(100).then(setLeagueData)
    }
    return on(EVENTS.USER_CHANGED, reload)
  }, [activeTab])

  const handleTabTap = (tab) => {
    if (tab === activeTab) return
    haptic.light()
    setActiveTab(tab)
  }

  // Свайп по списку влево/вправо — переключение вкладок Друзья ↔ Лига.
  const swipeRef = useRef({ x: null, y: null })

  const handleSwipeStart = (e) => {
    swipeRef.current.x = e.touches[0].clientX
    swipeRef.current.y = e.touches[0].clientY
  }

  const handleSwipeEnd = (e) => {
    const startX = swipeRef.current.x
    const startY = swipeRef.current.y
    swipeRef.current.x = null
    swipeRef.current.y = null
    if (startX === null) return

    const dx = e.changedTouches[0].clientX - startX
    const dy = e.changedTouches[0].clientY - startY
    // Горизонтальный свайп достаточной длины, не вертикальный скролл
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return

    haptic.light()
    if (dx < 0) {
      // свайп влево → следующая вкладка (Друзья → Лига)
      setActiveTab(TAB_LEAGUE)
    } else {
      // свайп вправо → предыдущая (Лига → Друзья)
      setActiveTab(TAB_FRIENDS)
    }
  }

  const handleInfoTap = () => {
    haptic.light()
    setShowRules(true)
  }

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  const handleRowTap = (row) => {
    haptic.light()
    // Место в модалке считает сама модалка: league_place (обе вкладки теперь
    // его отдают), иначе place. Передаём строку как есть.
    setSelectedProfile(row)
  }

  const handleBackupDone = (targetName) => {
    setSelectedProfile(null)
    setSentToast({ targetName })
  }

  const buildSelfRow = () => {
    if (!user) return null
    const muscles = user.total_muscles || 0
    const rankIndex = Math.min(Math.max(Math.floor(muscles / 900), 0), 10)
    return {
      user_id: user.id,
      first_name: user.first_name || null,
      username: user.username || null,
      photo_url: user.photo_url || null,
      total_muscles: muscles,
      rank_index: rankIndex,
      place: 1,
      is_me: true
    }
  }

  const ensureSelfInRows = (rows) => {
    const self = buildSelfRow()
    if (!self) return rows

    if (!rows || rows.length === 0) {
      return [self]
    }

    if (rows.some(r => r.is_me || r.user_id === self.user_id)) {
      return rows
    }

    const merged = [...rows, self].sort((a, b) => {
      if (b.total_muscles !== a.total_muscles) return b.total_muscles - a.total_muscles
      return a.user_id - b.user_id
    }).map((r, idx) => ({ ...r, place: idx + 1 }))

    return merged
  }

  const rows = activeTab === TAB_FRIENDS
    ? ensureSelfInRows(friendsRows)
    : ensureSelfInRows(leagueData.rows)

  const friendsCount = Math.max(0, rows.length - 1)

  const showInviteCTA = activeTab === TAB_FRIENDS && rows.length === 1 && rows[0]?.is_me

  const leagueTotalDisplay = activeTab === TAB_LEAGUE
    ? Math.max(leagueData.totalInLeague || 0, rows.length)
    : 0

  const leagueColor = myLeague?.color || 'var(--color-text-secondary)'
  const leagueNameForTab = myLeague ? myLeague.name.toUpperCase() : ''

  return (
    <div className="page page-fade" style={styles.page}>

      <header style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>РЕЙТИНГ</h1>
          <button onClick={handleInfoTap} style={styles.infoButton} aria-label="Правила">
            <UiIcon name="info" size={22} color="var(--color-text-secondary)" />
          </button>
        </div>
        <div style={styles.seasonRow}>
          <span style={{ ...styles.seasonName, color: season.color }}>
            Сезон: {season.emoji} {season.name}
          </span>
          <span style={styles.seasonEnd}>
            До следующего сезона {nextSeason.name} {nextSeason.emoji} осталось: {daysLeft} {pluralDays(daysLeft)}
          </span>
        </div>
      </header>

      <div
        style={styles.tabsRow}
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}
      >
        <button
          onClick={() => handleTabTap(TAB_FRIENDS)}
          style={{
            ...styles.tab,
            background: activeTab === TAB_FRIENDS ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
            color: activeTab === TAB_FRIENDS ? 'var(--color-primary)' : 'var(--color-text-secondary)'
          }}
        >
          <span style={styles.tabIcon}>
            <UiIcon
              name="friends"
              size={26}
              color={activeTab === TAB_FRIENDS ? 'var(--color-primary)' : 'var(--color-text-secondary)'}
            />
          </span>
          <span style={styles.tabLabel}>ДРУЗЬЯ</span>
        </button>

        <button
          onClick={() => handleTabTap(TAB_LEAGUE)}
          style={{
            ...styles.tab,
            background: activeTab === TAB_LEAGUE ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
            color: activeTab === TAB_LEAGUE ? 'var(--color-primary)' : 'var(--color-text-secondary)'
          }}
        >
          <span style={styles.tabIcon}>
            {myLeague && (
              <RankIcon
                rankIndex={myLeague.rankIndex}
                size={26}
                color={activeTab === TAB_LEAGUE ? leagueColor : 'var(--color-text-secondary)'}
              />
            )}
          </span>
          <span style={styles.tabLabel}>
            <span>ЛИГА:</span>
            {leagueNameForTab && (
              <span style={{
                color: activeTab === TAB_LEAGUE ? leagueColor : 'var(--color-text-secondary)',
                transition: 'color 0.25s ease'
              }}>
                {leagueNameForTab}
              </span>
            )}
          </span>
        </button>
      </div>

      {!loading && activeTab === TAB_LEAGUE && leagueTotalDisplay > 0 && (
        <div style={styles.subInfo}>
          В лиге {leagueTotalDisplay} {pluralPlayers(leagueTotalDisplay)}
        </div>
      )}
      {!loading && activeTab === TAB_FRIENDS && !showInviteCTA && (
        <div style={styles.subInfo}>
          В друзьях {friendsCount}
        </div>
      )}

      <div style={styles.listWrap}>
        {loading ? (
          <div style={styles.empty}>Загрузка...</div>
        ) : (
          <div style={styles.list}>
            {rows.map((row, idx) => (
              <div
                key={row.user_id}
                style={idx === 0 ? undefined : styles.rowDivider}
              >
                <LeaderboardRow
                  row={row}
                  isMe={row.is_me}
                  onTap={handleRowTap}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {showInviteCTA && !loading && (
        <div style={styles.inviteBlock}>
          <div style={styles.inviteEmoji}><UiIcon name="invite-friend" size={40} color="var(--color-primary)" /></div>
          <div style={styles.inviteTitle}>Друзей пока нет</div>
          <div style={styles.inviteSubtitle}>
            Пригласи друзей через Telegram, соревнуйтесь<br />
            кто больше прокачается за сезон
          </div>
          <button onClick={handleInviteTap} style={{ ...styles.inviteButton, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <UiIcon name="invite-friend" size={16} color="#0D0C0C" />
            ПРИГЛАСИТЬ ДРУГА
          </button>
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {selectedProfile && (
        <PlayerProfileModal
          row={selectedProfile}
          onClose={() => setSelectedProfile(null)}
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



function RulesModal({ onClose }) {
  return createPortal(
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.icon}>🏆</div>
        <div style={modalStyles.title}>КАК ЭТО РАБОТАЕТ</div>

        <div style={modalStyles.section}>
          <div style={modalStyles.sectionTitle}>СЕЗОНЫ</div>
          <div style={modalStyles.sectionText}>
            Сезон длится 3 месяца и сменяется 1-го числа в 03:00 МСК.
            В году 4 сезона:<br />
            🌞 Лето — 1.06–1.09<br />
            🍂 Осень — 1.09–1.12<br />
            ❄️ Зима — 1.12–1.03<br />
            🌸 Весна — 1.03–1.06
          </div>
        </div>

        <div style={modalStyles.section}>
          <div style={modalStyles.sectionTitle}>СБРОС</div>
          <div style={modalStyles.sectionText}>
            В конце сезона мускулы сбрасываются до начала твоей текущей лиги.
            Лига не понижается — ты остаёшься на своём ранге.
          </div>
        </div>

        <div style={modalStyles.section}>
          <div style={modalStyles.sectionTitle}>ПОДСТРАХОВКА</div>
          <div style={modalStyles.sectionText}>
            Открой профиль игрока и подстрахуй его — ему +100, тебе +20 за
            поддержку. Одного игрока можно поддержать раз в сутки,
            всего до 6 подстраховок в день.
          </div>
        </div>

        <div style={modalStyles.section}>
          <div style={modalStyles.sectionTitle}>НАГРАДЫ</div>
          <div style={modalStyles.sectionText}>
            Топ-3 каждой лиги получают сезонную рамку для аватара.
            При первом достижении новой лиги — значок навсегда.
          </div>
        </div>

        <ModalButton onClick={onClose} style={{ marginTop: '10px' }}>
          ПОНЯТНО
        </ModalButton>
      </div>

      <style>{`
        @keyframes rulesOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rulesPanel {
          0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}

function pluralDays(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дня'
  return 'дней'
}

function pluralPlayers(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'игроков'
  if (last === 1) return 'игрок'
  if (last >= 2 && last <= 4) return 'игрока'
  return 'игроков'
}

const styles = {
  page: {},
  header: {
    marginBottom: '20px'
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
  infoButton: {
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
  
  seasonRow: {
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px'
  },
  seasonName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    letterSpacing: '2px'
  },
  seasonEnd: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  },
  // Капсула-переключатель: серая подложка под активным сегментом
  tabsRow: {
    display: 'flex',
    gap: '4px',
    marginBottom: '16px',
    padding: '4px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 'var(--radius-card)'
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '12px 8px',
    border: 'none',
    borderRadius: '29px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    letterSpacing: '2px',
    transition: 'color 0.25s ease, background 0.25s ease',
    cursor: 'pointer',
    position: 'relative',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  // Иконка над текстом таба (друзья / лига) — крупная
  tabIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '28px',
    transition: 'opacity 0.25s ease'
  },
  // Текстовая строка таба. Для лиги внутри два span (ЛИГА: + название)
  tabLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    justifyContent: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  
  subInfo: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    marginBottom: '12px',
    fontWeight: 500
  },
  listWrap: {
    minHeight: '120px'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  // Разделитель между строками — тонкая линия сверху у всех кроме первой
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
  inviteEmoji: {
    fontSize: '40px',
    marginBottom: '8px'
  },
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



const modalStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 9999,
    // Старт сверху на той же высоте что и профили (16px ниже кнопок Telegram,
    // зашито в var). Низ с запасом под таб-бар, прокрутка внутри оверлея.
    padding: 'var(--tg-safe-top) 20px calc(var(--tabbar-height) + 40px)',
    overflowY: 'auto',
    animation: 'rulesOverlay 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '340px',
    flexShrink: 0,
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: '24px 22px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    animation: 'rulesPanel 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  icon: {
    fontSize: '36px',
    lineHeight: 1,
    marginBottom: '4px'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '16px',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    marginBottom: '8px'
  },
  section: {
    width: '100%',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '11px',
    color: 'var(--color-primary)',
    letterSpacing: '2px',
    marginBottom: '4px'
  },
  sectionText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  },
}