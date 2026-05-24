import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getAllUserRewards } from '../lib/rewards'
import { getAllLeagues, getLeagueByRankIndex, getLeagueByMuscles } from '../lib/leagues'
import { getCurrentUser } from '../lib/auth'
import LeagueBadgeIcon from '../components/LeagueBadgeIcon'

/**
 * Экран наград — две секции:
 *  1. Значки лиг — сетка 4 в ряд, открытые цветные, неоткрытые серые с замочком
 *  2. Сезонные рамки — горизонтальный список карточек со всеми накопленными
 *
 * Логика "открытости" значка:
 *  - Если запись есть в league_badges (БД) — значок открыт
 *  - Если текущая лига юзера ВЫШЕ этого rank_index — значок тоже считаем открытым
 *    (этап пройден, юзер давно за ним). При этом запись в БД не создаём —
 *    grant_league_badge_if_new в Supabase создаёт записи только при пересечении
 *    конкретного порога во время начисления мускулов. Старые "забытые" этапы
 *    мы просто визуально подсвечиваем как открытые.
 *
 * Тап по значку лиги — попап с описанием.
 * Тап по рамке — попап с её описанием.
 */
export default function Rewards() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [badges, setBadges] = useState([])
  const [frames, setFrames] = useState([])
  const [popup, setPopup] = useState(null)

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

  // ВСЕ лиги, включая Новобранца (rank_index = 0)
  const allLeagues = getAllLeagues()

  // Текущая лига юзера — нужна чтобы автоматом подсвечивать как открытые
  // все лиги ниже текущей (этапы пройдены, даже если значки в БД не записаны).
  const user = getCurrentUser()
  const currentRankIndex = user ? getLeagueByMuscles(user.total_muscles || 0).rankIndex : 0

  // Множество rank_index которые у юзера РЕАЛЬНО получены (есть запись в league_badges)
  const earnedFromDb = new Set(badges.map(b => b.rank_index))

  // Функция: считать ли значок открытым.
  // Открыт если есть запись в БД ИЛИ текущая лига юзера ВЫШЕ этого ранга.
  // Текущая лига (rankIndex === currentRankIndex) тоже считается открытой —
  // ты её достиг и в ней находишься.
  const isBadgeUnlocked = (rankIndex) => {
    if (earnedFromDb.has(rankIndex)) return true
    if (rankIndex <= currentRankIndex) return true
    return false
  }

  // Сколько значков всего открыто (для подписи "N из M открыто")
  const openedCount = allLeagues.filter(l => isBadgeUnlocked(l.rankIndex)).length

  const handleBadgeTap = (rankIndex, isLocked) => {
    haptic.light()
    setPopup({ kind: 'badge', data: { rankIndex, isLocked, isCurrent: rankIndex === currentRankIndex } })
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
            {openedCount} из {allLeagues.length} открыто
          </div>

          <div style={styles.badgesGrid}>
            {allLeagues.map(league => {
              const unlocked = isBadgeUnlocked(league.rankIndex)
              const isLocked = !unlocked
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

    // Текст в попапе зависит от состояния:
    //  - закрыт (lock) — мотивирующий текст "достигни лигу"
    //  - открыт и это твоя ТЕКУЩАЯ лига — "ты в ней сейчас"
    //  - открыт и ты её прошёл — "этап пройден"
    let description
    if (data.isLocked) {
      description = `Открой при первом достижении лиги ${league.name}. Останется навсегда.`
    } else if (data.isCurrent) {
      description = 'Это твоя текущая лига. Значок останется с тобой даже после сброса сезона.'
    } else {
      description = `Этап пройден. Когда-то ты достиг лиги ${league.name} — значок останется навсегда.`
    }

    content = (
      <>
        <LeagueBadgeIcon rankIndex={data.rankIndex} size={96} isLocked={data.isLocked} showGlow={!data.isLocked} />
        <div style={{ ...popupStyles.title, color: data.isLocked ? 'var(--color-text-secondary)' : league.color }}>
          {league.name.toUpperCase()}
        </div>
        <div style={popupStyles.text}>
          {description}
        </div>
      </>
    )
  } else {
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
    animation: 'rewardPopupFade 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
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