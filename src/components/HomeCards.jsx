import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { summarizeWorkouts, periodShortLabel, HISTORY_FETCH_LIMIT } from '../utils/history'
import { EVENTS, on } from '../lib/events'
import { WorkoutsTotal } from './HistoryStats'
import ProgramsIcon from './ProgramsIcon'
import TrendingUpIcon from './TrendingUpIcon'

/**
 * Две карточки-входа под каруселью: **Все программы** (квадрат-кнопка в каталог)
 * и **Статистика** (тренировки за ТЕКУЩИЙ МЕСЯЦ, время к ним в скобках).
 *
 * Каталог слева квадратом — это вход, у него нет показателя, и растягивать его
 * не на что. Статистика справа шире: в ней два числа.
 *
 * Вход в каталог был текстовой ссылкой «Все программы ›» под каруселью. Ссылка
 * и карточка-вход рядом были бы двумя видами одного действия, поэтому ссылки
 * больше нет — осталась кнопка.
 *
 * Период на главной НЕ выбирается — здесь всегда текущий месяц, подписанный
 * его названием («Сентябрь»). Главная отвечает на один вопрос: «сколько я
 * сделал в этом месяце», и выбор периода на ней был лишним решением. Разбор
 * по неделям/годам живёт на `/history`, куда ведёт тап по карточке.
 */
export default function HomeCards() {
  const navigate = useNavigate()

  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  useEffect(() => {
    let alive = true
    const load = () => {
      getRecentWorkouts(HISTORY_FETCH_LIMIT).then(d => { if (alive) setWorkouts(d || []) })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { alive = false; off() }
  }, [])

  // Всегда текущий месяц — на главной период не выбирают.
  const now = new Date()
  const sum = summarizeWorkouts(workouts, 'month', now)

  const go = (path) => { haptic.light(); navigate(path, { state: { from: '/' } }) }

  return (
    <div style={styles.row}>
      {/* Все программы — квадрат-кнопка в каталог. Показателя у входа нет:
          число программ ничего не говорит о том, что человек будет делать. */}
      <Card
        icon={<span style={styles.icon}><ProgramsIcon size={22} color="var(--color-primary)" /></span>}
        // Идеальный квадрат: ширина следует за высотой (aspect-ratio), а не
        // задана числом — высота карточек может измениться, квадрат останется.
        square
        // Название переносится и читается целиком. Разбивать его на «Все» +
        // серую строку «программы» пробовали — вторая половина вставала на
        // место периода и читалась подписью, а не частью названия.
        title="Все программы"
        onClick={() => go('/programs')}
      />
      {/* Статистика — шире (два показателя: тренировки и время за месяц). */}
      <Card
        flex="1 1 auto"
        icon={<span style={styles.icon}><TrendingUpIcon size={22} color="var(--color-primary)" /></span>}
        title="Статистика"
        periodLabel={periodShortLabel('month', now)}
        periodRow={<span />}
        value={<WorkoutsTotal count={sum.count} minutes={sum.minutes} iconSize={18} />}
        onClick={() => go('/history')}
      />
    </div>
  )
}

// Карточка — div, а не button: внутри строки заголовка живёт настоящая кнопка
// селектора, а вкладывать button в button нельзя (невалидная разметка, и клики
// конфликтуют). Роль и tabIndex сохраняют доступность.
function Card({ icon, title, periodRow, periodLabel, value, flex = '1 1 auto', square = false, onClick, innerRef }) {
  return (
    <div
      ref={innerRef}
      role="button"
      tabIndex={0}
      style={{ ...styles.card, flex: square ? '0 0 auto' : flex, ...(square ? styles.cardSquare : null) }}
      className="press-tile"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
    >
      <span style={styles.icon}>{icon}</span>
      <div style={styles.textCol}>
        <span style={styles.titleRow}>
          <span style={{ ...styles.title, ...(square ? styles.titleWrap : null) }}>{title}</span>
        </span>
        {/* Отдельная строка периода МЕЖДУ заголовком и цифрами: какой отрезок
            показан («Сентябрь», «Топ»). Так цифры ниже — просто метрики,
            а «за что они» читается на своём уровне. */}
        {periodRow && (
          <span style={styles.periodRow}>
            <span style={styles.periodMark}>{periodLabel}</span>
            {periodRow}
          </span>
        )}
        {value && (
          <span style={styles.valueRow}>
            <span style={styles.valueMain}>{value}</span>
          </span>
        )}
      </div>
    </div>
  )
}


const styles = {
  // Зазор между карточками — тот же межгрупповой шаг (24), что вертикальный
  // отступ от блока раздела выше: одинаковый воздух по обеим осям.
  row: { display: 'flex', gap: 'var(--space-6)', alignItems: 'stretch' },
  card: {
    // 110 — фактическая высота карточки с её содержимым. Задаём явно, потому
    // что от этого значения квадратная карточка берёт ширину (aspect-ratio
    // считает от minHeight, а не от растянутой высоты соседа).
    minWidth: 0, minHeight: '110px',
    // Зазор от иконки до текста — ЯВНЫЙ, а не остаток от space-between.
    // При space-between он зависел от высоты содержимого: у статистики строка
    // показателей переносится на две строки и упирается в низ, а у «Любимых»
    // она в одну — и сердечко отъезжало от заголовка на два десятка пикселей.
    // Теперь обе карточки строятся одинаково и читаются как один ритм.
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 'var(--space-2)',
    padding: 'var(--space-3)', textAlign: 'left',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', cursor: 'pointer'
  },
  // Квадратная карточка: ширина = высоте. Выравнивание и паддинги — как у
  // соседней карточки, чтобы содержимое стояло на одной левой линии.
  cardSquare: { aspectRatio: '1 / 1' },
  icon: { display: 'inline-flex', height: '22px' },
  textCol: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)', width: '100%' },
  title: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // В квадрате название длиннее его ширины — переносим вместо многоточия:
  // «Все прогр…» не подпись, а обрубок.
  titleWrap: { whiteSpace: 'normal', overflow: 'visible', lineHeight: 1.25 },
  // Строка значения: слева значение, справа подпись-контекст.
  valueRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-15)', minHeight: '20px', width: '100%' },
  valueMain: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-15)', minWidth: 0 },
  // Строка периода: подпись слева, селектор справа.
  periodRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', width: '100%' },
  // Подпись периода — тем же тихим серым, что иконки.
  periodMark: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  }
}
