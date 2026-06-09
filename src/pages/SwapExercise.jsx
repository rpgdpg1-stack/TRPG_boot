import { useEffect, useState } from 'react'
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

  // ВАЖНО: сбрасываем скролл в начало при каждом открытии страницы.
  // Без этого Telegram webview может восстановить позицию скролла из
  // прошлой сессии, и юзер увидит заголовок ушедшим наверх под кнопки.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    // При нажатии "Назад" — возвращаемся на день, передаём order_num карточки
    // с которой пришли, но БЕЗ флага wasSwapped. Это нужно WorkoutDay чтобы
    // проскроллить к нужной карточке и сделать лёгкий press-эффект — без
    // зелёной анимации (она только при реальной смене).
    backButton.setHandler(() => {
      navigate(`/workout/${programId}/${day}`, {
        state: {
          returnedFromOrderNum: parseInt(orderNum, 10),
          wasSwapped: false,
          // Прокидываем scrollY обратно. WorkoutDay восстановит ровно ту
          // позицию страницы, с которой юзер ушёл на смену упражнения.
          scrollY: location.state?.scrollY
        }
      })
    })
    lockVerticalSwipes()
    // location.state?.scrollY намеренно вне зависимостей: обработчик ставится
    // один раз при маунте, scrollY читается на этот момент и не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, programId, day, orderNum])

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
      const ok = await saveExerciseSwap(programId, day, parseInt(orderNum, 10), selectedId)
      if (ok) {
        haptic.success()
        // Передаём в state информацию для WorkoutDay:
        //   returnedFromOrderNum — к какой карточке проскроллить
        //   wasSwapped: true — играть анимацию "стрелки змейкой" + press + glow
        //   scrollY — восстановить позицию страницы откуда ушёл
        navigate(`/workout/${programId}/${day}`, {
          state: {
            returnedFromOrderNum: parseInt(orderNum, 10),
            wasSwapped: true,
            scrollY: location.state?.scrollY
          }
        })
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

      {/* Единый sticky-блок: шапка + ТЕКУЩЕЕ + заголовок АЛЬТЕРНАТИВЫ */}
      <div style={styles.stickyTop}>

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

      {/* Скроллящийся список альтернатив. paddingTop даёт зазор от
          заголовка АЛЬТЕРНАТИВЫ (он в sticky-блоке) до первой карточки. */}
      <div style={styles.alternativesList}>
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
        <div style={rowStyles.nameRow}>
          <div style={rowStyles.name}>{exercise.name}</div>
          {isDefault && (
            <span style={rowStyles.defaultBadge}>ОТ ПРОГРАММЫ</span>
          )}
        </div>

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
  // Страница: горизонтальные отступы, paddingBottom — под fixed кнопку "СМЕНИТЬ"
  page: {
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: '140px',
    minHeight: '100dvh'
  },
  // Единый sticky-блок. Растянут на всю ширину поверх горизонтального
  // padding'а страницы (margin -16px + padding 16px). Фон --color-bg
  // непрозрачный — карточки альтернатив при скролле уезжают под него.
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
  // Список альтернатив. paddingTop: 16px — зазор между заголовком
  // "АЛЬТЕРНАТИВЫ" (в sticky-блоке) и первой карточкой.
  alternativesList: {
    paddingTop: '16px'
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