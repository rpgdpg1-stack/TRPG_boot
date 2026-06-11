/**
 * Мини-превью рамки ранга — квадратик со скруглением, на котором показана
 * CSS-обводка рамки (полоска цвета ранга для 0–7, анимированные для 8/9/10).
 *
 * Используется в сетке вкладки «Рамки» на странице Наград.
 * Для locked (ранг не достигнут) — приглушённый серый контур.
 *
 * Внутри — заглушка-инициал или иконка ранга по центру, чтобы квадрат
 * не выглядел пустым. Пепел Бессмертного рисуется если рамка immortal.
 */

import { getFrameByRankIndex } from '../lib/frames'
import RankIcon from './RankIcon'

export default function FramePreview({ rankIndex, size = 64, isLocked = false }) {
  const frame = getFrameByRankIndex(rankIndex)
  const radius = Math.round(size * 0.28) // пропорционально, как 33/120 в профиле

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

  // Locked — серый приглушённый контур, без анимаций
  if (isLocked) {
    return (
      <div style={{ ...base, border: '2px solid rgba(255,255,255,0.12)' }}>
        <div style={{ opacity: 0.25 }}>
          <RankIcon rankIndex={rankIndex} size={Math.round(size * 0.42)} color="#888888" />
        </div>
      </div>
    )
  }

  // Открыта: для 8/9/10 — класс анимации (без inline borderColor),
  // для 0–7 — обычная полоска цвета ранга.
  const style = frame.animated
    ? { ...base, border: '3px solid' }
    : { ...base, border: '2px solid', borderColor: frame.color, boxShadow: `0 0 8px ${frame.color}33` }

  return (
    <div className={frame.className} style={style}>
      <RankIcon rankIndex={rankIndex} size={Math.round(size * 0.42)} />
      {frame.hasAsh && <span className="imm-ash"><i /><i /><i /><i /></span>}
    </div>
  )
}