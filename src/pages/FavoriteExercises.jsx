import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getFavoriteExercises, removeFavorite, formatFavoriteValue, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { getActiveDaySync } from '../lib/storage'
import { getProgramBySlug } from '../features/programs/registry'
import { getMuscleGroupColors } from '../features/programs/colors'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { localGet } from '../utils/storage'
import { EVENTS, on } from '../lib/events'
import ScreenTitle from '../components/ScreenTitle'
import HeartIcon from '../components/HeartIcon'
import HeartButton from '../components/HeartButton'
import ExerciseActionMenu from '../components/ExerciseActionMenu'

const title = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '')
const readPinnedGym = () => {
  try { return (JSON.parse(localGet('favorite_programs') || '{}') || {}).gym || null } catch { return null }
}

/**
 * «Любимые упражнения» — до 3. Добавляются сердечком в мини-модалке дня
 * тренировки; здесь показываются теми же карточками. Тап по карточке → та же
 * мини-модалка (вес/заметка/сердечко). Тап по сердечку — убрать. «+» ведёт в
 * закреплённую силовую, где ставишь ❤️ долгим тапом.
 */
export default function FavoriteExercises() {
  const navigate = useNavigate()
  const [favs, setFavs] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [openFav, setOpenFav] = useState(null) // fav для мини-модалки
  const closedAtRef = useRef(0)               // защита от «призрачного» тапа после закрытия модалки

  const guard = () => Date.now() - closedAtRef.current > 400

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const load = useCallback(() => {
    getFavoriteExercises().then(list => { setFavs(list); setLoaded(true) })
  }, [])

  useEffect(() => {
    load()
    return on(EVENTS.FAVORITES_CHANGED, load)
  }, [load])

  const byslot = {}
  for (const f of favs) byslot[f.slot] = f
  const slots = Array.from({ length: FAVORITE_LIMIT }, (_, i) => i + 1)

  const goAdd = () => {
    if (!guard()) return   // не реагируем на призрачный тап сразу после закрытия модалки
    haptic.light()
    const slug = readPinnedGym()
    if (!slug || !getProgramBySlug(slug)) { navigate('/category/gym', { state: { from: '/favorite-exercises' } }); return }
    const prog = getProgramBySlug(slug)
    const day = getActiveDaySync(slug) || Object.keys(prog.data?.days || { A: 1 })[0] || 'A'
    navigate(`/workout/${slug}/${day}`, { state: { from: '/favorite-exercises' } })
  }

  const removeFav = async (exerciseId) => {
    haptic.medium()
    await removeFavorite(exerciseId)
    load()
  }

  // slot-объект для ExerciseActionMenu (маппинг полей).
  const toSlot = (f) => ({
    exercise_id: f.exercise_id,
    exercise_name: f.name,
    muscle_group: f.muscle_group,
    sub_group: f.sub_group,
    meta_info: f.meta_info,
    preview_url: f.preview_url,
    video_url: f.video_url,
    user_weight_kg: f.weight_kg
  })

  return (
    <div className="page page-fade" style={styles.page}>
      <header style={styles.header}>
        <ScreenTitle>Любимые упражнения</ScreenTitle>
        <span style={styles.headerIcon}><HeartIcon filled size={18} /></span>
      </header>

      <p style={styles.intro}>
        Твой топ-3. Открой закреплённую тренировку, зажми упражнение и поставь ❤️
        в открывшейся карточке.
      </p>

      <div style={styles.list}>
        {slots.map(slot => {
          const f = byslot[slot]
          if (!f) {
            return (
              <button key={slot} className="press-tile" style={{ ...styles.card, ...styles.cardEmpty }} onClick={goAdd}>
                <span style={styles.plus}>＋</span>
                <span style={styles.emptyText}>Добавить из закреплённой тренировки</span>
              </button>
            )
          }
          const colors = getMuscleGroupColors(f.muscle_group)
          const tag = title(SUB_GROUP_LABELS[f.sub_group] || MUSCLE_GROUP_LABELS[f.muscle_group] || '')
          const val = formatFavoriteValue(f.weight_kg)
          return (
            <div key={slot} className="press-tile" style={styles.card} onClick={() => { if (!guard()) return; haptic.light(); setOpenFav(f) }}>
              <HeartButton
                filled
                color="var(--color-primary)"
                onActivate={() => removeFav(f.exercise_id)}
                ariaLabel="Убрать из любимых"
                style={styles.heartBtn}
              />
              <div style={styles.preview}>
                {f.preview_url
                  ? <img src={f.preview_url} alt="" style={styles.previewImg} draggable={false} />
                  : <span style={styles.previewEmoji}>💪</span>}
              </div>
              <div style={styles.cardContent}>
                <div style={styles.exName}>{title(f.name)}</div>
                {tag && <span style={{ ...styles.tag, background: colors.tag }}>{tag}</span>}
              </div>
              <div style={styles.weightBlock}>
                <div style={{ ...styles.weightValue, color: colors.accent }}>{f.weight_kg != null ? f.weight_kg : 0}</div>
                <div style={styles.weightUnit}>KG</div>
                {!val && <div style={styles.weightHint}>задать</div>}
              </div>
            </div>
          )
        })}
      </div>

      {!loaded && <div style={styles.loading}>Загрузка…</div>}

      {openFav && (
        <ExerciseActionMenu
          slot={toSlot(openFav)}
          onClose={() => { closedAtRef.current = Date.now(); setOpenFav(null); load() }}
          onWeightSaved={() => load()}
        />
      )}
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '14px' },
  headerIcon: { display: 'inline-flex' },
  intro: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    margin: '0 auto 20px', maxWidth: '300px'
  },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  // Карточка — как мини-модалка упражнения (превью + название + вес), одинаковой высоты.
  card: {
    position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center',
    padding: '16px', gap: '16px', width: '100%', minHeight: '150px',
    background: 'var(--surface-raised)', border: '1px solid var(--border-hairline)',
    borderRadius: '33px', overflow: 'hidden', textAlign: 'left', cursor: 'pointer'
  },
  cardEmpty: {
    justifyContent: 'center', gap: '10px', background: 'var(--surface)',
    border: '1px dashed rgba(255, 255, 255, 0.18)'
  },
  plus: { color: 'var(--color-primary)', fontSize: '22px', lineHeight: 1 },
  emptyText: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)' },
  heartBtn: {
    position: 'absolute', top: '10px', right: '10px', zIndex: 6, width: '40px', height: '40px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  preview: {
    flexShrink: 0, width: '118px', height: '118px', borderRadius: '33px', overflow: 'hidden',
    background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewEmoji: { fontSize: '40px' },
  cardContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' },
  exName: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, lineHeight: '19px', color: '#F0F0F0' },
  tag: {
    alignSelf: 'flex-start', padding: '3px 10px', borderRadius: '999px', color: '#FFFFFF',
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 700, opacity: 0.7, whiteSpace: 'nowrap'
  },
  weightBlock: { flexShrink: 0, width: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  weightValue: { fontFamily: 'var(--font-manrope)', fontSize: '20px', fontWeight: 800, lineHeight: '27px' },
  weightUnit: { fontFamily: 'var(--font-manrope)', fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', color: '#888888' },
  weightHint: { marginTop: '2px', fontFamily: 'var(--font-manrope)', fontSize: '9px', color: 'var(--color-text-secondary)' },
  loading: { textAlign: 'center', padding: '16px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' }
}
