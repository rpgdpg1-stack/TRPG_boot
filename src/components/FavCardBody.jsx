import { getProgramEmoji, getProgramTagColor, getProgramPlaces } from '../features/programs/registry'
import { getMuscleGroupColors } from '../features/programs/colors'
import { swimTotalMeters } from '../data/programs/swim'
import PlaceSwitcher from './PlaceSwitcher'
import ClockIcon from './ClockIcon'

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
export default function FavCardBody({ entry, accent = 'var(--color-primary)', activeMin = null, activeTimeColor = null, activeDone = 0, activeTotal = 0 }) {
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
            {activeMin ? (
              // Идёт тренировка: буква активного дня + время + N/M в ОДНУ строку,
              // по центру буквы. Время и N/M — одинаковым шрифтом (Manrope 800).
              <div style={styles.activeRow}>
                <span style={{
                  ...styles.dayLetter, ...styles.dayLetterActive,
                  color: dayColor(activeDay)
                }}>
                  {activeDay}
                </span>
                <span style={{ ...styles.activeStat, ...styles.activeTimeStat, color: activeTimeColor || 'var(--color-primary)' }}>
                  <ClockIcon size={13} />{activeMin}
                </span>
                <span style={{ ...styles.activeStat, color: 'var(--color-text-secondary)' }}>{activeDone}/{activeTotal}</span>
              </div>
            ) : (
              <div style={styles.daysRow}>
                <div style={styles.daysList}>
                  {allDays.map(d => {
                    const isToday = !!activeDay && d === activeDay
                    const dColor = dayColor(d)
                    return (
                      <span key={d} style={{
                        ...styles.dayLetter,
                        color: isToday ? dColor : 'rgba(255,255,255,0.35)'
                      }}>
                        {d}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
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
  // Активная строка: крупная буква дня + время + N/M в линию, по центру буквы.
  activeRow: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'nowrap' },
  activeStat: { fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: '15px', letterSpacing: '0.3px', lineHeight: 1, whiteSpace: 'nowrap' },
  activeTimeStat: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
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
