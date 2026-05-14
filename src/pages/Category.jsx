import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getPinnedPrograms } from '../lib/storage'
import { getProgramsByCategory } from '../features/programs/registry'
import ProgramCard from '../components/ProgramCard'

/**
 * Экран категории — список программ внутри неё.
 *
 * Тап по карточке программы ведёт сразу на день тренировки
 * (через ProgramCard → /workout/{slug}/{day}).
 */

const CATEGORIES_META = {
  gym: {
    title: 'СИЛОВАЯ',
    subtitle: 'ВЫБЕРИ ПРОГРАММУ',
    color: 'var(--color-primary)',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  cardio: {
    title: 'КАРДИО',
    subtitle: 'СКОРО',
    color: 'var(--cat-cardio)',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  pool: {
    title: 'ПЛАВАНИЕ',
    subtitle: 'СКОРО',
    color: 'var(--cat-pool)',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  stretch: {
    title: 'РАСТЯЖКА',
    subtitle: 'СКОРО',
    color: 'var(--cat-stretch)',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  }
}

const PLACEHOLDER_PROGRAMS = {
  cardio: [
    { slug: 'running', title: 'Бег', tags: [], available: false, comingSoon: true },
    { slug: 'hiit',    title: 'HIIT', tags: [], available: false, comingSoon: true }
  ],
  pool: [
    { slug: 'cardio-pool', title: 'Кардио план', tags: [], available: false, comingSoon: true }
  ],
  stretch: [
    { slug: 'yoga',    title: 'Йога',    tags: [], available: false, comingSoon: true },
    { slug: 'pilates', title: 'Пилатес', tags: [], available: false, comingSoon: true }
  ]
}

export default function Category() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pinnedIds, setPinnedIds] = useState([])

  const meta = CATEGORIES_META[id]

  const realPrograms = getProgramsByCategory(id)
  const placeholderPrograms = realPrograms.length === 0 ? (PLACEHOLDER_PROGRAMS[id] || []) : []
  const programs = [...realPrograms, ...placeholderPrograms]

  useEffect(() => {
    backButton.setHandler(() => navigate('/'))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    getPinnedPrograms().then(setPinnedIds)
  }, [])

  const handleCreateTap = () => {
    haptic.light()
  }

  if (!meta) {
    return (
      <div className="page page-enter" style={styles.notFoundPage}>
        <div style={styles.notFoundText}>Категория не найдена</div>
      </div>
    )
  }

  const sortedPrograms = [...programs].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.slug)
    const bPinned = pinnedIds.includes(b.slug)
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return 0
  })

  return (
    <div className="page page-enter" style={styles.page}>

      <header style={styles.header}>
        <h1 style={{ ...styles.title, color: meta.color }}>{meta.title}</h1>
        <div style={styles.subtitle}>{meta.subtitle}</div>
      </header>

      <div style={styles.programs}>
        {sortedPrograms.map(prog => (
          <ProgramCard
            key={prog.slug}
            id={prog.slug}
            title={prog.title}
            tags={prog.tags}
            available={prog.available}
            comingSoon={prog.comingSoon}
          />
        ))}
      </div>

      <button onClick={handleCreateTap} style={styles.createButton}>
        {meta.createLabel}
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