import UiIcon from './UiIcon'

/**
 * Недельный индикатор активности — бицепс, который крепнет с каждой тренировкой.
 *
 * ПОЧЕМУ НЕ ОГОНЁК. Раньше здесь стоял 🔥, но огонёк во всех приложениях
 * означает НЕПРЕРЫВНОСТЬ (серия дней подряд), а у нас число значит совсем
 * другое — сколько тренировок сделано за неделю. Пока лимит держал одну
 * тренировку в сутки, расхождение почти не замечалось; теперь, когда за день
 * засчитывается по одной на раздел, счётчик легко доходит до 9–12, и «🔥 12»
 * читается как «двенадцать недель подряд». Бицепс — фирменный знак TRPG и
 * прямо связан с тренировками, поэтому считает именно он.
 *
 * Огонёк из проекта убран НЕ насовсем: если появится настоящая серия недель,
 * он вернётся под неё. Тогда разделение честное: 💪 — сколько, 🔥 — насколько
 * стабильно.
 *
 * ЧЕТЫРЕ СОСТОЯНИЯ, дальше рост прекращается — иначе через месяц размер
 * перестаёт что-либо сообщать:
 *
 *   0  серый, 100%, обводка 0.2 — ещё не начинал
 *   1  бежевый, 105%, обводка 0.2 — ожил
 *   2  бежевый, 110%, обводка 0.4 + редкие искры
 *   3+ бежевый, 115%, обводка 0.7 + искры чаще и крупнее
 *
 * Растёт и масштаб, и толщина контура: силуэт становится массивнее, а не просто
 * больше. Потолок обводки 0.7 — тот же, что у залитого бицепса в таб-баре: выше
 * предплечье слипается с кулаком в пятно. Свечения у самого значка нет намеренно.
 *
 * Размер БОКСА постоянный (по максимальной стадии) — значок растёт внутри него.
 * Иначе строка «💪 3 Тренировки на этой неделе» дёргалась бы вбок при каждой
 * смене состояния.
 */

// Масштаб и толщина контура по стадиям. Индекс = стадия (0..3).
const SCALE = [1, 1.05, 1.1, 1.15]
const STROKE = [0.2, 0.2, 0.4, 0.7]
const MAX_LEVEL = SCALE.length - 1

// Искры: с какой стадии летят, сколько штук и насколько крупные.
// Раскладка фиксированная, а не случайная — случайные позиции при каждом
// рендере заставляли бы искры «прыгать» на любой перерисовке строки.
const SPARKS = {
  2: [
    { x: 30, y: 26, d: 3, drift: -5, dur: 2.2, delay: 0 },
    { x: 62, y: 20, d: 2.5, drift: 5, dur: 2.5, delay: 0.8 },
    { x: 46, y: 34, d: 3, drift: -1, dur: 2.3, delay: 1.5 }
  ],
  3: [
    { x: 26, y: 28, d: 3.5, drift: -6, dur: 2, delay: 0 },
    { x: 44, y: 18, d: 3, drift: -2, dur: 2.3, delay: 0.4 },
    { x: 64, y: 26, d: 3.5, drift: 6, dur: 2.1, delay: 0.8 },
    { x: 34, y: 40, d: 3, drift: -4, dur: 2.4, delay: 1.2 },
    { x: 68, y: 38, d: 3.5, drift: 7, dur: 2.2, delay: 1.6 },
    { x: 52, y: 24, d: 3, drift: 2, dur: 2.5, delay: 2 }
  ]
}

export default function WeeklyMuscle({ count = 0, size = 22, style }) {
  const level = Math.min(Math.max(count | 0, 0), MAX_LEVEL)
  const lit = level >= 1
  const sparks = SPARKS[level] || []

  // Бокс держит место под самую крупную стадию — соседи не едут.
  const box = Math.round(size * SCALE[MAX_LEVEL])

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: box,
        height: box,
        flexShrink: 0,
        ...style
      }}
    >
      {sparks.map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="muscle-spark"
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.d,
            height: s.d,
            borderRadius: '50%',
            background: 'var(--color-primary)',
            boxShadow: '0 0 5px var(--accent-strong)',
            pointerEvents: 'none',
            opacity: 0,
            '--spark-drift': `${s.drift}px`,
            animation: `muscleSpark ${s.dur}s ease-out ${s.delay}s infinite`
          }}
        />
      ))}

      <span
        className="muscle-weight"
        style={{
          display: 'inline-flex',
          transform: `scale(${SCALE[level]})`,
          transformOrigin: 'center',
          transition: 'transform 0.32s var(--ease-ios)',
          '--muscle-stroke': STROKE[level]
        }}
      >
        <UiIcon
          name="muscles-fill"
          size={size}
          color={lit ? 'var(--color-icon-muscle)' : 'var(--color-text-secondary)'}
        />
      </span>
    </span>
  )
}
