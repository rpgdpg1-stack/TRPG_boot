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

import { useState } from 'react'
import { getRankByLevel, getLevelFromXP } from '../lib/levels'
import { getLeagueByRankIndex } from '../lib/leagues'
import RankIcon from './RankIcon'
import MuscleIcon from './MuscleIcon'

export default function LeaderboardRow({ row, isMe, onTap }) {
  const {
    first_name,
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

  // Медалька для топ-3, иначе — серая решётка с номером
  const placeBadge = place === 1 ? '🥇'
                   : place === 2 ? '🥈'
                   : place === 3 ? '🥉'
                   : null

  const [pressed, setPressed] = useState(false)

  // Фон строки. Своя строка — лёгкая зелёная, при нажатии чуть насыщеннее.
  // Чужая — прозрачная, при нажатии светло-серая (как .tg-row в разделах).
  const bg = isMe
    ? (pressed ? 'rgba(158, 209, 83, 0.20)' : 'rgba(158, 209, 83, 0.10)')
    : (pressed ? 'rgba(255, 255, 255, 0.06)' : 'transparent')

  return (
    <div
      onClick={() => onTap?.(row)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        ...styles.row,
        background: bg,
        cursor: onTap ? 'pointer' : 'default'
      }}>

      {/* Место — слева, фиксированной ширины чтобы аватары выровнялись по колонке */}
      <div style={styles.placeWrap}>
        {placeBadge ? (
          <span style={styles.medal}>{placeBadge}</span>
        ) : (
          <span style={styles.placeNumber}>#{place}</span>
        )}
      </div>

      {/* Аватар — мини-версия. Квадрат 40x40, скругление 12.
          Рамка в цвет лиги (rank_index) — по дефолту рамка лиги, позже сюда
          подставим выбранную в наградах сезонную рамку. */}
      <div style={{
        ...styles.avatarWrap,
        borderColor: getLeagueByRankIndex(level >= 31 ? 10 : Math.floor((level - 1) / 3)).color
      }}>
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
        </div>
        <div style={{ ...styles.rank, color: rank.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <RankIcon level={level} size={11} />
          {rank.name} {rank.subLevel}
        </div>
      </div>

      {/* Мускулы справа — число в цвет ранга + бежевый бицепс */}
      <div style={{ ...styles.muscles, color: rank.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
        {total_muscles} <MuscleIcon size={18} earned={true} />
      </div>
    </div>
  )
}

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
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
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
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
    border: '2px solid',
    transition: 'border-color 0.3s ease'
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
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
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
  rank: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '10px',
    letterSpacing: '1px',
    lineHeight: 1
  },
  muscles: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    letterSpacing: '0.5px',
    flexShrink: 0,
    whiteSpace: 'nowrap'
  }
}