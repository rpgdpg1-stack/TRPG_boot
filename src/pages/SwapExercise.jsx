import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import ActionButton from '../components/ActionButton'
import ScreenTitle from '../components/ScreenTitle'
import { getExercisesForSubgroup, saveExerciseSwap, getExerciseById } from '../features/exercises/api'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS, titleCase } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { SectionLabel } from '../components/GroupLabel'
import ExercisePlaceholder from '../components/ExercisePlaceholder'
import EmptyState from '../components/EmptyState'
import { goal, GOALS } from '../lib/metrika'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Экран замены упражнения.
 *
 * АРХИТЕКТУРА:
 *
 * К верху прилипает ЕДИНЫЙ sticky-блок:
 *   - Шапка "СМЕНИТЬ УПРАЖНЕНИЕ"
 *   - Блок "ТЕКУЩЕЕ" с карточкой
 *   - Заголовок "АЛЬТЕРНАТИВЫ (N)"
 *
 * Ниже него скроллящийся список альтернативных карточек.
 *
 * ВАЖНО про автоскролл:
 * Раньше на разных открытиях страница вела себя по-разному — иногда
 * заголовок "СМЕНИТЬ УПРАЖНЕНИЕ" уезжал под системные кнопки Telegram.
 * Причина — браузер/Telegram webview восстанавливал позицию скролла из
 * предыдущей сессии. Лечится: window.scrollTo(0, 0) при маунте страницы.
 *
 * Блок "ТЕКУЩЕЕ" рендерится мгновенно из state (currentForRender),
 * не ждёт ответа БД.
 *
 * Сам экран — без привязки к маршруту. Живёт в двух местах:
 *  - страница `/swap/...` дня тренировки (обёртка `SwapExercise` ниже) — замена
 *    сохраняется в аккаунт;
 *  - поверх конструктора программы (`embedded`) — ничего не сохраняет, просто
 *    отдаёт выбранный id: черновик конструктора при этом жив, на другой маршрут
 *    мы не уходим.
 *
 * @param defaultExerciseId — «от программы»; в конструкторе не передаётся, бейджа нет.
 * @param excludeIds — Set id, которых в альтернативах быть не должно (уже в дне).
 * @param onConfirm — async (id) => bool: сохранить. false → ошибка на экране.
 * @param onSwapped — (id) => void: после удачного сохранения.
 * @param onBack — «Назад» Telegram.
 */
export function SwapExerciseView({
  subGroup, type, currentExerciseId, currentExerciseName, defaultExerciseId, muscleGroup,
  excludeIds, onConfirm, onSwapped, onBack, embedded = false
}) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)

  const [allExercises, setAllExercises] = useState([])
  const [currentExercise, setCurrentExercise] = useState(null)
  const [selectedId, setSelectedId] = useState(currentExerciseId || null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ВАЖНО: сбрасываем скролл в начало при каждом открытии страницы.
  // Без этого Telegram webview может восстановить позицию скролла из
  // прошлой сессии, и юзер увидит заголовок ушедшим наверх под кнопки.
  useEffect(() => {
    if (!embedded) window.scrollTo(0, 0)
  }, [embedded])

  // Таб-бара на /swap нет, а кнопка «Сменить» прибита к низу со своим
  // градиентом — глобальный нижний скрим (.app::after) тут лишний. Гасим.
  // Поверх конструктора класс уже висит — его снимет сам конструктор. Снимать
  // здесь нельзя: при закрытии замены скрим вернулся бы на конструктор.
  useEffect(() => {
    if (embedded) return
    document.body.classList.add('hide-app-scrim')
    return () => document.body.classList.remove('hide-app-scrim')
  }, [embedded])

  // «Назад» — решает хозяин экрана (страница дня или конструктор). Через ref:
  // обработчик ставится один раз, а функция у хозяина новая на каждый рендер.
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    backButton.setHandler(() => onBackRef.current?.())
    lockVerticalSwipes()
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!subGroup || !type) {
        setLoading(false)
        return
      }

      try {
        const [alternatives, currentEx] = await Promise.all([
          getExercisesForSubgroup(subGroup, type),
          currentExerciseId ? getExerciseById(currentExerciseId) : Promise.resolve(null)
        ])

        if (cancelled) return

        const sorted = (alternatives || []).slice().sort((a, b) => {
          if (defaultExerciseId && defaultExerciseId !== currentExerciseId) {
            if (a.id === defaultExerciseId) return -1
            if (b.id === defaultExerciseId) return 1
          }
          const pa = a.priority ?? 99
          const pb = b.priority ?? 99
          if (pa !== pb) return pa - pb
          return (a.name || '').localeCompare(b.name || '')
        })

        setAllExercises(sorted)
        setCurrentExercise(currentEx)
        setLoading(false)
      } catch (e) {
        console.error('[SwapExercise] load error:', e)
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [subGroup, type, currentExerciseId, currentExerciseName, defaultExerciseId])

  const handleSelect = (exerciseId) => {
    haptic.light()
    setSelectedId(exerciseId)
  }

  const handleConfirm = async () => {
    if (!selectedId || selectedId === currentExerciseId) return
    if (saving) return

    setSaving(true)
    try {
      const ok = await onConfirm(selectedId)
      if (ok) {
        haptic.success()
        onSwapped?.(selectedId)
      } else {
        haptic.error()
        setSaving(false)
        window.alert('Не удалось сохранить замену. Проверь подключение.')
      }
    } catch (e) {
      console.error('[SwapExercise] save error:', e)
      haptic.error()
      setSaving(false)
    }
  }

  const alternatives = allExercises.filter(e => e.id !== currentExerciseId && !excludeIds?.has(e.id))

  const shouldHighlightDefault = !!(
    defaultExerciseId &&
    defaultExerciseId !== currentExerciseId
  )

  if (!subGroup || !type) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBlock}>
          Открой замену через карточку упражнения<br />
          (долгое нажатие → Сменить)
        </div>
      </div>
    )
  }

  // Объект "текущего упражнения" для отрисовки. Если БД ещё не ответила —
  // собираем из state со страницы тренировки, чтобы карточка появилась
  // мгновенно. Когда придёт ответ — заменим на полный объект.
  const currentForRender = currentExercise || (currentExerciseId ? {
    id: currentExerciseId,
    name: currentExerciseName || '—',
    sub_group: subGroup,
    preview_url: null
  } : null)

  // Менять есть на что только когда выбрана ДРУГАЯ альтернатива.
  const canSwap = !!selectedId && selectedId !== currentExerciseId

  const screen = (
    <div style={{ ...styles.page, ...(embedded ? styles.pageEmbedded : null) }}>

      {/* Единый sticky-блок: шапка + ТЕКУЩЕЕ + заголовок АЛЬТЕРНАТИВЫ */}
      <div style={styles.stickyTop}>

        <header style={styles.header}>
          <ScreenTitle zIndex={embedded ? 101 : undefined}>Сменить упражнение</ScreenTitle>
          <div style={styles.subtitle}>Похожие на текущее</div>
        </header>

        {currentForRender && (
          <div style={styles.currentBlock}>
            <SectionLabel caps>ТЕКУЩЕЕ</SectionLabel>
            <ExerciseRow
              exercise={currentForRender}
              muscleGroup={muscleGroup}
              isSelected={selectedId === currentForRender.id}
              isDefault={false}
              onTap={() => handleSelect(currentForRender.id)}
            />
          </div>
        )}

        <div style={styles.alternativesHeader}>
          АЛЬТЕРНАТИВЫ {!loading && alternatives.length > 0 && `(${alternatives.length})`}
        </div>
      </div>

      {/* Скроллящийся список альтернатив. paddingTop даёт зазор от
          заголовка АЛЬТЕРНАТИВЫ (он в sticky-блоке) до первой карточки. */}
      <div style={styles.alternativesList}>
        {loading ? (
          <div style={styles.loading}>Загрузка...</div>
        ) : alternatives.length === 0 ? (
          <div style={styles.empty}>
            <EmptyState
              icon="change"
              title="Альтернатив пока нет"
              hint="Для этой подгруппы мышц в каталоге ещё нет замен. Мы их добавляем."
            />
          </div>
        ) : (
          <div style={styles.altList}>
            {alternatives.map(ex => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                muscleGroup={muscleGroup}
                isSelected={selectedId === ex.id}
                isDefault={shouldHighlightDefault && ex.id === defaultExerciseId}
                onTap={() => handleSelect(ex.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div style={styles.bottomBar}>
        <div className="dock-scrim" />
        {/* Пока альтернатива не выбрана — тихая серая рамка с зелёным текстом;
            выбрал — кнопка заливается акцентом (готова к действию). */}
        <ActionButton
          onClick={handleConfirm}
          disabled={!canSwap || saving || loading}
          variant={canSwap ? 'accent' : 'neutral'}
          bordered={!canSwap || saving || loading}
          hug
          style={{ fontSize: 'var(--text-body-size)' }}
        >
          {saving ? 'Сохранение…' : 'Сменить'}
        </ActionButton>
      </div>
    </div>
  )

  // Поверх конструктора — свой прокручиваемый слой (как у пикера): страница под
  // ним стоит на месте, sticky-шапка липнет к верху этого слоя.
  // Прокручивается ВНУТРЕННИЙ слой, а не сам оверлей: useScrollLock ищет
  // прокручиваемого предка только внутри оверлея — сам оверлей он не проверяет и
  // гасил бы любой жест. Отсюда же уезжавшая шапка «Текущее», которую не достать.
  //
  // Портал в body ОБЯЗАТЕЛЕН (как у пикера): страница конструктора живёт в
  // анимированном контейнере с transform, и без портала z-index оверлея не
  // выходил из него — док «Сохранить» (он в body) оказывался ПОВЕРХ замены.
  // Тап по «Сменить» попадал в «Сохранить»: сохранялась старая программа и
  // конструктор закрывался.
  if (!embedded) return screen
  return createPortal(
    <div ref={overlayRef} style={styles.overlay}>
      <div style={styles.scroller}>{screen}</div>
    </div>,
    document.body
  )
}

/**
 * Страница замены в дне тренировки: `/swap/:programId/:day/:orderNum`.
 * State: { subGroup, type, currentExerciseId, currentExerciseName, defaultExerciseId, muscleGroup, place, scrollY }
 */
export default function SwapExercise() {
  const { programId, day, orderNum } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const st = location.state || {}
  const place = st.place || 'gym'

  // Назад в день: order_num карточки и позиция скролла — WorkoutDay проскроллит к
  // ней и подсветит; wasSwapped включает «змейку» (только при реальной смене).
  const backToDay = (wasSwapped) => navigate(`/workout/${programId}/${day}`, {
    state: { returnedFromOrderNum: parseInt(orderNum, 10), wasSwapped, scrollY: st.scrollY }
  })

  return (
    <SwapExerciseView
      subGroup={st.subGroup}
      type={st.type}
      currentExerciseId={st.currentExerciseId}
      currentExerciseName={st.currentExerciseName}
      defaultExerciseId={st.defaultExerciseId}
      muscleGroup={st.muscleGroup}
      onBack={() => backToDay(false)}
      onConfirm={(id) => saveExerciseSwap(programId, day, parseInt(orderNum, 10), id, place)}
      onSwapped={() => { goal(GOALS.EXERCISE_SWAP, { program: programId, place }); backToDay(true) }}
    />
  )
}

function ExerciseRow({ exercise, muscleGroup, isSelected, isDefault, onTap }) {
  // Заливки ровно ДВЕ: выбранная строка — светло-серая «закреплённая»
  // (`--surface-pinned`, тот же цвет, что у закреплённой программы на главной),
  // все остальные — обычная карточка. Зелёных обводок нет: выбор показывает
  // точка радио справа. «От программы» ничем не залито — у него бейдж в углу.
  const background = isSelected ? 'var(--surface-pinned)' : 'var(--color-card)'

  const colors = getMuscleGroupColors(muscleGroup)
  // Один тег — подгруппа, в цвете основной группы (имя группы тут не дублируем).
  const tagLabel = titleCase(
    SUB_GROUP_LABELS[exercise.sub_group] || exercise.sub_group ||
    MUSCLE_GROUP_LABELS[muscleGroup] || muscleGroup || ''
  )

  return (
    <button onClick={onTap} className="press-tile" style={{ ...rowStyles.row, background }}>
      {/* Бейдж «от программы» — над кружком радио: правый край вровень с кружком,
          по высоте посередине между верхом строки и верхом кружка. */}
      {isDefault && <span style={rowStyles.defaultBadge}>ОТ ПРОГРАММЫ</span>}

      <div style={rowStyles.preview}>
        {exercise.preview_url ? (
          <img src={exercise.preview_url} alt="" style={rowStyles.previewImg} />
        ) : (
          <ExercisePlaceholder size={24} />
        )}
      </div>

      <div style={rowStyles.content}>
        <div style={rowStyles.nameRow}>
          {/* Название не заезжает под угловой бейдж — держим для него полосу. */}
          <div style={{ ...rowStyles.name, ...(isDefault ? rowStyles.nameWithBadge : null) }}>
            {exercise.name}
          </div>
        </div>

        <div style={rowStyles.tagsRow}>
          {tagLabel && (
            <span style={{ ...rowStyles.tag, background: colors.tag, color: 'var(--color-text)', opacity: 0.7 }}>
              {tagLabel}
            </span>
          )}
        </div>

      </div>

      <div style={rowStyles.radio}>
        <div style={{
          ...rowStyles.radioOuter,
          borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-control)'
        }}>
          {isSelected && <div style={rowStyles.radioInner} />}
        </div>
      </div>
    </button>
  )
}

const styles = {
  // Страница: горизонтальные отступы, paddingBottom — под fixed кнопку "СМЕНИТЬ".
  // marginBottom гасит таб-баровский padding-bottom у .app (тут таб-бара нет) —
  // иначе под списком копится двойной отступ + лишний скролл, когда альтернатив
  // мало. Без min-height:100dvh страница ровно по контенту: мало карточек → не
  // скроллится; много → у низа фикс-зазор (paddingBottom) и нормальный overscroll.
  page: {
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)',
    paddingBottom: '100px',
    marginBottom: 'calc(-1 * (var(--tabbar-height) + var(--tabbar-bottom) + 60px))'
  },
  // Поверх конструктора таб-бара нет и прятать нечего — отрицательный отступ не нужен.
  pageEmbedded: { marginBottom: 0 },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'var(--color-bg)',
    overflow: 'hidden'
  },
  scroller: { height: '100%', overflowY: 'auto', overscrollBehavior: 'contain' },
  // Единый sticky-блок. Растянут на всю ширину поверх горизонтального
  // padding'а страницы (margin -16px + padding 16px). Фон --color-bg
  // непрозрачный — карточки альтернатив при скролле уезжают под него.
  stickyTop: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'var(--color-bg)',
    // Верх шапки — ровно 16px ниже кнопок Telegram (зашито в var).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: 'var(--space-3)',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)'
  },
  header: {
    marginBottom: 'var(--space-5)',
    textAlign: 'center'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  },
  currentBlock: {
    marginBottom: 'var(--space-4)'
  },
  alternativesHeader: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    paddingLeft: 'var(--space-1)'
  },
  // Список альтернатив. paddingTop: 16px — зазор между заголовком
  // "АЛЬТЕРНАТИВЫ" (в sticky-блоке) и первой карточкой.
  alternativesList: {
    paddingTop: 'var(--space-4)'
  },
  altList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)'
  },
  loading: {
    textAlign: 'center',
    padding: 'var(--space-6) var(--space-5)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)'
  },
  empty: {
    padding: 'var(--space-5)',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    background: 'var(--layer-faint)',
    borderRadius: 'var(--radius-card)'
  },
  errorBlock: {
    padding: 'var(--space-10) var(--space-5)',
    paddingTop: 'calc(var(--tg-safe-top) + 40px)',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  },
  // Футер — как в пикере (отступы от края + градиент-подложка).
  bottomBar: {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    display: 'flex',
    justifyContent: 'center',
    padding: 'var(--space-12) var(--space-4) var(--tabbar-bottom)',
    zIndex: 50,
    pointerEvents: 'none'
  },
}

// Полоса, которую название освобождает под угловой бейдж «ОТ ПРОГРАММЫ»
// (ширина самой надписи + зазор). Токена под это нет — величину диктует текст.
const BADGE_GUTTER = '88px'

const rowStyles = {
  row: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    background: 'var(--color-card)',
    border: 'none',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '90px',
    textAlign: 'left',
    transition: 'background 0.2s ease'
  },
  preview: {
    flexShrink: 0,
    width: '64px',
    height: '64px',
    borderRadius: 'var(--radius-medium)',
    overflow: 'hidden',
    background: 'var(--color-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap'
  },
  name: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    lineHeight: '16px',
    color: 'var(--color-text)'
  },
  // Полоса под угловой бейдж: он абсолютный и текста не расталкивает.
  nameWithBadge: { paddingRight: BADGE_GUTTER },
  // Раньше бейдж стоял на 16px от верха и налезал на кружок радио. Теперь:
  //  - справа — вровень с кружком: поле строки (12) + 2px, на которые кружок 20
  //    уже своей 24-пиксельной ячейки;
  //  - по высоте — центр посередине между верхом строки и верхом кружка. Кружок
  //    стоит по центру строки, его верх = 50% − 10px, середина до него =
  //    (50% − 10px) / 2. Проценты — от высоты строки, поэтому бейдж держит
  //    середину и у высоких строк с длинным названием.
  defaultBadge: {
    position: 'absolute',
    top: 'calc(25% - 5px)',
    right: 'calc(var(--space-3) + 2px)',
    transform: 'translateY(-50%)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '9px',
    lineHeight: '11px',
    color: 'var(--color-primary)',
    background: 'var(--accent-soft)',
    padding: '2px var(--space-15)',
    borderRadius: 'var(--radius-pill)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap'
  },
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 'var(--space-1)',
    flexWrap: 'wrap'
  },
  tag: {
    display: 'inline-block',
    padding: 'var(--space-05) var(--space-2)',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 700,
    letterSpacing: '0.2px',
    lineHeight: '13px',
    whiteSpace: 'nowrap'
  },
  radio: {
    flexShrink: 0,
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioOuter: {
    width: '20px',
    height: '20px',
    border: '2px solid',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'border-color 0.2s ease'
  },
  radioInner: {
    width: '10px',
    height: '10px',
    background: 'var(--color-primary)',
    borderRadius: '50%',
    boxShadow: '0 0 6px var(--color-primary)'
  }
}