import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getFavoriteExercises, getFavoritesSync, formatFavoriteValue, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { getActiveDaySync, getFavoriteProgramsSync } from '../lib/storage'
import { getProgramBySlug } from '../features/programs/registry'
import { getMuscleGroupColors } from '../features/programs/colors'
import { isCustomExercise } from '../features/programs/userExercises'
import { exerciseTagLabel } from '../features/programs/labels'
import { EVENTS, on } from '../lib/events'
import { shouldIgnoreCardTap } from '../lib/weight-editing-state'
import { useWeightEditor } from '../features/exercises/use-weight-editor'
import { WEIGHT_COLOR_TRANSITION } from '../components/WeightRaiseFlash'
import ScreenTitle from '../components/ScreenTitle'
import HeartIcon from '../components/HeartIcon'
import ExerciseActionMenu from '../components/ExerciseActionMenu'
import ExercisePlaceholder from '../components/ExercisePlaceholder'
import MarqueeTag from '../components/MarqueeTag'

const title = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '')
// Закреплённая силовая программа — из настроек аккаунта. Прямое чтение
// localStorage тут больше не работает: закрепы переехали в аккаунт.
const readPinnedGym = () => getFavoriteProgramsSync().gym || null

/**
 * «Любимые упражнения» — до FAVORITE_LIMIT (5). Добавляются сердечком в мини-модалке дня
 * тренировки; здесь показываются теми же карточками. Тап ИЛИ долгий тап по
 * карточке → та же мини-модалка (вес/заметка/сердечко/график) — убрать из
 * любимых можно ТОЛЬКО там: сердечек на самих карточках нет, пять штук подряд
 * читались как основное действие экрана. Тап по цифре веса — правка на месте.
 * «+» ведёт в закреплённую силовую, где ставишь ❤️ долгим тапом.
 */
export default function FavoriteExercises() {
  const navigate = useNavigate()
  const [favs, setFavs] = useState(() => getFavoritesSync() || [])
  const [loaded, setLoaded] = useState(() => getFavoritesSync() !== null)
  const [openFav, setOpenFav] = useState(null) // fav для мини-модалки
  const closedAtRef = useRef(0)               // защита от «призрачного» тапа после закрытия модалки

  const guard = () => Date.now() - closedAtRef.current > 400

  // Долгое нажатие по карточке — открывает ту же модалку заметки, что и тап.
  const lpTimer = useRef(null)
  const lpFired = useRef(false)
  const lpStart = useRef({ x: 0, y: 0 })
  const LP_MS = 500
  const LP_MOVE = 10
  const clearLp = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } }
  useEffect(() => () => clearLp(), [])

  const cardPointerDown = (e, f) => {
    // Идёт ввод веса (или клавиатура только что закрылась) — тап по карточке
    // ГАСИМ: человек тапнул мимо, чтобы убрать клавиатуру, а не открыть меню.
    if (shouldIgnoreCardTap()) return
    // Нажатие по кнопке внутри карточки — не считаем долгим тапом карточки.
    if (e.target.closest('button')) return
    lpFired.current = false
    lpStart.current = { x: e.clientX, y: e.clientY }
    clearLp()
    lpTimer.current = setTimeout(() => {
      lpFired.current = true
      haptic.medium()
      if (guard()) setOpenFav(f)
    }, LP_MS)
  }
  const cardPointerMove = (e) => {
    if (!lpTimer.current) return
    if (Math.abs(e.clientX - lpStart.current.x) > LP_MOVE || Math.abs(e.clientY - lpStart.current.y) > LP_MOVE) clearLp()
  }
  const cardPointerUp = () => clearLp()
  // Обычный тап по карточке НИЧЕГО не открывает. На этом экране рабочих действий
  // ровно два: поправить вес (тап по цифре) и прочитать длинный тег (тап по нему).
  // Меню — только долгим нажатием, как у программы на главной и у строки друга.
  // Раньше короткий тап открывал меню, и любая попытка тронуть вес мимо цифры
  // выкидывала в модалку.
  const cardClick = () => { lpFired.current = false }

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

  // slot-объект для ExerciseActionMenu (маппинг полей).
  const toSlot = (f) => ({
    exercise_id: f.exercise_id,
    exercise_name: f.name,
    muscle_group: f.muscle_group,
    sub_group: f.sub_group,
    meta_info: f.meta_info,
    preview_url: f.preview_url,
    video_url: f.video_url,
    user_weight_kg: f.weight_kg,
    counts_reps: f.counts_reps
  })

  return (
    <div className="page page-fade" style={styles.page}>
      <header style={styles.header}>
        <ScreenTitle>Любимые упражнения</ScreenTitle>
      </header>

      <p style={styles.intro}>
        Твой топ упражнений. Открой любую силовую программу, зажми упражнение и поставь{' '}
        <span style={styles.introHeart}><HeartIcon filled size={15} /></span>{' '}
        в открывшейся карточке.
      </p>
      {/* Лимит отдельной строкой и тише: это ограничение, а не инструкция —
          читать его нужно после того, как понятно, ЧТО тут делают. */}
      <p style={{ ...styles.intro, ...styles.introLimit }}>
        В любимые помещается не больше {FAVORITE_LIMIT} упражнений — на то он и короткий список.
      </p>

      <div style={styles.list}>
        {slots.map((slot) => {
          const f = byslot[slot]
          if (!f) {
            return (
              <button key={slot} className="press-tile" style={{ ...styles.card, ...styles.cardEmpty }} onClick={goAdd}>
                <span style={styles.plus}>＋</span>
                <span style={styles.emptyText}>Добавить из закреплённой тренировки</span>
              </button>
            )
          }
          const colors = getMuscleGroupColors(f.muscle_group, isCustomExercise(f.exercise_id))
          // Группа живёт в теге («Ноги — Квадрицепс»), заголовков над карточками нет.
          const tag = exerciseTagLabel(f.muscle_group, f.sub_group)
          const val = formatFavoriteValue(f.weight_kg, f.counts_reps)
          return (
            <div
              key={slot}
              className="press-tile"
              style={styles.card}
              onClick={cardClick}
              onPointerDown={(e) => cardPointerDown(e, f)}
              onPointerMove={cardPointerMove}
              onPointerUp={cardPointerUp}
              onPointerCancel={cardPointerUp}
              onPointerLeave={cardPointerUp}
            >
              <div style={styles.preview}>
                {f.preview_url
                  ? <img src={f.preview_url} alt="" style={styles.previewImg} draggable={false} />
                  : <ExercisePlaceholder size={40} />}
              </div>
              <div style={styles.cardContent}>
                <div style={styles.exName}>{title(f.name)}</div>
                {/* Многоточие без прокатки: карточка ловит долгое нажатие, и живой тег
                    отбирал бы у неё эту зону. Целиком подпись читается в меню. */}
                {tag && <MarqueeTag label={tag} background={colors.tag} style={styles.tag} />}
              </div>
              <FavWeight fav={f} accent={colors.accent} showHint={!val} onSaved={load} />
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

/**
 * Блок веса — тапается отдельно от карточки: тап по цифре открывает ввод (как в
 * дне тренировки), тап по остальной карточке — меню упражнения. Поэтому гасим
 * всплытие: иначе поверх клавиатуры вылезала бы модалка.
 */
function FavWeight({ fav, accent, showHint, onSaved }) {
  const w = useWeightEditor({
    exerciseId: fav.exercise_id,
    weight: fav.weight_kg,
    onSaved: () => onSaved?.()
  })
  return (
    <div
      style={styles.weightBlock}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={styles.weightInputWrap}>
        {w.raise.arrow}
        {/* Каретка и выделение — в цвете группы мышц (как в дне тренировки),
            а не общим зелёным: зелёный тут занят действиями. */}
        <input
          ref={w.inputRef}
          {...w.inputProps}
          style={{ ...styles.weightInput, caretColor: accent, opacity: w.editing ? 1 : 0 }}
        />
        {!w.editing && (
          <div style={{
            ...styles.weightValue,
            color: w.raise.colorFor('var(--color-text)'),
            transition: WEIGHT_COLOR_TRANSITION
          }}>
            {w.value}
          </div>
        )}
      </div>
      <div style={styles.weightUnit}>{fav.counts_reps ? 'раз' : 'кг'}</div>
      {showHint && <div style={styles.weightHint}>задать</div>}
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 'var(--space-4)' },
  introHeart: { display: 'inline-flex', verticalAlign: '-2px' },
  intro: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    margin: '0 auto var(--space-5)', maxWidth: '300px'
  },
  // Строка лимита идёт сразу под инструкцией — своим отступом её не отрывать.
  introLimit: { marginTop: 'calc(var(--space-3) * -1)' },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  // Карточка — 1:1 по размерам с карточкой упражнения в дне тренировки
  // (ExerciseCard: minHeight 132, padding/gap 16, превью 100, radius 33).
  card: {
    position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center',
    padding: 'var(--space-4)', gap: 'var(--space-4)', width: '100%', minHeight: '132px',
    background: 'var(--surface-raised)', border: 'none',
    borderRadius: 'var(--radius-card)', overflow: 'hidden', textAlign: 'left', cursor: 'pointer'
  },
  cardEmpty: {
    justifyContent: 'center', gap: 'var(--space-2)', background: 'var(--surface)',
    border: '1px dashed rgba(255, 255, 255, 0.18)'
  },
  plus: { color: 'var(--color-primary)', fontSize: 'var(--text-heading-size)', lineHeight: 1 },
  emptyText: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700, color: 'var(--color-text-secondary)' },
  preview: {
    flexShrink: 0, width: '100px', height: '100px', borderRadius: 'var(--radius-card)', overflow: 'hidden',
    background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  cardContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--space-2)' },
  exName: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700, lineHeight: '19px', color: 'var(--color-text)' },
  // Форма пилюли — в MarqueeTag; здесь выравнивание в колонке и приглушение.
  tag: { alignSelf: 'flex-start', opacity: 0.7 },
  // Блок веса 1:1 с карточкой упражнения в дне тренировки (ExerciseCard):
  // цифра и прозрачный инпут поверх неё лежат в одной ячейке 38×27.
  weightBlock: {
    position: 'relative', flexShrink: 0, width: '38px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-15)', margin: '-6px'
  },
  weightInputWrap: { position: 'relative', width: '38px', height: '27px' },
  weightInput: {
    position: 'absolute', top: 0, left: 0, width: '38px', height: '27px',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-heading-size)', fontWeight: 800,
    lineHeight: '27px', background: 'transparent', border: 'none', outline: 'none',
    textAlign: 'center', padding: 0, margin: 0,
    color: 'var(--color-text)',
    transition: 'opacity 0.12s ease'
  },
  weightValue: {
    position: 'absolute', top: 0, left: 0, width: '38px', height: '27px',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-heading-size)', fontWeight: 800,
    lineHeight: '27px', textAlign: 'center', color: 'var(--color-text)',
    pointerEvents: 'none'
  },
  weightUnit: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 800, lineHeight: '15px', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', textAlign: 'center' },
  weightHint: { marginTop: 'var(--space-05)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', color: 'var(--color-text-secondary)' },
  loading: { textAlign: 'center', padding: 'var(--space-4)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-text-secondary)' }
}
