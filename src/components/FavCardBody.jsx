import { getProgramPlaces } from '../features/programs/registry'
import { getMuscleGroupColors } from '../features/programs/colors'
import { swimTotalMeters } from '../data/programs/swim'
import ClockIcon from './ClockIcon'
import ProgramEmblem from './ProgramEmblem'
import PencilIcon from './PencilIcon'

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
  const places = getProgramPlaces(prog)
  // Цвет буквы дня = акцент ПЕРВОЙ группы мышц этого дня (спина/грудь/ноги…).
  const dayColor = (d) => {
    const g = prog.data?.days?.[d]?.[0]?.muscle_group
    return (g && getMuscleGroupColors(g).accent) || accent
  }

  return (
    <>
      <span style={styles.emblemWrap}><ProgramEmblem program={prog} size={44} /></span>
      <div style={styles.content}>
        <div style={styles.title}>
          {title}
          {/* Серый карандаш рядом с названием — индикатор «созданная мной программа». */}
          {prog.source === 'custom' && (
            <span style={styles.titlePencil}><PencilIcon size={13} color="var(--color-text-secondary)" /></span>
          )}
        </div>

        {/* Теги места/бассейна на карточке убраны — выбор живёт внутри программы.
            Заплыв (kind==='swim') тег «Бассейн» тоже не показывает. Остаётся «Скоро». */}
        {places.length === 0 && prog.kind !== 'swim' && prog.comingSoon && (
          <div style={styles.tags}>
            <span style={styles.soonTag}>Скоро</span>
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
            {/* Тег места (Зал/Дом/Улица) на карточке убран — выбор места живёт внутри
                тренировки (перед «Начать»). На карточке остаётся только «Скоро». */}
            {places.length > 0 && prog.comingSoon && (
              <div style={styles.tags}>
                <span style={styles.soonTag}>Скоро</span>
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
                    // Рекомендованный день — в акцентном цвете группы; остальные —
                    // СЕРЫМ (как счётчик), чтобы не пестрило множеством цветов.
                    return (
                      <span key={d} style={{
                        ...styles.dayLetter,
                        color: isToday ? dayColor(d) : 'var(--color-text-secondary)'
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
  emblemWrap: { position: 'relative', zIndex: 1, flexShrink: 0, width: '48px', display: 'flex', justifyContent: 'center' },
  content: { position: 'relative', zIndex: 1, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    lineHeight: 1.1
  },
  // Карандаш-индикатор сразу после названия (по центру строки текста).
  titlePencil: { display: 'inline-flex', verticalAlign: 'middle', marginLeft: '5px', marginTop: '-2px', opacity: 0.7 },
  daysRow: { display: 'flex', alignItems: 'baseline', gap: '10px' },
  // Активная строка: крупная буква дня + время + N/M в линию, по центру буквы.
  activeRow: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'nowrap' },
  activeStat: { fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: '15px', letterSpacing: '0.3px', lineHeight: 1, whiteSpace: 'nowrap' },
  activeTimeStat: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
  daysLabel: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px' },
  daysList: { display: 'flex', alignItems: 'baseline', gap: '12px' },
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
