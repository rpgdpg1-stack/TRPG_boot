/**
 * Модалка итогов сезона — показывается тем кто попал в топ-3 какой-то лиги.
 *
 * Внутри:
 *  - название и эмодзи сезона ("🌸 Весна 2026")
 *  - медаль места (🥇🥈🥉)
 *  - лига в которой получил награду
 *  - "рамка" — пока просто крупный значок лиги с медалью поверх. Когда позже
 *    сделаем настоящие рамки для аватара — заменим этот блок на превью рамки
 *
 * onConfirm() помечает рамку показанной (markRewardShown с type='frame').
 */

import { useEffect, useRef } from 'react'
import { getLeagueByRankIndex } from '../../lib/leagues'
import LeagueBadgeIcon from '../LeagueBadgeIcon'

export default function SeasonEndModal({ reward, onConfirm }) {
  const sceneRef = useRef(null)

  const league = getLeagueByRankIndex(reward.rank_index)
  const place = reward.place

  // Медальки для топ-3
  const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'

  // Цвет в зависимости от места: золото / серебро / бронза.
  // Используем для свечения вокруг рамки и фона кнопки.
  const placeColor = place === 1 ? '#FFD700'
                   : place === 2 ? '#C0C0C0'
                   : '#CD7F32'

  // Конфетти-искорки — медленнее и реже чем у значка лиги (тут праздник, не повышение).
  // Цвет — золото для 1 места, серебро для 2, бронза для 3.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    let isActive = true
    const interval = setInterval(() => {
      if (!isActive || !scene) return

      const spark = document.createElement('div')
      const angle = Math.random() * Math.PI * 2
      const distance = 70 + Math.random() * 40
      const targetX = Math.cos(angle) * distance
      const targetY = Math.sin(angle) * distance - 20 // чуть вверх в среднем
      const size = 2 + Math.floor(Math.random() * 2)

      spark.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${size}px;
        height: ${size}px;
        background: ${placeColor};
        box-shadow: 0 0 8px ${placeColor};
        --burst-x: ${targetX}px;
        --burst-y: ${targetY}px;
        animation: particleBurst 1.6s ease-out forwards;
        pointer-events: none;
        border-radius: 1px;
      `
      scene.appendChild(spark)
      setTimeout(() => spark.remove(), 1700)
    }, 150)

    return () => {
      isActive = false
      clearInterval(interval)
    }
  }, [placeColor])

  return (
    <div style={styles.overlay}>
      <div style={{
        ...styles.modal,
        borderColor: `${placeColor}50`,
        boxShadow: `0 8px 40px rgba(0, 0, 0, 0.6), 0 0 50px ${placeColor}30`
      }}>

        {/* Шапка сезона */}
        <div style={styles.seasonHeader}>
          СЕЗОН ЗАВЕРШЁН
        </div>
        <div style={styles.seasonName}>
          {reward.season_name}
        </div>

        {/* Сцена со значком и медалью */}
        <div ref={sceneRef} style={styles.scene}>
          <div style={styles.badgeWrap}>
            <LeagueBadgeIcon rankIndex={reward.rank_index} size={88} showGlow={true} />
            <div style={styles.medalOverlay}>{medal}</div>
          </div>
        </div>

        {/* Результат */}
        <div style={{ ...styles.placeText, color: placeColor }}>
          {place} МЕСТО
        </div>
        <div style={styles.leagueText}>
          в лиге <span style={{ color: league.color }}>{league.name}</span>
        </div>

        <div style={styles.subtitle}>
          Рамка добавлена в коллекцию.<br />
          Можно выставить рядом с аватаром в профиле.
        </div>

        <button
          onClick={onConfirm}
          style={{
            ...styles.button,
            background: placeColor,
            boxShadow: `0 4px 20px ${placeColor}50`
          }}
        >
          ЗАБРАТЬ НАГРАДУ
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
  placeText: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '24px',
    letterSpacing: '3px',
    lineHeight: 1,
    marginTop: '4px',
    textShadow: 'currentColor 0 0 10px'
  },
  leagueText: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1.5px'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    marginTop: '8px'
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