import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import StarIcon from '../components/StarIcon'
import { SectionLabel } from '../components/GroupLabel'
import {
  WINDOWS,
  ACTIVITY_TITLE_MAX, ACTIVITY_BENEFIT_MAX, CUSTOM_PER_WINDOW_MAX,
  getActivitiesConfigSync, fetchActivitiesConfig, saveActivitiesConfig,
  getRecommendedForWindow
} from '../lib/activities'

// Галочка-переключатель (чистая): квадрат со скруглением, при вкл — зелёная заливка + галка.
function Check({ on }) {
  return (
    <span style={{
      ...checkboxStyles.box,
      background: on ? 'var(--color-primary)' : 'transparent',
      borderColor: on ? 'var(--color-primary)' : 'rgba(255,255,255,0.25)'
    }}>
      {on && <UiIcon name="check" size={14} color="var(--bg-base)" />}
    </span>
  )
}

export default function DailyBoost() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(getActivitiesConfigSync)

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
    fetchActivitiesConfig().then(cfg => { if (cfg) setConfig(cfg) })
  }, [navigate])

  const update = (patch) => setConfig(saveActivitiesConfig({ ...config, ...patch }))
  const toggle = (key) => { haptic.light(); update({ [key]: !config[key] }) }

  const genId = () => 'c' + Math.random().toString(36).slice(2, 8)

  const addCustom = (winId, data) => {
    haptic.success()
    const list = config.custom[winId] || []
    if (list.length >= CUSTOM_PER_WINDOW_MAX) return
    // Добавил свою — автоматически включаем показ «Моих».
    update({ showCustom: true, custom: { ...config.custom, [winId]: [...list, { id: genId(), ...data }] } })
  }
  const editCustom = (winId, itemId, data) => {
    haptic.success()
    const list = (config.custom[winId] || []).map(it => it.id === itemId ? { ...it, ...data } : it)
    update({ custom: { ...config.custom, [winId]: list } })
  }
  const removeCustom = (winId, itemId) => {
    haptic.light()
    const list = (config.custom[winId] || []).filter(it => it.id !== itemId)
    update({ custom: { ...config.custom, [winId]: list } })
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Настройка активностей</ScreenTitle>

      <p style={styles.intro}>
        Утро, день и вечер — по одной активности за раз. Минимум шума, максимум действия.
      </p>

      {/* Галочки показа */}
      <div style={styles.toggles}>
        <button onClick={() => toggle('showRecommended')} style={styles.toggleRow} className="tg-row">
          <Check on={config.showRecommended} />
          <div style={styles.toggleText}>
            <span style={styles.toggleTitle}>Рекомендации</span>
            <span style={styles.toggleSub}>Базовые активности на каждое окно</span>
          </div>
        </button>
        <div style={styles.toggleDivider} />
        <button onClick={() => toggle('showCustom')} style={styles.toggleRow} className="tg-row">
          <Check on={config.showCustom} />
          <div style={styles.toggleText}>
            <span style={styles.toggleTitle}>Мои активности</span>
            <span style={styles.toggleSub}>Свои — до 3 на каждое окно</span>
          </div>
        </button>
      </div>

      {/* Окна */}
      {WINDOWS.map(win => {
        const rec = getRecommendedForWindow(win.id)
        const customs = config.custom[win.id] || []
        return (
          <div key={win.id} style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionEmoji}>{win.emoji}</span>
              <SectionLabel style={{ marginBottom: 0, paddingLeft: 0 }}>{win.label}</SectionLabel>
            </div>

            {/* Рекомендуемая (read-only) */}
            {rec && (
              <div style={{ ...styles.recRow, opacity: config.showRecommended ? 1 : 0.4 }}>
                <span style={styles.recEmoji}>{rec.emoji}</span>
                <div style={styles.textCol}>
                  <span style={styles.recTitle}>{rec.title}</span>
                  <span style={styles.recBenefit}>{rec.benefit}</span>
                </div>
                <span style={styles.recTag}>рекомендуем</span>
              </div>
            )}

            {/* Свои (до 3): тап по существующей — редактировать, ✕ — удалить. */}
            <WindowCustoms
              items={customs}
              dim={!config.showCustom}
              onAdd={(data) => addCustom(win.id, data)}
              onEdit={(id, data) => editCustom(win.id, id, data)}
              onRemove={(id) => removeCustom(win.id, id)}
            />
          </div>
        )
      })}

      <div style={{ height: 'calc(var(--tabbar-height) + 40px)' }} />
    </div>
  )
}

/** Свои активности окна (до 3): существующие — тап редактирует, ✕ удаляет; ниже —
    «Добавить свою», пока не достигнут лимит. */
function WindowCustoms({ items, dim, onAdd, onEdit, onRemove }) {
  const [editingId, setEditingId] = useState(null) // id элемента | 'new' | null
  const canAdd = items.length < CUSTOM_PER_WINDOW_MAX

  return (
    <div style={{ ...styles.customsWrap, opacity: dim ? 0.45 : 1 }}>
      {items.map(it => (
        editingId === it.id ? (
          <CustomEditor
            key={it.id}
            initialTitle={it.title}
            initialBenefit={it.benefit || ''}
            saveLabel="Сохранить"
            onSave={(data) => { onEdit(it.id, data); setEditingId(null) }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={it.id} style={styles.customRow}>
            <StarIcon size={20} />
            <button style={styles.customTap} onClick={() => { haptic.light(); setEditingId(it.id) }}>
              <span style={styles.recTitle}>{it.title}</span>
              {it.benefit && <span style={styles.recBenefit}>{it.benefit}</span>}
            </button>
            <button onClick={() => onRemove(it.id)} style={styles.removeBtn} aria-label="Удалить">✕</button>
          </div>
        )
      ))}

      {editingId === 'new' ? (
        <CustomEditor
          saveLabel="Добавить"
          onSave={(data) => { onAdd(data); setEditingId(null) }}
          onCancel={() => setEditingId(null)}
        />
      ) : canAdd ? (
        <button onClick={() => { haptic.light(); setEditingId('new') }} style={styles.addBtn} className="tg-row">
          <StarIcon size={16} />
          <span>Добавить свою</span>
        </button>
      ) : null}
    </div>
  )
}

/** Форма своей активности: название (обяз.) + описание (опц.). */
function CustomEditor({ initialTitle = '', initialBenefit = '', saveLabel = 'Добавить', onSave, onCancel }) {
  const [title, setTitle] = useState(initialTitle)
  const [benefit, setBenefit] = useState(initialBenefit)
  const canSave = title.trim().length > 0
  return (
    <div style={styles.editor}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, ACTIVITY_TITLE_MAX))}
        placeholder="Например: выпить стакан воды"
        maxLength={ACTIVITY_TITLE_MAX}
        style={styles.input}
      />
      <input
        value={benefit}
        onChange={(e) => setBenefit(e.target.value.slice(0, ACTIVITY_BENEFIT_MAX))}
        placeholder="Описание (необязательно) — напр. пробуждение"
        maxLength={ACTIVITY_BENEFIT_MAX}
        style={{ ...styles.input, fontSize: 'var(--text-label-size)' }}
      />
      <div style={styles.editorButtons}>
        <button onClick={onCancel} style={styles.cancelBtn}>Отмена</button>
        <button
          onClick={() => { if (canSave) onSave({ title: title.trim(), benefit: benefit.trim() || null }) }}
          disabled={!canSave}
          style={{ ...styles.saveBtn, opacity: canSave ? 1 : 0.4 }}
        >{saveLabel}</button>
      </div>
    </div>
  )
}

const checkboxStyles = {
  box: {
    flexShrink: 0,
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-xs)',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s ease, border-color 0.15s ease'
  }
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  intro: {
    margin: 'var(--space-1) var(--space-1) var(--space-4)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    lineHeight: 1.4,
    color: 'var(--color-text-secondary)'
  },
  toggles: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    marginBottom: 'var(--space-5)'
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    width: '100%',
    padding: 'var(--space-4) var(--space-4)',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer'
  },
  toggleDivider: { height: '1px', background: 'var(--border-hairline)', marginLeft: '50px' },
  toggleText: { display: 'flex', flexDirection: 'column', gap: 'var(--space-05)' },
  toggleTitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700, color: 'var(--color-text)' },
  toggleSub: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500, color: 'var(--color-text-secondary)' },

  section: { marginBottom: 'var(--space-5)' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-1) var(--space-2)' },
  sectionEmoji: { fontSize: 'var(--text-body-size)', lineHeight: 1 },

  recRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-medium)',
    marginBottom: 'var(--space-15)',
    transition: 'opacity 0.2s ease'
  },
  recEmoji: { fontSize: 'var(--text-heading-size)', lineHeight: 1, flexShrink: 0, width: '28px', textAlign: 'center' },
  textCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-05)' },
  recTitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 },
  recBenefit: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500, color: 'var(--color-text-secondary)', lineHeight: 1.2 },
  recTag: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-caption-size)',
    letterSpacing: '1px', color: 'var(--color-text-secondary)', textTransform: 'uppercase'
  },

  customsWrap: { display: 'flex', flexDirection: 'column', gap: 'var(--space-15)', transition: 'opacity 0.2s ease' },
  customRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-medium)'
  },
  // Тапабельная зона текста своей активности (открывает редактирование).
  customTap: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-05)',
    background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0
  },
  removeBtn: {
    flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%',
    background: 'var(--highlight-recent)', border: 'none', color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-button-size)', cursor: 'pointer'
  },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    width: '100%', padding: 'var(--space-3) var(--space-4)',
    background: 'transparent',
    border: '1px dashed rgba(255,255,255,0.15)',
    borderRadius: 'var(--radius-medium)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    cursor: 'pointer'
  },
  editor: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-medium)'
  },
  input: {
    width: '100%', padding: 'var(--space-3) var(--space-3)',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid var(--layer-3)',
    borderRadius: 'var(--radius-small)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 500,
    outline: 'none', WebkitAppearance: 'none'
  },
  editorButtons: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-05)' },
  cancelBtn: {
    padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none',
    color: 'var(--color-text-secondary)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, cursor: 'pointer'
  },
  saveBtn: {
    padding: 'var(--space-2) var(--space-5)', background: 'var(--color-primary)', color: 'var(--bg-base)',
    border: 'none', borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, cursor: 'pointer'
  }
}
