import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes, confirm } from '../lib/telegram'
import { toggleFavoriteProgram, getFavoriteProgramByCategory, getActiveDay } from '../lib/storage'
import { getProgramsByCategory, getProgramEmoji, getProgramTagColor, getProgramPlaces, programCountLabel } from '../features/programs/registry'
import PlaceSwitcher from '../components/PlaceSwitcher'
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
    subtitle: 'СКОРО',
    color: 'var(--color-primary)',
    iconName: 'power',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ',
    info: {
      essence: 'Тренировки с отягощением: мышцы работают против сопротивления.',
      bullets: [
        'Растят силу и мышечную массу',
        'Разгоняют обмен веществ — жжёшь калории даже в покое',
        'Укрепляют кости, суставы и осанку'
      ]
    }
  },
  cardio: {
    title: 'КАРДИО',
    subtitle: 'СКОРО',
    color: 'var(--cat-cardio)',
    iconName: 'cardio',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ',
    info: {
      essence: 'Аэробная нагрузка (бег, HIIT) — держит пульс высоким.',
      bullets: [
        'Прокачивает выносливость и здоровье сердца',
        'Эффективно сжигает калории',
        'Даёт энергию и снимает стресс'
      ]
    }
  },
  pool: {
    title: 'ПЛАВАНИЕ',
    subtitle: 'СКОРО',
    color: 'var(--cat-pool)',
    iconName: 'swimming',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ',
    info: {
      essence: 'Нагрузка в воде — всё тело работает без удара по суставам.',
      bullets: [
        'Тренирует выносливость и силу разом',
        'Бережёт суставы и спину, почти без риска травм',
        'Развивает дыхание и расслабляет'
      ]
    }
  },
  stretch: {
    title: 'РАСТЯЖКА',
    subtitle: 'СКОРО',
    color: 'var(--cat-stretch)',
    iconName: 'stretching',
    createLabel: '+ СОЗДАТЬ СВОЮ ПРОГРАММУ',
    info: {
      essence: 'Работа над гибкостью и подвижностью: йога, пилатес.',
      bullets: [
        'Возвращает подвижность суставам',
        'Убирает зажимы и боль в спине',
        'Ускоряет восстановление и расслабляет'
      ]
    }
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
  const [showInfo, setShowInfo] = useState(false)
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

  const handleInfoTap = () => {
    haptic.light()
    setShowInfo(true)
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
        <button onClick={handleInfoTap} style={styles.infoButton} aria-label={`О разделе «${meta.title}»`}>
          <UiIcon name="info" size={22} color="var(--color-text-secondary)" />
        </button>
        <span style={styles.headerIcon}>
          <UiIcon name={meta.iconName} size={40} color={meta.color} />
        </span>
        <h1 style={styles.title}>{meta.title}</h1>
        <div style={styles.subtitle}>
          {realPrograms.length > 0 ? programCountLabel(id) : meta.subtitle}
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

      {showInfo && <CategoryInfoModal meta={meta} onClose={() => setShowInfo(false)} />}
    </div>
  )
}

/**
 * Поповер «о разделе»: суть направления + что прокачивает.
 * Стиль и поведение — как RulesModal в рейтинге (портал, тап по фону закрывает).
 */
function CategoryInfoModal({ meta, onClose }) {
  return createPortal(
    <div style={infoStyles.overlay} onClick={onClose}>
      <div style={infoStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={infoStyles.icon}>
          <UiIcon name={meta.iconName} size={40} color={meta.color} />
        </div>
        <div style={infoStyles.title}>{meta.title}</div>
        <div style={infoStyles.essence}>{meta.info.essence}</div>

        <div style={infoStyles.bullets}>
          {meta.info.bullets.map((b, i) => (
            <div key={i} style={infoStyles.bulletRow}>
              <span style={{ ...infoStyles.bulletDot, background: meta.color }} />
              <span style={infoStyles.bulletText}>{b}</span>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={infoStyles.closeButton}>ПОНЯТНО</button>
      </div>

      <style>{`
        @keyframes catInfoOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes catInfoPanel {
          0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}

const styles = {
  page: {},
  header: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '24px', marginTop: '8px' },
  infoButton: { position: 'absolute', top: 0, right: 0, width: '36px', height: '36px', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  headerIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '26px', letterSpacing: '1.5px', lineHeight: 1, color: 'var(--color-text)', textAlign: 'center' },
  subtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '2px', textAlign: 'center' },
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

const infoStyles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    zIndex: 9999,
    padding: 'calc(var(--tg-safe-top) - 10px) 20px calc(var(--tabbar-height) + 40px)',
    overflowY: 'auto',
    animation: 'catInfoOverlay 0.2s ease-out forwards'
  },
  modal: {
    width: '100%', maxWidth: '340px', flexShrink: 0,
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: '24px 22px 18px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    animation: 'catInfoPanel 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  icon: { lineHeight: 1, marginBottom: '10px' },
  title: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px',
    color: 'var(--color-text)', letterSpacing: '2px', marginBottom: '8px'
  },
  essence: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', lineHeight: 1.5,
    color: 'var(--color-text)', textAlign: 'center', marginBottom: '16px'
  },
  bullets: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' },
  bulletRow: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  bulletDot: { flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%', marginTop: '6px' },
  bulletText: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    lineHeight: 1.4, color: 'var(--color-text-secondary)'
  },
  closeButton: {
    width: '100%', marginTop: '20px', padding: '16px',
    background: 'var(--color-primary)', color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700, letterSpacing: '1px',
    borderRadius: 'var(--radius-medium)', border: 'none'
  }
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

        {/* Места (Зал/Дом/Улица) — переключаемый тег; для программ без мест
            (заплыв) — обычные теги как раньше. */}
        {getProgramPlaces(prog).length > 0 ? (
          <div style={cardStyles.tags}>
            <PlaceSwitcher program={prog} />
            {prog.comingSoon && <span style={cardStyles.soonTag}>Скоро</span>}
          </div>
        ) : prog.tags && prog.tags.length > 0 ? (
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
        ) : null}

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