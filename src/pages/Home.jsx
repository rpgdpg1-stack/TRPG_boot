import { useEffect, useRef, useState } from 'react'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { EVENTS, on } from '../lib/events'
import { getCurrentUser } from '../lib/auth'
import { resolveWeeklyStreak } from '../utils/dates'
import { pluralizeWorkouts } from '../utils/plural'
import SectionCarousel from '../components/SectionCarousel'
import ScreenTitle from '../components/ScreenTitle'
import HomeCards from '../components/HomeCards'
import StreakFlame from '../components/StreakFlame'
import StreakInfoPopup from '../components/StreakInfoPopup'

// Тонкая инфо-плашка под заголовком: недельный стрик. Лёгкий фон, без тени —
// строка-информер, не карточка.
const capitalize = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)

function WeekStrip() {
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  const [info, setInfo] = useState(false)
  const stripRef = useRef(null)
  const openInfo = () => { haptic.light(); setInfo(v => !v) }
  useEffect(() => {
    const upd = () => {
      const u = getCurrentUser()
      setStreak(resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week))
    }
    const off = on(EVENTS.USER_CHANGED, upd)
    const off2 = on(EVENTS.USER_READY, upd)
    return () => { off(); off2() }
  }, [])

  // Порядок читается как фраза: огонёк → число → «Тренировок на этой неделе».
  // Ноль — та же строка, только огонёк серый и цифра приглушена.
  const hasStreak = streak >= 1

  // Строка целиком — кнопка-пояснение. Именно здесь человек впервые видит
  // огонёк и цифру, и именно здесь чаще всего непонятно, что они значат;
  // тапать он будет по всей фразе, а не прицельно в значок.
  return (
    <div style={stripStyles.wrap} ref={stripRef}>
      <button style={stripStyles.strip} onClick={openInfo} aria-label="Что такое серия за неделю">
        {/* Огонёк и число — одной группой, вплотную (счётчик принадлежит огоньку). */}
        <span style={stripStyles.flameGroup}>
          <span style={hasStreak ? undefined : stripStyles.greyFlame}>
            <StreakFlame streak={streak} />
          </span>
          <span style={{ ...stripStyles.count, ...(hasStreak ? null : stripStyles.countZero) }}>
            {streak}
          </span>
        </span>
        <span style={stripStyles.label}>{capitalize(pluralizeWorkouts(streak))} на этой неделе</span>
      </button>

      <StreakInfoPopup
        streak={streak}
        open={info}
        onClose={() => setInfo(false)}
        align="center"
        anchorRef={stripRef}
      />
    </div>
  )
}

const stripStyles = {
  // Обёртка держит поп-ап: он absolute относительно неё.
  wrap: { position: 'relative', marginBottom: 'var(--space-6)' },
  // Строка-информер, без фона и рамки: это подпись под заголовком, а не блок
  // наравне с карточками ниже.
  strip: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    minHeight: '32px', width: '100%',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
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
