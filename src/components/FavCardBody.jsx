import { getProgramEmoji, getProgramTagColor, getProgramPlaces } from '../features/programs/registry'
import { getMuscleGroupColors } from '../features/programs/colors'
import { swimTotalMeters } from '../data/programs/swim'
import PlaceSwitcher from './PlaceSwitcher'

/**
 * Тело карточки избранной программы — общее для главной и страницы «Избранное».
 *
 * Рисует: эмодзи + контент (название, строка дней А/Б/В с подсветкой активного,
 * либо мин·метры для заплыва, теги программы). Обёртку (карточка, обводка,
 * правый блок «НАЧАТЬ»/сердце) рисует вызывающий — здесь только содержимое.
 *
 * `accent` — цвет раздела (var(--color-primary) / var(--cat-pool) / …):
 * им подсвечивается активный день. На главной он же даёт обводку/свечение карточки
 * (см. Home.FavCard), на странице избранного обводки нет — только подсветка дня.
 */
export default function FavCardBody({ entry, accent = 'var(--color-primary)', activeMin = null, activeTimeColor = null, activeDone = 0, activeTotal = 0, showLast = false, lastLabel = null }) {
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

        {/* Теги для НЕ-мест (заплыв / «Скоро») — обычные теги. */}
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
        ) : activeMin ? (
          // Идёт тренировка: крупная буква активного дня (в цвете первой группы),
          // справа N/M, ещё правее время; ниже — статичный тег места. Прогресс —
          // заливкой ВСЕЙ карточки (ProgramCard), отдельной полоски нет.
          <>
            <div style={styles.activeRow}>
              <span style={{
                ...styles.dayLetter, ...styles.dayLetterActive,
                color: dayColor(activeDay),
                textShadow: `0 0 6px color-mix(in srgb, ${dayColor(activeDay)} 45%, transparent)`
              }}>
                {activeDay}
              </span>
              <span style={styles.activeCount}>{activeDone}/{activeTotal}</span>
              <span style={{ ...styles.activeTime, color: activeTimeColor || 'var(--color-primary)' }}>
                {activeMin}
              </span>
            </div>
            {places.length > 0 && (
              <div style={styles.tags}><PlaceSwitcher program={prog} tag /></div>
            )}
          </>
        ) : (
          // Не активна: статичный тег места → дни A/B/C (подсветка рекомендованного
          // в цвете его группы) → «Последняя · N».
          <>
            {places.length > 0 && (
              <div style={styles.tags}>
                <PlaceSwitcher program={prog} tag />
                {prog.comingSoon && <span style={styles.soonTag}>Скоро</span>}
              </div>
            )}
            <div style={styles.daysRow}>
              <div style={styles.daysList}>
                {allDays.map(d => {
                  const isToday = !!activeDay && d === activeDay
                  const dColor = dayColor(d)
                  return (
                    <span key={d} style={{
                      ...styles.dayLetter,
                      color: isToday ? dColor : 'rgba(255,255,255,0.35)',
                      textShadow: isToday ? `0 0 6px color-mix(in srgb, ${dColor} 45%, transparent)` : 'none'
                    }}>
                      {d}
                    </span>
                  )
                })}
              </div>
            </div>
            {showLast && (
              <div style={styles.metaRow}>
                {lastLabel && <span style={styles.lastText}>Последняя · {lastLabel}</span>}
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
  // position/zIndex — чтобы контент был ПОВЕРХ заливки-прогресса карточки (ProgramCard).
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
  // Активная строка: крупная буква дня + N/M + время в одну линию.
  activeRow: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'nowrap' },
  metaRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', minHeight: '18px' },
  lastText: { fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.2px', whiteSpace: 'nowrap' },
  activeCount: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--color-text-secondary)', letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0 },
  activeTime: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0 },
  daysLabel: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px' },
  daysList: { display: 'flex', alignItems: 'baseline', gap: '14px' },
  dayLetter: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px', lineHeight: 1, transition: 'color 0.3s ease' },
  // Активный (запущенный) день на карточке — крупнее и жирнее (виден статус).
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
