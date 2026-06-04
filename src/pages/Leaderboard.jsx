import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getFriendsLeaderboard, getLeagueLeaderboard } from '../lib/leaderboard'
import { getLeagueByMuscles, getLeagueByRankIndex } from '../lib/leagues'
import { getCurrentUser } from '../lib/auth'
import { shareReferralLink } from '../lib/friends'
import { backupUser, getUserPublicProfile, BACKUP_BONUS } from '../lib/backups'
import { getCurrentSeason, getDaysUntilSeasonEnd, getNextSeason } from '../utils/season'
import { EVENTS, on } from '../lib/events'
import LeaderboardRow from '../components/LeaderboardRow'
import ProfileHeader from '../components/ProfileHeader'
import BackupSentToast from '../components/rewards/BackupSentToast'
import RankIcon from '../components/RankIcon'
import UiIcon from '../components/UiIcon'
import MuscleIcon from '../components/MuscleIcon'

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
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

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
            <UiIcon name="info" size={22} color="#3FA2F7" />
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

      <div style={styles.tabsRow}>
        <button
          onClick={() => handleTabTap(TAB_FRIENDS)}
          style={{
            ...styles.tab,
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
          {activeTab === TAB_FRIENDS && <div style={styles.tabUnderline} />}
        </button>

        <button
          onClick={() => handleTabTap(TAB_LEAGUE)}
          style={{
            ...styles.tab,
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
          {activeTab === TAB_LEAGUE && <div style={styles.tabUnderline} />}
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
            {rows.map(row => (
              <LeaderboardRow
                key={row.user_id}
                row={row}
                isMe={row.is_me}
                showHandle={activeTab === TAB_FRIENDS}
                onTap={handleRowTap}
              />
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

      {activeTab === TAB_FRIENDS && !showInviteCTA && !loading && (
        <div style={styles.bottomInvite}>
          <button onClick={handleInviteTap} style={{ ...styles.inviteButtonSecondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <UiIcon name="invite-friend" size={16} color="var(--color-primary)" />
            Пригласить ещё друга
          </button>
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} season={season} />}

      {selectedProfile && (
        <ProfileModal
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

/**
 * Модалка профиля игрока из рейтинга. ProfileHeader в режиме просмотра.
 * Подгружает публичный профиль (последняя тренировка, стрик).
 * Для чужого игрока — кнопка "Подстраховать".
 */
function ProfileModal({ row, onClose, onBackupDone }) {
  const me = getCurrentUser()
  const isSelf = me && row.user_id === me.id

  const [pub, setPub] = useState(null)
  const [backupState, setBackupState] = useState('idle') // 'idle' | 'sending' | 'done' | 'already'

  useEffect(() => {
    let cancelled = false
    getUserPublicProfile(row.user_id).then(data => {
      if (!cancelled) setPub(data)
    })
    return () => { cancelled = true }
  }, [row.user_id])

  const userObj = {
    first_name: row.first_name,
    username: row.username,
    photo_url: row.photo_url
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
    } else {
      haptic.error()
      setBackupState('idle')
      window.alert('Не удалось подстраховать. Проверь подключение.')
    }
  }

  const buttonText = backupState === 'sending' ? 'ОТПРАВКА...'
                   : backupState === 'already' ? 'УЖЕ ПОДСТРАХОВАН СЕГОДНЯ'
                   : null

  return createPortal(
    <div style={profileModalStyles.overlay} onClick={onClose}>
      <div style={profileModalStyles.inner} onClick={(e) => e.stopPropagation()}>
        <ProfileHeader
          user={userObj}
          xp={row.total_muscles || 0}
          streak={pub?.weekly_streak ?? null}
          totalWorkouts={null}
          friendsPlace={row.place}
          lastWorkout={pub?.last_workout || null}
          interactive={false}
          showUsername={false}
        />

        {/* Кнопка подстраховки — только для чужого игрока */}
        {!isSelf && (
          backupState === 'idle' ? (
            <button onClick={handleBackup} style={profileModalStyles.backupButton}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Подстраховать +100 <MuscleIcon size={16} earned={true} />
              </span>
            </button>
          ) : (
            <button
              disabled
              style={{ ...profileModalStyles.backupButton, ...profileModalStyles.backupButtonDisabled }}
            >
              {buttonText}
            </button>
          )
        )}

        <button onClick={onClose} style={profileModalStyles.close}>ЗАКРЫТЬ</button>
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

function RulesModal({ onClose, season }) {
  return createPortal(
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.icon}>🏆</div>
        <div style={modalStyles.title}>КАК ЭТО РАБОТАЕТ</div>

        <div style={modalStyles.section}>
          <div style={modalStyles.sectionTitle}>СЕЗОН — 3 МЕСЯЦА</div>
          <div style={modalStyles.sectionText}>
            Сейчас идёт {season.emoji} {season.name}. Сезоны сменяются 1-го числа
            марта, июня, сентября и декабря в 03:00 МСК.
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
            поддержку. Одного игрока можно поддержать раз в сутки.
          </div>
        </div>

        <div style={modalStyles.section}>
          <div style={modalStyles.sectionTitle}>НАГРАДЫ</div>
          <div style={modalStyles.sectionText}>
            Топ-3 каждой лиги получают сезонную рамку для аватара.
            При первом достижении новой лиги — значок навсегда.
          </div>
        </div>

        <button onClick={onClose} style={modalStyles.closeButton}>
          ПОНЯТНО
        </button>
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
    marginTop: '8px',
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
    fontFamily: 'var(--font-tiny5)',
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
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    letterSpacing: '2px'
  },
  seasonEnd: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  },
  tabsRow: {
    display: 'flex',
    gap: '0',
    marginBottom: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '6px',
    padding: '12px 8px',
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    letterSpacing: '2px',
    transition: 'color 0.25s ease',
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
  tabUnderline: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    bottom: 0,
    height: '2px',
    background: 'var(--color-primary)',
    borderRadius: '1px 1px 0 0',
    boxShadow: '0 0 8px var(--color-primary)'
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
    gap: '6px'
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
    fontFamily: 'var(--font-tiny5)',
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
    borderRadius: '12px',
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
    padding: '10px 20px',
    background: 'rgba(158, 209, 83, 0.08)',
    color: 'var(--color-primary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: '12px',
    border: '1px solid rgba(158, 209, 83, 0.25)'
  }
}

const profileModalStyles = {
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
    // Старт сверху на той же высоте что и инфо-модалка — профили
    // (свой/чужой) больше не прыгают по вертикали. Низ с запасом под
    // таб-бар, прокрутка внутри оверлея если контент высокий.
    padding: 'var(--tg-safe-top) 20px calc(var(--tabbar-height) + 40px)',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
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
    padding: '14px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '1px',
    borderRadius: '14px',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(158, 209, 83, 0.3)'
  },
  backupButtonDisabled: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--color-text-secondary)',
    boxShadow: 'none',
    cursor: 'default',
    letterSpacing: '0.5px',
    fontSize: '12px'
  },
  close: {
    width: '100%',
    padding: '14px',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    borderRadius: '14px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    cursor: 'pointer'
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
    // Старт сверху на той же высоте что и профили — единое положение.
    // Низ с запасом под таб-бар, прокрутка внутри оверлея.
    padding: 'var(--tg-safe-top) 20px calc(var(--tabbar-height) + 40px)',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    animation: 'rulesOverlay 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '340px',
    flexShrink: 0,
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
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
    fontFamily: 'var(--font-tiny5)',
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
    fontFamily: 'var(--font-tiny5)',
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
  closeButton: {
    width: '100%',
    marginTop: '10px',
    padding: '12px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: '12px',
    border: 'none'
  }
}