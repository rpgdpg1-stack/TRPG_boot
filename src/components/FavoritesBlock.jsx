import { useState } from 'react'
import { createPortal } from 'react-dom'
import { pluralizeExercises } from '../utils/plural'
import { getMuscleGroupColors } from '../features/programs/colors'
import HeartIcon from './HeartIcon'
import CloseCross from './CloseCross'

/**
 * «Любимые упражнения» в профиле (своём и друга) — КОМПАКТНО:
 *   ❤️ Любимые упражнения
 *   3 упражнения ›
 * Тап → модалка со списком (миниатюра + название + вес/повторы). Так профиль
 * лёгкий (особенно у друга, куда заходят чаще), а детали — в один тап.
 *
 * items: [{ name, weight_kg, counts_reps, preview_url }].
 */
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function FavoritesBlock({ items, bare = false, showWeights = true }) {
  const [open, setOpen] = useState(false)

  // Закрытие с гашением «призрачного» click: модалка (portal) снимается на
  // pointerup крестика, а следующий синтетический click иначе попадает на
  // страницу под ней (и, например, уводил на Статистику). Гасим один клик.
  const closeModal = () => {
    setOpen(false)
    const swallow = (e) => { e.stopPropagation(); e.preventDefault() }
    document.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 400)
  }

  if (!items || items.length === 0) return null
  const count = items.length

  const summary = (
    <button style={styles.summary} className="press-tile" onClick={() => setOpen(true)}>
      <span style={styles.summaryIcon}><HeartIcon filled size={16} /></span>
      <div style={styles.summaryText}>
        <div style={styles.summaryTitle}>Любимые упражнения</div>
        <div style={styles.summarySub}>{count} {pluralizeExercises(count)}</div>
      </div>
      <span style={styles.chev}>›</span>
    </button>
  )

  return (
    <>
      {bare ? summary : <div style={styles.card}>{summary}</div>}
      {open && createPortal(<FavoritesModal items={items} showWeights={showWeights} onClose={closeModal} />, document.body)}
    </>
  )
}

function FavoritesModal({ items, onClose, showWeights = true }) {
  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.panel} onClick={(e) => e.stopPropagation()}>
        <div style={m.header}>
          <HeartIcon filled size={16} />
          <span style={m.headerTitle}>Любимые упражнения</span>
        </div>

        <div style={m.list}>
          {items.map((f, i) => {
            const n = Number(f.weight_kg)
            const has = showWeights && Number.isFinite(n) && n > 0
            const num = has ? (n % 1 === 0 ? n : n.toFixed(1)) : null
            // Число веса/повторов — в акцент мышечной группы (ноги→зелёный,
            // грудь→оранжевый…), единица (кг/раз) — серым, не подсвечиваем.
            const accent = getMuscleGroupColors(f.muscle_group).accent
            return (
              <div key={i}>
                {i > 0 && <div style={m.divider} />}
                <div style={m.row}>
                  <div style={m.thumb}>
                    {f.preview_url
                      ? <img src={f.preview_url} alt="" style={m.thumbImg} draggable={false} />
                      : <span style={m.thumbEmoji}>💪</span>}
                  </div>
                  <span style={m.name}>{cap(f.name)}</span>
                  {has && (
                    <span style={m.val}>
                      <span style={{ color: accent, fontWeight: 800 }}>{num}</span>
                      <span style={m.valUnit}> {f.counts_reps ? 'раз' : 'кг'}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <CloseCross onClose={onClose} style={{ marginTop: '14px' }} />
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--surface)', border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)', padding: '4px', marginBottom: '20px'
  },
  // Свёрнутая строка: сердечко + [название / N упражнений] + шеврон. Вид как ряд меню.
  summary: {
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
    padding: '10px 12px', minHeight: '52px', textAlign: 'left',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-medium)', cursor: 'pointer'
  },
  summaryIcon: { display: 'inline-flex', width: '22px', justifyContent: 'center', flexShrink: 0 },
  summaryText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' },
  summaryTitle: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text)' },
  summarySub: { fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' },
  chev: { flexShrink: 0, fontSize: '18px', color: 'var(--color-text-secondary)' }
}

const m = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 10001,
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
    display: 'flex', flexDirection: 'column', gap: '12px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  header: { display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '2px' },
  headerTitle: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' },
  list: { display: 'flex', flexDirection: 'column' },
  divider: { height: '1px', background: 'var(--border-hairline)' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 2px' },
  thumb: {
    flexShrink: 0, width: '44px', height: '44px', borderRadius: '12px', overflow: 'hidden',
    background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbEmoji: { fontSize: '22px' },
  name: {
    flex: 1, minWidth: 0, fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  val: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px',
    whiteSpace: 'nowrap'
  },
  valUnit: { color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '12px' }
}
