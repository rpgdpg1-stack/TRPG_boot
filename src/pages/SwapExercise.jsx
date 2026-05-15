import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getExercisesForSubgroup, saveExerciseSwap, getExerciseById } from '../features/exercises/api'

/**
 * Полноэкранная страница замены упражнения.
 *
 * URL: /swap/:programId/:day/:orderNum
 * State: { subGroup, type, currentExerciseId, currentExerciseName, defaultExerciseId }
 *
 * defaultExerciseId — это упражнение которое заложено в программу для этого
 * слота. Если оно отличается от текущего (юзер свапнул на что-то своё),
 * на этой странице мы подсветим его зелёной обводкой + бейджем "ОТ ПРОГРАММЫ"
 * и поставим первым в списке альтернатив, чтобы было легко вернуться к базовому.
 */
export default function SwapExercise() {
  const { programId, day, orderNum } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const stateData = location.state || {}
  const { subGroup, type, currentExerciseId, currentExerciseName, defaultExerciseId } = stateData

  const [allExercises, setAllExercises] = useState([])
  const [currentExercise, setCurrentExercise] = useState(null)
  const [selectedId, setSelectedId] = useState(currentExerciseId || null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

        // Сортировка: сначала default (рекомендованное от программы) если оно
        // в этой подгруппе и не совпадает с текущим, потом всё остальное по priority.
        const sorted = (alternatives || []).slice().sort((a, b) => {
          // Если есть defaultExerciseId и он не равен текущему — пин его наверх
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
        setCurrentExercise(currentEx || { id: currentExerciseId, name: currentExerciseName || '—' })
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

  // Показываем "ОТ ПРОГРАММЫ" только если default действительно отличается
  // от текущего. Если юзер ничего не менял (current == default) — рекомендованное
  // и есть текущее, бейджу негде быть.
  const shouldHighlightDefault = !!(
    defaultExerciseId &&
    defaultExerciseId !== currentExerciseId
  )

  if (!subGroup || !type) {
    return (
      <div className="page page-enter" style={styles.page}>
        <div style={styles.errorBlock}>
          Открой замену через карточку упражнения<br />
          (долгое нажатие → Сменить)
        </div>
      </div>
    )
  }

  return (
    <div className="page page-enter" style={styles.page}>

      <header style={styles.header}>
        <h1 style={styles.title}>СМЕНИТЬ УПРАЖНЕНИЕ</h1>
        <div style={styles.subtitle}>Похожие на текущее</div>
      </header>

      {loading && (
        <div style={styles.loading}>Загрузка...</div>
      )}

      {!loading && currentExercise && (
        <>
          <div style={styles.currentBlock}>
            <div style={styles.sectionLabel}>ТЕКУЩЕЕ</div>
            <ExerciseRow
              exercise={currentExercise}
              isSelected={selectedId === currentExercise.id}
              isCurrent={true}
              isDefault={false}
              onTap={() => handleSelect(currentExercise.id)}
            />
          </div>

          <div style={styles.alternativesBlock}>
            <div style={styles.sectionLabel}>
              АЛЬТЕРНАТИВЫ {alternatives.length > 0 && `(${alternatives.length})`}
            </div>

            {alternatives.length === 0 ? (
              <div style={styles.empty}>
                Альтернатив для этой подгруппы пока нет
              </div>
            ) : (
              <div style={styles.altList}>
                {alternatives.map(ex => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    isSelected={selectedId === ex.id}
                    isCurrent={false}
                    isDefault={shouldHighlightDefault && ex.id === defaultExerciseId}
                    onTap={() => handleSelect(ex.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!loading && (
        <div style={styles.bottomBar}>
          <button
            onClick={handleConfirm}
            disabled={!selectedId || selectedId === currentExerciseId || saving}
            style={{
              ...styles.confirmButton,
              opacity: (!selectedId || selectedId === currentExerciseId || saving) ? 0.4 : 1,
              cursor: (!selectedId || selectedId === currentExerciseId || saving) ? 'default' : 'pointer'
            }}
          >
            {saving ? 'Сохранение...' : 'СМЕНИТЬ'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Карточка упражнения в списке.
 *
 * isCurrent — это текущее выбранное (в блоке "ТЕКУЩЕЕ")
 * isDefault — это рекомендованное программой (зелёная обводка + бейдж).
 * isSelected — на нём сейчас стоит радио-точка (юзер выбрал).
 *
 * isDefault и isSelected — независимые штуки. Если default выбран — он и обведён,
 * и точка стоит. Если выбрали что-то другое — default остаётся обведённым
 * (как маркер базового), а точка переезжает на выбранное.
 */
function ExerciseRow({ exercise, isSelected, isCurrent, isDefault, onTap }) {
  // Цвет обводки. Приоритет: selected > default > none.
  // Если карточка одновременно selected и default — рисуем сплошную зелёную
  // (selected важнее визуально, а default видно по бейджу).
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

const styles = {
  page: {
    padding: '16px 16px 100px',
    minHeight: '100vh'
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
  loading: {
    textAlign: 'center',
    padding: '40px 20px',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px'
  },
  currentBlock: {
    marginBottom: '20px'
  },
  alternativesBlock: {
    marginBottom: '20px'
  },
  sectionLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '8px',
    paddingLeft: '4px'
  },
  altList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
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
    padding: '12px 16px calc(var(--tabbar-height) + var(--tabbar-bottom) + 12px)',
    background: 'linear-gradient(180deg, transparent 0%, var(--color-bg) 40%)',
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
    padding: '10px 12px',
    background: 'var(--color-card)',
    border: '2px solid transparent',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '76px',
    textAlign: 'left',
    transition: 'background 0.2s ease, border-color 0.2s ease'
  },
  preview: {
    flexShrink: 0,
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'rgba(255, 255, 255, 0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewPlaceholder: { fontSize: '24px' },
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px'
  },
  // Имя + бейдж "ОТ ПРОГРАММЫ" в одной строке.
  // Если имя длинное и бейдж не помещается — flexWrap отправит его на новую строку.
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    lineHeight: 1.25
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
  meta: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
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