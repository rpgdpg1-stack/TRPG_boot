/**
 * Превью рамки ранга для сетки в Наградах.
 *
 * Показывает рамку «как в реальности»: для рангов 8/9/10 — анимированную
 * (через CSS-класс из frames.js + index.css: пульс/блик/пепел), для 0–7 —
 * обычную полоску цвета ранга. Внутри вместо аватара — силуэт человечка
 * (profile.svg), как заглушка.
 *
 * Закрытая рамка (ранг не достигнут) — приглушённый контур + замочек в углу,
 * по аналогии с LeagueBadgeIcon (там тоже 🔒).
 */

import { getFrameByRankIndex } from '../lib/frames'
import UiIcon from './UiIcon'

export default function FramePreview({ rankIndex, size = 64, isLocked = false }) {
  const frame = getFrameByRankIndex(rankIndex)
  const radius = Math.round(size * 0.28) // пропорционально 33/120 из профиля
  const silhouetteSize = Math.round(size * 0.5)

  const base = {
    position: 'relative',
    width: size,
    height: size,
    borderRadius: radius,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-card)',
    boxSizing: 'border-box'
  }

  // Закрытая — приглушённый контур + замок поверх
  if (isLocked) {
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ ...base, border: '2px solid rgba(255,255,255,0.12)' }}>
          <span style={{ opacity: 0.25, lineHeight: 0 }}>
            <UiIcon name="profile" size={silhouetteSize} color="#888888" />
          </span>
        </div>
        <span style={{
          position: 'absolute',
          right: '-3px',
          bottom: '-3px',
          fontSize: `${Math.round(size * 0.3)}px`,
          lineHeight: 1,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
        }}>
          🔒
        </span>
      </div>
    )
  }

  // Открытая: 8/9/10 — анимированный класс (без inline borderColor),
  // 0–7 — полоска цвета ранга.
  const style = frame.animated
    ? { ...base, border: '3px solid' }
    : { ...base, border: '2px solid', borderColor: frame.color, boxShadow: `0 0 8px ${frame.color}33` }

  return (
    <div className={frame.className} style={style}>
      <span style={{ lineHeight: 0, opacity: 0.85 }}>
        <UiIcon name="profile" size={silhouetteSize} color={frame.animated ? '#FFFFFF' : frame.color} />
      </span>
      {frame.hasAsh && <span className="imm-ash"><i /><i /><i /><i /></span>}
    </div>
  )
}