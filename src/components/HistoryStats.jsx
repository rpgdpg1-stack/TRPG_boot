import MuscleIcon from './MuscleIcon'
import { formatStatTime, formatMeters, CATEGORY_ORDER } from '../utils/history'
import { pluralizeWorkouts, pluralizeCategoryCap } from '../utils/plural'
import SectionBadge from './SectionBadge'

// Бицепс главного показателя.
const ICON = 20

/**
 * Сводка тренировок за период.
 *   Сверху — главный показатель (`WorkoutsTotal`) по ВСЕМ типам.
 *   Тонкий разделитель.
 *   Ниже — список видов активности, которые БЫЛИ в периоде: прямоугольный бейдж
 *   (чёрная иконка на цветном фоне, единый вид с календарём) + название + число
 *   тренировок в цвет вида; у плавания/бега рядом — дистанция в скобках, тоже в
 *   цвет. Отсутствующие виды не выводим — список сам растёт под новые типы.
 *   Нет тренировок → мотивирующая заглушка.
 * `summary` — результат `summarizeWorkouts` (`{ count, minutes, byType }`).
 */

// Вид активности: иконка/цвет/название + какая метрика (счёт или дистанция).
// Название склоняется по числу (pluralizeCategoryCap): в строке «5 Силовых»
// число и слово читаются слитно, и несклоняемая подпись сразу режет глаз.
const TYPE_META = {
  strength: { icon: 'power', color: 'var(--cat-gym)', metric: 'count' },
  pool: { icon: 'swimming', color: 'var(--cat-pool)', metric: 'distance' },
  cardio: { icon: 'cardio', color: 'var(--cat-cardio)', metric: 'distance' },
  stretch: { icon: 'stretching', color: 'var(--cat-stretch)', metric: 'count' }
}

export default function HistoryStats({ summary, loading = false, periodLabel = '', emptyText = 'Заверши первую тренировку, чтобы увидеть статистику.' }) {
  // Первый заход без кеша — скелетон вместо мигания пустой заглушки.
  if (loading) {
    return (
      <div>
        <div style={styles.totals}>
          <span style={styles.skTotal} />
        </div>
        <div style={styles.divider} aria-hidden="true" />
        <div style={styles.list}>
          {[0, 1].map(i => <span key={i} style={styles.skRow} />)}
        </div>
      </div>
    )
  }

  if (!summary || summary.count === 0) {
    return <div style={styles.empty}>{emptyText}</div>
  }

  const types = CATEGORY_ORDER.filter(k => summary.byType?.[k]?.count > 0)

  return (
    <div>
      {/* Период — ОТДЕЛЬНЫМ уровнем над цифрами, по центру и тихо. Так цифры
          остаются просто метриками и не конкурируют с подписью, а «за какой
          отрезок» читается один раз сверху. */}
      {periodLabel && <div style={styles.periodLabel}>{periodLabel}</div>}

      {/* Главный показатель периода — тот же, что в карточке на главной. */}
      <div style={styles.totals}>
        <WorkoutsTotal count={summary.count} minutes={summary.minutes} iconSize={ICON} />
      </div>

      <div style={styles.divider} aria-hidden="true" />

      <div style={styles.list}>
        {types.map(k => {
          const m = TYPE_META[k]
          const b = summary.byType[k]
          const showDist = m.metric === 'distance' && b.distance > 0
          return (
            <div key={k} style={styles.row}>
              <SectionBadge iconName={m.icon} color={m.color} />
              <span style={{ ...styles.rowCount, color: m.color }}>{b.count}</span>
              <span style={styles.rowLabel}>{pluralizeCategoryCap(k, b.count)}</span>
              {showDist && (
                <span style={styles.rowDist}>
                  (<Distance meters={b.distance} color={m.color} inherit />)
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** «2,25 км»: число — в цвет вида активности, единица — серым. */
/**
 * Пара «число + единица» — ОДИН вид на весь проект: цифра акцентом (Geist 800,
 * title-размер), единица тише и мельче (Manrope 700, label-размер, серым).
 *
 * Раньше единица наследовала кегль родителя, и «км» в дистанции выходил заметно
 * крупнее «кг» в весе — рядом это читалось как разнобой.
 */
export function MetricValue({ num, unit, color = 'var(--color-primary)', inherit = false }) {
  // inherit — значение внутри уже размеченной строки (дистанция в скобках рядом
  // с числом вида): свой кегль там навязывать нельзя, иначе «2,25 км» выходит
  // крупнее соседней «8». Наследуем размер и вес от родителя, задаём только цвет.
  if (inherit) {
    return (
      <>
        <span style={{ color }}>{num}</span>
        {unit && <span> {unit}</span>}
      </>
    )
  }
  return (
    <>
      <span style={{ ...styles.totalValue, color }}>{num}</span>
      {unit && <span style={styles.totalUnit}> {unit}</span>}
    </>
  )
}

export function Distance({ meters, color, inherit = false }) {
  const text = formatMeters(meters)
  const i = text.lastIndexOf(' ')
  return (
    <MetricValue
      num={i > 0 ? text.slice(0, i) : text}
      unit={i > 0 ? text.slice(i + 1) : ''}
      color={color}
      inherit={inherit}
    />
  )
}

// Слово показателя пишем с большой буквы («50 Тренировок»), а склоняем общей
// утилитой — своих правил счёта тут не заводим.
const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1)

/**
 * Главный показатель статистики — ОДИН на все места, где она показана: карточка
 * на главной, экран Истории, модалка статистики в своём профиле и в профиле друга.
 *
 * Вид: залитый бежевый бицепс + число тренировок + слово белым (склоняется по
 * числу: «1 Тренировка» · «3 Тренировки» · «50 Тренировок»), и следом время в
 * скобках серым. Отдельной иконки часов больше нет: время — не
 * второй показатель наравне, а уточнение к тренировкам, поэтому оно и стоит в
 * скобках тихим серым сразу за словом.
 *
 * `flexWrap` — предохранитель для больших периодов («Всё»): длинная строка
 * («150 Тренировок (200 ч 00 мин)») в узкой карточке главной переносит скобки на
 * вторую строку, а не вылезает за край.
 */
export function WorkoutsTotal({ count, minutes, iconSize = ICON }) {
  return (
    <span style={styles.totalTop}>
      <MuscleIcon size={iconSize} filled />
      <span style={styles.totalValue}>{count}</span>
      <span style={styles.totalWord}>{capitalize(pluralizeWorkouts(count))}</span>
      <span style={styles.totalTime}>({formatStatTime(minutes)})</span>
    </span>
  )
}

const styles = {
  totals: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-6)' },
  // Подпись периода — отдельная строка над цифрами, по центру, тихим серым.
  periodLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', textAlign: 'center',
    marginBottom: 'var(--space-2)'
  },
  totalTop: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexWrap: 'wrap', gap: 'var(--space-1)', rowGap: 'var(--space-05)', minWidth: 0
  },
  // Слово «Тренировка/Тренировки/Тренировок» — белым: это подпись главного
  // показателя, а не единица измерения.
  totalWord: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text)', whiteSpace: 'nowrap'
  },
  // Время в скобках — целиком серое (и скобки, и цифры, и «ч»/«мин»): доп. инфа.
  totalTime: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  },
  // Цифра — акцентная зелёная (главное в показателе).
  totalValue: {
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)',
    letterSpacing: '0.2px', whiteSpace: 'nowrap', color: 'var(--color-primary)'
  },
  // Единица значения («ч») — серая и тоньше цифры.
  totalUnit: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', marginLeft: '-1px'
  },
  // Подпись метрики (secondary info) — серым, чтобы главной была цифра.
  divider: { height: '1px', background: 'var(--border-hairline)', margin: 'var(--space-4) 0' },

  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  row: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  // Число — в ЦВЕТ вида активности (силовая графитовая, плавание голубое…),
  // название — светло-серым, дистанция — тише всех.
  // Строка вида — на ступень тише тоталов: это разбивка, а не главный показатель.
  // Каждый следующий элемент мельче предыдущего (число → название → дистанция).
  rowCount: {
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-button-size)', letterSpacing: '0.2px'
  },
  rowLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--text-label)'
  },
  // Дистанция в скобках — тем же кеглем, что число слева: это второй показатель
  // той же строки, а не сноска. Тише только цветом.
  rowDist: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700,
    color: 'var(--text-info)', marginLeft: '-2px'
  },

  empty: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--space-1) 0', lineHeight: 1.4
  },
  // Скелетоны (первый заход без кеша).
  skTotal: { width: '180px', height: '34px', borderRadius: 'var(--radius-xs)', background: 'var(--highlight-recent)' },
  skRow: { height: '22px', borderRadius: 'var(--radius-xs)', background: 'var(--layer-1)' }
}
