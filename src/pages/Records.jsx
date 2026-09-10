import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getRecords, getRecordsSync } from '../lib/records'
import ScreenTitle from '../components/ScreenTitle'
import PersonalRecords, { hasRecords, RECORD_META } from '../components/PersonalRecords'

/**
 * Личные рекорды — отдельный экран, вход из профиля.
 *
 * Раньше блок жил внизу статистики, но это две разные вещи: статистика отвечает
 * «как я тренировался» (сколько раз, сколько времени, по каким дням), рекорды —
 * «чего я достиг» (максимальный рабочий вес, лучший заплыв, лучший месяц).
 * Смешивать их в одном экране значило заставлять пролистывать всю аналитику
 * ради одной строки.
 *
 * Тот же компонент `PersonalRecords` показывается в модалке профиля друга — там
 * рекорды остаются модалкой, потому что человек смотрит на другого мимоходом и
 * не должен ради этого уходить из списка друзей.
 */
// Что считается рекордом. Кардио и растяжку не перечисляем: их программ ещё
// нет, и обещать раздел, которого не существует, — врать.
const EMPTY_KINDS = ['month', 'strength', 'swim']

export default function Records() {
  const navigate = useNavigate()
  // Старт из кеша (мгновенно), сервер догоняет.
  const [records, setRecords] = useState(() => getRecordsSync())

  useEffect(() => { getRecords().then(setRecords) }, [])

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  // Пока рекордов нет, `PersonalRecords` не рисует ничего — пустая полка ничего
  // не сообщает. На отдельном экране так нельзя: человек пришёл сюда сам и
  // должен понять, почему тут пусто и что сделать. Условие берём из того же
  // компонента (`hasRecords`), чтобы «есть рекорды» считалось одинаково и
  // здесь, и на плитке в профиле.
  const hasAny = hasRecords(records)

  return (
    <div className="page page-fade">
      <ScreenTitle>Рекорды</ScreenTitle>

      {hasAny ? (
        // `bare` — без своей шапки: заголовок «Рекорды» уже стоит наверху экрана,
        // и второй такой же внутри блока читался бы как ошибка вёрстки. Карточку
        // даём здесь — тем же видом, что блок статистики на соседнем экране.
        <div style={styles.card}>
          <PersonalRecords records={records} bare />
        </div>
      ) : (
        // Пусто — но не пустым экраном: показываем, ЧТО именно здесь считается.
        // Так человек понимает, что нужно сделать, и что раздел не сломан.
        // Прочерк вместо значения — тот же приём, что у веса «0» в дне: место
        // под цифру видно, самой цифры пока нет.
        <div style={styles.card}>
          <div style={styles.emptyTitle}>Рекордов пока нет</div>
          <div style={styles.emptyHint}>
            Заверши тренировку с рабочим весом или заплыв — лучший результат появится здесь.
          </div>
          <div style={styles.emptyList}>
            {EMPTY_KINDS.map((kind, i) => (
              <div key={kind} style={{ ...styles.emptyRow, ...(i > 0 ? styles.emptyRowDivider : null) }}>
                <span style={styles.emptyMetric}>{RECORD_META[kind].metric}</span>
                <span style={styles.emptyDash}>—</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  // Обводки нет — тот же вид, что у блока статистики на соседнем экране.
  card: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-4) var(--space-4) var(--space-2)'
  },
  emptyTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700,
    color: 'var(--color-text)', marginBottom: 'var(--space-15)'
  },
  emptyHint: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', lineHeight: 1.45
  },
  emptyList: { display: 'flex', flexDirection: 'column', marginTop: 'var(--space-4)' },
  emptyRow: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 'var(--space-3)', padding: 'var(--space-3) 0'
  },
  emptyRowDivider: { borderTop: '1px solid var(--border-hairline)' },
  emptyMetric: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', lineHeight: 1.35
  },
  // Прочерк вместо значения — Manrope, как все числа проекта.
  emptyDash: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)', fontWeight: 800,
    color: 'var(--color-text-inactive)', lineHeight: 1
  }
}
