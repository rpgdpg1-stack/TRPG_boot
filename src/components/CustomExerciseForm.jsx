import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MUSCLE_GROUP_LABELS, exerciseTagLabel } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { buildMetaInfo, parseMetaInfo } from '../features/programs/userExercises'
import { haptic } from '../lib/telegram'
import ActionButton from './ActionButton'
import ChevronIcon from './ChevronIcon'
import ExercisePlaceholder from './ExercisePlaceholder'

/**
 * Форма своего упражнения — заведение и правка.
 *
 * Ничего не обязательно, кроме названия. Группу и подгруппу человек ПИШЕТ
 * сам: он заводит упражнение как раз потому, что нужного в каталоге нет, и
 * заставлять его в этот момент подбирать чужую классификацию — лишнее решение
 * не вовремя.
 *
 * Выбор из готовых групп при этом рядом, кнопкой-стрелкой. Он не про порядок
 * в данных, а про ЦВЕТ: совпал ключ группы — тег окрасится как у остальных
 * упражнений спины или ног, и своё встанет в общий строй. Не совпал — тег
 * акцентный, «моё».
 *
 * Тег и подпись подходов показаны живьём над формой: человек видит не поля,
 * а будущую карточку.
 *
 * Картинки нет — загрузку изображений не даём, у своего упражнения всегда
 * placeholder.
 */
export default function CustomExerciseForm({ groups = [], initial = null, onSave, onClose }) {
  const isEdit = !!initial
  const parsed = parseMetaInfo(initial?.meta_info)

  const [name, setName] = useState(initial?.name || '')
  const [group, setGroup] = useState(initial?.muscle_group || '')
  const [subGroup, setSubGroup] = useState(initial?.sub_group || '')
  const [sets, setSets] = useState(parsed.sets)
  const [reps, setReps] = useState(parsed.reps)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  const tagLabel = exerciseTagLabel(group, subGroup)
  const colors = getMuscleGroupColors(group, true)
  const meta = buildMetaInfo(sets, reps)
  const canSave = name.trim().length > 0 && !saving

  const pickGroup = (key) => {
    haptic.selection()
    // Повторный тап по выбранной — снять выбор: значит, группа своя, текстом.
    setGroup(prev => (prev === key ? '' : key))
    setGroupsOpen(false)
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        name: name.trim(),
        group: group.trim(),
        subGroup: subGroup.trim(),
        meta
      })
      haptic.success()
    } catch (e) {
      haptic.error()
      setError(e?.message || 'Не удалось сохранить')
      setSaving(false)
    }
  }

  const content = (
    <div style={styles.overlay}>
      <div style={styles.header}>
        <div style={styles.title}>{isEdit ? 'Своё упражнение' : 'Новое упражнение'}</div>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Закрыть">✕</button>
      </div>

      <div style={styles.scroll}>
        {/* Живой предпросмотр карточки — видно результат, а не поля. */}
        <div style={styles.preview}>
          <div style={styles.previewImg}><ExercisePlaceholder size={24} /></div>
          <div style={styles.previewText}>
            <div style={styles.previewName}>{name.trim() || 'Название упражнения'}</div>
            {tagLabel && (
              <span style={{ ...styles.previewTag, background: colors.tag }}>{tagLabel}</span>
            )}
            {meta && <div style={styles.previewMeta}>{meta}</div>}
          </div>
        </div>

        <div style={styles.card}>
          <Field label="Название">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Протяжка со штангой"
              maxLength={60}
              style={styles.input}
            />
          </Field>

          <Field label="Группа" divider>
            <div style={styles.inputRow}>
              <input
                type="text"
                value={MUSCLE_GROUP_LABELS[group] ? titleCase(MUSCLE_GROUP_LABELS[group]) : group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Например: Спина"
                maxLength={30}
                style={styles.input}
              />
              <button
                onClick={() => { haptic.light(); setGroupsOpen(o => !o) }}
                style={styles.pickBtn}
                aria-label="Выбрать из существующих групп"
              >
                <span style={{ display: 'inline-flex', transition: 'transform 0.18s var(--ease-ios)', transform: groupsOpen ? 'rotate(180deg)' : 'none' }}>
                  <ChevronIcon size={16} />
                </span>
              </button>
            </div>
          </Field>

          {groupsOpen && (
            <div style={styles.groupPanel}>
              {groups.map(key => {
                const c = getMuscleGroupColors(key)
                const active = group === key
                return (
                  <button
                    key={key}
                    onClick={() => pickGroup(key)}
                    className="press-tile"
                    style={{
                      ...styles.groupChip,
                      background: active ? c.tag : 'var(--layer-2)',
                      color: active ? 'var(--color-text)' : 'var(--color-text-secondary)'
                    }}
                  >
                    {titleCase(MUSCLE_GROUP_LABELS[key] || key)}
                  </button>
                )
              })}
            </div>
          )}

          <Field label="Подгруппа" divider>
            <input
              type="text"
              value={subGroup}
              onChange={(e) => setSubGroup(e.target.value)}
              placeholder="Например: Широчайшие"
              maxLength={30}
              style={styles.input}
            />
          </Field>

          <Field label="Подходы и повторения" divider>
            <div style={styles.setsRow}>
              <input
                type="text"
                inputMode="numeric"
                value={sets}
                onChange={(e) => setSets(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                placeholder="3"
                style={{ ...styles.input, ...styles.setsInput }}
              />
              <span style={styles.times}>×</span>
              <input
                type="text"
                value={reps}
                onChange={(e) => setReps(e.target.value.slice(0, 9))}
                placeholder="8-12"
                style={{ ...styles.input, ...styles.repsInput }}
              />
            </div>
          </Field>
        </div>

        <div style={styles.hint}>
          Группу можно выбрать из существующих — тогда тег окрасится как у них.
          Написал свою — тег будет акцентным.
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <ActionButton onClick={submit} variant="primary" hug disabled={!canSave}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </ActionButton>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

function Field({ label, divider, children }) {
  return (
    <div style={{ ...styles.field, ...(divider ? styles.fieldDivider : null) }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  )
}

const titleCase = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '')

const styles = {
  // Поверх пикера (тот на z-index 100) — форма открывается из него.
  overlay: {
    position: 'fixed', inset: 0, zIndex: 110,
    height: '100dvh', background: 'var(--color-bg)',
    display: 'flex', flexDirection: 'column',
    paddingTop: 'var(--tg-safe-top)'
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '0 var(--space-4) var(--space-3)'
  },
  title: {
    flex: 1, fontFamily: 'var(--font-display)', fontSize: 'var(--text-title-size)',
    fontWeight: 800, color: 'var(--color-text)'
  },
  closeBtn: {
    width: '44px', height: '44px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--color-card)', border: 'none', borderRadius: '50%',
    color: 'var(--color-text-secondary)', fontSize: 'var(--text-body-size)',
    WebkitTapHighlightColor: 'transparent'
  },
  scroll: {
    flex: '1 1 0%', minHeight: 0, overflowY: 'auto',
    padding: '0 var(--space-4) 120px'
  },

  // Предпросмотр — та же раскладка, что у карточки в списке (картинка слева,
  // название, тег, подходы), чтобы не гадать, как это будет выглядеть.
  preview: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)',
    padding: 'var(--space-3)', minHeight: '90px', marginBottom: 'var(--space-4)'
  },
  previewImg: {
    width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)',
    overflow: 'hidden', background: 'var(--color-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  previewText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-15)' },
  previewName: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    lineHeight: '16px', color: 'var(--color-text)'
  },
  previewTag: {
    padding: 'var(--space-05) var(--space-2)', borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)', fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)', fontWeight: 700, opacity: 0.7, whiteSpace: 'nowrap'
  },
  previewMeta: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },

  card: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)', overflow: 'hidden'
  },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--space-15)', padding: 'var(--space-3) var(--space-4)' },
  fieldDivider: { borderTop: '1px solid var(--color-border)' },
  fieldLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },
  inputRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  input: {
    flex: 1, minWidth: 0, height: '32px', padding: 0,
    background: 'transparent', border: 'none', outline: 'none',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-button-size)',
    fontWeight: 700, color: 'var(--color-text)'
  },
  pickBtn: {
    width: '32px', height: '32px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--layer-2)', border: 'none', borderRadius: '50%',
    color: 'var(--color-text-secondary)', WebkitTapHighlightColor: 'transparent'
  },
  groupPanel: {
    display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)',
    padding: '0 var(--space-4) var(--space-3)'
  },
  groupChip: {
    padding: 'var(--space-15) var(--space-3)', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 700, whiteSpace: 'nowrap'
  },
  setsRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  setsInput: { flex: '0 0 40px', width: '40px', textAlign: 'center' },
  repsInput: { flex: '0 0 90px', width: '90px' },
  times: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)',
    color: 'var(--color-text-secondary)'
  },

  hint: {
    marginTop: 'var(--space-3)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', lineHeight: 1.5
  },
  error: {
    marginTop: 'var(--space-3)', textAlign: 'center',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 700, color: 'var(--color-error)'
  },
  actions: { display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }
}
