/**
 * Модалка "Новый сезон начался".
 *
 * Показывается при первом входе в новом сезоне после сброса.
 * В отличие от SeasonEndModal — НЕ привязана к таблице БД.
 *
 * Логика показа:
 *  - users.last_seen_season хранит ключ последнего показанного сезона
 *  - при входе сравниваем с текущим сезоном
 *  - если расходится — показываем модалку и обновляем last_seen_season
 *
 * Шлёт onConfirm() который обновит поле в БД.
 *
 * Внутри — крупный эмодзи сезона, название, призыв побороться за рамку.
 */

import { useEffect, useRef } from 'react'

export default function NewSeasonModal({ season, daysLeft, onConfirm }) {
  const sceneRef = useRef(null)

  // Тематические искорки в цвет сезона (зелёные для весны, золотые для лета и т.д.)
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
        background: ${season.color};
        box-shadow: 0 0 6px ${season.color};
        --burst-x: ${targetX}px;
        --burst-y: ${targetY}px;
        animation: particleBurst 1.3s ease-out forwards;
        pointer-events: none;
        border-radius: 1px;
      `
      scene.appendChild(spark)
      setTimeout(() => spark.remove(), 1400)
    }, 140)

    return () => {
      isActive = false
      clearInterval(interval)
    }
  }, [season.color])

  return (
    <div style={styles.overlay}>
      <div style={{
        ...styles.modal,
        borderColor: `${season.color}50`,
        boxShadow: `0 8px 40px rgba(0, 0, 0, 0.6), 0 0 40px ${season.color}30`
      }}>

        {/* Сцена с крупным эмодзи сезона */}
        <div ref={sceneRef} style={styles.scene}>
          <div style={styles.emojiWrap}>
            {season.emoji}
          </div>
        </div>

        <div style={styles.kicker}>НОВЫЙ СЕЗОН</div>
        <div style={{ ...styles.title, color: season.color }}>
          {season.name.toUpperCase()}
        </div>

        <div style={styles.subtitle}>
          Сезон длится {daysLeft} {pluralDays(daysLeft)}.<br />
          Поднимайся в рангах. Топ-3 Бессмертного даёт медаль и титул.
        </div>

        <button
          onClick={onConfirm}
          style={{
            ...styles.button,
            background: season.color,
            boxShadow: `0 4px 20px ${season.color}50`
          }}
        >
          ПОГНАЛИ
        </button>
      </div>

      <style>{`
        @keyframes newSeasonOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes newSeasonPanel {
          0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes emojiBob {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-6px) scale(1.05); }
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
    animation: 'newSeasonOverlay 0.3s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '340px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid',
    borderRadius: '28px',
    padding: '30px 24px 22px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    animation: 'newSeasonPanel 0.5s cubic-bezier(0.32, 0.72, 0, 1) forwards'
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
  emojiWrap: {
    fontSize: '92px',
    lineHeight: 1,
    animation: 'emojiBob 2s ease-in-out infinite',
    zIndex: 2,
    position: 'relative',
    filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))'
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
    fontWeight: 700,
    fontSize: '24px',
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
    marginTop: '6px',
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