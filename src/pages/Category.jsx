import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { toggleFavoriteProgram, getFavoriteProgramByCategory } from '../lib/storage'
import { getProgramsByCategory, programCountLabel } from '../features/programs/registry'
import ProgramCard from '../components/ProgramCard'
import UiIcon from '../components/UiIcon'
import ModalButton from '../components/ModalButton'
import ScreenTitle from '../components/ScreenTitle'

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

// Заголовок раздела в навбаре — sentence case («Силовая»), а не капс из меты.
const toSentenceCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)

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
    // Конструктор откроется push'ем и вернётся назад (navigate(-1)) сюда же.
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
        <ScreenTitle>{toSentenceCase(meta.title)}</ScreenTitle>
        {/* Иконка раздела + инфо-кнопка + счётчик — на 16px ниже заголовка. */}
        <div style={styles.headerBody}>
          <button onClick={handleInfoTap} style={styles.infoButton} aria-label={`О разделе «${meta.title}»`}>
            <UiIcon name="info" size={22} color="var(--color-text-secondary)" />
          </button>
          <span style={styles.headerIcon}>
            <UiIcon name={meta.iconName} size={40} color={meta.color} />
          </span>
          <div style={styles.subtitle}>
            {realPrograms.length > 0 ? programCountLabel(id) : meta.subtitle}
          </div>
        </div>
      </header>

      <div style={styles.programs}>
        {programs.map(prog => (
          <ProgramCard
            key={prog.slug}
            prog={prog}
            isFav={favoriteSlug === prog.slug}
            onToggleFav={() => handleFavoriteTap(prog.slug)}
            onDeleted={handleDeleted}
            dots
            bordered={false}
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

        <ModalButton onClick={onClose} style={{ marginTop: '20px' }}>ПОНЯТНО</ModalButton>
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
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' },
  // Блок под заголовком (16px): иконка раздела, счётчик, инфо-кнопка (справа).
  headerBody: { position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' },
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
    padding: 'var(--tg-safe-top) 20px calc(var(--tabbar-height) + 40px)',
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
}

