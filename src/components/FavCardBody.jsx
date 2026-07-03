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

  return (
    <>
      <span style={styles.emoji}>{emoji}</span>
      <div style={styles.content}>
        <div style={styles.title}>{title}</div>

        {/* Порядок: название → место (Зал/Дом/Улица) → дни / «Продолжить N» / мин·метры.
            Место (переключаемый тег) идёт ВЫШЕ строки дней. Заплыв без мест — обычные
            теги. «Скоро» — для будущих программ раздела. */}
        {places.length > 0 ? (
          <div style={styles.tags}>
            <PlaceSwitcher program={prog} />
            {prog.comingSoon && <span style={styles.soonTag}>Скоро</span>}
          </div>
        ) : (prog.tags && prog.tags.length > 0) || prog.comingSoon ? (
          <div style={styles.tags}>
            {(prog.tags || []).map(tag => {
              const ft = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
              return <span key={tag} style={{ ...styles.tag, background: getProgramTagColor(tag, prog.source) }}>{ft}</span>
            })}
            {prog.comingSoon && <span style={styles.soonTag}>Скоро</span>}
          </div>
        ) : null}

        {available && (prog.kind === 'swim' ? (
          <div style={styles.daysRow}>
            <span style={styles.daysLabel}>
              {prog.data.durationMin} мин · {swimTotalMeters()} м
            </span>
          </div>
        ) : (
          // Дни A/B/C с подсветкой активного — остаются всегда. Ниже — ЕДИНЫЙ слот
          // (не прыгает между состояниями): активна тренировка → статус
          // (N/M · полоска · время); иначе на главной → «Последняя · N».
          <>
            <div style={styles.daysRow}>
              <div style={styles.daysList}>
                {/* Идёт тренировка — показываем ТОЛЬКО активный день, крупнее и в
                    акценте (зелёный у силовой); серые остальные буквы прячем.
                    Не активна — обычный ряд A/B/C с подсветкой рекомендованного. */}
                {(activeMin ? [activeDay].filter(Boolean) : allDays).map(d => {
                  const isToday = !!activeDay && d === activeDay
                  const isActiveOne = !!activeMin && d === activeDay
                  const hl = isToday || isActiveOne
                  // Цвет подсвеченного дня = цвет ПЕРВОЙ группы мышц этого дня
                  // (спина/грудь/ноги…), а не общий акцент.
                  const dGroup = prog.data?.days?.[d]?.[0]?.muscle_group
                  const dColor = (dGroup && getMuscleGroupColors(dGroup).accent) || accent
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

            {activeMin ? (
              // Статус активной тренировки как в дне: слева N/M, по центру тонкая
              // прогресс-полоска (зелёная заполненность по отжатым), справа время.
              <div style={styles.metaRow}>
                <span style={styles.activeCount}>{activeDone}/{activeTotal}</span>
                <div style={styles.activeTrack}>
                  <div style={{
                    ...styles.activeFill,
                    width: `${activeTotal > 0 ? Math.min(100, (activeDone / activeTotal) * 100) : 0}%`
                  }} />
                </div>
                <span style={{ ...styles.activeTime, color: activeTimeColor || 'var(--color-primary)' }}>
                  {activeMin}
                </span>
              </div>
            ) : showLast ? (
              <div style={styles.metaRow}>
                {lastLabel && <span style={styles.lastText}>Последняя · {lastLabel}</span>}
              </div>
            ) : null}
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
  emoji: { fontSize: '34px', lineHeight: 1, flexShrink: 0, width: '48px', textAlign: 'center' },
  content: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    lineHeight: 1.1
  },
  daysRow: { display: 'flex', alignItems: 'baseline', gap: '10px' },
  // Единый нижний слот — одинаковая высота в активном и неактивном состоянии
  // (чтобы карточка не прыгала при старте/отмене).
  metaRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', minHeight: '18px' },
  lastText: { fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.2px', whiteSpace: 'nowrap' },
  activeCount: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', letterSpacing: '1px', whiteSpace: 'nowrap', flexShrink: 0 },
  activeTrack: { flex: 1, minWidth: 0, height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' },
  activeFill: { height: '100%', background: 'var(--color-primary)', borderRadius: '3px', transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)' },
  activeTime: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0 },
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
