import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getFriendsLeaderboard, getLeagueLeaderboard } from '../lib/leaderboard'
import { getLeagueByMuscles, getLeagueByRankIndex } from '../lib/leagues'
import { getCurrentUser } from '../lib/auth'
import { shareReferralLink } from '../lib/friends'
import { getCurrentSeason, getDaysUntilSeasonEnd, formatSeasonEndDate } from '../utils/season'
import { EVENTS, on } from '../lib/events'
import LeaderboardRow from '../components/LeaderboardRow'

/**
 * Экран рейтинга.
 *
 * Два таба сверху: Друзья / Лига.
 *
 * Таб "Лига" в формате: ЛИГА (СПОРТСМЕН)
 *   - когда активен — "(СПОРТСМЕН)" цветом лиги
 *   - когда неактивен — всё серым
 *
 * Под табами — подпись с количеством игроков:
 *   - Друзья: "В друзьях N" (не считая самого юзера)
 *   - Лига: "В лиге N игроков"
 *
 * Список ниже:
 *  - Друзья: топ по мускулам среди друзей юзера (включая его самого)
 *  - Лига: топ-100 внутри текущей лиги юзера
 *
 * Если сервер вернул пусто или без юзера — фронт собирает строку из
 * getCurrentUser() и показывает юзера как #1.
 *
 * Подсказка по правилам — кнопка-инфо ℹ️ в шапке справа.
 * Модалка правил рендерится через position: fixed на уровне всего viewport,
 * чтобы центрироваться независимо от padding'ов страницы.
 */

const TAB_FRIENDS = 'friends'
const TAB_LEAGUE = 'league'

export default function Leaderboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Стартовый таб берём из URL ?tab=friends|league. Дефолт — friends.
  const initialTab = searchParams.get('tab') === TAB_LEAGUE ? TAB_LEAGUE : TAB_FRIENDS
  const [activeTab, setActiveTab] = useState(initialTab)

  const [friendsRows, setFriendsRows] = useState([])
  const [leagueData, setLeagueData] = useState({ rows: [], totalInLeague: 0 })
  const [loading, setLoading] = useState(true)
  const [showRules, setShowRules] = useState(false)

  const user = getCurrentUser()
  const myLeague = user ? getLeagueByMuscles(user.total_muscles || 0) : null

  const season = getCurrentSeason()
  const daysLeft = getDaysUntilSeasonEnd()
  const endDateStr = formatSeasonEndDate()

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

  // Счётчик друзей — не считаем самого юзера. То есть это число РЕАЛЬНО
  // приглашённых друзей, а не размер списка.
  const friendsCount = Math.max(0, rows.length - 1)

  const showInviteCTA = activeTab === TAB_FRIENDS && rows.length === 1 && rows[0]?.is_me

  const leagueTotalDisplay = activeTab === TAB_LEAGUE
    ? Math.max(leagueData.totalInLeague || 0, rows.length)
    : 0

  // Цвет лиги для таба "Лига" — берём из myLeague когда есть. Если юзера
  // ещё нет (не должно случаться, но на всякий) — fallback на серый.
  const leagueColor = myLeague?.color || 'var(--color-text-secondary)'
  const leagueNameForTab = myLeague ? myLeague.name.toUpperCase() : ''

  return (
    <div className="page page-fade" style={styles.page}>

      <header style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>РЕЙТИНГ</h1>
          <button onClick={handleInfoTap} style={styles.infoButton} aria-label="Правила">
            <span style={styles.infoIcon}>ℹ️</span>
          </button>
        </div>
        <div style={styles.seasonRow}>
          <span style={{ ...styles.seasonName, color: season.color }}>
            {season.emoji} {season.name}
          </span>
          <span style={styles.seasonEnd}>
            до {endDateStr} · {daysLeft} {pluralDays(daysLeft)}
          </span>
        </div>
      </header>

      {/* Табы — Друзья / Лига (СПОРТСМЕН) */}
      <div style={styles.tabsRow}>
        <button
          onClick={() => handleTabTap(TAB_FRIENDS)}
          style={{
            ...styles.tab,
            color: activeTab === TAB_FRIENDS ? 'var(--color-primary)' : 'var(--color-text-secondary)'
          }}
        >
          ДРУЗЬЯ
          {activeTab === TAB_FRIENDS && <div style={styles.tabUnderline} />}
        </button>

        <button
          onClick={() => handleTabTap(TAB_LEAGUE)}
          style={{
            ...styles.tab,
            // Базовый цвет таба — зелёный когда активен, серый когда нет.
            // Цвет конкретной лиги в скобках задаётся отдельно через span ниже.
            color: activeTab === TAB_LEAGUE ? 'var(--color-primary)' : 'var(--color-text-secondary)'
          }}
        >
          ЛИГА
          {leagueNameForTab && (
            <>
              {' '}
              <span style={{
                color: activeTab === TAB_LEAGUE ? leagueColor : 'var(--color-text-secondary)',
                transition: 'color 0.25s ease'
              }}>
                ({leagueNameForTab})
              </span>
            </>
          )}
          {activeTab === TAB_LEAGUE && <div style={styles.tabUnderline} />}
        </button>
      </div>

      {/* Доп. инфа под табом */}
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
                // В табе Лига скрываем @username — там собраны незнакомые юзеры
                // одной лиги, никнеймы не несут смысла и захламляют строку.
                // В табе Друзья оставляем, чтобы можно было отличить однофамильцев.
                showHandle={activeTab === TAB_FRIENDS}
              />
            ))}
          </div>
        )}
      </div>

      {showInviteCTA && !loading && (
        <div style={styles.inviteBlock}>
          <div style={styles.inviteEmoji}>👥</div>
          <div style={styles.inviteTitle}>Друзей пока нет</div>
          <div style={styles.inviteSubtitle}>
            Пригласи друзей через Telegram, соревнуйтесь<br />
            кто больше прокачается за сезон
          </div>
          <button onClick={handleInviteTap} style={styles.inviteButton}>
            ПРИГЛАСИТЬ ДРУГА
          </button>
        </div>
      )}

      {activeTab === TAB_FRIENDS && !showInviteCTA && !loading && (
        <div style={styles.bottomInvite}>
          <button onClick={handleInviteTap} style={styles.inviteButtonSecondary}>
            👥 Пригласить ещё друга
          </button>
        </div>
      )}

      {/* Модалка с правилами — вынесена на уровень компонента,
          использует position: fixed для центрирования по viewport */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} season={season} />}
    </div>
  )
}

/**
 * Модалка-объяснялка правил рейтинга. Открывается по кнопке ℹ️.
 *
 * Центрирование: overlay имеет position: fixed + inset: 0 + flex centering.
 * fixed позиционирует относительно viewport, а не родителя — поэтому
 * никакие padding'и страницы не мешают.
 */
function RulesModal({ onClose, season }) {
  return (
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
    </div>
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
  infoIcon: {
    fontSize: '20px',
    opacity: 0.7
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
    padding: '14px 8px',
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

const modalStyles = {
  // position: fixed гарантирует центрирование относительно viewport,
  // независимо от padding'ов родителя. inset: 0 + flex centering
  // ставит модалку строго по центру экрана.
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
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    animation: 'rulesOverlay 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '340px',
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