/**
 * Рамки аватара — чистый CSS, без SVG-ассетов.
 *
 * Ранги 0–7 (Новичок … X3 Чемпион): обычная обводка в цвет ранга
 *   (как было исторически) — никакой анимации.
 * Ранг 8  (Титан):      пульс обводки  → класс frame-titan
 * Ранг 9  (Легенда):    бегущий блик   → класс frame-legend
 * Ранг 10 (Бессмертный): золотой пульс + летящий пепел → frame-immortal (+ слой пепла)
 *
 * Цвета берём из RANK_NAMES/IMMORTAL (levels.js), чтобы не дублировать палитру.
 * Анимированные рамки задают цвет обводки сами в CSS (index.css), но мы всё
 * равно возвращаем color для свечения/совместимости.
 *
 * Использование в аватаре:
 *   const f = getFrameByRankIndex(rankIndex)
 *   <div className={f.className} style={{ borderColor: f.color, ... }}>
 *     {f.hasAsh && <span className="imm-ash"><i/><i/><i/><i/></span>}
 *     ...фото...
 *   </div>
 */

import { RANK_NAMES, IMMORTAL } from './levels'

// rankIndex → имя CSS-класса анимированной рамки (или null для обычной полоски)
const ANIMATED = {
  8:  'frame-titan',
  9:  'frame-legend',
  10: 'frame-immortal'
}

/**
 * Вернуть мету рамки по индексу ранга.
 * @param {number} rankIndex 0..10
 * @returns {{ className: string, color: string, animated: boolean, hasAsh: boolean }}
 */
export function getFrameByRankIndex(rankIndex) {
  const idx = Math.min(Math.max(rankIndex ?? 0, 0), 10)

  const color = idx >= RANK_NAMES.length
    ? IMMORTAL.color
    : (RANK_NAMES[idx]?.color || RANK_NAMES[0].color)

  const className = ANIMATED[idx] || ''

  return {
    className,
    color,
    animated: !!className,
    hasAsh: idx === 10   // только Бессмертный рисует слой пепла
  }
}

/**
 * Хелпер: индекс ранга из мускулов (та же формула, что в БД: /900, cap 0..10).
 * Удобно, чтобы не тащить getLeagueByMuscles в каждый аватар.
 */
export function rankIndexFromMuscles(totalMuscles) {
  return Math.min(Math.max(Math.floor((totalMuscles || 0) / 900), 0), 10)
}