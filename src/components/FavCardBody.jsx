import { getProgramEmoji, getProgramTagColor, getProgramPlaces } from '../features/programs/registry'
import { getMuscleGroupColors } from '../features/programs/colors'
import { swimTotalMeters } from '../data/programs/swim'
import PlaceSwitcher from './PlaceSwitcher'

/**
 * Тело карточки программы — общее для главной, избранного и раздела.
 *
 * Слева: эмодзи + контент (название → тег места → дни A/B/C, либо мин·метры для
 * заплыва). Иерархия ОДИНАКОВА в активном и неактивном состоянии — меняется лишь
 * буква активного дня (крупнее/жирнее). Правый блок (время/прогресс/«последняя»)
 * и заливку-прогресс рисует вызывающий (`ProgramCard`).
 *
 * `accent` — цвет раздела (фолбэк для буквы дня). `activeMin` — truthy, если идёт
 * тренировка по этой программе (тогда показываем ТОЛЬКО активный день, крупно).
 */
export default function FavCardBody({ entry, accent = 'var(--color-primary)', activeMin = null }) {
  const { prog, activeDay } = entry
  const available = prog.available !== false
  const allDays = prog.data?.days ? Object.keys(prog.data.days) : []
  // Свою программу показываем как ввёл юзер; встроенные нормализуем по регистру.
  const title = prog.title
    ? (prog.source === 'custom'
        ? prog.title
        : prog.title.charAt(0).toUpperCase() + prog.title.slice(1).toLowerCase())
    : ''
  const emoji = getProgramEmoji(prog.slug)
  const places = getProgramPlaces(prog)
  // Цвет буквы дня = акцент ПЕРВОЙ группы мышц этого дня (спина/грудь/ноги…).
  const dayColor = (d) => {
    const g = prog.data?.days?.[d]?.[0]?.muscle_group
    return (g && getMuscleGroupColors(g).accent) || accent
  }

  return (
    <>
      <span style={styles.emoji}>{emoji}</span>
      <div style={styles.content}>
        <div style={styles.title}>{title}</div>

        {/* Теги для НЕ-мест (заплыв / «Скоро»). */}
        {places.length === 0 && ((prog.tags && prog.tags.length > 0) || prog.comingSoon) && (
          <div style={styles.tags}>
            {(prog.tags || []).map(tag => {
              const ft = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
              return <span key={tag} style={{ ...styles.tag, background: getProgramTagColor(tag, prog.source) }}>{ft}</span>
            })}
            {prog.comingSoon && <span style={styles.soonTag}>Скоро</span>}
          </div>
        )}

        {available && (prog.kind === 'swim' ? (
          <div style={styles.daysRow}>
            <span style={styles.daysLabel}>
              {prog.data.durationMin} мин · {swimTotalMeters()} м
            </span>
          </div>
        ) : (
          // Иерархия: тег места (статичный, не тапается) → дни. Идёт тренировка —
          // показываем ТОЛЬКО активный день, крупнее и жирнее; иначе — ряд A/B/C с
          // подсветкой рекомендованного. Цвет подсвеченного дня — по его первой группе.
          <>
            {places.length > 0 && (
              <div style={styles.tags}>
                <PlaceSwitcher program={prog} tag />
                {prog.comingSoon && <span style={styles.soonTag}>Скоро</span>}
              </div>
            )}
            <div style={styles.daysRow}>
              <div style={styles.daysList}>
                {(activeMin ? [activeDay].filter(Boolean) : allDays).map(d => {
                  const isToday = !!activeDay && d === activeDay
                  const isActiveOne = !!activeMin && d === activeDay
                  const hl = isToday || isActiveOne
                  const dColor = dayColor(d)
                  return (
                    <span key={d} style={{
                      ...styles.dayLetter,
                      ...(isActiveOne ? styles.dayLetterActive : null),
                      color: hl ? dColor : 'rgba(255,255,255,0.35)',
                      textShadow: hl ? `0 0 6px color-mix(in srgb, ${dColor} 45%, transparent)` : 'none'
                    }}>
                      {d}
                    </span>
                  )
                })}
              </div>
            </div>
          </>
        ))}

        {prog.source === 'shared' && prog.authorName && (
          <div style={styles.authorLine}>от {prog.authorName}</div>
        )}
      </div>
    </>
  )
}

const styles = {
  // position/zIndex — контент ПОВЕРХ заливки-прогресса карточки (ProgramCard).
  emoji: { position: 'relative', zIndex: 1, fontSize: '34px', lineHeight: 1, flexShrink: 0, width: '48px', textAlign: 'center' },
  content: { position: 'relative', zIndex: 1, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    lineHeight: 1.1
  },
  daysRow: { display: 'flex', alignItems: 'baseline', gap: '10px' },
  daysLabel: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px' },
  daysList: { display: 'flex', alignItems: 'baseline', gap: '14px' },
  dayLetter: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px', lineHeight: 1, transition: 'color 0.3s ease' },
  // Активный (запущенный) день — крупнее и жирнее (свечение оставляем).
  dayLetterActive: { fontSize: '22px', fontWeight: 800 },
  tags: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  tag: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: '6px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-bg)'
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
