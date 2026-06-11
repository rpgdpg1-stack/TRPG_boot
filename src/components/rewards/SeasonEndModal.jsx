/**
 * Модалка ИТОГОВ СЕЗОНА. Показывается один раз после сезонного сброса
 * каждому игроку (данные из season_summaries через api_get_season_summary).
 *
 * Показывает:
 *  - название завершённого сезона
 *  - сколько РАНГОВ игрок прошёл за сезон (ranks_climbed)
 *  - финишную лигу + место в ней (final_place из final_league_size)
 *  - медаль 🥇🥈🥉 если место топ-3 (ВИЗУАЛЬНО для любой лиги)
 *  - если Бессмертный топ-3 (is_immortal_top3) — золотой акцент + плашка
 *    "медаль и титул #N сохранены" (они реально записаны в season_rewards)
 *
 * onConfirm() помечает снимок показанным (markSeasonSummaryShown).
 *
 * data = {
 *   id, season_key, season_name, start_rank_index, final_rank_index,
 *   ranks_climbed, final_place, final_league_size, is_immortal_top3
 * }
 */

import { useEffect, useRef } from 'react'
import { getLeagueByRankIndex } from '../../lib/leagues'
import LeagueBadgeIcon from '../LeagueBadgeIcon'

function pluralRanks(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'рангов'
  if (last === 1) return 'ранг'
  if (last >= 2 && last <= 4) return 'ранга'
  return 'рангов'
}

export default function SeasonEndModal({ summary, onConfirm }) {
  const sceneRef = useRef(null)

  const league = getLeagueByRankIndex(summary.final_rank_index)
  const place = summary.final_place
  const isTop3 = place != null && place <= 3
  const climbed = summary.ranks_climbed || 0

  const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : null
  const placeColor = place === 1 ? '#FFD700'
                   : place === 2 ? '#C0C0C0'
                   : place === 3 ? '#CD7F32'
                   : league.color

  // Акцентный цвет модалки: топ-3 → цвет медали, иначе цвет финиш-лиги
  const accent = isTop3 ? placeColor : league.color

  // Искорки в цвет акцента (только если есть чему радоваться — топ-3 или прошёл ранги)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (!isTop3 && climbed === 0) return // нечего праздновать — без искр

    let isActive = true
    const interval = setInterval(() => {
      if (!isActive || !scene) return
      const spark = document.createElement('div')
      const angle = Math.random() * Math.PI * 2
      const distance = 70 + Math.random() * 40
      const targetX = Math.cos(angle) * distance
      const targetY = Math.sin(angle) * distance - 20
      const size = 2 + Math.floor(Math.random() * 2)
      spark.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${size}px;
        height: ${size}px;
        background: ${accent};
        box-shadow: 0 0 8px ${accent};
        --burst-x: ${targetX}px;
        --burst-y: ${targetY}px;
        animation: particleBurst 1.6s ease-out forwards;
        pointer-events: none;
        border-radius: 1px;
      `
      scene.appendChild(spark)
      setTimeout(() => spark.remove(), 1700)
    }, 150)

    return () => { isActive = false; clearInterval(interval) }
  }, [accent, isTop3, climbed])

  return (
    <div style={styles.overlay}>
      <div style={{
        ...styles.modal,
        borderColor: `${accent}50`,
        boxShadow: `0 8px 40px rgba(0, 0, 0, 0.6), 0 0 50px ${accent}30`
      }}>

        <div style={styles.seasonHeader}>СЕЗОН ЗАВЕРШЁН</div>
        <div style={styles.seasonName}>{summary.season_name}</div>

        {/* Сцена: значок финиш-лиги + медаль если топ-3 */}
        <div ref={sceneRef} style={styles.scene}>
          <div style={styles.badgeWrap}>
            <LeagueBadgeIcon rankIndex={summary.final_rank_index} size={88} showGlow={true} />
            {medal && <div style={styles.medalOverlay}>{medal}</div>}
          </div>
        </div>

        {/* Сколько рангов прошёл */}
        {climbed > 0 ? (
          <div style={styles.climbLine}>
            За сезон пройдено <span style={{ color: 'var(--color-primary)' }}>{climbed} {pluralRanks(climbed)}</span>
          </div>
        ) : (
          <div style={styles.climbLine}>Сезон завершён</div>
        )}

        {/* Финиш-лига + место */}
        <div style={styles.finishLine}>
          Финиш: <span style={{ color: league.color }}>{league.name}</span>
          {place != null && (
            <> · <span style={{ color: placeColor }}>
              {place} место{summary.final_league_size ? ` из ${summary.final_league_size}` : ''}
            </span></>
          )}
        </div>

        {/* Плашка результата */}
        {summary.is_immortal_top3 ? (
          <div style={{ ...styles.rewardBox, borderColor: `${placeColor}55`, background: `${placeColor}14` }}>
            <div style={{ ...styles.rewardTitle, color: placeColor }}>
              {medal} МЕДАЛЬ И ТИТУЛ #{place}
            </div>
            <div style={styles.rewardSub}>
              Сохранены в наградах. Титул можно надеть под именем.
            </div>
          </div>
        ) : isTop3 ? (
          <div style={styles.subtitle}>
            Топ-3 лиги! Медали за сезон даёт только лига Бессмертный — доберись до неё.
          </div>
        ) : (
          <div style={styles.subtitle}>
            Новый сезон уже идёт. Вперёд за новыми рангами.
          </div>
        )}

        <button
          onClick={onConfirm}
          style={{
            ...styles.button,
            background: accent,
            boxShadow: `0 4px 20px ${accent}50`
          }}
        >
          {summary.is_immortal_top3 ? 'ЗАБРАТЬ НАГРАДУ' : 'ПОНЯТНО'}
        </button>
      </div>

      <style>{`
        @keyframes seasonOverlayFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes seasonPanelIn {
          0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes medalPulse {
          0%, 100% { transform: scale(1) rotate(-8deg); }
          50%      { transform: scale(1.1) rotate(-8deg); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.94)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px',
    animation: 'seasonOverlayFade 0.3s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '340px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid',
    borderRadius: '28px',
    padding: '28px 24px 22px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    animation: 'seasonPanelIn 0.5s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  seasonHeader: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px'
  },
  seasonName: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    marginBottom: '4px'
  },
  scene: {
    position: 'relative',
    width: '140px',
    height: '140px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '4px 0'
  },
  badgeWrap: {
    position: 'relative',
    zIndex: 2
  },
  medalOverlay: {
    position: 'absolute',
    right: '-12px',
    bottom: '-8px',
    fontSize: '44px',
    lineHeight: 1,
    animation: 'medalPulse 1.8s ease-in-out infinite',
    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))'
  },
  climbLine: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    textAlign: 'center',
    marginTop: '4px'
  },
  finishLine: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    textAlign: 'center',
    lineHeight: 1.5
  },
  rewardBox: {
    width: '100%',
    marginTop: '12px',
    padding: '12px 14px',
    border: '1px solid',
    borderRadius: '14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  },
  rewardTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    letterSpacing: '1.5px',
    textAlign: 'center'
  },
  rewardSub: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.4
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    marginTop: '8px',
    padding: '0 4px'
  },
  button: {
    width: '100%',
    marginTop: '14px',
    padding: '14px',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: '14px',
    border: 'none',
    cursor: 'pointer'
  }
}