import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getAllUserRewards } from '../lib/rewards'
import { getAllLeagues, getLeagueByRankIndex } from '../lib/leagues'
import LeagueBadgeIcon from '../components/LeagueBadgeIcon'

/**
 * Экран наград — две секции:
 *  1. Значки лиг — сетка 4 в ряд, открытые цветные, неоткрытые серые с замочком
 *  2. Сезонные рамки — горизонтальный список карточек со всеми накопленными
 *
 * Активная рамка (active_frame_id) пока НЕ реализована визуально на аватаре —
 * только хранится в БД. Когда будем подключать рамку к аватару — сделаем
 * отдельной фичей. Сейчас просто отображаем коллекцию.
 *
 * Тап по значку лиги — попап с описанием лиги (минимальный).
 * Тап по рамке — попап с её описанием (когда получил, какое место).
 */
export default function Rewards() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [badges, setBadges] = useState([])
  const [frames, setFrames] = useState([])
  const [popup, setPopup] = useState(null) // { kind: 'badge'|'frame', data }

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    getAllUserRewards().then(data => {
      if (cancelled) return
      setBadges(data.badges)
      setFrames(data.frames)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Все лиги от 1 до 10 (Новобранец 0 пропускаем — он у всех "по умолчанию")
  const allLeagues = getAllLeagues().slice(1)
  const earnedRankIndexes = new Set(badges.map(b => b.rank_index))

  const handleBadgeTap = (rankIndex, isLocked) => {
    haptic.light()
    setPopup({ kind: 'badge', data: { rankIndex, isLocked } })
  }

  const handleFrameTap = (frame) => {
    haptic.light()
    setPopup({ kind: 'frame', data: frame })
  }

  return (
    <div className="page page-fade" style={styles.page}>

      <header style={styles.header}>
        <h1 style={styles.title}>НАГРАДЫ</h1>
        <div style={styles.subtitle}>ЗНАЧКИ ЛИГ И РАМКИ СЕЗОНОВ</div>
      </header>

      {loading ? (
        <div style={styles.empty}>Загрузка...</div>
      ) : (
        <>
          {/* Секция: значки лиг */}
          <div style={styles.sectionHeader}>ЗНАЧКИ ЛИГ</div>
          <div style={styles.subSectionInfo}>
            {earnedRankIndexes.size} из {allLeagues.length} открыто
          </div>

          <div style={styles.badgesGrid}>
            {allLeagues.map(league => {
              const isLocked = !earnedRankIndexes.has(league.rankIndex)
              return (
                <button
                  key={league.rankIndex}
                  onClick={() => handleBadgeTap(league.rankIndex, isLocked)}
                  style={styles.badgeCell}
                  className="press-tile"
                >
                  <LeagueBadgeIcon
                    rankIndex={league.rankIndex}
                    size={56}
                    isLocked={isLocked}
                    showGlow={!isLocked}
                  />
                  <div style={{
                    ...styles.badgeName,
                    color: isLocked ? 'var(--color-text-secondary)' : league.color,
                    opacity: isLocked ? 0.5 : 1
                  }}>
                    {league.name}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Секция: сезонные рамки */}
          <div style={{ ...styles.sectionHeader, marginTop: '28px' }}>СЕЗОННЫЕ РАМКИ</div>
          <div style={styles.subSectionInfo}>
            {frames.length === 0 ? 'Пока нет — попади в топ-3 лиги к концу сезона' : `${frames.length} в коллекции`}
          </div>

          {frames.length > 0 && (
            <div style={styles.framesList}>
              {frames.map(frame => {
                const league = getLeagueByRankIndex(frame.rank_index)
                const medal = frame.place === 1 ? '🥇' : frame.place === 2 ? '🥈' : '🥉'
                const placeColor = frame.place === 1 ? '#FFD700' : frame.place === 2 ? '#C0C0C0' : '#CD7F32'

                return (
                  <button
                    key={frame.id}
                    onClick={() => handleFrameTap(frame)}
                    style={{
                      ...styles.frameCard,
                      borderColor: `${placeColor}40`
                    }}
                    className="press-tile"
                  >
                    <div style={styles.frameMedal}>{medal}</div>
                    <div style={styles.frameBadge}>
                      <LeagueBadgeIcon rankIndex={frame.rank_index} size={48} showGlow={true} />
                    </div>
                    <div style={{ ...styles.framePlace, color: placeColor }}>
                      {frame.place} место
                    </div>
                    <div style={styles.frameLeague}>
                      {league.name}
                    </div>
                    <div style={styles.frameSeason}>
                      {frame.season_name}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Попап с описанием награды */}
      {popup && (
        <RewardPopup popup={popup} onClose={() => setPopup(null)} />
      )}
    </div>
  )
}

function RewardPopup({ popup, onClose }) {
  const { kind, data } = popup

  let content
  if (kind === 'badge') {
    const league = getLeagueByRankIndex(data.rankIndex)
    content = (
      <>
        <LeagueBadgeIcon rankIndex={data.rankIndex} size={96} isLocked={data.isLocked} showGlow={!data.isLocked} />
        <div style={{ ...popupStyles.title, color: data.isLocked ? 'var(--color-text-secondary)' : league.color }}>
          {league.name.toUpperCase()}
        </div>
        <div style={popupStyles.text}>
          {data.isLocked
            ? `Открой при первом достижении лиги ${league.name}. Останется навсегда.`
            : 'Ты достиг этой лиги. Значок останется с тобой даже после сброса сезона.'}
        </div>
      </>
    )
  } else {
    // frame
    const league = getLeagueByRankIndex(data.rank_index)
    const medal = data.place === 1 ? '🥇' : data.place === 2 ? '🥈' : '🥉'
    content = (
      <>
        <div style={{ fontSize: 64, lineHeight: 1 }}>{medal}</div>
        <div style={popupStyles.title}>
          {data.place} МЕСТО · {league.name.toUpperCase()}
        </div>
        <div style={popupStyles.text}>
          Получена в сезон {data.season_name}.<br />
          Совсем скоро её можно будет выставить рядом с аватаром.
        </div>
      </>
    )
  }

  return (
    <div style={popupStyles.overlay} onClick={onClose}>
      <div style={popupStyles.modal} onClick={(e) => e.stopPropagation()}>
        {content}
        <button onClick={onClose} style={popupStyles.btn}>ПОНЯТНО</button>
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
  header: { marginTop: '8px', marginBottom: '20px', textAlign: 'center' },
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
    marginBottom: '14px'
  },
  badgesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px'
  },
  badgeCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '12px 4px',
    background: 'var(--color-card)',
    borderRadius: '16px',
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
  framesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px'
  },
  frameCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '14px 8px',
    background: 'var(--color-card)',
    border: '1px solid',
    borderRadius: '16px',
    minHeight: '160px',
    justifyContent: 'center'
  },
  frameMedal: { fontSize: '28px', lineHeight: 1 },
  frameBadge: { margin: '4px 0' },
  framePlace: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1px'
  },
  frameLeague: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  frameSeason: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)'
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  }
}

const popupStyles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: '20px',
    animation: 'rewardPopupFade 0.2s ease-out forwards'
  },
  modal: {
    width: '100%', maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '28px 22px 18px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
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