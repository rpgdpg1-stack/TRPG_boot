import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { getMuscleGroupColors } from '../features/programs/colors'
import { isCustomExercise } from '../features/programs/userExercises'
import { useScrollLock } from '../lib/use-scroll-lock'
import { exerciseTagLabel } from '../features/programs/labels'
import { periodShortLabel, periodHintSuffix } from '../utils/history'
import HeartIcon from './HeartIcon'
import TrendingUpIcon from './TrendingUpIcon'
import UiIcon from './UiIcon'
import HistoryStats from './HistoryStats'
import PersonalRecords, { hasRecords, RECORD_GOLD } from './PersonalRecords'
import PeriodSwitcher, { periodOptions } from './PeriodSwitcher'
import CloseCross from './CloseCross'
import ExercisePlaceholder from './ExercisePlaceholder'
import MarqueeTag from './MarqueeTag'

/**
 * Плитки-входы в карточке профиля (своей и друга) — визуально те же, что
 * карточки на главной: иконка сверху, подпись снизу, фон `--surface`, radius-card.
 * Цифр НЕТ (они внутри модалок), плитки только открывают детали.
 *
 * Тап открывает модалку по центру (затемнение + крестик снизу):
 *   • «Статистика» — переключатель Месяц/Год (по умолчанию ГОД) + тоталы и разбивка
 *     по видам за выбранный период; плитка доступна ВСЕГДА, даже без тренировок —
 *     внутри тогда честная заглушка;
 *   • «Рекорды» — тот же блок, что внизу экрана статистики (`PersonalRecords`):
 *     лучший месяц, самый большой рабочий вес, самый длинный заплыв. У друга —
 *     его рекорды, если он не закрыл статистику;
 *   • «Любимые упражнения» — список с рабочим весом.
 *
 * Пропсы: `stats` — сводки по периодам (`{ week, month, year, all }`, любые из них),
 * `records` (`{best_month, strength, swim}` — свои или друга), favorites, showWeights.
 */
// Периоды и их подписи — те же, что на главной («7 дней · Август · 2026 · Всё»).
// Показываем только те, по которым есть данные: свой профиль считает все четыре,
// друг — что отдал сервер.
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function ProfileMetrics({ stats, records = null, favorites = [], showWeights = true }) {
  const [open, setOpen] = useState(null)   // 'stats' | 'records' | 'favorites' | null

  const favCount = favorites?.length || 0
  const hasFav = favCount > 0
  // Статистика доступна всегда: пустой период честнее показать текстом, чем
  // прятать вход (иначе непонятно, есть ли раздел вообще).
  const hasStats = !!stats
  // Рекорды — наоборот: пока рекордов нет, плитка молчит. Обещать раздел,
  // внутри которого «пока пусто», незачем — он появится сам с первым рекордом.
  const hasRec = hasRecords(records)

  const show = (key) => { haptic.light(); setOpen(key) }

  // Разделы модалки в одном порядке с плитками. Отсюда же строится переключатель
  // ВНУТРИ модалки: список один, разъехаться нечему.
  const tabs = [
    hasStats && { id: 'stats', title: 'Статистика' },
    hasRec && { id: 'records', title: 'Рекорды' },
    hasFav && { id: 'favorites', title: 'Любимые упражнения' }
  ].filter(Boolean)

  if (!hasStats && !hasFav && !hasRec) return null

  // Три плитки в ряд на узком экране (375) не помещаются с большим зазором —
  // 92px минимум у каждой плюс два раза по 24 дают 324 при доступных 311.
  // Поэтому с третьей плитки зазор ужимается до 12: ряд остаётся одной строкой,
  // а плитки не начинают переносить подписи.
  const tiles = (hasStats ? 1 : 0) + (hasRec ? 1 : 0) + (hasFav ? 1 : 0)

  return (
    <>
      <div style={{ ...styles.row, ...(tiles >= 3 ? styles.rowTight : null) }}>
        {hasStats && (
          <button style={styles.tile} className="press-tile" onClick={() => show('stats')}>
            <span style={styles.tileIcon}><TrendingUpIcon size={22} color="var(--color-primary)" /></span>
            <span style={styles.tileTitle}>Статистика</span>
          </button>
        )}
        {hasRec && (
          <button style={styles.tile} className="press-tile" onClick={() => show('records')}>
            {/* Кубок золотой, а не зелёный: золото — язык рекордов во всём
                приложении (блок на экране статистики, эмодзи в сводках бота). */}
            <span style={styles.tileIcon}><UiIcon name="trophy" size={22} color={RECORD_GOLD} /></span>
            <span style={styles.tileTitle}>Рекорды</span>
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
          tabs={tabs}
          stats={stats}
          records={records}
          favorites={favorites}
          showWeights={showWeights}
          onClose={() => setOpen(null)}
        />,
        document.body
      )}
    </>
  )
}

// Смена раздела: старый контент гаснет, потом встаёт новый. Иконка
// переключается СРАЗУ — она отвечает на палец, ждать её незачем.
const FADE_MS = 130
// Свайп засчитывается от этого хода пальца и только если он заметно
// горизонтальнее вертикального. Порог намеренно крупный: под пальцем
// прокручивается список, и диагональное движение не должно листать разделы.
const SWIPE_MIN_PX = 60
const SWIPE_RATIO = 1.5
// Место под крестиком: он живёт под панелью, и панель не должна его выдавить.
const CROSS_RESERVE_PX = 84
// Сколько панели обязано остаться при любом раскладе. Отметка верха берётся из
// центрированного положения, а раздел потом может вырасти — без этого предела
// на низком экране панель схлопывалась в полоску вместо того, чтобы прокручиваться.
const MIN_PANEL_PX = 240

/**
 * Модалка метрики: переключатель разделов + содержимое активного.
 *
 * Разделы переключаются ВНУТРИ модалки, без возврата в карточку профиля:
 * человек открыл чужой профиль, чтобы посмотреть достижения, и не должен
 * закрывать-открывать окно ради соседнего раздела.
 *
 * Переключатель — только иконки, без подписей: те же три иконки уже стоят
 * плитками в карточке профиля, и повторить их там ещё раз с текстом значило бы
 * показать одну навигацию дважды. Название несёт заголовок активного раздела
 * под иконками.
 *
 * **Верхняя граница панели не двигается.** При открытии панель встаёт по центру
 * экрана, и это положение ЗАПОМИНАЕТСЯ: дальше разделы меняют высоту только
 * вниз. Иначе центрирование дёргало бы окно вверх-вниз на каждом переключении,
 * и вместо «я в одной панели и смотрю другой раздел» получалось бы «мне
 * открыли другую модалку».
 *
 * **Свайп влево-вправо** листает разделы — как дополнение к тапу, а не вместо.
 * Вертикальный жест остаётся прокруткой: направление определяется один раз в
 * начале движения и до конца жеста не меняется.
 *
 * Кнопки «назад» нет — выход один, крестик снизу.
 */
function MetricModal({ kind, tabs, stats, records, favorites, showWeights, onClose }) {
  // active — что подсвечено в переключателе (меняется сразу),
  // shown — что нарисовано (меняется после того, как старое погасло).
  const [active, setActive] = useState(kind)
  const [shown, setShown] = useState(kind)
  const isStats = shown === 'stats'
  const isRecords = shown === 'records'

  // Периоды считаем всегда, а не только на вкладке статистики: в неё можно
  // прийти переключателем, и к этому моменту список должен быть готов.
  const available = periodOptions().filter(p => stats && p.id in stats)
  // «Всё» по умолчанию: карточка профиля — про общий итог, а не про текущий
  // отрезок; сузить до года/месяца человек может сам. Если «Всё» недоступно
  // (у друга сервер отдал только разбивку) — первый доступный.
  const [period, setPeriod] = useState('all')
  const activePeriod = available.some(p => p.id === period) ? period : (available[0]?.id || 'all')
  const overlayRef = useRef(null)
  const panelRef = useRef(null)
  useScrollLock(overlayRef)

  // Положение верха панели, замеренное при открытии. Пока null — панель
  // центрируется как обычная модалка; дальше стоит на этой отметке.
  const [topOffset, setTopOffset] = useState(null)
  useLayoutEffect(() => {
    const panel = panelRef.current
    const overlay = overlayRef.current
    if (!panel || !overlay) return
    const cs = getComputedStyle(overlay)
    const padTop = parseFloat(cs.paddingTop) || 0
    const padBottom = parseFloat(cs.paddingBottom) || 0
    const avail = overlay.clientHeight - padTop - padBottom
    const measured = panel.getBoundingClientRect().top - overlay.getBoundingClientRect().top - padTop
    // Отметку опускаем не ниже, чем позволяет оставшееся место.
    const maxTop = Math.max(0, avail - CROSS_RESERVE_PX - MIN_PANEL_PX)
    setTopOffset(Math.min(Math.max(0, Math.round(measured)), Math.round(maxTop)))
  }, [])

  const swapTimer = useRef(null)
  useEffect(() => () => clearTimeout(swapTimer.current), [])

  // Высота содержимого — в пикселях, иначе её нечем анимировать: с `height:auto`
  // браузер меняет размер скачком. Измеритель НЕ пересоздаётся при смене раздела
  // (key стоит на блоке внутри него), поэтому наблюдатель переживает переключение.
  const innerRef = useRef(null)
  const [bodyH, setBodyH] = useState(null)
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const upd = () => setBodyH(el.offsetHeight)
    upd()
    const ro = new ResizeObserver(upd)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pick = (id) => {
    if (id === active || !tabs.some(t => t.id === id)) return
    haptic.selection()
    setActive(id)
    clearTimeout(swapTimer.current)
    swapTimer.current = setTimeout(() => setShown(id), FADE_MS)
  }

  // Свайп: направление решается один раз за жест и дальше не пересматривается —
  // иначе на диагонали палец «перетягивал» бы прокрутку в переключение.
  const touch = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, axis: null }
  }
  const onTouchMove = (e) => {
    const st = touch.current
    if (!st || st.axis) return
    const t = e.touches[0]
    const dx = t.clientX - st.x
    const dy = t.clientY - st.y
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    st.axis = Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO ? 'x' : 'y'
  }
  const onTouchEnd = (e) => {
    const st = touch.current
    touch.current = null
    if (!st || st.axis !== 'x') return
    const t = e.changedTouches[0]
    const dx = t.clientX - st.x
    if (Math.abs(dx) < SWIPE_MIN_PX) return
    const i = tabs.findIndex(x => x.id === active)
    // Крайние разделы не зациклены: упёрся — значит упёрся, это честнее,
    // чем прыжок с последнего на первый.
    const next = tabs[dx < 0 ? i + 1 : i - 1]
    if (next) pick(next.id)
  }

  const summary = isStats ? stats?.[activePeriod] : null
  // Заглушка честно называет период и адресата (свой профиль / профиль друга).
  // Заглушка одинаковая для своего профиля и для друга — это карточка профиля,
  // а не экран статистики: тут достаточно факта.
  const hint = periodHintSuffix(activePeriod)
  const emptyText = activePeriod === 'month' ? `Не тренировался в этом месяце${hint}`
    : activePeriod === 'year' ? `Не тренировался в этом году${hint}`
      : activePeriod === 'week' ? `Не тренировался на этой неделе${hint}`
        : 'Тренировок пока нет'

  // Верх зафиксирован — центрирование выключаем и держим панель на замеренной
  // отметке. Высота при этом ограничена местом до низа экрана, чтобы растущий
  // раздел уходил во внутреннюю прокрутку, а не выдавливал крестик.
  const fixed = topOffset != null
  const panelStyle = fixed
    ? {
      ...m.panel,
      marginTop: `${topOffset}px`,
      maxHeight: `min(85vh, calc(100% - ${topOffset + CROSS_RESERVE_PX}px))`
    }
    : m.panel

  return (
    <div
      ref={overlayRef}
      style={{ ...m.overlay, justifyContent: fixed ? 'flex-start' : 'center' }}
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        ref={panelRef}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { touch.current = null }}
      >
        {/* Шапка липкая: если раздел вырос и панель прокручивается, иконки
            остаются на месте, контент уходит под них. */}
        <div style={m.head}>
          {/* Переключатель нужен, только когда есть куда переключаться. */}
          {tabs.length > 1 && (
            <div style={m.tabs}>
              {tabs.map(t => (
                <button
                  key={t.id}
                  style={{ ...m.tab, ...(t.id === active ? m.tabOn : null) }}
                  onClick={() => pick(t.id)}
                  aria-label={t.title}
                  aria-current={t.id === active}
                >
                  <TabIcon id={t.id} on={t.id === active} />
                </button>
              ))}
            </div>
          )}
          <span style={m.headTitle}>
            <span style={m.title}>{tabs.find(t => t.id === active)?.title}</span>
            {active === 'favorites' && <span style={m.count}>{favorites.length}</span>}
          </span>
        </div>

        {/* Высота меняется плавно и ТОЛЬКО вниз: верх панели прибит замером выше.
            Содержимое гаснет на время подмены (active уже новый, shown ещё старый)
            и появляется обратно уже другим разделом. key — чтобы React считал
            это новым блоком и отыграл появление, а не подменял текст на месте. */}
        <div style={{ ...m.bodyBox, height: bodyH != null ? `${bodyH}px` : undefined }}>
          <div ref={innerRef}>
            <div key={shown} style={{ ...m.body, opacity: active === shown ? 1 : 0 }}>
              {/* Переключатель периода только у статистики и только когда периодов больше одного. */}
              {isStats && available.length > 1 && (
                <PeriodSwitcher items={available} value={activePeriod} onChange={setPeriod} style={{ marginBottom: 'var(--space-4)' }} />
              )}

              {isStats
                ? <HistoryStats summary={summary} periodLabel={periodShortLabel(activePeriod)} emptyText={emptyText} />
                : isRecords
                  ? <PersonalRecords records={records} bare />
                  : <FavoritesList items={favorites} showWeights={showWeights} />}
            </div>
          </div>
        </div>
      </div>

      <CloseCross onClose={onClose} style={{ marginTop: 'var(--space-4)' }} />
    </div>
  )
}

/** Иконка раздела: активная — своим цветом, спящая — приглушённо-серой (как в таб-баре). */
function TabIcon({ id, on }) {
  const off = 'var(--color-text-inactive)'
  if (id === 'stats') return <TrendingUpIcon size={20} color={on ? 'var(--color-primary)' : off} />
  if (id === 'records') return <UiIcon name="trophy" size={20} color={on ? RECORD_GOLD : off} />
  return <HeartIcon filled size={20} color={on ? 'var(--color-primary)' : off} />
}

/**
 * Список любимых. Заголовков групп нет — принадлежность упражнения пишет тег
 * ВТОРОЙ строкой под названием («Ноги — Квадрицепс»), в цвете группы. Так же,
 * как на карточках дня и на странице «Любимые».
 */
function FavoritesList({ items, showWeights }) {
  return (
    <div style={m.favList}>
      {items.map((f, i) => {
        const n = Number(f.weight_kg)
        const has = showWeights && Number.isFinite(n) && n > 0
        // Дробный вес — через ЗАПЯТУЮ: в русской типографике это десятичный
        // разделитель, и так же он пишется в рекордах и на карточках упражнений.
        const num = has ? (n % 1 === 0 ? String(n) : n.toFixed(1).replace('.', ',')) : null
        const colors = getMuscleGroupColors(f.muscle_group, isCustomExercise(f.exercise_id))
        const tag = exerciseTagLabel(f.muscle_group, f.sub_group)
        return (
          <div key={i} style={m.favRow}>
            <div style={m.thumb}>
              {f.preview_url
                ? <img src={f.preview_url} alt="" style={m.thumbImg} draggable={false} />
                : <ExercisePlaceholder size={24} />}
            </div>
            <div style={m.favContent}>
              <div style={m.favName}>{cap(f.name)}</div>
              {/* Тут любимые — витрина (и своя, и в чужом профиле), а не рабочий
                  список: длинный тег просто обрезается многоточием, прокатки по
                  тапу НЕТ. Тапать в профиле не по чему, и «живой» тег обещал бы
                  взаимодействие, которого здесь нет. */}
              {tag && (
                <MarqueeTag label={tag} background={colors.tag} style={m.favTag} />
              )}
            </div>
            {has && (
              // Тот же приём, что в «Рекордах»: число в строке с названием,
              // единица под ним, всё прижато к правому краю. Значения списка
              // встают ровным столбиком, а не пляшут вслед за длиной единицы.
              <span style={m.favVal}>
                {/* Вес — белым, как в дне тренировки; цвет группы несёт тег. */}
                <span style={m.favNum}>{num}</span>
                <span style={m.favUnit}>{f.counts_reps ? 'раз' : 'кг'}</span>
              </span>
            )}
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
  row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 'var(--space-6)' },
  rowTight: { gap: 'var(--space-3)' },
  tile: {
    minWidth: '92px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-15)',
    padding: 'var(--space-1) var(--space-2)', background: 'transparent', border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  tileIcon: { display: 'inline-flex', height: '22px' },
  tileTitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--color-text)' }
}

const m = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 10001,
    // Фон под модалкой заморожен НАГЛУХО: оверлей не прокручивается и гасит жест,
    // прокрутка живёт только внутри панели (см. panel).
    touchAction: 'none',
    overscrollBehavior: 'contain',
    padding: 'calc(env(safe-area-inset-top) + 24px) var(--space-5) calc(env(safe-area-inset-bottom) + 20px)',
    overflow: 'hidden',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  panel: {
    position: 'relative', width: '100%', maxWidth: '360px',
    // Длинный список прокручивается внутри панели, а не тянет за собой страницу.
    // Высота — по содержимому: у рекордов его больше, у любимых меньше, и
    // растягивать все разделы под один рост незачем. Предел 85% экрана, дальше
    // прокрутка внутри панели, а не «модалка во весь экран».
    maxHeight: 'min(100%, 85vh)', overflowY: 'auto', touchAction: 'pan-y', overscrollBehavior: 'contain',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-medium)',
    padding: 'var(--space-4)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  // Шапка колонкой: сверху иконки-переключатель, под ними — название активного.
  // Липкая: при прокрутке длинного раздела остаётся на месте, содержимое уходит
  // под неё. Отрицательные поля — чтобы стеклянная подложка перекрывала паддинги
  // панели во всю ширину, а не оставляла щель по краям.
  head: {
    // top отрицательный НЕ случайно: sticky липнет к padding-box, а у панели
    // сверху свои 16px. С `top: 0` в эту щель подтекал прокручиваемый контент —
    // строка списка выглядывала над шапкой. Смещение ровно на паддинг панели
    // сажает стеклянную подложку на её верхнюю кромку.
    position: 'sticky', top: 'calc(-1 * var(--space-4))', zIndex: 2,
    // Панель — флекс-колонка: без этого её дети сжимались бы под maxHeight
    // вместо того, чтобы включить прокрутку, и содержимое молча обрезалось.
    flexShrink: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
    margin: 'calc(-1 * var(--space-4)) calc(-1 * var(--space-4)) 0',
    padding: 'var(--space-4) var(--space-4) var(--space-2)',
    background: 'rgba(34, 34, 34, 0.94)',
    backdropFilter: 'var(--blur-glass)', WebkitBackdropFilter: 'var(--blur-glass)'
  },
  tabs: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' },
  tab: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '40px', height: '32px', padding: 0,
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    opacity: 0.45,
    transition: 'opacity 0.16s ease, background 0.16s ease'
  },
  // Активная — тот же залитый фон, что у активного таба внизу экрана.
  tabOn: { opacity: 1, background: 'var(--color-surface-active)' },
  headTitle: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' },
  // Обёртка с измеренной высотой — она и анимируется при смене раздела.
  bodyBox: { flexShrink: 0, overflow: 'hidden', transition: 'height 0.24s var(--ease-ios)' },
  // Содержимое раздела появляется тем же тихим движением, что группы в списках,
  // и гаснет обратно на время подмены.
  body: {
    animation: 'groupPillIn 0.22s var(--ease-ios) both',
    transition: `opacity ${FADE_MS}ms ease`
  },
  title: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700, color: 'var(--color-text)' },
  count: { fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-body-size)', color: 'var(--color-primary)' },

  favList: { display: 'flex', flexDirection: 'column' },
  favRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-1)' },
  thumb: {
    flexShrink: 0, width: '44px', height: '44px', borderRadius: 'var(--radius-small)', overflow: 'hidden',
    background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  // Название и тег — колонкой, чтобы тег встал второй строкой под именем.
  favContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' },
  favName: {
    maxWidth: '100%', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  // Форма пилюли — в MarqueeTag; здесь только приглушение.
  favTag: { alignSelf: 'flex-start', opacity: 0.7 },
  // Колонка значения — как в «Рекордах»: число сверху, единица под ним, оба по
  // правому краю. Ширина фиксирована, чтобы название не пляcало от строки к строке.
  favVal: {
    flexShrink: 0, width: '52px',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px'
  },
  favNum: {
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-button-size)',
    lineHeight: 1.2, color: 'var(--color-text)', whiteSpace: 'nowrap'
  },
  favUnit: {
    fontFamily: 'var(--font-manrope)', fontWeight: 500, fontSize: 'var(--text-caption-size)',
    lineHeight: 1.2, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  }
}
