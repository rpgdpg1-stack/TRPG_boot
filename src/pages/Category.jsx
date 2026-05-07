import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic } from '../lib/telegram'
import { getPinnedPrograms } from '../lib/storage'
import ProgramCard from '../components/ProgramCard'

/**
 * Универсальный экран категории. Контент берётся из CATEGORIES_DATA по id из URL.
 * Здесь живут программы конкретной категории (Силовая, Бассейн, Растяжка).
 */

const CATEGORIES_DATA = {
  gym: {
    title: 'СИЛОВАЯ',
    subtitle: 'ВЫБЕРИ ПРОГРАММУ',
    programs: [
      {
        id: 'split',
        title: 'Сплит',
        tags: ['зал'],
        available: true,
        comingSoon: false
      }
      // Тут позже появятся: Фулбоди, ПушПуллЛегс и т.д.
    ]
  },
  pool: {
    title: 'БАССЕЙН',
    subtitle: 'СКОРО',
    programs: [
      { id: 'cardio-pool', title: 'Кардио план', tags: [], available: false, comingSoon: true }
    ]
  },
  stretch: {
    title: 'РАСТЯЖКА',
    subtitle: 'СКОРО',
    programs: [
      { id: 'yoga', title: 'Йога', tags: [], available: false, comingSoon: true },
      { id: 'pilates', title: 'Пилатес', tags: [], available: false, comingSoon: true }
    ]
  }
}

export default function Category() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pinnedIds, setPinnedIds] = useState([])

  const data = CATEGORIES_DATA[id]

  // Управление кнопкой Назад в Телеге
  useEffect(() => {
    backButton.show(() => navigate('/'))
    return () => backButton.hide()
  }, [navigate])

  // Подгружаем закрепы для сортировки
  useEffect(() => {
    getPinnedPrograms().then(setPinnedIds)
  }, [])

  const handleCreateTap = () => {
    haptic.light()
    // Заглушка — создание своей тренировки добавим позже
  }

  // Если категория не найдена — fallback
  if (!data) {
    return (
      <div className="page page-enter" style={styles.notFoundPage}>
        <div style={styles.notFoundText}>Категория не найдена</div>
      </div>
    )
  }

  // Сортировка: закреплённые наверх
  const sortedPrograms = [...data.programs].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id)
    const bPinned = pinnedIds.includes(b.id)
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return 0
  })

  return (
    <div className="page page-enter" style={styles.page}>

      {/* Шапка категории */}
      <header style={styles.header}>
        <h1 style={styles.title}>{data.title}</h1>
        <div style={styles.subtitle}>{data.subtitle}</div>
      </header>

      {/* Список программ */}
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

      {/* Создать свою тренировку */}
      <button onClick={handleCreateTap} style={styles.createButton}>
        + СОЗДАТЬ СВОЮ ТРЕНИРОВКУ
      </button>
    </div>
  )
}

const styles = {
  page: {
    padding: '16px 16px 24px'
  },
  header: {
    marginBottom: '24px',
    marginTop: '8px',
    textAlign: 'center'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '36px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1,
    marginBottom: '8px'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  },
  programs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px'
  },
  createButton: {
    width: '100%',
    padding: '20px',
    border: '1.5px dashed rgba(255, 255, 255, 0.15)',
    borderRadius: 'var(--radius-card)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    background: 'transparent'
  },
  notFoundPage: {
    minHeight: '70vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notFoundText: {
    fontFamily: 'var(--font-manrope)',
    color: 'var(--color-text-secondary)'
  }
}
