import { useState, useEffect, useRef } from 'react'
import { saveExerciseWeight } from '../lib/programs'

/**
 * Карточка упражнения на экране дня тренировки.
 *
 * Д2:
 * - Тап → onTap (родитель управляет активацией)
 * - isActive → визуальное состояние "выполнено" (затемнение + блюр + монохром)
 * - "✅ Готово, молодец!" всплывает при первой активации (1.5 сек)
 *
 * Д3.1 (ввод веса):
 * - Тап по полю веса → нативная цифровая клавиатура
 * - Текущее значение выделено, можно печатать поверх
 * - Закрытие клавиатуры → автосохранение в БД (user_exercise_weights)
 * - Тап по полю веса НЕ активирует карточку (event.stopPropagation)
 */
export default function ExerciseCard({ slot, isActive = false, onTap }) {
  const {
    exercise_id,
    exercise_name,
    meta_info,
    preview_url,
    is_swapped,
    user_weight_kg
  } = slot

  const [showDoneToast, setShowDoneToast] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('') // строка во время редактирования
  const [localWeight, setLocalWeight] = useState(user_weight_kg) // отображение после сохранения
  const inputRef = useRef(null)

  // Синхронизируем локальный вес если родитель прислал новый
  useEffect(() => {
    setLocalWeight(user_weight_kg)
  }, [user_weight_kg])

  // Toast "Готово, молодец" — как было
  useEffect(() => {
    if (isActive) {
      setShowDoneToast(true)
      const timer = setTimeout(() => setShowDoneToast(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  // Когда переходим в режим редактирования — фокусируем и выделяем
  useEffect(() => {
    if (editing && inputRef.current) {
      // Микро-задержка — даёт iOS показать клавиатуру стабильно
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [editing])

  // Тап на карточку — родитель решит активировать/нет
  const handleCardClick = (e) => {
    // Если идёт редактирование — не активируем
    if (editing) return
    if (onTap) onTap(slot)
  }

  // Тап на поле веса — открыть ввод. НЕ всплывает до карточки.
  const handleWeightTap = (e) => {
    e.stopPropagation()
    if (!exercise_id) return // нечего сохранять
    // В draft кладём текущий вес или пустую строку
    setDraft(localWeight !== null && localWeight !== undefined ? String(localWeight) : '')
    setEditing(true)
  }

  // Изменение значения в input
  const handleInputChange = (e) => {
    let v = e.target.value
    // Разрешаем только цифры, точку, запятую
    v = v.replace(/,/g, '.')
    v = v.replace(/[^0-9.]/g, '')
    // Не больше одной точки
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    // Максимум 5 символов (например 999.5)
    if (v.length > 5) v = v.slice(0, 5)
    setDraft(v)
  }

  // Закрытие клавиатуры — сохраняем
  const handleInputBlur = async () => {
    setEditing(false)

    // Парсим
    const trimmed = draft.trim()
    if (trimmed === '') {
      // Пустое — оставляем как было, ничего не сохраняем
      return
    }

    const num = parseFloat(trimmed)
    if (isNaN(num) || num < 0) {
      // Невалидное — откатываем
      return
    }

    // Округляем до 0.5 кг для аккуратности, ограничиваем 1-500
    const clamped = Math.max(0, Math.min(500, num))
    const rounded = Math.round(clamped * 2) / 2 // шаг 0.5

    // Если не изменилось — не сохраняем
    if (rounded === localWeight) return

    setLocalWeight(rounded) // оптимистичное обновление

    // Сохраняем в БД (fire-and-forget с логом)
    try {
      const ok = await saveExerciseWeight(exercise_id, rounded)
      if (!ok) {
        console.warn('[ExerciseCard] saveExerciseWeight returned false')
      }
    } catch (e) {
      console.error('[ExerciseCard] saveExerciseWeight error:', e)
    }
  }

  // Enter/Готово на клавиатуре — закрываем
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur()
    }
  }

  const displayWeight = localWeight !== null && localWeight !== undefined
    ? localWeight
    : null

  return (
    <div
      onClick={handleCardClick}
      style={{
        ...styles.card,
        cursor: 'pointer',
        opacity: isActive ? 0.45 : 1,
        filter: isActive ? 'grayscale(0.85) blur(0.4px)' : 'none',
        transition: 'opacity 0.3s ease, filter 0.3s ease'
      }}
    >
      {/* Превью */}
      <div style={styles.preview}>
        {preview_url ? (
          <img src={preview_url} alt="" style={styles.previewImg} />
        ) : (
          <div style={styles.previewPlaceholder}>💪</div>
        )}
      </div>

      {/* Контент */}
      <div style={styles.content}>
        <div style={styles.title}>
          {exercise_name}
          {is_swapped && <span style={styles.swappedBadge}>заменено</span>}
        </div>
        <div style={styles.meta}>{meta_info || ''}</div>
      </div>

      {/* Вес — кнопка/поле */}
      <div
        style={styles.weightBlock}
        onClick={handleWeightTap}
      >
        <div style={styles.weightLabel}>ВЕС</div>

        {editing ? (
          <div style={styles.weightInputWrap}>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              pattern="[0-9]*"
              value={draft}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => e.stopPropagation()}
              placeholder="—"
              style={styles.weightInput}
            />
            <span style={styles.weightUnit}>кг</span>
          </div>
        ) : (
          <div style={styles.weightValue}>
            {displayWeight !== null ? displayWeight : '—'}
            <span style={styles.weightUnit}>кг</span>
          </div>
        )}
      </div>

      {/* Toast "Готово, молодец!" */}
      {showDoneToast && (
        <div style={styles.doneToast}>
          ✅ Готово, молодец!
        </div>
      )}

      <style>{`
        @keyframes doneToastFade {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          75%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '90px'
  },
  preview: {
    flexShrink: 0,
    width: '64px',
    height: '64px',
    borderRadius: '14px',
    overflow: 'hidden',
    background: 'rgba(255, 255, 255, 0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewPlaceholder: { fontSize: '28px' },
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingRight: '4px'
  },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    lineHeight: 1.25,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    flexWrap: 'wrap'
  },
  swappedBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-primary)',
    background: 'rgba(158, 209, 83, 0.12)',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px'
  },
  meta: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
  },
  weightBlock: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    minWidth: '72px',
    padding: '8px 6px',
    margin: '-8px -6px', // расширяем тап-зону без визуального сдвига
    borderRadius: '8px'
  },
  weightLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  weightValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '20px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '3px'
  },
  weightInputWrap: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '3px'
  },
  weightInput: {
    width: '52px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '20px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    textAlign: 'right',
    padding: 0,
    margin: 0,
    // Подсветка курсора цветом primary
    caretColor: 'var(--color-primary)',
    // Системный размер на iOS чтобы не было zoom
    fontSize: '20px',
    // У текстовых инпутов на iOS может быть min-width — обнуляем
    minWidth: 0
  },
  weightUnit: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  },
  doneToast: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: '14px',
    padding: '8px 14px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    animation: 'doneToastFade 1.5s ease-out forwards',
    zIndex: 10,
    filter: 'none',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(158, 209, 83, 0.15)'
  }
}
