import { useEffect, useState } from 'react'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { EVENTS, on } from '../lib/events'
import { getCurrentUser } from '../lib/auth'
import { resolveWeeklyStreak } from '../utils/dates'
import SectionCarousel from '../components/SectionCarousel'
import ScreenTitle from '../components/ScreenTitle'
import HomeCards from '../components/HomeCards'
import StreakFlame from '../components/StreakFlame'

// Тонкая инфо-плашка под заголовком: недельный стрик. Лёгкий фон, без тени —
// строка-информер, не карточка.
function pluralTraining(n) {
  const d = n % 10, dd = n % 100
  if (d === 1 && dd !== 11) return 'тренировка'
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return 'тренировки'
  return 'тренировок'
}

function WeekStrip() {
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  useEffect(() => {
    const upd = () => {
      const u = getCurrentUser()
      setStreak(resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week))
    }
    const off = on(EVENTS.USER_CHANGED, upd)
    const off2 = on(EVENTS.USER_READY, upd)
    return () => { off(); off2() }
  }, [])

  // Формат один на все состояния: «На этой неделе 🔥 3 тренировки».
  // Ноль — та же строка с серым огоньком и «0 тренировок».
  const hasStreak = streak >= 1
  return (
    <div style={stripStyles.strip}>
      <span style={stripStyles.label}>На этой неделе</span>
      {/* Огонёк и ×N — одной группой, вплотную (счётчик принадлежит огоньку). */}
      <span style={stripStyles.flameGroup}>
        <span style={hasStreak ? undefined : stripStyles.greyFlame}>
          <StreakFlame streak={streak} />
        </span>
        <span style={{ ...stripStyles.count, ...(hasStreak ? null : stripStyles.countZero) }}>
          {streak}
        </span>
      </span>
      <span style={stripStyles.label}>{pluralTraining(streak)}</span>
    </div>
  )
}

const stripStyles = {
  // Карточка-информер: тот же фон и скругление, что у карточек статистики ниже,
  // и та же высота — три блока экрана читаются одним семейством. Содержимое по
  // центру, воздух вокруг даёт сама высота.
  strip: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    minHeight: '110px', padding: 'var(--space-4)', marginBottom: 'var(--space-6)',
    background: 'var(--surface)', borderRadius: 'var(--radius-card)'
  },
  label: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--color-text-secondary)' },
  // Огонёк + цифра — вплотную (3px), как единый значок серии. Тот же вид в профиле.
  // Крестика «×» нет — только цифра.
  flameGroup: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' },
  count: { fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)', color: 'var(--color-streak)', letterSpacing: '0.5px' },
  // 0 — серым (как негорящий огонёк), ≥1 — оранжевым.
  countZero: { color: 'rgba(255, 255, 255, 0.4)' },
  greyFlame: { display: 'inline-flex', opacity: 0.6, filter: 'grayscale(1)' }
}

/**
 * Главная — Тренировки.
 *
 * Максимально тихий экран под сценарий «открыл → начал тренировку»:
 * заголовок → карусель разделов с закреплённой программой (Начать/Продолжить) →
 * компактная карточка-кнопка «Статистика» (вся аналитика — на /history).
 */
export default function Home() {
  // Pull-to-refresh здесь НЕ нужен: свои тренировки меняет только сам пользователь
  // и только внутри приложения — кеш инвалидируется по событию завершения. Жест
  // переехал на «Друзей», где данные приходят извне. Заодно перестал бороться
  // с горизонтальным листанием карусели разделов.
  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Заголовок экрана (fixed на линии кнопок Telegram). */}
      <div style={styles.topBlock}>
        <ScreenTitle>Тренировки</ScreenTitle>
      </div>

      {/* Скроллящийся контент: инфо-плашка недели + карусель разделов + карточки. */}
      <div style={styles.scrollSection}>
        <WeekStrip />

        {/* Карусель разделов: свайп по разделам, внутри — закреплённая программа
            (Начать/Продолжить) + Все программы / Создать. Заголовка секции нет. */}
        <SectionCarousel />

        {/* Второй план: карточки-входы. Заголовка-обёртки нет — карточки
            подписаны сами, а заголовок только ел первый экран. */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <HomeCards />
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    // relative — база для абсолютного индикатора/слоёв.
    position: 'relative',
    paddingTop: 0,
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)',
    paddingBottom: 'var(--space-6)'
  },
  // Заголовок экрана — в потоке. Верхний отступ = зона под кнопками Telegram.
  topBlock: {
    position: 'relative',
    zIndex: 1,
    paddingTop: 'var(--tg-safe-top)'
  },
  scrollSection: {
    position: 'relative',
    zIndex: 1
  }
}
