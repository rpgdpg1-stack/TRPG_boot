import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import {
  getFavoriteExercises, setFavoriteExercise, clearFavoriteExercise,
  formatFavoriteValue, FAVORITE_SLOTS
} from '../lib/favorite-exercises'
import ScreenTitle from '../components/ScreenTitle'
import PixelHeart from '../components/PixelHeart'
import ExercisePicker from '../components/ExercisePicker'

/**
 * «Любимые упражнения» — до 3 слотов с рабочим весом. Витрина личного прогресса
 * (показывается в профиле и друзьям, если включено в приватности).
 *
 * Тап по слоту → пикер упражнений из конструктора (лимит 1): выбрал — сохранилось.
 * У заполненного слота — «×» для очистки.
 */
export default function FavoriteExercises() {
  const navigate = useNavigate()
  const [byslot, setBySlot] = useState({})   // { [slot]: fav }
  const [loaded, setLoaded] = useState(false)
  const [pickSlot, setPickSlot] = useState(null) // открытый слот для пикера

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const load = useCallback(() => {
    getFavoriteExercises().then(list => {
      const m = {}
      for (const f of list) m[f.slot] = f
      setBySlot(m)
      setLoaded(true)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const slots = Array.from({ length: FAVORITE_SLOTS }, (_, i) => i + 1)
  const usedIds = new Set(Object.values(byslot).map(f => f.exercise_id))

  const handlePick = async (ex) => {
    if (pickSlot == null || !ex?.id) return
    haptic.success()
    setPickSlot(null)
    await setFavoriteExercise(pickSlot, ex.id)
    load()
  }

  const handleClear = async (slot, e) => {
    e.stopPropagation()
    haptic.medium()
    await clearFavoriteExercise(slot)
    load()
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <header style={styles.header}>
        <ScreenTitle>Любимые упражнения</ScreenTitle>
        <span style={styles.headerIcon}><PixelHeart filled size={26} /></span>
      </header>

      <p style={styles.intro}>
        Твой топ-3: любимые упражнения и рабочие веса. Показ в профиле и друзьям
        настраивается в приватности.
      </p>

      <div style={styles.slots}>
        {slots.map(slot => {
          const fav = byslot[slot]
          const value = fav ? formatFavoriteValue(fav.weight_kg) : null
          return (
            <button
              key={slot}
              className="press-tile"
              onClick={() => { haptic.light(); setPickSlot(slot) }}
              style={{ ...styles.slot, ...(fav ? styles.slotFilled : styles.slotEmpty) }}
            >
              <span style={styles.slotIndex}>{slot}</span>
              <div style={styles.slotBody}>
                {fav ? (
                  <>
                    <div style={styles.slotTitle}>{cap(fav.name)}</div>
                    <div style={styles.slotHint}>{value || 'Вес не задан'}</div>
                  </>
                ) : (
                  <>
                    <div style={styles.slotTitleEmpty}>Свободный слот</div>
                    <div style={styles.slotHint}>Выбрать упражнение</div>
                  </>
                )}
              </div>
              {fav
                ? <span style={styles.remove} onClick={(e) => handleClear(slot, e)} aria-label="Убрать">×</span>
                : <span style={styles.plus}>＋</span>}
            </button>
          )
        })}
      </div>

      {!loaded && <div style={styles.loading}>Загрузка…</div>}

      {pickSlot != null && (
        <ExercisePicker
          excludeIds={usedIds}
          atLimit={false}
          count={0}
          max={1}
          onToggle={handlePick}
          onDone={() => setPickSlot(null)}
        />
      )}
    </div>
  )
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '14px' },
  headerIcon: { display: 'inline-flex' },
  intro: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    margin: '0 auto 20px', maxWidth: '300px'
  },
  slots: { display: 'flex', flexDirection: 'column', gap: '10px' },
  slot: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
    padding: '16px 18px', minHeight: '68px', borderRadius: 'var(--radius-card)',
    textAlign: 'left', cursor: 'pointer'
  },
  slotFilled: { background: 'var(--surface-raised)', border: '1px solid var(--border-hairline)' },
  slotEmpty: { background: 'var(--surface)', border: '1px dashed rgba(255, 255, 255, 0.18)' },
  slotIndex: {
    flexShrink: 0, width: '26px', height: '26px', borderRadius: '8px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface)', fontFamily: 'var(--font-display)', fontWeight: 800,
    fontSize: '14px', color: 'var(--color-text-secondary)'
  },
  slotBody: { flex: 1, minWidth: 0 },
  slotTitle: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' },
  slotTitleEmpty: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '2px' },
  slotHint: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)' },
  remove: {
    flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)',
    fontSize: '18px', lineHeight: 1
  },
  plus: { flexShrink: 0, color: 'var(--color-primary)', fontSize: '20px', lineHeight: 1, opacity: 0.8 },
  loading: { textAlign: 'center', padding: '16px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' }
}
