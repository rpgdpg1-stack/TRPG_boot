import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { summarizeWorkouts, periodShortLabel, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getFavoritesSync, getFavoriteExercises, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { EVENTS, on } from '../lib/events'
import { WorkoutsTotal } from './HistoryStats'
import HeartIcon from './HeartIcon'
import TrendingUpIcon from './TrendingUpIcon'

/**
 * Две карточки-входа на главной: **Статистика** (тренировки за ТЕКУЩИЙ МЕСЯЦ,
 * время к ним в скобках) и **Любимые**.
 *
 * Период на главной НЕ выбирается — здесь всегда текущий месяц, подписанный
 * его названием («Сентябрь»). Главная отвечает на один вопрос: «сколько я
 * сделал в этом месяце», и выбор периода на ней был лишним решением. Разбор
 * по неделям/годам живёт на `/history`, куда ведёт тап по карточке.
 */
export default function HomeCards() {
  const navigate = useNavigate()

  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [favCount, setFavCount] = useState(() => (getFavoritesSync() || []).length)
  useEffect(() => {
    let alive = true
    const load = () => {
      getRecentWorkouts(HISTORY_FETCH_LIMIT).then(d => { if (alive) setWorkouts(d || []) })
      getFavoriteExercises().then(l => { if (alive) setFavCount((l || []).length) })
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
      <Card
        icon={<span style={styles.icon}><HeartIcon filled size={22} color="var(--color-primary)" /></span>}
        // Идеальный квадрат: ширина следует за высотой (aspect-ratio), а не
        // задана числом — высота карточек может измениться, квадрат останется.
        square
        title="Любимые"
        // Своя строка на том же уровне, что «Август» у статистики: без неё
        // карточки разъезжались по высоте и сердечко уезжало вниз. Число
        // здесь не пишем — лимит виден ниже, в самой цифре («3 упр»).
        periodLabel="Топ"
        periodRow={<span />}
        value={<Value num={Math.min(favCount, FAVORITE_LIMIT)} unit="упр" />}
        onClick={() => go('/favorite-exercises')}
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
          <span style={styles.title}>{title}</span>
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
        <span style={styles.valueRow}>
          <span style={styles.valueMain}>{value}</span>
        </span>
      </div>
    </div>
  )
}


// Значение карточки: крупная зелёная цифра + тихая единица измерения.
function Value({ num, unit }) {
  return (
    <>
      <span style={styles.valueNum}>{num}</span>
      <span style={styles.valueUnit}>{unit}</span>
    </>
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
  // Строка значения: слева значение, справа подпись-контекст.
  valueRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-15)', minHeight: '20px', width: '100%' },
  valueMain: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-15)', minWidth: 0 },
  valueNum: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)', fontWeight: 800, lineHeight: 1, color: 'var(--color-primary)' },
  valueUnit: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500, color: 'var(--color-text-secondary)' },
  // Строка периода: подпись слева, селектор справа.
  periodRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', width: '100%' },
  // Подпись периода — тем же тихим серым, что иконки.
  periodMark: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  }
}
