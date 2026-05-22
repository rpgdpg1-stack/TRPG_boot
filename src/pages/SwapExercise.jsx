import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getExercisesForSubgroup, saveExerciseSwap, getExerciseById } from '../features/exercises/api'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'

/**
 * Полноэкранная страница замены упражнения.
 *
 * URL: /swap/:programId/:day/:orderNum
 * State: { subGroup, type, currentExerciseId, currentExerciseName, defaultExerciseId, muscleGroup }
 *
 * АРХИТЕКТУРА:
 *
 * К верху экрана прилипает ЕДИНЫЙ закреплённый блок (stickyTop):
 *   1. Шапка "СМЕНИТЬ УПРАЖНЕНИЕ" + подзаголовок
 *   2. Заголовок "ТЕКУЩЕЕ" + карточка текущего упражнения
 *   3. Заголовок "АЛЬТЕРНАТИВЫ (N)"
 *
 * Под ним — скроллящийся список альтернатив.
 *
 * Из-за того что у stickyTop отрицательные marginLeft/Right (растягиваем на
 * всю ширину поверх горизонтального padding страницы), следующий элемент
 * в потоке (alternativesList) при первом рендере мог визуально оказаться
 * частично под sticky-блоком — первая карточка обрезалась сверху, юзеру
 * приходилось скроллить чтобы её увидеть.
 *
 * РЕШЕНИЕ: измеряем реальную высоту stickyTop через ResizeObserver и
 * проставляем её как paddingTop у alternativesList. Так первая карточка
 * всегда оказывается ниже sticky-блока ровно на его высоту + небольшой
 * зазор. Работает И при малом контенте (нет скролла), И при большом.
 *
 * Блок "ТЕКУЩЕЕ" рендерится мгновенно из state (currentForRender),
 * не ждёт ответа БД.
 */
export default function SwapExercise() {
  const { programId, day, orderNum } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const stateData = location.state || {}
  const {
    subGroup,
    type,
    currentExerciseId,
    currentExerciseName,
    defaultExerciseId,
    muscleGroup
  } = stateData

  const [allExercises, setAllExercises] = useState([])
  const [currentExercise, setCurrentExercise] = useState(null)
  const [selectedId, setSelectedId] = useState(currentExerciseId || null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Реф и измеренная высота закреплённой шапки.
  // Используется для отступа alternativesList — гарантия что первая карточка
  // не окажется под sticky-блоком при первом открытии страницы.
  const stickyRef = useRef(null)
  const [stickyHeight, setStickyHeight] = useState(0)

  useEffect(() => {
    backButton.setHandler(() => navigate(`/workout/${programId}/${day}`))
    lockVerticalSwipes()
  }, [navigate, programId, day])

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

  // Меряем высоту sticky-блока. ResizeObserver сработает и на маунте,
  // и при ресайзе (поворот экрана, изменение safe-area).
  // Перезамеряем когда меняются данные внутри блока — название текущего
  // упражнения может быть длинным и переноситься на 2 строки, что меняет высоту.
  useEffect(() => {
    const el = stickyRef.current
    if (!el) return

    const update = () => setStickyHeight(el.offsetHeight)
    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [currentExercise, currentExerciseName, loading])

  const handleSelect = (exerciseId) => {
    haptic.light()
    setSelectedId(exerciseId)
  }

  const handleConfirm = async () => {
    if (!selectedId || selectedId === currentExerciseId) return
    if (saving) return

    setSaving(true)
    try {
      const ok = await saveExerciseSwap(programId, day, parseInt(orderNum, 10), selectedId)
      if (ok) {
        haptic.success()
        navigate(`/workout/${programId}/${day}`)
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

  const alternatives = allExercises.filter(e => e.id !== currentExerciseId)

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
    preview_url: null,
    meta_info: null
  } : null)

  return (
    <div style={styles.page}>

      {/* Единый sticky-блок: шапка + ТЕКУЩЕЕ + заголовок АЛЬТЕРНАТИВЫ.
          Измеряется через stickyRef для расчёта отступа списка. */}
      <div ref={stickyRef} style={styles.stickyTop}>

        <header style={styles.header}>
          <h1 style={styles.title}>СМЕНИТЬ УПРАЖНЕНИЕ</h1>
          <div style={styles.subtitle}>Похожие на текущее</div>
        </header>

        {currentForRender && (
          <div style={styles.currentBlock}>
            <div style={styles.sectionLabel}>ТЕКУЩЕЕ</div>
            <ExerciseRow
              exercise={currentForRender}
              muscleGroup={muscleGroup}
              isSelected={selectedId === currentForRender.id}
              isCurrent={true}
              isDefault={false}
              onTap={() => handleSelect(currentForRender.id)}
            />
          </div>
        )}

        <div style={styles.alternativesHeader}>
          АЛЬТЕРНАТИВЫ {!loading && alternatives.length > 0 && `(${alternatives.length})`}
        </div>
      </div>

      {/* Скроллящаяся часть. paddingTop задаём через инлайн стиль,
          равный высоте sticky-блока + 12px зазор. Гарантия что первая
          карточка всегда видна сразу после sticky, не под ней. */}
      <div style={{
        ...styles.alternativesList,
        paddingTop: stickyHeight ? `${stickyHeight + 12}px` : '300px'
      }}>
        {loading ? (
          <div style={styles.loading}>Загрузка...</div>
        ) : alternatives.length === 0 ? (
          <div style={styles.empty}>
            Альтернатив для этой подгруппы пока нет
          </div>
        ) : (
          <div style={styles.altList}>
            {alternatives.map(ex => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                muscleGroup={muscleGroup}
                isSelected={selectedId === ex.id}
                isCurrent={false}
                isDefault={shouldHighlightDefault && ex.id === defaultExerciseId}
                onTap={() => handleSelect(ex.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div style={styles.bottomBar}>
        <button
          onClick={handleConfirm}
          disabled={!selectedId || selectedId === currentExerciseId || saving || loading}
          style={{
            ...styles.confirmButton,
            opacity: (!selectedId || selectedId === currentExerciseId || saving || loading) ? 0.4 : 1,
            cursor: (!selectedId || selectedId === currentExerciseId || saving || loading) ? 'default' : 'pointer'
          }}
        >
          {saving ? 'Сохранение...' : 'СМЕНИТЬ'}
        </button>
      </div>
    </div>
  )
}

/**
 * Карточка упражнения в списке.
 *
 * В НОВОМ ДИЗАЙНЕ (как в ExerciseCard и ExerciseActionMenu):
 *  - сверху название упражнения
 *  - ниже ряд тегов: цветной тег группы мышц + серый тег подгруппы
 *  - снизу серая подпись подходов (meta_info)
 *  - справа radio-кружок для выбора
 *
 * isCurrent — это текущее выбранное упражнение в блоке "ТЕКУЩЕЕ"
 * isDefault — это рекомендованное программой (зелёная обводка + бейдж "ОТ ПРОГРАММЫ")
 * isSelected — на нём сейчас стоит радио-точка (юзер выбрал)
 *
 * muscleGroup приходит снаружи (со страницы тренировки), а не из самого
 * exercise — потому что в выдаче getExercisesForSubgroup у объектов нет
 * поля muscle_group (есть только sub_group и type). Подгруппа однозначно
 * определяет группу, поэтому передаём её один раз для всей страницы.
 */
function ExerciseRow({ exercise, muscleGroup, isSelected, isCurrent, isDefault, onTap }) {
  let borderColor = 'transparent'
  if (isSelected) {
    borderColor = 'var(--color-primary)'
  } else if (isDefault) {
    borderColor = 'rgba(158, 209, 83, 0.55)'
  }

  let background = 'var(--color-card)'
  if (isSelected) {
    background = 'rgba(158, 209, 83, 0.10)'
  } else if (isCurrent) {
    background = 'rgba(255, 255, 255, 0.04)'
  } else if (isDefault) {
    background = 'rgba(158, 209, 83, 0.05)'
  }

  // Цвета и подписи тегов — те же что в большой карточке
  const colors = getMuscleGroupColors(muscleGroup)
  const groupLabel = toTitleCase(MUSCLE_GROUP_LABELS[muscleGroup] || (muscleGroup || ''))
  const subGroupLabel = toTitleCase(SUB_GROUP_LABELS[exercise.sub_group] || (exercise.sub_group || ''))

  return (
    <button onClick={onTap} className="press-tile" style={{
      ...rowStyles.row,
      borderColor,
      background
    }}>
      <div style={rowStyles.preview}>
        {exercise.preview_url ? (
          <img src={exercise.preview_url} alt="" style={rowStyles.previewImg} />
        ) : (
          <div style={rowStyles.previewPlaceholder}>💪</div>
        )}
      </div>

      <div style={rowStyles.content}>
        {/* 1. Название + бейдж "ОТ ПРОГРАММЫ" если применимо */}
        <div style={rowStyles.nameRow}>
          <div style={rowStyles.name}>{exercise.name}</div>
          {isDefault && (
            <span style={rowStyles.defaultBadge}>ОТ ПРОГРАММЫ</span>
          )}
        </div>

        {/* 2. Теги: цветной (группа) + серый (подгруппа) */}
        <div style={rowStyles.tagsRow}>
          {groupLabel && (
            <span style={{ ...rowStyles.tag, background: colors.tag, color: '#FFFFFF' }}>
              {groupLabel}
            </span>
          )}
          {subGroupLabel && (
            <span style={{ ...rowStyles.tag, ...rowStyles.tagSecondary }}>
              {subGroupLabel}
            </span>
          )}
        </div>

        {/* 3. Подходы — снизу серой подписью */}
        {exercise.meta_info && (
          <div style={rowStyles.meta}>{exercise.meta_info}</div>
        )}
      </div>

      <div style={rowStyles.radio}>
        <div style={{
          ...rowStyles.radioOuter,
          borderColor: isSelected ? 'var(--color-primary)' : 'rgba(255,255,255,0.25)'
        }}>
          {isSelected && <div style={rowStyles.radioInner} />}
        </div>
      </div>
    </button>
  )
}

function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

const styles = {
  // Страница: горизонтальные отступы, paddingBottom — под фиксированную кнопку "СМЕНИТЬ".
  // paddingTop НЕ ставим — он внутри sticky-блока.
  page: {
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: '140px',
    minHeight: '100dvh'
  },
  // ЕДИНЫЙ sticky-блок: шапка + ТЕКУЩЕЕ + заголовок АЛЬТЕРНАТИВЫ.
  // Растянут на всю ширину поверх горизонтального padding страницы
  // (margin -16px + padding 16px). Фон --color-bg непрозрачный.
  stickyTop: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'var(--color-bg)',
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: '12px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  header: {
    marginBottom: '20px',
    textAlign: 'center'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '24px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1,
    marginBottom: '6px'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  },
  currentBlock: {
    marginBottom: '16px'
  },
  sectionLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '8px',
    paddingLeft: '4px'
  },
  alternativesHeader: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    paddingLeft: '4px'
  },
  // Список альтернатив. paddingTop задаётся ИНЛАЙН (см. JSX выше) —
  // равен высоте stickyTop + зазор. Это то что физически опускает
  // первую карточку ниже sticky-блока, чтобы она не пряталась под ним
  // при первом открытии страницы.
  //
  // Растягиваем на всю ширину тем же приёмом что и stickyTop — иначе
  // ширины блоков рассинхронизированы и карточки могут визуально обрезаться.
  alternativesList: {
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  altList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  loading: {
    textAlign: 'center',
    padding: '24px 20px',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px'
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 'var(--radius-card)'
  },
  errorBlock: {
    padding: '40px 20px',
    paddingTop: 'calc(var(--tg-safe-top) + 40px)',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  },
  bottomBar: {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    padding: '24px 16px 20px',
    background: 'linear-gradient(180deg, rgba(13, 12, 12, 0) 0%, rgba(13, 12, 12, 0.85) 30%, var(--color-bg) 70%)',
    zIndex: 50,
    pointerEvents: 'none'
  },
  confirmButton: {
    width: '100%',
    padding: '16px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: '16px',
    border: 'none',
    pointerEvents: 'auto',
    transition: 'opacity 0.2s ease, transform 0.1s ease',
    boxShadow: '0 4px 20px rgba(158, 209, 83, 0.3)'
  }
}

const rowStyles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'var(--color-card)',
    border: '2px solid transparent',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '90px',
    textAlign: 'left',
    transition: 'background 0.2s ease, border-color 0.2s ease'
  },
  preview: {
    flexShrink: 0,
    width: '64px',
    height: '64px',
    borderRadius: '14px',
    overflow: 'hidden',
    background: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewPlaceholder: { fontSize: '28px', opacity: 0.4 },
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap'
  },
  name: {
    fontFamily: 'var(--font-geist)',
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: '16px',
    color: 'var(--color-text)'
  },
  defaultBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-primary)',
    background: 'rgba(158, 209, 83, 0.15)',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '1px',
    whiteSpace: 'nowrap'
  },
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '5px',
    flexWrap: 'wrap'
  },
  tag: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.2px',
    lineHeight: '13px',
    whiteSpace: 'nowrap'
  },
  tagSecondary: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#A0A0A0',
    fontWeight: 600
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.03em',
    color: '#888888',
    lineHeight: '13px'
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