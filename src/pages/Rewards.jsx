import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getAllUserRewards, getImmortalAwards, setActiveTitle } from '../lib/rewards'
import { getAllLeagues, getLeagueByRankIndex, getLeagueByMuscles } from '../lib/leagues'
import { getCurrentUser, refreshCurrentUser } from '../lib/auth'
import LeagueBadgeIcon from '../components/LeagueBadgeIcon'
import FramePreview from '../components/FramePreview'
import TitleTag from '../components/TitleTag'

/**
 * Экран наград — три вкладки:
 *  1. ТИТУЛЫ  — сетка рангов (бывшие «значки лиг») + титулы #1/#2/#3 Бессмертного
 *  2. РАМКИ   — сетка рамок рангов (превью CSS-обводки)
 *  3. МЕДАЛИ  — счётчики 🥇🥈🥉 + раскрывающийся список заработанных
 *
 * Логика «открытости» ранга (титул/рамка):
 *  - есть запись в league_badges (БД) ИЛИ текущая лига юзера ВЫШЕ/РАВНА этому рангу.
 *
 * Титул/рамка ранга НЕ выбираются (производная текущего ранга) — только описание.
 * Выбор (надеть/снять) есть только у титулов #1/#2/#3 Бессмертного.
 */

const TABS = [
  { id: 'titles',  label: 'ТИТУЛЫ' },
  { id: 'frames',  label: 'РАМКИ' },
  { id: 'medals',  label: 'МЕДАЛИ' }
]

// Описания титулов Бессмертного
const IMMORTAL_TITLES = [
  { place: 1, label: '#1', color: '#FFD700' },
  { place: 2, label: '#2', color: '#C0C0C0' },
  { place: 3, label: '#3', color: '#CD7F32' }
]

export default function Rewards() {
  const navigate = useNavigate()

  const [tab, setTab] = useState('titles')
  const [loading, setLoading] = useState(true)
  const [badges, setBadges] = useState([])
  const [frames, setFrames] = useState([])          // season_rewards (медали Бессмертного)
  const [awards, setAwards] = useState({ gold: 0, silver: 0, bronze: 0, best_place: null, title1: false, title2: false, title3: false })
  const [activeTitle, setActiveTitleState] = useState(() => getCurrentUser()?.active_title ?? null)
  const [popup, setPopup] = useState(null)
  const [medalsOpen, setMedalsOpen] = useState(false)

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    Promise.all([getAllUserRewards(), getImmortalAwards()]).then(([all, aw]) => {
      if (cancelled) return
      setBadges(all.badges)
      setFrames(all.frames)
      setAwards(aw)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const allLeagues = getAllLeagues()
  const user = getCurrentUser()
  const currentRankIndex = user ? getLeagueByMuscles(user.total_muscles || 0).rankIndex : 0
  const earnedFromDb = new Set(badges.map(b => b.rank_index))

  const isUnlocked = (rankIndex) => {
    if (earnedFromDb.has(rankIndex)) return true
    if (rankIndex <= currentRankIndex) return true
    return false
  }

  const openedCount = allLeagues.filter(l => isUnlocked(l.rankIndex)).length

  const handleBadgeTap = (rankIndex) => {
    haptic.light()
    setPopup({ kind: 'title', data: { rankIndex, isLocked: !isUnlocked(rankIndex), isCurrent: rankIndex === currentRankIndex } })
  }

  const handleFrameTap = (rankIndex) => {
    haptic.light()
    setPopup({ kind: 'frame', data: { rankIndex, isLocked: !isUnlocked(rankIndex), isCurrent: rankIndex === currentRankIndex } })
  }

  const handleImmortalTitleTap = (place, unlocked) => {
    haptic.light()
    setPopup({ kind: 'immortal_title', data: { place, unlocked } })
  }

  // Надеть/снять титул #N
  const handleToggleTitle = async (place) => {
    haptic.medium()
    const next = activeTitle === String(place) ? null : place
    setActiveTitleState(next === null ? null : String(next))
    await setActiveTitle(next)
    await refreshCurrentUser()
    setPopup(null)
  }

  return (
    <div className="page page-fade" style={styles.page}>

      <header style={styles.header}>
        <h1 style={styles.title}>НАГРАДЫ</h1>
        <div style={styles.subtitle}>ТИТУЛЫ · РАМКИ · МЕДАЛИ СЕЗОНОВ</div>
      </header>

      {/* Вкладки */}
      <div style={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { haptic.light(); setTab(t.id) }}
            style={{
              ...styles.tab,
              ...(tab === t.id ? styles.tabActive : {})
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.empty}>Загрузка...</div>
      ) : (
        <>
          {/* ===== ВКЛАДКА ТИТУЛЫ ===== */}
          {tab === 'titles' && (
            <>
              <div style={styles.subSectionInfo}>
                {openedCount} из {allLeagues.length} рангов открыто
              </div>

              <div style={styles.badgesGrid}>
                {allLeagues.map(league => {
                  const isLocked = !isUnlocked(league.rankIndex)
                  return (
                    <button
                      key={league.rankIndex}
                      onClick={() => handleBadgeTap(league.rankIndex)}
                      style={styles.badgeCell}
                      className="press-tile"
                    >
                      <LeagueBadgeIcon
                        rankIndex={league.rankIndex}
                        size={56}
                        isLocked={isLocked}
                        showGlow={true}
                      />
                      <div style={{
                        ...styles.badgeName,
                        color: league.color
                      }}>
                        {league.name}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Титулы Бессмертного #1/#2/#3 */}
              <div style={{ ...styles.sectionHeader, marginTop: '28px' }}>ТИТУЛЫ БЕССМЕРТНОГО</div>
              <div style={styles.subSectionInfo}>
                Топ-1/2/3 лиги Бессмертный по итогам сезона. Можно надеть под именем.
              </div>

              <div style={styles.titlesRow}>
                {IMMORTAL_TITLES.map(t => {
                  const unlocked = t.place === 1 ? awards.title1 : t.place === 2 ? awards.title2 : awards.title3
                  const isOn = activeTitle === String(t.place)
                  return (
                    <button
                      key={t.place}
                      onClick={() => handleImmortalTitleTap(t.place, unlocked)}
                      style={{
                        ...styles.titleCard,
                        borderColor: `${t.color}66`
                      }}
                      className="press-tile"
                    >
                      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                        {/* Титул анимирован всегда (пиксели), закрытый — отличается только замком */}
                        <TitleTag place={t.place} size={30} />
                        {!unlocked && <span style={styles.titleLock}>🔒</span>}
                      </span>
                      <span style={styles.titleHint}>
                        {isOn ? 'надет' : unlocked ? 'открыт' : 'закрыт'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ===== ВКЛАДКА РАМКИ ===== */}
          {tab === 'frames' && (
            <>
              <div style={styles.subSectionInfo}>
                Рамка отражает твой текущий ранг. Топовые ранги — анимированные.
              </div>

              <div style={styles.framesGrid}>
                {allLeagues.map(league => {
                  const isLocked = !isUnlocked(league.rankIndex)
                  return (
                    <button
                      key={league.rankIndex}
                      onClick={() => handleFrameTap(league.rankIndex)}
                      style={styles.badgeCell}
                      className="press-tile"
                    >
                      <FramePreview rankIndex={league.rankIndex} size={60} isLocked={isLocked} />
                      <div style={{
                        ...styles.badgeName,
                        color: league.color
                      }}>
                        {league.name}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ===== ВКЛАДКА МЕДАЛИ ===== */}
          {tab === 'medals' && (
            <>
              <div style={styles.subSectionInfo}>
                Медали — за топ-1/2/3 лиги Бессмертный по итогам сезона.
              </div>

              <div style={styles.medalCounts}>
                <div style={styles.medalCount}>
                  <span style={styles.medalEmoji}>🥇</span>
                  <span style={{ ...styles.medalNum, color: '#FFD700' }}>×{awards.gold}</span>
                </div>
                <div style={styles.medalCount}>
                  <span style={styles.medalEmoji}>🥈</span>
                  <span style={{ ...styles.medalNum, color: '#C0C0C0' }}>×{awards.silver}</span>
                </div>
                <div style={styles.medalCount}>
                  <span style={styles.medalEmoji}>🥉</span>
                  <span style={{ ...styles.medalNum, color: '#CD7F32' }}>×{awards.bronze}</span>
                </div>
              </div>

              {frames.length === 0 ? (
                <div style={styles.empty}>
                  Пока пусто. Доберись до лиги Бессмертный и попади в топ-3 к концу сезона.
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { haptic.light(); setMedalsOpen(o => !o) }}
                    style={styles.medalsToggle}
                    className="press-tile"
                  >
                    <span>Заработанные медали ({frames.length})</span>
                    <span style={{ transform: medalsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                  </button>

                  {medalsOpen && (
                    <div style={styles.medalsList}>
                      {[...frames]
                        .sort((a, b) => (a.place - b.place) || (b.season_key > a.season_key ? 1 : -1))
                        .map(m => {
                          const medal = m.place === 1 ? '🥇' : m.place === 2 ? '🥈' : '🥉'
                          const placeColor = m.place === 1 ? '#FFD700' : m.place === 2 ? '#C0C0C0' : '#CD7F32'
                          return (
                            <div key={m.id} style={styles.medalRow}>
                              <span style={styles.medalRowEmoji}>{medal}</span>
                              <div style={styles.medalRowInfo}>
                                <div style={{ ...styles.medalRowPlace, color: placeColor }}>
                                  {m.place} место · БЕССМЕРТНЫЙ
                                </div>
                                <div style={styles.medalRowSeason}>{m.season_name}</div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {popup && (
        <RewardPopup
          popup={popup}
          activeTitle={activeTitle}
          onToggleTitle={handleToggleTitle}
          onClose={() => setPopup(null)}
        />
      )}

      </div>
  )
}

function RewardPopup({ popup, activeTitle, onToggleTitle, onClose }) {
  const { kind, data } = popup

  let content
  if (kind === 'title') {
    const league = getLeagueByRankIndex(data.rankIndex)
    let description
    if (data.isLocked) {
      description = `Открой при достижении лиги ${league.name}. Остаётся навсегда.`
    } else if (data.isCurrent) {
      description = 'Твой текущий ранг. Титул остаётся даже после сброса сезона.'
    } else {
      description = `Этап пройден — ранг ${league.name} достигнут.`
    }
    content = (
      <>
        <LeagueBadgeIcon rankIndex={data.rankIndex} size={96} isLocked={data.isLocked} showGlow={!data.isLocked} />
        <div style={{ ...popupStyles.title, color: data.isLocked ? 'var(--color-text-secondary)' : league.color }}>
          {league.name.toUpperCase()}
        </div>
        <div style={popupStyles.text}>{description}</div>
      </>
    )
  } else if (kind === 'frame') {
    const league = getLeagueByRankIndex(data.rankIndex)
    let description
    if (data.isLocked) {
      description = `Откроется при достижении ранга ${league.name}.`
    } else {
      description = 'Рамка отражает твой ранг и меняется вместе с ним. Выбор появится с кастомными рамками.'
    }
    content = (
      <>
        <FramePreview rankIndex={data.rankIndex} size={96} isLocked={data.isLocked} />
        <div style={{ ...popupStyles.title, color: data.isLocked ? 'var(--color-text-secondary)' : league.color }}>
          РАМКА · {league.name.toUpperCase()}
        </div>
        <div style={popupStyles.text}>{description}</div>
      </>
    )
  } else {
    // immortal_title
    const t = IMMORTAL_TITLES.find(x => x.place === data.place)
    const isOn = activeTitle === String(data.place)
    content = (
      <>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '16px 0' }}>
          <span style={{ transform: 'scale(2)', display: 'inline-flex' }}>
            <TitleTag place={data.place} size={28} />
          </span>
          {!data.unlocked && <span style={{ fontSize: 28, marginLeft: '16px' }}>🔒</span>}
        </div>
        <div style={{ ...popupStyles.title, color: data.unlocked ? t.color : 'var(--color-text-secondary)' }}>
          ТИТУЛ {t.label}
        </div>
        <div style={popupStyles.text}>
          {data.unlocked
            ? 'Заработан за топ-' + data.place + ' лиги Бессмертный. Можно надеть — он покажется под именем как ранг.'
            : 'Откроется, если займёшь ' + data.place + '-е место в лиге Бессмертный по итогам сезона.'}
        </div>
        {data.unlocked && (
          <button onClick={() => onToggleTitle(data.place)} style={{ ...popupStyles.btn, background: t.color }}>
            {isOn ? 'СНЯТЬ' : 'НАДЕТЬ'}
          </button>
        )}
      </>
    )
  }

  return (
    <div style={popupStyles.overlay} onClick={onClose}>
      <div style={popupStyles.modal} onClick={(e) => e.stopPropagation()}>
        {content}
        {kind !== 'immortal_title' || !data.unlocked
          ? <button onClick={onClose} style={popupStyles.btnGhost}>ПОНЯТНО</button>
          : <button onClick={onClose} style={popupStyles.btnGhost}>ЗАКРЫТЬ</button>}
      </div>
      <style>{`
        @keyframes rewardPopupFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rewardPopupIn {
          0%   { opacity: 0; transform: scale(0.9) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  page: {},
  header: { marginTop: '8px', marginBottom: '16px', textAlign: 'center' },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '32px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1,
    marginBottom: '6px'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  },
  tabs: {
    display: 'flex',
    gap: '6px',
    marginBottom: '18px',
    background: 'rgba(255,255,255,0.04)',
    padding: '4px',
    borderRadius: 'var(--radius-medium)'
  },
  tab: {
    flex: 1,
    padding: '9px 4px',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1px',
    color: 'var(--color-text-secondary)',
    background: 'transparent',
    transition: 'background 0.2s, color 0.2s'
  },
  tabActive: {
    background: 'var(--color-card)',
    color: 'var(--color-text)'
  },
  sectionHeader: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '6px',
    paddingLeft: '4px'
  },
  subSectionInfo: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    paddingLeft: '4px',
    marginBottom: '14px',
    lineHeight: 1.4
  },
  badgesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px'
  },
  framesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px'
  },
  badgeCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '12px 4px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-medium)',
    border: 'none',
    minHeight: '108px',
    justifyContent: 'center'
  },
  badgeName: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    letterSpacing: '0.5px',
    lineHeight: 1,
    textAlign: 'center'
  },
  titlesRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px'
  },
  titleCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '18px 8px',
    background: 'var(--color-card)',
    border: '1px solid',
    borderRadius: 'var(--radius-medium)',
    minHeight: '92px',
    justifyContent: 'center'
  },
  titleBig: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '30px',
    letterSpacing: '1px',
    lineHeight: 1,
    position: 'relative'
  },
  titleLock: {
    fontSize: '13px',
    lineHeight: 1,
    marginLeft: '2px',
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
  },
  titleHint: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
  },
  medalCounts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '20px'
  },
  medalCount: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '18px 8px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-medium)'
  },
  medalEmoji: { fontSize: '34px', lineHeight: 1 },
  medalNum: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '20px',
    letterSpacing: '1px'
  },
  medalsToggle: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-medium)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '10px'
  },
  medalsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  medalRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-medium)'
  },
  medalRowEmoji: { fontSize: '28px', lineHeight: 1, flexShrink: 0 },
  medalRowInfo: { flex: 1, minWidth: 0 },
  medalRowPlace: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1px',
    marginBottom: '2px'
  },
  medalRowSeason: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  }
}

const popupStyles = {
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
    animation: 'rewardPopupFade 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: '28px 22px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    animation: 'rewardPopupIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '16px',
    letterSpacing: '2px',
    textAlign: 'center'
  },
  text: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    padding: '0 4px'
  },
  btn: {
    width: '100%',
    marginTop: '8px',
    padding: '12px',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: 'var(--radius-medium)',
    border: 'none'
  },
  btnGhost: {
    width: '100%',
    marginTop: '8px',
    padding: '12px',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: 'var(--radius-medium)',
    border: 'none'
  }
}