import { useCallback, useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/telegram'
import { useOutsideClose } from '../lib/use-outside-close'
import { getMuscleGroupColors } from '../features/programs/colors'
import UiIcon from './UiIcon'
import HeartIcon from './HeartIcon'
import HistoryStats from './HistoryStats'

/**
 * Ряд метрик в карточке профиля (своей и друга) + всплывающая детализация.
 *
 * Метрики: **Статистика** (иконка + «N трен») и **Любимые** (сердечко + «N упр»).
 * Тап по метрике → попап ПОД карточкой: он ложится ПОВЕРХ контента ниже и не
 * двигает профиль. Активная метрика подсвечена, вторая приглушена. Закрытие —
 * повторный тап по метрике, тап мимо или скролл страницы.
 *
 * Содержимое попапа:
 *   • статистика — общие тоталы (тренировки/время) + разбивка по видам
 *     активности (`HistoryStats`), справа в шапке — период («Июль»);
 *   • любимые — список упражнений с рабочим весом.
 *
 * Пропсы: summary (`summarizeWorkouts`), favorites, showWeights, periodLabel.
 */
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function ProfileMetrics({ summary, favorites = [], showWeights = true, periodLabel = '', loading = false }) {
  const [open, setOpen] = useState(null)   // 'stats' | 'favorites' | null
  const wrapRef = useRef(null)
  const close = useCallback(() => setOpen(null), [])
  useOutsideClose(wrapRef, !!open, close)

  // Скролл страницы — тоже закрывает (попап привязан к карточке, а не к экрану).
  useEffect(() => {
    if (!open) return
    const onScroll = () => setOpen(null)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [open])

  const workouts = summary?.count || 0
  const favCount = favorites?.length || 0
  const hasStats = workouts > 0
  const hasFav = favCount > 0
  if (!hasStats && !hasFav && !loading) return null

  const toggle = (key) => {
    haptic.light()
    setOpen(prev => (prev === key ? null : key))
  }

  const dim = (key) => (open && open !== key ? styles.metricDim : null)

  return (
    <div style={styles.wrap} ref={wrapRef}>
      <div style={styles.row}>
        {hasStats && (
          <button style={{ ...styles.metric, ...dim('stats') }} onClick={() => toggle('stats')} aria-label="Статистика">
            <UiIcon name="stats" size={20} color="#3FA2F7" />
            <span style={styles.num}>{workouts}</span>
            <span style={styles.unit}>трен</span>
          </button>
        )}
        {hasFav && (
          <button style={{ ...styles.metric, ...dim('favorites') }} onClick={() => toggle('favorites')} aria-label="Любимые упражнения">
            <HeartIcon filled size={20} color="var(--color-text-secondary)" />
            <span style={styles.num}>{favCount}</span>
            <span style={styles.unit}>упр</span>
          </button>
        )}
      </div>

      {open && (
        <div style={styles.popover}>
          <div style={styles.popHead}>
            <span style={styles.popTitle}>
              {open === 'stats' ? 'Тренировки' : 'Любимые упражнения'}
            </span>
            {periodLabel && <span style={styles.popPeriod}>{periodLabel}</span>}
          </div>

          {open === 'stats'
            ? <HistoryStats summary={summary} />
            : <FavoritesList items={favorites} showWeights={showWeights} />}
        </div>
      )}
    </div>
  )
}

/** Список любимых: миниатюра + название + рабочий вес (в акцент группы мышц). */
function FavoritesList({ items, showWeights }) {
  return (
    <div style={styles.favList}>
      {items.map((f, i) => {
        const n = Number(f.weight_kg)
        const has = showWeights && Number.isFinite(n) && n > 0
        const num = has ? (n % 1 === 0 ? n : n.toFixed(1)) : null
        const accent = getMuscleGroupColors(f.muscle_group).accent
        return (
          <div key={i} style={i === 0 ? styles.favRow : { ...styles.favRow, ...styles.favRowDivider }}>
            <div style={styles.thumb}>
              {f.preview_url
                ? <img src={f.preview_url} alt="" style={styles.thumbImg} draggable={false} />
                : <span style={styles.thumbEmoji}>💪</span>}
            </div>
            <span style={styles.favName}>{cap(f.name)}</span>
            {has && (
              <span style={styles.favVal}>
                <span style={{ color: accent, fontWeight: 800 }}>{num}</span>
                <span style={styles.favUnit}> {f.counts_reps ? 'раз' : 'кг'}</span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  // relative — база для попапа, который ложится ПОВЕРХ контента ниже.
  wrap: { position: 'relative' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px' },
  metric: {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 0.2s ease'
  },
  // Неактивная метрика приглушается, пока открыт попап другой.
  metricDim: { opacity: 0.35 },
  num: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', letterSpacing: '0.2px', color: 'var(--color-primary)' },
  unit: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' },

  // Попап: во всю ширину карточки, сразу под метриками, поверх контента ниже.
  popover: {
    position: 'absolute',
    top: 'calc(100% + 14px)',
    left: '-6px', right: '-6px',
    zIndex: 40,
    padding: '14px 16px 16px',
    background: 'rgba(34, 34, 34, 0.98)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.55)',
    animation: 'metricPopIn 0.22s var(--ease-ios) forwards'
  },
  popHead: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: '10px', marginBottom: '12px'
  },
  popTitle: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' },
  popPeriod: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px' },

  favList: { display: 'flex', flexDirection: 'column' },
  favRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0' },
  favRowDivider: { borderTop: '1px solid var(--border-hairline)' },
  thumb: {
    flexShrink: 0, width: '40px', height: '40px', borderRadius: '12px', overflow: 'hidden',
    background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbEmoji: { fontSize: '20px' },
  favName: {
    flex: 1, minWidth: 0, fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  favVal: { flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' },
  favUnit: { color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '12px' }
}
