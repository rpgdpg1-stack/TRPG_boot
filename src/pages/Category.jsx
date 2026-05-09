import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getPinnedPrograms } from '../lib/storage'
import ProgramCard from '../components/ProgramCard'

/**
 * Универсальный экран категории.
 *
 * Г8.2:
 * - Кнопка назад настраивается через setHandler (без скрытия — нет мерцания)
 * - Возврат на конкретный путь '/' а не navigate(-1)
 * - Повторно блокируем свайп вниз
 */

const CATEGORIES_DATA = {
  gym: {
    title: 'СИЛОВАЯ',
    subtitle: 'ВЫБЕРИ ПРОГРАММУ',
    color: 'var(--cat-strength)',
    programs: [
      { id: 'split', title: 'Сплит', tags: ['зал'], available: true, comingSoon: false }
    ],
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  cardio: {
    title: 'КАРДИО',
    subtitle: 'СКОРО',
    color: 'var(--cat-cardio)',
    programs: [
      { id: 'running', title: 'Бег', tags: [], available: false, comingSoon: true },
      { id: 'hiit',    title: 'HIIT', tags: [], available: false, comingSoon: true }
    ],
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  pool: {
    title: 'БАССЕЙН',
    subtitle: 'СКОРО',
    color: 'var(--cat-pool)',
    programs: [
      { id: 'cardio-pool', title: 'Кардио план', tags: [], available: false, comingSoon: true }
    ],
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  stretch: {
    title: 'РАСТЯЖКА',
    subtitle: 'СКОРО',
    color: 'var(--cat-stretch)',
    programs: [
      { id: 'yoga',    title: 'Йога',    tags: [], available: false, comingSoon: true },
      { id: 'pilates', title: 'Пилатес', tags: [], available: false, comingSoon: true }
    ],
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  recovery: {
    title: 'ВОССТАНОВЛЕНИЕ',
    subtitle: 'СКОРО',
    color: 'var(--cat-recovery)',
    programs: [
      { id: 'sleep',  title: 'Сон',           tags: [], available: false, comingSoon: true },
      { id: 'breath', title: 'Дыхание',       tags: [], available: false, comingSoon: true }
    ],
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  }
}

export default function Category() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pinnedIds, setPinnedIds] = useState([])

  const data = CATEGORIES_DATA[id]

  useEffect(() => {
    // Перенастраиваем кнопку назад без скрытия — это убирает мерцание крестика
    backButton.setHandler(() => navigate('/'))
    // На всякий случай повторно блокируем свайп вниз
    lockVerticalSwipes()
    // НЕ вызываем backButton.hide() в cleanup — следующий экран сам перенастроит
  }, [navigate])

  useEffect(() => {
    getPinnedPrograms().then(setPinnedIds)
  }, [])

  // На главной странице кнопку назад надо скрыть. Это делаем при размонтировании.
  // Но: если переходим на Program (он сам поставит свою кнопку) — лишний hide ничего не сломает,
  // потому что Program в useEffect сразу вызовет setHandler.
  // А вот если возвращаемся на Home (через тап по back) — Home кнопку не настраивает, и она исчезнет естественным путём.
  // Чтобы это сработало корректно, скрываем при размонтировании ТОЛЬКО если идём на главную.
  useEffect(() => {
    return () => {
      // Проверяем — мы возвращаемся на главную или идём вглубь?
      // Простая эвристика: если pathname сменился на '/' — скрываем.
      // Но в момент cleanup pathname уже мог поменяться, поэтому делаем через таймер.
      setTimeout(() => {
        if (window.location.pathname === '/') {
          backButton.hide()
        }
      }, 50)
    }
  }, [])

  const handleCreateTap = () => {
    haptic.light()
  }

  if (!data) {
    return (
      <div className="page page-enter" style={styles.notFoundPage}>
        <div style={styles.notFoundText}>Категория не найдена</div>
      </div>
    )
  }

  const sortedPrograms = [...data.programs].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id)
    const bPinned = pinnedIds.includes(b.id)
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return 0
  })

  return (
    <div className="page page-enter" style={styles.page}>

      <header style={styles.header}>
        <h1 style={{ ...styles.title, color: data.color }}>{data.title}</h1>
        <div style={styles.subtitle}>{data.subtitle}</div>
      </header>

      <div style={styles.programs}>
        {sortedPrograms.map(prog => (
          <ProgramCard
            key={prog.id}
            id={prog.id}
            title={prog.title}
            tags={prog.tags}
            available={prog.available}
            comingSoon={prog.comingSoon}
          />
        ))}
      </div>

      <button onClick={handleCreateTap} style={styles.createButton}>
        {data.createLabel}
      </button>
    </div>
  )
}

const styles = {
  page: {},
  header: { marginBottom: '24px', marginTop: '8px', textAlign: 'center' },
  title: { fontFamily: 'var(--font-tiny5)', fontSize: '36px', letterSpacing: '3px', lineHeight: 1, marginBottom: '8px' },
  subtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '2px' },
  programs: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  createButton: {
    width: '100%', padding: '20px',
    border: '1.5px dashed rgba(255, 255, 255, 0.15)',
    borderRadius: 'var(--radius-card)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600, letterSpacing: '1.5px',
    background: 'transparent'
  },
  notFoundPage: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontFamily: 'var(--font-manrope)', color: 'var(--color-text-secondary)' }
}
