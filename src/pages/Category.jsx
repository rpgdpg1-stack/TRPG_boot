import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes, confirm } from '../lib/telegram'
import { toggleFavoriteProgram, getFavoriteProgramByCategory, getActiveDay } from '../lib/storage'
import { getProgramsByCategory, getProgramEmoji, getProgramTagColor } from '../features/programs/registry'
import { deleteMyProgram, shareProgramLink } from '../features/programs/customProgram'
import ProgramActionMenu from '../components/ProgramActionMenu'
import { swimTotalMeters } from '../data/programs/swim'
import PixelHeart from '../components/PixelHeart'
import UiIcon from '../components/UiIcon'

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
    iconName: 'power',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  cardio: {
    title: 'КАРДИО',
    subtitle: 'СКОРО',
    color: 'var(--cat-cardio)',
    iconName: 'cardio',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  pool: {
    title: 'ПЛАВАНИЕ',
    subtitle: 'ВЫБЕРИ ПРОГРАММУ',
    color: 'var(--cat-pool)',
    iconName: 'swimming',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ'
  },
  stretch: {
    title: 'РАСТЯЖКА',
    subtitle: 'СКОРО',
    color: 'var(--cat-stretch)',
    iconName: 'stretching',
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
  const [favoriteSlug, setFavoriteSlug] = useState(null)
  const [, bump] = useState(0)

  const meta = CATEGORIES_META[id]

  const realPrograms = getProgramsByCategory(id)
  const placeholderPrograms = realPrograms.length === 0 ? (PLACEHOLDER_PROGRAMS[id] || []) : []
  const programs = [...realPrograms, ...placeholderPrograms]
  const hasCustom = realPrograms.some(p => p.source === 'custom')

  useEffect(() => {
    backButton.setHandler(() => navigate('/'))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    getFavoriteProgramByCategory(id).then(slug => {
      if (!cancelled) setFavoriteSlug(slug)
    })
    return () => { cancelled = true }
  }, [id])

  const handleFavoriteTap = async (programSlug) => {
    haptic.medium()
    const nowFav = await toggleFavoriteProgram(id, programSlug)
    setFavoriteSlug(nowFav ? programSlug : null)
  }

  const handleCreateTap = () => {
    haptic.light()
    if (id === 'gym') navigate('/constructor')
  }

  const handleDeleted = () => bump(n => n + 1)

  if (!meta) {
    return (
      <div className="page page-enter" style={styles.notFoundPage}>
        <div style={styles.notFoundText}>Категория не найдена</div>
      </div>
    )
  }

  return (
    <div className="page page-enter" style={styles.page}>

      <header style={styles.header}>
        <span style={styles.headerIcon}>
          <UiIcon name={meta.iconName} size={30} color={meta.color} />
        </span>
        <div style={styles.headerText}>
          <h1 style={styles.title}>{meta.title}</h1>
          <div style={styles.subtitle}>{meta.subtitle}</div>
        </div>
      </header>

      <div style={styles.programs}>
        {programs.map(prog => (
          <ProgramCardWithFav
            key={prog.slug}
            prog={prog}
            isFav={favoriteSlug === prog.slug}
            onFavTap={() => handleFavoriteTap(prog.slug)}
            onDeleted={handleDeleted}
          />
        ))}
      </div>

      {(id !== 'gym' || !hasCustom) && (
        <button onClick={handleCreateTap} style={styles.createButton}>
          {meta.createLabel}
        </button>
      )}
    </div>
  )
}

const styles = {
  page: {},
  header: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', marginTop: '8px' },
  headerIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1, width: '40px' },
  headerText: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '26px', letterSpacing: '1.5px', lineHeight: 1, color: 'var(--color-text)' },
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

function ProgramCardWithFav({ prog, isFav, onFavTap, onDeleted }) {
  const navigate = useNavigate()
  const [activeDay, setActiveDay] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const lpTimer = useRef(null)
  const lpFired = useRef(false)
  const lpStart = useRef({ x: 0, y: 0 })

  const handleEdit = () => {
    haptic.light()
    navigate('/constructor')
  }

  const handleDelete = async () => {
    const ok = await confirm('Удалить эту программу?')
    if (!ok) return
    haptic.medium()
    const success = await deleteMyProgram(prog.dbId)
    if (success && onDeleted) onDeleted()
  }

  const handleShare = async () => {
    haptic.light()
    await shareProgramLink(prog.dbId)
  }

  const handleLongPressDown = (e) => {
    if (!prog.source || menuOpen) return
    lpFired.current = false
    lpStart.current = { x: e.clientX, y: e.clientY }
    if (lpTimer.current) clearTimeout(lpTimer.current)
    lpTimer.current = setTimeout(() => {
      lpFired.current = true
      haptic.medium()
      setMenuOpen(true)
    }, 450)
  }
  const handleLongPressMove = (e) => {
    if (!lpTimer.current) return
    const dx = Math.abs(e.clientX - lpStart.current.x)
    const dy = Math.abs(e.clientY - lpStart.current.y)
    if (dx > 10 || dy > 10) { clearTimeout(lpTimer.current); lpTimer.current = null }
  }
  const handleLongPressUp = () => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
  }

  useEffect(() => {
    if (!prog.available) return
    let cancelled = false
    getActiveDay(prog.slug).then(d => {
      if (!cancelled) setActiveDay(d)
    })
    return () => { cancelled = true }
  }, [prog.slug, prog.available])

  const handleCardTap = () => {
    if (lpFired.current) { lpFired.current = false; return }
    if (menuOpen) return
    if (!prog.available) return
    haptic.light()
    if (prog.kind === 'swim') {
      setTimeout(() => navigate(`/swim/${prog.slug}`), 80)
      return
    }
    const firstDay = prog.data?.days ? Object.keys(prog.data.days)[0] : 'A'
    const day = activeDay || firstDay
    setTimeout(() => navigate(`/workout/${prog.slug}/${day}`), 80)
  }

  const allDays = prog.data?.days ? Object.keys(prog.data.days) : []
  // Свою программу показываем ровно как ввёл юзер (его регистр, эмодзи).
  // Встроенные — нормализуем: Первая заглавная, остальные строчные.
  const formattedTitle = prog.title
    ? (prog.source === 'custom'
        ? prog.title
        : prog.title.charAt(0).toUpperCase() + prog.title.slice(1).toLowerCase())
    : ''
  const emoji = getProgramEmoji(prog.slug)

  return (
    <div
      onClick={handleCardTap}
      onPointerDown={handleLongPressDown}
      onPointerMove={handleLongPressMove}
      onPointerUp={handleLongPressUp}
      onPointerLeave={handleLongPressUp}
      onPointerCancel={handleLongPressUp}
      className={prog.available ? 'press-tile' : ''}
      style={{
        ...cardStyles.card,
        opacity: prog.available ? 1 : 0.55,
        cursor: prog.available ? 'pointer' : 'default'
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); if (prog.available) onFavTap() }}
        style={{ ...cardStyles.favButton, opacity: prog.available ? 1 : 0.4 }}
        aria-label={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
      >
        <PixelHeart filled={isFav} size={22} />
      </button>

      <span style={cardStyles.emoji}>{emoji}</span>

      <div style={cardStyles.content}>
        <div style={cardStyles.cardTitle}>{formattedTitle}</div>

        {prog.available && prog.kind === 'swim' && (
          <div style={cardStyles.daysRow}>
            <span style={cardStyles.daysLabel}>
              {prog.data.durationMin} мин · {swimTotalMeters()} м
            </span>
          </div>
        )}
        {prog.available && prog.kind !== 'swim' && (
          <div style={cardStyles.daysRow}>
            <span style={cardStyles.daysLabel}>День:</span>
            <div style={cardStyles.daysList}>
              {allDays.map(d => {
                const isToday = !!activeDay && d === activeDay
                return (
                  <span key={d} style={{
                    ...cardStyles.dayLetter,
                    color: isToday ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.35)',
                    textShadow: isToday ? '0 0 6px rgba(158, 209, 83, 0.4)' : 'none'
                  }}>
                    {d}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {prog.tags && prog.tags.length > 0 && (
          <div style={cardStyles.tags}>
            {prog.tags.map(tag => {
              const ft = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
              return (
                <span key={tag} style={{ ...cardStyles.tag, background: getProgramTagColor(tag, prog.source) }}>
                  {ft}
                </span>
              )
            })}
            {prog.comingSoon && <span style={cardStyles.soonTag}>Скоро</span>}
          </div>
        )}

        {prog.source === 'shared' && prog.authorName && (
          <div style={cardStyles.authorLine}>от {prog.authorName}</div>
        )}
      </div>

      {menuOpen && (
        <ProgramActionMenu
          editable={prog.editable}
          onEdit={() => { setMenuOpen(false); handleEdit() }}
          onShare={() => { setMenuOpen(false); handleShare() }}
          onDelete={() => { setMenuOpen(false); handleDelete() }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  )
}




const cardStyles = {
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 18px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '100px',
    textAlign: 'left'
  },
  favButton: {
    position: 'absolute',
    top: '14px',
    right: '14px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    transition: 'transform 0.15s ease',
    zIndex: 2,
    padding: 0
  },
  emoji: {
    fontSize: '34px',
    lineHeight: 1,
    flexShrink: 0,
    width: '48px',
    textAlign: 'center'
  },
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingRight: '36px'
  },
  cardTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    lineHeight: 1.1
  },
  daysRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px'
  },
  daysLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.35)',
    letterSpacing: '1px'
  },
  daysList: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '14px'
  },
  dayLetter: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '17px',
    lineHeight: 1,
    transition: 'color 0.3s ease, text-shadow 0.3s ease'
  },
  tags: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  tag: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-bg)',
    letterSpacing: '0.3px'
  },
  soonTag: {
    display: 'inline-block',
    padding: '3px 9px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.3px'
  },
  authorLine: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)'
  }
}