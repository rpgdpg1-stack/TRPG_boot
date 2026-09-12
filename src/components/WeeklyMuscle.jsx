import UiIcon from './UiIcon'

/**
 * Индикатор активности — бицепс.
 *
 * ПОЧЕМУ НЕ ОГОНЁК. Раньше здесь стоял 🔥, но огонёк во всех приложениях
 * означает НЕПРЕРЫВНОСТЬ (серия дней подряд), а у нас число значит совсем
 * другое — сколько тренировок сделано за неделю. Пока лимит держал одну
 * тренировку в сутки, расхождение почти не замечалось; теперь, когда за день
 * засчитывается по одной на раздел, счётчик легко доходит до 9–12, и «🔥 12»
 * читается как «двенадцать недель подряд». Бицепс — фирменный знак TRPG и
 * прямо связан с тренировками, поэтому считает именно он.
 *
 * ДВА СОСТОЯНИЯ, не четыре. Раньше значок рос в четыре ступени по числу
 * тренировок (100 → 105 → 110 → 115%, обводка 0.2 → 0.7). Ступени считывались
 * только рядом друг с другом: в жизни человек видит ОДИН бицепс и понять по
 * нему, вторая это тренировка или третья, всё равно не мог — число рядом
 * говорило это точнее. Осталось то, что читается без сравнения:
 *
 *   серый  — тренировок не было
 *   залитый — были (сразу самая массивная форма)
 *
 * ИСКРЫ — ОТДЕЛЬНЫЙ СМЫСЛ, не следующая ступень. Они означают ровно одно:
 * тренировка идёт ПРЯМО СЕЙЧАС. Поэтому летят только у активной сессии — своей
 * на главной и чужой в списке друзей. Постоянно висящие искры утяжеляли
 * интерфейс и обещали движение там, где ничего не происходит.
 */

// Залитый бицепс — сразу самая массивная форма. Потолок обводки 0.7 — тот же,
// что у залитого бицепса в таб-баре: выше предплечье слипается с кулаком в пятно.
const LIT_SCALE = 1.15
const LIT_STROKE = 0.7
const DIM_STROKE = 0.2

// Искры: раскладка фиксированная, а не случайная — случайные позиции при каждом
// рендере заставляли бы искры «прыгать» на любой перерисовке строки.
const SPARKS = [
  { x: 26, y: 28, d: 3.5, drift: -6, dur: 2, delay: 0 },
  { x: 44, y: 18, d: 3, drift: -2, dur: 2.3, delay: 0.4 },
  { x: 64, y: 26, d: 3.5, drift: 6, dur: 2.1, delay: 0.8 },
  { x: 34, y: 40, d: 3, drift: -4, dur: 2.4, delay: 1.2 },
  { x: 68, y: 38, d: 3.5, drift: 7, dur: 2.2, delay: 1.6 },
  { x: 52, y: 24, d: 3, drift: 2, dur: 2.5, delay: 2 }
]

/**
 * @param lit    — залитый (были тренировки) или серый.
 * @param sparks — летят искры: тренировка идёт прямо сейчас.
 */
export default function WeeklyMuscle({ lit = false, sparks = false, size = 22, style }) {
  // Бокс держит место под залитую (крупную) форму — соседи не едут при смене.
  const box = Math.round(size * LIT_SCALE)

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
      {sparks && SPARKS.map((s, i) => (
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
          transform: `scale(${lit ? LIT_SCALE : 1})`,
          transformOrigin: 'center',
          transition: 'transform 0.32s var(--ease-ios)',
          '--muscle-stroke': lit ? LIT_STROKE : DIM_STROKE
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
