/**
 * Модалка "Ты вошёл в новую лигу!"
 *
 * Показывается при первом достижении новой лиги (выдан league_badge).
 * Большой значок лиги по центру, анимация "повышения", цвет в тон лиги.
 *
 * Внутри одна модалка показывает один значок. Если значков несколько
 * (например юзер давно не заходил и прокачался сразу через 2 лиги) —
 * родитель (App.jsx) показывает их по одному с кнопкой "Дальше".
 *
 * После закрытия — onConfirm() помечает значок как показанный в БД.
 */

import { useEffect, useRef } from 'react'
import { getLeagueByRankIndex } from '../../lib/leagues'
import LeagueBadgeIcon from '../LeagueBadgeIcon'

export default function LeagueBadgeModal({ rankIndex, onConfirm }) {
  const league = getLeagueByRankIndex(rankIndex)
  const sceneRef = useRef(null)

  // Спавним мелкие искорки цвета лиги вокруг значка пока модалка открыта.
  // Эффект "значок светится" — стандартный приём для важных наград.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    let isActive = true
    const interval = setInterval(() => {
      if (!isActive || !scene) return

      const spark = document.createElement('div')
      const angle = Math.random() * Math.PI * 2
      const distance = 60 + Math.random() * 30
      const targetX = Math.cos(angle) * distance
      const targetY = Math.sin(angle) * distance
      const size = 2 + Math.floor(Math.random() * 2)

      spark.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${size}px;
        height: ${size}px;
        background: ${league.color};
        box-shadow: 0 0 6px ${league.color};
        --burst-x: ${targetX}px;
        --burst-y: ${targetY}px;
        animation: particleBurst 1.2s ease-out forwards;
        pointer-events: none;
        border-radius: 1px;
      `
      scene.appendChild(spark)
      setTimeout(() => spark.remove(), 1300)
    }, 120)

    return () => {
      isActive = false
      clearInterval(interval)
    }
  }, [league.color])

  return (
    <div style={styles.overlay}>
      <div style={{
        ...styles.modal,
        borderColor: `${league.color}40`,
        boxShadow: `0 8px 40px rgba(0, 0, 0, 0.6), 0 0 40px ${league.color}30`
      }}>

        {/* Сцена со значком и искорками */}
        <div ref={sceneRef} style={styles.scene}>
          <div style={styles.badgeWrap}>
            <LeagueBadgeIcon rankIndex={rankIndex} size={96} showGlow={true} />
          </div>
        </div>

        {/* Заголовок */}
        <div style={styles.kicker}>НОВАЯ ЛИГА</div>
        <div style={{ ...styles.title, color: league.color }}>
          {league.name.toUpperCase()}
        </div>

        {/* Подпись */}
        <div style={styles.subtitle}>
          {league.isImmortal
            ? 'Ты в самой вершине. Дальше — только бесконечность.'
            : 'Значок останется с тобой навсегда, даже после сброса сезона.'}
        </div>

        <button
          onClick={onConfirm}
          style={{
            ...styles.button,
            background: league.color,
            boxShadow: `0 4px 20px ${league.color}50`
          }}
        >
          ПРИНЯТЬ
        </button>
      </div>

      <style>{`
        @keyframes badgeOverlayFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes badgePanelIn {
          0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px',
    animation: 'badgeOverlayFade 0.3s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '340px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid',
    borderRadius: 'var(--radius-card)',
    padding: '32px 24px 22px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    animation: 'badgePanelIn 0.5s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  scene: {
    position: 'relative',
    width: '140px',
    height: '140px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px'
  },
  badgeWrap: {
    animation: 'badgePulse 2s ease-in-out infinite',
    zIndex: 2,
    position: 'relative'
  },
  kicker: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '28px',
    letterSpacing: '3px',
    lineHeight: 1,
    textShadow: 'currentColor 0 0 12px'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    marginTop: '4px',
    padding: '0 8px'
  },
  button: {
    width: '100%',
    marginTop: '12px',
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