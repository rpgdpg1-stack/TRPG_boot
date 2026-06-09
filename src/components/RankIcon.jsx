import { RANK_NAMES, IMMORTAL, IMMORTAL_START_LEVEL, LEVELS_PER_RANK } from '../lib/levels'

/**
 * Иконка ранга — SVG из src/assets/ranks/, окрашенная в цвет ранга.
 *
 * Файлы рангов лежат в src/assets/ranks/{icon}.svg, где {icon} — поле icon
 * из RANK_NAMES / IMMORTAL (rookie, sportsman, ..., immortal).
 *
 * Все SVG должны быть с fill="currentColor" — тогда они красятся цветом,
 * который мы задаём в style.color обёртки. Цвет берётся из ранга.
 *
 * Подключение файлов через import.meta.glob — Vite на этапе сборки находит
 * ВСЕ svg в папке и отдаёт их URL'ы. Не нужно прописывать import для каждого
 * вручную; при добавлении нового ранга достаточно положить файл в папку.
 *
 * Способ показа: <img src={url}> не красится currentColor (внешний ресурс).
 * Поэтому грузим СОДЕРЖИМОЕ svg как строку (query '?raw') и вставляем инлайн
 * через dangerouslySetInnerHTML — так currentColor работает.
 *
 * Параметры:
 *  - rankIndex — какой ранг показать (0..9 обычные, 10 = Бессмертный).
 *    Если не передан, можно передать level — посчитаем ранг из него.
 *  - level — альтернатива rankIndex (берётся ранг по уровню)
 *  - size — размер в px (квадрат), по умолчанию 16
 *  - color — переопределить цвет; по умолчанию цвет ранга
 */

// Грузим все svg рангов как сырые строки. Ключи — пути вида
// '/src/assets/ranks/rookie.svg', значения — содержимое файла (string).
const rankSvgs = import.meta.glob('../assets/ranks/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
})

/**
 * Достаём содержимое svg по имени иконки (без расширения).
 * Возвращает строку svg или null если файла нет.
 */
function getSvgByIconName(iconName) {
  if (!iconName) return null
  // Ищем ключ заканчивающийся на /{iconName}.svg
  const key = Object.keys(rankSvgs).find(k => k.endsWith(`/${iconName}.svg`))
  return key ? rankSvgs[key] : null
}

/**
 * По rankIndex получаем мета-данные ранга (имя иконки + цвет).
 * rankIndex 10+ → Бессмертный.
 */
function getRankMetaByIndex(rankIndex) {
  if (rankIndex >= RANK_NAMES.length) {
    return { icon: IMMORTAL.icon, color: IMMORTAL.color }
  }
  const r = RANK_NAMES[rankIndex] || RANK_NAMES[0]
  return { icon: r.icon, color: r.color }
}

export default function RankIcon({ rankIndex, level, size = 16, color }) {
  // Определяем индекс ранга: либо напрямую, либо из уровня
  let idx = rankIndex
  if (idx === undefined || idx === null) {
    if (level !== undefined && level !== null) {
      if (level >= IMMORTAL_START_LEVEL) {
        idx = RANK_NAMES.length // бессмертный
      } else {
        idx = Math.floor((level - 1) / LEVELS_PER_RANK)
      }
    } else {
      idx = 0
    }
  }

  const meta = getRankMetaByIndex(idx)
  const svgRaw = getSvgByIconName(meta.icon)
  const finalColor = color || meta.color

  // Если файл не нашёлся — рисуем пустой квадрат нужного размера,
  // чтобы вёрстка не прыгала. (Лучше дырка чем краш.)
  if (!svgRaw) {
    console.warn('[RankIcon] svg не найден для иконки:', meta.icon)
    return (
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          flexShrink: 0
        }}
        aria-hidden="true"
      />
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: finalColor,        // currentColor внутри svg возьмёт это
        flexShrink: 0,
        lineHeight: 0
      }}
      // Размер самого svg форсируем через CSS ниже (svg может иметь свой width/height)
      ref={(el) => {
        if (el) {
          const svg = el.querySelector('svg')
          if (svg) {
            svg.setAttribute('width', size)
            svg.setAttribute('height', size)
            svg.style.display = 'block'
          }
        }
      }}
      dangerouslySetInnerHTML={{ __html: svgRaw }}
      aria-hidden="true"
    />
  )
}