import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getRecords, getRecordsSync } from '../lib/records'
import ScreenTitle from '../components/ScreenTitle'
import PersonalRecords, { hasRecords } from '../components/PersonalRecords'
import EmptyState from '../components/EmptyState'

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
        <EmptyState
          icon="trophy"
          title="Рекордов пока нет"
          hint="Заверши тренировку с рабочим весом или заплыв — лучший результат появится здесь."
        />
      )}
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-4) var(--space-4) var(--space-2)'
  }
}
