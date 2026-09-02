import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { toggleFavoriteProgram, getFavoriteProgramByCategory, getFavoriteProgramsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { getProgramsByCategory } from '../features/programs/registry'
import { pluralizePrograms } from '../utils/plural'
import ProgramCard from '../components/ProgramCard'
import UiIcon from '../components/UiIcon'
import ModalButton from '../components/ModalButton'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Экран категории — список программ внутри неё.
 *
 * Тап по карточке программы ведёт сразу на день тренировки
 * (через ProgramCard → /workout/{slug}/{day}).
 */

const CATEGORIES_META = {
  gym: {
    // Цвет раздела — токен силовой (холодный металл), НЕ зелёный акцент.
    color: 'var(--cat-gym)',
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
    { slug: 'running', title: 'Бег', tags: [], available: false, comingSoon: true }
  ],
  pool: [
    { slug: 'cardio-pool', title: 'Кардио план', tags: [], available: false, comingSoon: true }
  ],
  stretch: [
    { slug: 'yoga', title: 'Йога', tags: [], available: false, comingSoon: true }
  ]
}

// Заголовок раздела в навбаре — sentence case («Силовая»), а не капс из меты.
const toSentenceCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)

export default function Category() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Старт из уже прочитанных настроек аккаунта — закреплённая сразу наверху,
  // без промаргивания снизу→вверх. Читать напрямую localStorage тут больше
  // нельзя: закрепы переехали в аккаунт, старый ключ пуст, и экран каждый раз
  // строился без закрепа, а потом переставлял карточки на глазах.
  const [favoriteSlug, setFavoriteSlug] = useState(() => getFavoriteProgramsSync()[id] || null)
  const [showInfo, setShowInfo] = useState(false)
  const [, bump] = useState(0)
  // FLIP-анимация переезда карточки при закреплении: слепок позиций до реордера.
  const cardRefs = useRef(new Map())
  const flipPrev = useRef(null)

  const meta = CATEGORIES_META[id]

  const realPrograms = getProgramsByCategory(id)
  // Прокидываем category в плейсхолдеры (ключ = раздел) — чтобы эмблема взяла
  // цвет раздела (кардио — оранжевый, растяжка — розовый), а не дефолтный зелёный.
  const placeholderPrograms = realPrograms.length === 0
    ? (PLACEHOLDER_PROGRAMS[id] || []).map(p => ({ ...p, category: id }))
    : []
  const programs = [...realPrograms, ...placeholderPrograms]
  const hasCustom = realPrograms.some(p => p.source === 'custom')
  // Закреплённая программа — наверх списка (как на главной); остальные в прежнем порядке.
  const ordered = favoriteSlug
    ? [...programs].sort((a, b) => (a.slug === favoriteSlug ? -1 : b.slug === favoriteSlug ? 1 : 0))
    : programs

  // FLIP: после реордера (смена закрепа) плавно доезжаем карточки из старых позиций.
  useLayoutEffect(() => {
    const prev = flipPrev.current
    if (!prev) return
    flipPrev.current = null
    cardRefs.current.forEach((el, slug) => {
      if (!el) return
      const oldTop = prev.get(slug)
      if (oldTop == null) return
      const delta = oldTop - el.getBoundingClientRect().top
      if (!delta) return
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.34s var(--ease-ios)'
        el.style.transform = ''
      })
    })
  }, [favoriteSlug])

  useEffect(() => {
    backButton.setHandler(() => navigate('/'))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    getFavoriteProgramByCategory(id).then(slug => {
      if (!cancelled) setFavoriteSlug(slug)
    })
    // Настройки могли доехать из базы уже после первого кадра (первый заход
    // на устройстве) — тогда подхватываем их событием.
    const off = on(EVENTS.PREFS_CHANGED, () => {
      if (!cancelled) setFavoriteSlug(getFavoriteProgramsSync()[id] || null)
    })
    return () => { cancelled = true; off() }
  }, [id])

  const handleFavoriteTap = async (programSlug) => {
    haptic.medium()
    // Слепок позиций ДО реордера — для FLIP-анимации переезда наверх.
    const snap = new Map()
    cardRefs.current.forEach((el, slug) => { if (el) snap.set(slug, el.getBoundingClientRect().top) })
    flipPrev.current = snap
    const nowFav = await toggleFavoriteProgram(id, programSlug)
    setFavoriteSlug(nowFav ? programSlug : null)
  }

  // Конструктор пока умеет только силовую.
  const canCreate = id === 'gym'

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

  // Закреплённая отдельно от остальных — под своими заголовками. Реордер и
  // FLIP-анимация переезда работают как прежде: ref'ы привязаны к slug, а не
  // к позиции в списке.
  const pinnedList = ordered.filter(p => p.slug === favoriteSlug)
  const restList = ordered.filter(p => p.slug !== favoriteSlug)

  const renderCard = (prog) => (
    <div
      key={prog.slug}
      ref={el => { if (el) cardRefs.current.set(prog.slug, el); else cardRefs.current.delete(prog.slug) }}
    >
      <ProgramCard
        prog={prog}
        isFav={favoriteSlug === prog.slug}
        onToggleFav={() => handleFavoriteTap(prog.slug)}
        onDeleted={handleDeleted}
        menu
        cta
        bordered={false}
        background={favoriteSlug === prog.slug
          ? 'var(--surface-pinned)'
          : 'var(--color-card)'}
      />
    </div>
  )

  if (!meta) {
    return (
      <div className="page page-enter" style={styles.notFoundPage}>
        <div style={styles.notFoundText}>Категория не найдена</div>
      </div>
    )
  }

  return (
    <div className="page page-enter" style={styles.page}>

      <div style={styles.content}>
      <header style={styles.header}>
        <ScreenTitle>{toSentenceCase(meta.title)}</ScreenTitle>
        {/* Иконка раздела + инфо-кнопка + счётчик — на 16px ниже заголовка. */}
        <div style={styles.headerBody}>
          <button onClick={handleInfoTap} style={styles.infoButton} aria-label={`О разделе «${meta.title}»`}>
            <UiIcon name="info" size={22} color="var(--color-text-secondary)" />
          </button>
          <span style={styles.headerIcon}>
            <UiIcon name={meta.iconName} size={36} color={meta.color} />
          </span>
          {/* Счётчик — тем же строем, что «Друзей: 3» на вкладке друзей:
              подпись серым, число акцентом. */}
          <div style={styles.subtitle}>
            {realPrograms.length} {pluralizePrograms(realPrograms.length)}
          </div>
        </div>
      </header>

      {/* Заголовки появляются только когда есть что разделять: пока ничего не
          закреплено, это просто список — подписывать его нечем и незачем. */}
      {pinnedList.length > 0 ? (
        <>
          <SectionLabel>Закреплённая</SectionLabel>
          <div style={styles.programs}>{pinnedList.map(renderCard)}</div>
          {restList.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: 'var(--space-6)' }}>Все</SectionLabel>
              <div style={styles.programs}>{restList.map(renderCard)}</div>
            </>
          )}
        </>
      ) : (
        <div style={styles.programs}>{ordered.map(renderCard)}</div>
      )}

      {/* «Создать» работает только в силовой — конструктор пока умеет её одну.
          В остальных разделах кнопка приглушена и подписана «Скоро», как
          карточки-заглушки рядом: место под функцию видно, но она честно не
          обещает работать. */}
      {(id !== 'gym' || !hasCustom) && (
        <button
          onClick={canCreate ? handleCreateTap : undefined}
          disabled={!canCreate}
          style={{ ...styles.createButton, ...(canCreate ? null : styles.createSoon) }}
          className={canCreate ? 'press-tile' : undefined}
        >
          <span style={styles.createPlus}>＋</span> Создать
        </button>
      )}
      </div>

      {showInfo && <CategoryInfoModal meta={meta} onClose={() => setShowInfo(false)} />}
    </div>
  )
}

/**
 * Поповер «о разделе»: суть направления + что прокачивает.
 * Портал + тап по фону закрывает — как остальные модалки приложения.
 */
function CategoryInfoModal({ meta, onClose }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  return createPortal(
    <div ref={overlayRef} style={infoStyles.overlay} onClick={onClose}>
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

        <ModalButton onClick={onClose} style={{ marginTop: 'var(--space-5)' }}>ПОНЯТНО</ModalButton>
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
  // relative — база для абсолютного свечения (SectionGlow).
  page: { position: 'relative' },
  // Контент над свечением.
  content: { position: 'relative', zIndex: 1 },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 'var(--space-6)' },
  // Блок под заголовком (16px): иконка раздела, счётчик, инфо-кнопка (справа).
  headerBody: { position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' },
  infoButton: { position: 'absolute', top: 0, right: 0, width: '36px', height: '36px', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  headerIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-display-size)', letterSpacing: '1.5px', lineHeight: 1, color: 'var(--color-text)', textAlign: 'center' },
  // Подпись-счётчик под иконкой раздела. Разрядка снята: она была нужна капсу
  // («2 ПРОГРАММЫ»), а обычному тексту мешает.
  subtitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--color-text-secondary)', textAlign: 'center' },
  programs: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' },
  createButton: {
    width: '100%', minHeight: '56px', padding: 'var(--space-4)',
    // Пунктир вместо сплошной нитки: рамка «здесь можно добавить своё», а не
    // край готового блока — тот же язык, что у «Выбрать программу» на главной.
    border: '1px dashed var(--layer-3)',
    borderRadius: 'var(--radius-card)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700,
    background: 'var(--layer-1)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    cursor: 'pointer'
  },
  createSoon: { opacity: 0.45, cursor: 'default' },
  createPlus: { color: 'var(--color-primary)', fontSize: 'var(--text-title-size)', fontWeight: 700, lineHeight: 1 },
  notFoundPage: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontFamily: 'var(--font-manrope)', color: 'var(--color-text-secondary)' }
}

const infoStyles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    zIndex: 9999,
    padding: 'var(--tg-safe-top) var(--space-5) calc(var(--tabbar-height) + 40px)',
    overflowY: 'auto',
    animation: 'catInfoOverlay 0.2s ease-out forwards'
  },
  modal: {
    width: '100%', maxWidth: '340px', flexShrink: 0,
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-6) var(--space-5)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    animation: 'catInfoPanel 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: 'var(--shadow-modal)'
  },
  icon: { lineHeight: 1, marginBottom: 'var(--space-3)' },
  title: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-title-size)',
    color: 'var(--color-text)', letterSpacing: '2px', marginBottom: 'var(--space-2)'
  },
  essence: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', lineHeight: 1.5,
    color: 'var(--color-text)', textAlign: 'center', marginBottom: 'var(--space-4)'
  },
  bullets: { width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  bulletRow: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' },
  bulletDot: { flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%', marginTop: 'var(--space-15)' },
  bulletText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    lineHeight: 1.4, color: 'var(--color-text-secondary)'
  },
}

