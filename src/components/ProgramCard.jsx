import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { isPinned, togglePin, getActiveDay } from '../lib/storage'

/**
 * Карточка программы внутри категории.
 *
 * Визуально похожа на карточки категорий на главной: эмодзи слева,
 * текст справа. Внизу — пиксельная строка дней и тег зала/дома.
 *
 * Структура:
 *   [эмодзи] [Сплит]                    [♡]
 *            День: A B C
 *            Зал
 *
 * При тапе ведём на день тренировки. Если у юзера ещё нет завершений
 * (activeDay === null) — открываем день A по умолчанию, а в карточке
 * все буквы дней показываем серыми (как в категориях ещё ничего не выбрано).
 */

// Сопоставление слага программы и эмодзи. Когда добавим вторую программу,
// просто допишем сюда строчку — никакой логики менять не надо.
const PROGRAM_EMOJI = {
  split: '🏋️'
}

// Дефолт если в карте нет — карточка не должна ломаться даже для незнакомой программы
const DEFAULT_EMOJI = '💪'

export default function ProgramCard({ id, title, tags = [], available = true, comingSoon = false }) {
  const navigate = useNavigate()
  const [pinned, setPinned] = useState(false)
  const [activeDay, setActiveDay] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([isPinned(id), getActiveDay(id)]).then(([p, d]) => {
      if (!cancelled) {
        setPinned(p)
        setActiveDay(d)
      }
    })
    return () => { cancelled = true }
  }, [id])

  const handleCardTap = async () => {
    if (!available) return
    haptic.light()
    const day = activeDay || 'A'
    setTimeout(() => navigate(`/workout/${id}/${day}`), 80)
  }

  const handlePinTap = async (e) => {
    e.stopPropagation()
    haptic.medium()
    const newState = await togglePin(id)
    setPinned(newState)
  }

  // Жёстко зафиксированный список дней. Когда появятся программы с другим
  // набором (A/B без C) — будем читать из registry. Пока одна программа,
  // нет смысла усложнять.
  const allDays = ['A', 'B', 'C']
  const hasRecommendation = !!activeDay

  // "Сплит" → "Сплит" (первая заглавная, остальные строчные).
  // toLowerCase + первая буква в верхний регистр.
  const formattedTitle = title
    ? title.charAt(0).toUpperCase() + title.slice(1).toLowerCase()
    : ''

  const emoji = PROGRAM_EMOJI[id] || DEFAULT_EMOJI

  return (
    <div
      onClick={handleCardTap}
      className={available ? 'press-tile' : ''}
      style={{
        ...styles.card,
        opacity: available ? 1 : 0.55,
        cursor: available ? 'pointer' : 'default'
      }}
    >
      {/* Сердечко-закрепление в правом верхнем углу */}
      <button
        onClick={handlePinTap}
        style={styles.pinButton}
        aria-label={pinned ? 'Открепить' : 'Закрепить'}
      >
        <HeartIcon filled={pinned} />
      </button>

      {/* Эмодзи слева — отдельной колонкой по высоте всего блока, как на главной */}
      <span style={styles.emoji}>{emoji}</span>

      {/* Правая колонка: название → дни → тег */}
      <div style={styles.content}>
        <div style={styles.title}>{formattedTitle}</div>

        {available && (
          <div style={styles.daysRow}>
            <span style={styles.daysLabel}>День:</span>
            <div style={styles.daysList}>
              {allDays.map(d => {
                const isToday = hasRecommendation && d === activeDay
                return (
                  <span
                    key={d}
                    style={{
                      ...styles.dayLetter,
                      // Активная буква — зелёная и с лёгким свечением. Размер
                      // НЕ меняем — иначе строка прыгает при смене активного дня.
                      color: isToday ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.35)',
                      textShadow: isToday ? '0 0 6px rgba(158, 209, 83, 0.4)' : 'none'
                    }}
                  >
                    {d}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Теги: "Зал" → "Зал" (как title), цветная плашка */}
        {tags.length > 0 && (
          <div style={styles.tags}>
            {tags.map(tag => {
              const formattedTag = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
              return (
                <span key={tag} style={{ ...styles.tag, background: getTagColor(tag) }}>
                  {formattedTag}
                </span>
              )
            })}
            {comingSoon && <span style={styles.soonTag}>Скоро</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function HeartIcon({ filled }) {
  const color = filled ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.3)'

  if (filled) {
    return (
      <svg width="22" height="22" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
        <rect x="2" y="3" width="3" height="2" fill={color} />
        <rect x="11" y="3" width="3" height="2" fill={color} />
        <rect x="1" y="5" width="5" height="2" fill={color} />
        <rect x="10" y="5" width="5" height="2" fill={color} />
        <rect x="6" y="5" width="4" height="2" fill={color} />
        <rect x="1" y="7" width="14" height="2" fill={color} />
        <rect x="2" y="9" width="12" height="2" fill={color} />
        <rect x="3" y="11" width="10" height="1" fill={color} />
        <rect x="4" y="12" width="8" height="1" fill={color} />
        <rect x="5" y="13" width="6" height="1" fill={color} />
        <rect x="6" y="14" width="4" height="1" fill={color} />
        <rect x="7" y="15" width="2" height="1" fill={color} />
      </svg>
    )
  }

  return (
    <svg width="22" height="22" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <rect x="2" y="3" width="3" height="1" fill={color} />
      <rect x="11" y="3" width="3" height="1" fill={color} />
      <rect x="1" y="4" width="1" height="1" fill={color} />
      <rect x="5" y="4" width="1" height="1" fill={color} />
      <rect x="10" y="4" width="1" height="1" fill={color} />
      <rect x="14" y="4" width="1" height="1" fill={color} />
      <rect x="1" y="5" width="1" height="2" fill={color} />
      <rect x="14" y="5" width="1" height="2" fill={color} />
      <rect x="6" y="5" width="1" height="1" fill={color} />
      <rect x="9" y="5" width="1" height="1" fill={color} />
      <rect x="7" y="6" width="2" height="1" fill={color} />
      <rect x="1" y="7" width="1" height="1" fill={color} />
      <rect x="14" y="7" width="1" height="1" fill={color} />
      <rect x="2" y="8" width="1" height="1" fill={color} />
      <rect x="13" y="8" width="1" height="1" fill={color} />
      <rect x="3" y="9" width="1" height="1" fill={color} />
      <rect x="12" y="9" width="1" height="1" fill={color} />
      <rect x="3" y="10" width="1" height="1" fill={color} />
      <rect x="12" y="10" width="1" height="1" fill={color} />
      <rect x="4" y="11" width="1" height="1" fill={color} />
      <rect x="11" y="11" width="1" height="1" fill={color} />
      <rect x="5" y="12" width="1" height="1" fill={color} />
      <rect x="10" y="12" width="1" height="1" fill={color} />
      <rect x="6" y="13" width="1" height="1" fill={color} />
      <rect x="9" y="13" width="1" height="1" fill={color} />
      <rect x="7" y="14" width="2" height="1" fill={color} />
    </svg>
  )
}

function getTagColor(tag) {
  const t = tag.toLowerCase()
  if (t === 'зал') return 'var(--tag-gym)'
  if (t === 'дом') return 'var(--tag-home)'
  if (t === 'улица') return 'var(--tag-outdoor)'
  return 'var(--color-text-secondary)'
}

const styles = {
  // Корневая карточка — горизонтальный flex (эмодзи слева, контент справа),
  // как у категорий на главной странице. Высота не фиксируем — пусть
  // подстраивается под содержимое.
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
  // Эмодзи — крупный, как на категориях главной (там 34px). Ширина
  // фиксированная чтобы все карточки выровнялись по левому краю текста.
  emoji: {
    fontSize: '34px',
    lineHeight: 1,
    flexShrink: 0,
    width: '48px',
    textAlign: 'center'
  },
  // Правая колонка: название → дни → тег. Все элементы выровнены по левому краю.
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingRight: '36px' // место под сердечко справа, чтобы текст не залезал
  },
  pinButton: {
    position: 'absolute',
    top: '14px',
    right: '14px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    transition: 'transform 0.15s ease',
    zIndex: 2,
    padding: 0
  },
  // Название "Сплит" — Manrope, обычный регистр (заглавная только первая буква
  // делается в коде через formattedTitle). Размер на уровне категорий главной.
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    lineHeight: 1.1
  },
  // Строка "День: A B C" — пиксельный шрифт, чуть крупнее предыдущей версии.
  daysRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px'
  },
  daysLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.35)',
    letterSpacing: '1px'
  },
  daysList: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '14px'
  },
  // Размер букв — одинаковый для всех (активная отличается только цветом
  // и свечением). Так строка не прыгает при смене дня.
  dayLetter: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '17px',
    letterSpacing: '0',
    lineHeight: 1,
    transition: 'color 0.3s ease, text-shadow 0.3s ease'
  },
  // Теги "Зал" / "Дом" / "Улица" — на собственной строке снизу. Маленькая
  // цветная плашка. Текст обычный, не Tiny5, потому что пиксельный шрифт
  // на коротких словах в нижнем регистре выглядит грязно.
  tags: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  tag: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: '6px',
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
    borderRadius: '6px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.3px'
  }
}