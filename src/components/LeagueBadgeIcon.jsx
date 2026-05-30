/**
 * Значок лиги — круглая медалька с ИКОНКОЙ РАНГА (SVG) внутри.
 *
 * Лига = ранг, поэтому показываем ту же иконку что и везде (RankIcon),
 * а не эмодзи. Цвет фона/обводки = цвет лиги, иконка внутри тоже в цвет лиги
 * (для locked — серая палитра + замочек).
 *
 * Используется:
 *  - страница Наград (сетка значков + сезонные рамки)
 *  - модалка LeagueBadgeModal (новая лига)
 *  - модалка SeasonEndModal (итоги сезона)
 *
 * Размер варьируется через size (px) — иконка внутри = 55% от size.
 *
 * isLocked — "запертый" вид: серый, иконка приглушена, замочек в углу.
 */

import { getLeagueByRankIndex } from '../lib/leagues'
import RankIcon from './RankIcon'

export default function LeagueBadgeIcon({
  rankIndex,
  size = 48,
  isLocked = false,
  showGlow = true
}) {
  const league = getLeagueByRankIndex(rankIndex)

  // Размер иконки = 55% от значка (как раньше у эмодзи — выверено визуально)
  const iconSize = Math.round(size * 0.55)
  // Толщина обводки скейлится: 2px на 48px значке = ~4% размера
  const borderWidth = Math.max(2, Math.round(size * 0.04))

  // Цвета: основной цвет лиги + полупрозрачный фон того же цвета.
  // Для locked — серая палитра.
  const ringColor = isLocked ? 'rgba(255,255,255,0.15)' : league.color
  const bgColor = isLocked
    ? 'rgba(255,255,255,0.04)'
    : `${league.color}22` // 22 = ~13% альфа

  // Цвет иконки: в цвет лиги, для locked — серый приглушённый
  const iconColor = isLocked ? 'rgba(255,255,255,0.35)' : league.color

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bgColor,
        border: `${borderWidth}px solid ${ringColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
        boxShadow: !isLocked && showGlow
          ? `0 0 ${Math.round(size * 0.25)}px ${league.color}40, inset 0 0 ${Math.round(size * 0.15)}px ${league.color}30`
          : 'none',
        transition: 'box-shadow 0.3s ease, background 0.3s ease'
      }}
      aria-label={`Лига ${league.name}`}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isLocked ? 0.4 : 1,
        lineHeight: 0
      }}>
        <RankIcon rankIndex={rankIndex} size={iconSize} color={iconColor} />
      </span>

      {isLocked && (
        // Замочек поверх — в правом нижнем углу
        <span style={{
          position: 'absolute',
          right: '-2px',
          bottom: '-2px',
          fontSize: `${Math.round(size * 0.3)}px`,
          lineHeight: 1,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
        }}>
          🔒
        </span>
      )}
    </div>
  )
}