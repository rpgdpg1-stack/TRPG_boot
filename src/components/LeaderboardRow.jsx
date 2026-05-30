/**
 * Строка списка рейтинга — одна позиция (один юзер).
 *
 * Состав слева направо:
 *   [МЕДАЛЬ/НОМЕР]  [АВАТАР]  Имя @ник           Ранг   123 💪
 *                                                         (золотым если is_me)
 *
 * Медали для топ-3 (🥇🥈🥉), для остальных — серый "#4".
 * Если is_me — подсвечиваем зелёным фоном и обводкой, чтобы юзер видел себя.
 *
 * Аватарка квадратная 40px со скруглением 12px (мини-версия аватарки с главной).
 * Если photo_url нет — placeholder с первой буквой имени.
 *
 * Имя длинное → ellipsis. Не даём строке распухнуть и сломать раскладку.
 */

import { getRankByLevel, getLevelFromXP } from '../lib/levels'
import RankIcon from './RankIcon'

export default function LeaderboardRow({ row, isMe, showHandle = true }) {
  const {
    first_name,
    username,
    photo_url,
    total_muscles,
    place
  } = row

  // Ранг считаем заново на клиенте — у нас уже есть готовая функция,
  // и она корректно даёт подуровень ("Спортсмен 2" вместо просто "Спортсмен").
  // В строке списка важно видеть точный подуровень, не только название лиги.
  const level = getLevelFromXP(total_muscles)
  const rank = getRankByLevel(level)

  const displayName = first_name || 'Игрок'
  const handleStr = username ? `@${username}` : ''

  // Медалька для топ-3, иначе — серая решётка с номером
  const placeBadge = place === 1 ? '🥇'
                   : place === 2 ? '🥈'
                   : place === 3 ? '🥉'
                   : null

  return (
    <div style={{
      ...styles.row,
      background: isMe ? 'rgba(158, 209, 83, 0.10)' : 'transparent',
      border: isMe ? '1px solid rgba(158, 209, 83, 0.35)' : '1px solid rgba(255, 255, 255, 0.04)'
    }}>

      {/* Место — слева, фиксированной ширины чтобы аватары выровнялись по колонке */}
      <div style={styles.placeWrap}>
        {placeBadge ? (
          <span style={styles.medal}>{placeBadge}</span>
        ) : (
          <span style={styles.placeNumber}>#{place}</span>
        )}
      </div>

      {/* Аватар — мини-версия. Квадрат 40x40, скругление 12 — мягче чем у больших карточек */}
      <div style={styles.avatarWrap}>
        {photo_url ? (
          <img src={photo_url} alt="" style={styles.avatarImg} draggable={false} />
        ) : (
          <div style={styles.avatarPlaceholder}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Имя + ранг под ним */}
      <div style={styles.nameBlock}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{displayName}</span>
          {showHandle && handleStr && <span style={styles.handle}>{handleStr}</span>}
        </div>
        <div style={{ ...styles.rank, color: rank.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <RankIcon level={level} size={11} />
          {rank.name} {rank.subLevel}
        </div>
      </div>

      {/* Мускулы справа — пиксельным шрифтом, в цвет ранга */}
      <div style={{ ...styles.muscles, color: rank.color }}>
        {total_muscles} 💪
      </div>
    </div>
  )
}

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '14px',
    transition: 'background 0.2s ease'
  },
  // Колонка места — фиксированной ширины, чтобы аватары
  // у всех строк начинались в одной X-координате
  placeWrap: {
    width: '32px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  medal: {
    fontSize: '22px',
    lineHeight: 1
  },
  placeNumber: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
  },
  avatarWrap: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'var(--color-card)',
    flexShrink: 0,
    border: '1px solid rgba(255, 255, 255, 0.08)'
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    color: 'var(--color-primary)'
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '5px',
    overflow: 'hidden'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  handle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    letterSpacing: '1px',
    lineHeight: 1
  },
  muscles: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    letterSpacing: '0.5px',
    flexShrink: 0,
    whiteSpace: 'nowrap'
  }
}