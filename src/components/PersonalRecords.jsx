import { getMuscleGroupColors } from '../features/programs/colors'
import { exerciseTagLabel } from '../features/programs/labels'
import { getProgramBySlug } from '../features/programs/registry'
import { MONTHS_RU } from '../utils/history'
import { pluralizeWorkouts } from '../utils/plural'
import UiIcon from './UiIcon'
import ExercisePlaceholder from './ExercisePlaceholder'
import { Distance, MetricValue } from './HistoryStats'

/**
 * **Рекорды** — по одному лучшему достижению на вид активности. ОДИН блок на
 * три места: экран `/history`, модалка «Рекорды» в своём профиле и та же
 * модалка в профиле друга. Раздел раньше назывался «Лучшие результаты».
 *
 * Порядок: лучший месяц (он про всё сразу) → силовая → плавание. Метрики
 * описаны для ВСЕХ видов сразу (RECORD_META), а рисуются только те, по которым
 * уже есть данные. Появится первая завершённая пробежка или растяжка — её
 * строка встанет сюда сама, правок здесь не потребуется.
 *
 * У силовой есть конкретное упражнение, поэтому под метрикой идёт строка с его
 * миниатюрой и названием (как в списке любимых). У остальных видов упражнения
 * нет — значение стоит прямо в строке метрики.
 *
 * Значение — золотое: это рекорд, а не текущее число. Цвет вида остаётся на
 * бейдже, чтобы два акцента не спорили.
 *
 * `records` — `{ best_month: {month, count, minutes}, strength: {...}, swim: {...} }`
 * из `api_get_personal_records` (свои) или из профиля друга — формат ОДИН,
 * считает их один и тот же `srv_user_records`.
 * `bare` — внутри модалки: без карточки и без своей шапки (они уже есть у модалки).
 */
export const RECORD_GOLD = '#FFC83D'

/**
 * Месяц называем рекордом, только если он и правда выделяется. Когда всё
 * началось месяц назад, «лучший месяц — август, 1 тренировка» звучит насмешкой.
 * Тот же порог держат сводки бота.
 */
const BEST_MONTH_MIN = 2

/**
 * Подпись метрики — полная фраза с двоеточием.
 *
 * Бейджа вида и отдельного названия («Силовая», «Плавание») здесь нет: вид
 * назван в самой подписи, а иконка с заголовком дублировали её и делали блок
 * пёстрым. Осталось одно тихое пояснение и под ним сам результат.
 */
const RECORD_META = {
  month: { metric: 'Больше всего тренировок за месяц:' },
  strength: { metric: 'Самый большой рабочий вес в силовой тренировке:' },
  swim: { metric: 'Самая длинная дистанция в плавании:' },
  // Появятся вместе со своими программами — метрики уже зафиксированы.
  cardio: { metric: 'Самая длинная дистанция в беге:' },
  stretch: { metric: 'Самая длинная тренировка в растяжке:' }
}

const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '')

/** «2026-06-01» → «Июнь 2026». Дату разбираем строкой: часовой пояс тут ни при чём. */
function monthLabel(iso) {
  if (!iso) return ''
  const [y, m] = String(iso).split('-')
  const idx = Number(m) - 1
  return MONTHS_RU[idx] ? `${MONTHS_RU[idx]} ${y}` : ''
}

/** Есть ли что показывать — чтобы место вызова не рисовало пустой блок. */
export function hasRecords(records) {
  if (!records) return false
  return !!(records.strength || records.swim || (records.best_month?.count >= BEST_MONTH_MIN))
}

export default function PersonalRecords({ records, bare = false }) {
  const strength = records?.strength || null
  const swim = records?.swim || null
  const month = records?.best_month?.count >= BEST_MONTH_MIN ? records.best_month : null
  if (!strength && !swim && !month) return null

  // Тег принадлежности — тот же формат, что на карточках упражнений.
  const strengthTag = strength ? exerciseTagLabel(strength.muscle_group, strength.sub_group) : ''
  const kg = strength ? Number(strength.weight_kg) : 0
  const kgText = kg % 1 === 0 ? String(kg) : kg.toFixed(1).replace('.', ',')
  // Название программы заплыва — из реестра, тем же регистром, что на карточках.
  const swimProgram = getProgramBySlug('swim')
  const swimTitle = swimProgram ? cap(swimProgram.title) : 'Заплыв'

  // Разделитель — у каждого блока, кроме первого: какой из них первый, зависит
  // от того, что у человека вообще есть.
  let shown = 0
  const next = () => shown++ > 0

  return (
    <div style={bare ? styles.recGroupBare : styles.recGroup}>
      {/* Шапка блока как у карточек главной: иконка сверху, заголовок под ней.
          Кубок золотой — тем же цветом, что и сами рекорды ниже, поэтому блок
          читается одним смысловым куском. В модалке шапка своя, и эта не нужна. */}
      {!bare && (
        <div style={styles.recHeadWrap}>
          <span style={styles.recHeadIcon}><UiIcon name="trophy" size={22} color={RECORD_GOLD} /></span>
          <div style={styles.recHead}>Рекорды</div>
        </div>
      )}

      {/* Лучший месяц — первым: он про тренировки вообще, а не про один вид. */}
      {month && (
        <RecordBlock
          kind="month"
          divider={next()}
          title={monthLabel(month.month)}
          value={<MetricValue num={month.count} unit={pluralizeWorkouts(month.count)} color={RECORD_GOLD} />}
        />
      )}

      {strength && (
        <RecordBlock kind="strength" divider={next()}>
          <div style={styles.recItem}>
            <span style={styles.recThumb}>
              {strength.preview_url
                ? <img src={strength.preview_url} alt="" style={styles.recThumbImg} draggable={false} />
                : <ExercisePlaceholder size={20} />}
            </span>
            <span style={styles.recItemCol}>
              <span style={styles.recItemName}>{cap(strength.name)}</span>
              {strengthTag && (
                <span style={{ ...styles.recItemTag, background: getMuscleGroupColors(strength.muscle_group).tag }}>
                  {strengthTag}
                </span>
              )}
            </span>
            <span style={styles.recValue}>
              <MetricValue num={kgText} unit="кг" color={RECORD_GOLD} />
            </span>
          </div>
        </RecordBlock>
      )}

      {swim && (
        <RecordBlock
          kind="swim"
          divider={next()}
          title={swimTitle}
          value={<Distance meters={swim.distance_m} color={RECORD_GOLD} />}
        />
      )}
    </div>
  )
}

/**
 * Одна запись: подпись метрики, под ней результат.
 * `value` — значение прямо в строке (виды без упражнения);
 * `children` — строка результата под метрикой (силовая с миниатюрой).
 */
function RecordBlock({ kind, divider = false, title = null, value = null, children = null }) {
  const m = RECORD_META[kind]
  return (
    <div style={{ ...styles.recBlock, ...(divider ? styles.recDivider : null) }}>
      <div style={styles.recMetric}>{m.metric}</div>
      {/* Виды без упражнения (лучший месяц, плавание, бег) — название слева,
          результат справа: та же раскладка, что у силовой строкой ниже. */}
      {(title || value) && (
        <div style={styles.recPlainRow}>
          <span style={styles.recItemName}>{title}</span>
          {value && <span style={styles.recValue}>{value}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

const styles = {
  // Рекорды — блок-карточка со строками по видам активности.
  recGroup: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-4) var(--space-4) var(--space-2)'
  },
  // В модалке карточки нет: фон и отступы даёт сама панель.
  recGroupBare: { display: 'flex', flexDirection: 'column', width: '100%' },
  recHeadWrap: { display: 'flex', flexDirection: 'column', gap: 'var(--space-15)', marginBottom: 'var(--space-2)' },
  recHeadIcon: { display: 'inline-flex', height: '22px' },
  recHead: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700,
    color: 'var(--color-text)', letterSpacing: '0.2px'
  },
  recBlock: { display: 'flex', flexDirection: 'column', gap: 'var(--space-15)', padding: 'var(--space-3) 0' },
  recDivider: { borderTop: '1px solid var(--border-hairline)', marginTop: 'var(--space-1)', paddingTop: 'var(--space-4)' },
  // Строка результата без миниатюры (лучший месяц, плавание, бег): название
  // слева, значение справа — ровно как у силовой, только вместо картинки
  // упражнения название месяца или программы.
  recPlainRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--space-3)', marginTop: 'var(--space-05)'
  },
  recMetric: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)'
  },
  // Строка результата с миниатюрой — как в списке любимых упражнений.
  recItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-05)' },
  recThumb: {
    flexShrink: 0, width: '32px', height: '32px', borderRadius: 'var(--radius-small)', overflow: 'hidden',
    background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  recThumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  // Название и тег — колонкой: тег встаёт второй строкой под названием.
  recItemCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' },
  recItemTag: {
    padding: 'var(--space-05) var(--space-2)', borderRadius: 'var(--radius-pill)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 700,
    opacity: 0.7, whiteSpace: 'nowrap'
  },
  recItemName: {
    // maxWidth обязателен: колонка с названием выровнена по левому краю
    // (alignItems: flex-start), поэтому ширина строки считается по содержимому
    // и длинное название лезло на значение справа — в узкой модалке «Тяга
    // верхнего блока нейтральным хватом» наезжала на «105 кг».
    flex: 1, minWidth: 0, maxWidth: '100%',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 600,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  recValue: { flexShrink: 0, fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: 'var(--text-body-size)', whiteSpace: 'nowrap' }
}
