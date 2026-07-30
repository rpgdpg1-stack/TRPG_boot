import { useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { getMuscleGroupColors } from '../features/programs/colors'
import { MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import HeartIcon from './HeartIcon'
import TrendingUpIcon from './TrendingUpIcon'
import HistoryStats from './HistoryStats'
import CloseCross from './CloseCross'

/**
 * Две плитки-входа в карточке профиля (своей и друга) — визуально те же, что
 * карточки на главной: иконка сверху, подпись снизу, фон `--surface`, radius-card.
 * Цифр НЕТ (они внутри модалок), плитки только открывают детали.
 *
 * Тап открывает модалку по центру (затемнение + крестик снизу):
 *   • «Статистика» — тоталы (тренировки/время) + разбивка по видам, справа период;
 *   • «Любимые упражнения» — список с рабочим весом.
 *
 * Пропсы: summary (`summarizeWorkouts`), favorites, showWeights, periodLabel.
 */
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function ProfileMetrics({ summary, favorites = [], showWeights = true, periodLabel = '' }) {
  const [open, setOpen] = useState(null)   // 'stats' | 'favorites' | null

  const workouts = summary?.count || 0
  const favCount = favorites?.length || 0
  const hasStats = workouts > 0
  const hasFav = favCount > 0
  if (!hasStats && !hasFav) return null

  const show = (key) => { haptic.light(); setOpen(key) }

  return (
    <>
      <div style={styles.row}>
        {hasStats && (
          <button style={styles.tile} className="press-tile" onClick={() => show('stats')}>
            <span style={styles.tileIcon}><TrendingUpIcon size={22} color="var(--color-primary)" /></span>
            <span style={styles.tileTitle}>Статистика</span>
          </button>
        )}
        {hasFav && (
          <button style={styles.tile} className="press-tile" onClick={() => show('favorites')}>
            <span style={styles.tileIcon}><HeartIcon filled size={22} color="var(--color-primary)" /></span>
            <span style={styles.tileTitle}>Любимые</span>
          </button>
        )}
      </div>

      {open && createPortal(
        <MetricModal
          kind={open}
          summary={summary}
          favorites={favorites}
          showWeights={showWeights}
          periodLabel={periodLabel}
          onClose={() => setOpen(null)}
        />,
        document.body
      )}
    </>
  )
}

/** Модалка метрики: шапка (иконка + название, справа период) + содержимое. */
function MetricModal({ kind, summary, favorites, showWeights, periodLabel, onClose }) {
  const isStats = kind === 'stats'
  return (
    <div style={m.overlay} onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div style={m.panel} onClick={(e) => e.stopPropagation()}>
        <div style={m.head}>
          <span style={m.headLeft}>
            {isStats
              ? <TrendingUpIcon size={18} color="var(--color-primary)" />
              : <HeartIcon filled size={18} color="var(--color-primary)" />}
            <span style={m.title}>{isStats ? 'Статистика' : 'Любимые упражнения'}</span>
            {!isStats && <span style={m.count}>{favorites.length}</span>}
          </span>
          {isStats && periodLabel && <span style={m.period}>{periodLabel}</span>}
        </div>

        {isStats
          ? <HistoryStats summary={summary} />
          : <FavoritesList items={favorites} showWeights={showWeights} />}
      </div>

      <CloseCross onClose={onClose} style={{ marginTop: '14px' }} />
    </div>
  )
}

/**
 * Список любимых: над каждым упражнением — заголовок его группы мышц в цвете
 * группы (тот же приём, что в дне тренировки, только мельче — модалка компактная).
 */
function FavoritesList({ items, showWeights }) {
  return (
    <div style={m.favList}>
      {items.map((f, i) => {
        const n = Number(f.weight_kg)
        const has = showWeights && Number.isFinite(n) && n > 0
        const num = has ? (n % 1 === 0 ? n : n.toFixed(1)) : null
        const accent = getMuscleGroupColors(f.muscle_group).accent
        const group = MUSCLE_GROUP_LABELS[f.muscle_group] || ''
        // Подряд идущие упражнения одной группы — под общим заголовком.
        const sameAsPrev = i > 0 && items[i - 1].muscle_group === f.muscle_group
        return (
          <div key={i}>
            {group && !sameAsPrev && (
              <div style={{ ...m.groupHead, color: accent, marginTop: i === 0 ? 0 : '10px' }}>{group}</div>
            )}
            <div style={m.favRow}>
            <div style={m.thumb}>
              {f.preview_url
                ? <img src={f.preview_url} alt="" style={m.thumbImg} draggable={false} />
                : <span style={m.thumbEmoji}>💪</span>}
            </div>
            <span style={m.favName}>{cap(f.name)}</span>
            {has && (
              <span style={m.favVal}>
                <span style={{ color: accent, fontWeight: 800 }}>{num}</span>
                <span style={m.favUnit}> {f.counts_reps ? 'раз' : 'кг'}</span>
              </span>
            )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  // Два входа по центру карточки. Фона у плиток НЕТ: тогда отступ «линия → иконка»
  // и «подпись → низ карточки» равны паддингам самой карточки профиля (16),
  // как расстояние от аватара до линии. Кликабельность даёт press-эффект.
  row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '28px' },
  tile: {
    minWidth: '92px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    padding: '2px 8px', background: 'transparent', border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  tileIcon: { display: 'inline-flex', height: '22px' },
  tileTitle: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }
}

const m = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 10001,
    // Фон под модалкой заморожен: прокрутка не уходит на страницу (overscroll
    // contain), сам оверлей прокручивается только если контент выше экрана.
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
    padding: 'calc(env(safe-area-inset-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 20px)',
    overflowY: 'auto',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  panel: {
    position: 'relative', width: '100%', maxWidth: '360px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '18px 16px',
    display: 'flex', flexDirection: 'column', gap: '14px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingLeft: '2px' },
  headLeft: { display: 'inline-flex', alignItems: 'center', gap: '8px' },
  title: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' },
  count: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px', color: 'var(--color-primary)' },
  period: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px' },

  favList: { display: 'flex', flexDirection: 'column' },
  // Заголовок группы — как в дне тренировки, но мельче и без лишнего воздуха.
  groupHead: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '11px',
    letterSpacing: '1.6px', padding: '0 2px 2px'
  },
  favRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 2px' },
  thumb: {
    flexShrink: 0, width: '44px', height: '44px', borderRadius: '12px', overflow: 'hidden',
    background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbEmoji: { fontSize: '22px' },
  favName: {
    flex: 1, minWidth: 0, fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  favVal: { flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' },
  favUnit: { color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '12px' }
}
