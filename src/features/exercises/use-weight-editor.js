import { useEffect, useRef, useState } from 'react'
import { saveExerciseWeight } from './api'
import { sanitizeWeightInput, normalizeWeightForSave } from './weight-format'
import { haptic } from '../../lib/telegram'
import {
  markWeightEditingStarted,
  markWeightEditingEnded
} from '../../lib/weight-editing-state'
import { useWeightRaiseFlash } from '../../components/WeightRaiseFlash'

/**
 * Ввод рабочего веса прямо в карточке: прозрачный инпут поверх цифры,
 * сохранение по blur/Enter, вспышка ↑/↓ на изменение.
 *
 * Логика одна и та же везде, где вес правят по тапу (день тренировки, меню
 * упражнения, «Любимые»), — здесь её единственный экземпляр. Вёрстку хук не
 * навязывает: отдаёт готовые пропсы для `<input>` и текущее значение.
 *
 * `ExerciseCard` и `ExerciseActionMenu` пока держат свои копии этой логики
 * (менять рабочие экраны заодно с новой фичей — лишний риск); при следующей
 * правке их стоит перевести сюда.
 */
export function useWeightEditor({ exerciseId, weight, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('0')
  const [value, setValue] = useState(weight != null ? weight : 0)
  const inputRef = useRef(null)
  const editingRef = useRef(false)
  const raise = useWeightRaiseFlash()

  // Вес мог измениться снаружи (сохранили в модалке, пришли свежие данные) —
  // подхватываем, пока человек не редактирует поле сам.
  useEffect(() => {
    if (editingRef.current) return
    setValue(weight != null ? weight : 0)
  }, [weight])

  // Ушли с экрана прямо в фокусе — снимаем глобальный флаг «идёт ввод веса»,
  // иначе тапы по карточкам останутся заблокированными.
  useEffect(() => () => { if (editingRef.current) markWeightEditingEnded() }, [])

  const onFocus = () => {
    editingRef.current = true
    setEditing(true)
    setDraft(String(value))
    markWeightEditingStarted()
    haptic.light()
    setTimeout(() => { try { inputRef.current?.select() } catch { /* ignore */ } }, 10)
  }

  const onChange = (e) => setDraft(sanitizeWeightInput(e.target.value))

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur() }
  }

  const onBlur = async () => {
    editingRef.current = false
    setEditing(false)
    markWeightEditingEnded()

    const norm = normalizeWeightForSave(draft)

    // Стерли всё → 0. Уже 0 — сохранять нечего.
    if (norm.cleared) {
      if (value !== 0) {
        setValue(0)
        haptic.success()
        await persist(0)
      }
      return
    }
    if (norm.invalid) return

    const rounded = norm.value
    if (rounded === value) return // не изменилось — не пиликаем

    raise.trigger(rounded > value ? 'up' : 'down')
    setValue(rounded)
    // Вибро сразу с новой цифрой: хаптика подтверждает жест, а не запись в базу
    // (оффлайн-правка всё равно уходит в очередь).
    haptic.success()
    await persist(rounded)
  }

  const persist = async (kg) => {
    try {
      const ok = await saveExerciseWeight(exerciseId, kg)
      if (ok) onSaved?.(exerciseId, kg)
      else console.warn('[useWeightEditor] saveExerciseWeight returned false')
    } catch (e) {
      console.error('[useWeightEditor] saveExerciseWeight error:', e)
    }
  }

  return {
    editing,
    value,
    raise,
    inputRef,
    inputProps: {
      type: 'text',
      inputMode: 'decimal',
      pattern: '[0-9]*',
      value: editing ? draft : String(value),
      onFocus,
      onChange,
      onBlur,
      onKeyDown
    }
  }
}
