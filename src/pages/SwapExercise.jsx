import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getExercisesForSubgroup, saveExerciseSwap, getExerciseById } from '../lib/programs'

/**
 * Полноэкранная страница замены упражнения.
 *
 * URL: /swap/:programId/:day/:orderNum
 * Передаём через location.state: { subGroup, type, currentExerciseId }
 *
 * Если state нет (юзер открыл страницу напрямую) — показываем ошибку.
 *
 * Логика:
 * - Загружаем все упражнения той же subGroup+type
 * - Текущее закреплено сверху (выделено зелёным)
 * - Снизу список альтернатив с радио-кнопками
 * - Кнопка "Сменить" внизу — активна когда выбрано НЕ текущее
 * - Тап Сменить → saveExerciseSwap → возврат на /workout/:programId/:day
 */
export default function SwapExercise() {
  const { programId, day, orderNum } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const stateData = location.state || {}
  const { subGroup, type, currentExerciseId, currentExerciseName } = stateData

  const [allExercises, setAllExercises] = useState([])
  const [currentExercise, setCurrentExercise] = useState(null)
  const [selectedId, setSelectedId] = useState(currentExerciseId || null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    backButton.setHandler(() => navigate(`/workout/${programId}/${day}`))
    lockVerticalSwipes()
  }, [navigate, programId, day])

  // Загружаем альтернативы и данные текущего упражнения
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

        // Сортируем альтернативы по priority и имени
        const sorted = (alternatives || []).slice().sort((a, b) => {
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
  }, [subGroup, type, currentExerciseId, currentExerciseName])

  // Тап на альтернативу — выбрать
  const handleSelect = (exerciseId) => {
    haptic.light()
    setSelectedId(exerciseId)
  }

  // Кнопка Сменить
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

  // Альтернативы кроме текущей
  const alternatives = allExercises.filter(e => e.id !== currentExerciseId)

  // Без правильных данных — показываем ошибку
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
          {/* Текущее упражнение — закреплено сверху */}
          <div style={styles.currentBlock}>
            <div style={styles.sectionLabel}>ТЕКУЩЕЕ</div>
            <ExerciseRow
              exercise={currentExercise}
              isSelected={selectedId === currentExercise.id}
              isCurrent={true}
              onTap={() => handleSelect(currentExercise.id)}
            />
          </div>

          {/* Альтернативы */}
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
                    onTap={() => handleSelect(ex.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Кнопка Сменить — внизу */}
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
 * Одна строка в списке альтернатив.
 */
function ExerciseRow({ exercise, isSelected, isCurrent, onTap }) {
  return (
    <button onClick={onTap} className="press-tile" style={{
      ...rowStyles.row,
      borderColor: isSelected ? 'var(--color-primary)' : 'transparent',
      background: isSelected
        ? 'rgba(158, 209, 83, 0.10)'
        : isCurrent
          ? 'rgba(255, 255, 255, 0.04)'
          : 'var(--color-card)'
    }}>
      {/* Превью */}
      <div style={rowStyles.preview}>
        {exercise.preview_url ? (
          <img src={exercise.preview_url} alt="" style={rowStyles.previewImg} />
        ) : (
          <div style={rowStyles.previewPlaceholder}>💪</div>
        )}
      </div>

      {/* Название */}
      <div style={rowStyles.content}>
        <div style={rowStyles.name}>{exercise.name}</div>
        {exercise.meta_info && (
          <div style={rowStyles.meta}>{exercise.meta_info}</div>
        )}
      </div>

      {/* Радио-кружок */}
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
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    lineHeight: 1.25
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
