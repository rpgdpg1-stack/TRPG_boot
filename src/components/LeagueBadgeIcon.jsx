/**
 * Значок лиги — круглая медалька с эмодзи лиги.
 *
 * Используется:
 *  - в модалке "Ты вошёл в лигу N!" (большой размер)
 *  - в профиле в галерее наград (средний)
 *  - на странице рейтинга рядом с именем юзера (маленький)
 *  - возможно на главной рядом с рангом (маленький)
 *
 * Цвет фона и обводки = цвет лиги. Эмодзи — из leagues.js.
 * Размер варьируется через size (px) — единственный параметр который влияет
 * на габариты, всё внутри масштабируется автоматически.
 *
 * isLocked — отображает значок в "запертом" виде (серым, с замочком).
 * Для будущей галереи наград где не все ещё открыты.
 */

import { getLeagueByRankIndex } from '../lib/leagues'

export default function LeagueBadgeIcon({
  rankIndex,
  size = 48,
  isLocked = false,
  showGlow = true
}) {
  const league = getLeagueByRankIndex(rankIndex)

  // Размер шрифта эмодзи = 55% от размера значка — выверено визуально
  const emojiSize = Math.round(size * 0.55)
  // Толщина обводки тоже скейлится: 2px на 48px значке = ~4% размера
  const borderWidth = Math.max(2, Math.round(size * 0.04))

  // Цвета: основной цвет лиги + полупрозрачный фон того же цвета.
  // Для locked — серая палитра.
  const ringColor = isLocked ? 'rgba(255,255,255,0.15)' : league.color
  const bgColor = isLocked
    ? 'rgba(255,255,255,0.04)'
    : `${league.color}22` // 22 = ~13% альфа

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
        // Лёгкое внешнее свечение цветом лиги — придаёт значку "вес".
        // Отключаем для locked и при showGlow=false.
        boxShadow: !isLocked && showGlow
          ? `0 0 ${Math.round(size * 0.25)}px ${league.color}40, inset 0 0 ${Math.round(size * 0.15)}px ${league.color}30`
          : 'none',
        transition: 'box-shadow 0.3s ease, background 0.3s ease'
      }}
      aria-label={`Лига ${league.name}`}
    >
      <span style={{
        fontSize: `${emojiSize}px`,
        lineHeight: 1,
        filter: isLocked ? 'grayscale(1) opacity(0.4)' : 'none',
        userSelect: 'none'
      }}>
        {league.emoji}
      </span>

      {isLocked && (
        // Замочек поверх — крошечный, в правом нижнем углу
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