import { useRef, useState } from 'react'
import { haptic } from '../lib/telegram'
import AnchorMenu from './AnchorMenu'
import ChevronIcon from './ChevronIcon'
import UiIcon from './UiIcon'

/**
 * Контролы форм — общая база для экранов настроек и профиля.
 *
 * Собраны из уже существовавшего паттерна экрана «Приватность» (карточка-группа
 * со строками и переключателем), чтобы новые экраны не изобретали свою вёрстку.
 *
 * Правила, зашитые сюда:
 *  · строка не ниже 56px — палец попадает без прицеливания;
 *  · подпись под заголовком объясняет последствие, а не повторяет заголовок;
 *  · разделитель — между строками, не по краям группы;
 *  · значение справа всегда тише заголовка (иерархия «что» → «сколько»).
 */

/** Карточка-группа: строки внутри одного скруглённого блока. */
export function FormCard({ children, style }) {
  return <div style={{ ...s.card, ...style }}>{children}</div>
}

/** Строка с переключателем. */
export function ToggleRow({ label, hint, value, onToggle, divider, nested = false }) {
  return (
    <div style={{ ...s.row, ...(divider ? s.divider : null), ...(nested ? s.rowNested : null) }}>
      <div style={s.rowContent}>
        <div style={{ ...s.rowTitle, ...(nested ? s.rowTitleNested : null) }}>{label}</div>
        {hint && <div style={s.rowHint}>{hint}</div>}
      </div>
      <button
        onClick={() => { haptic.selection(); onToggle?.() }}
        aria-label={label}
        style={{ ...s.switch, background: value ? 'var(--color-primary)' : 'var(--layer-3)' }}
      >
        <span style={{ ...s.knob, transform: value ? 'translateX(18px)' : 'translateX(0)' }} />
      </button>
    </div>
  )
}

/** Строка со значением справа (и опционально — стрелкой, если это переход). */
export function ValueRow({ label, hint, value, placeholder = '—', onClick, divider }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick ? () => { haptic.light(); onClick() } : undefined}
      className={onClick ? 'press-tile' : undefined}
      style={{ ...s.row, ...(divider ? s.divider : null), ...(onClick ? s.rowButton : null) }}
    >
      <div style={s.rowContent}>
        <div style={s.rowTitle}>{label}</div>
        {hint && <div style={s.rowHint}>{hint}</div>}
      </div>
      <span style={{ ...s.value, ...(value ? null : s.valueEmpty) }}>{value || placeholder}</span>
    </Tag>
  )
}

/** Поле ввода с единицей измерения. */
export function TextField({ label, value, onChange, placeholder, unit, type = 'text', inputMode, divider }) {
  return (
    <div style={{ ...s.row, ...(divider ? s.divider : null) }}>
      <label style={s.rowTitle} htmlFor={`f-${label}`}>{label}</label>
      <span style={s.fieldWrap}>
        <input
          id={`f-${label}`}
          type={type}
          inputMode={inputMode}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          style={s.input}
        />
        {unit && <span style={s.unit}>{unit}</span>}
      </span>
    </div>
  )
}

/**
 * Строка-селектор: значение выбирается из короткого списка.
 *
 * Почему список, а не сегменты в строку: сегменты выкладывают все варианты
 * разом и занимают всю ширину строки — ради двух слов это шумно, а строка
 * перестаёт быть похожей на соседние («Рост», «Версия»). Здесь справа стоит
 * само значение, как в остальных строках формы, и раскрывается тем же
 * выпадающим списком, что и селектор раздела на главной.
 *
 * Ничего не выбрано — вместо значения приглашение («Выбрать»), тише заголовка:
 * пустой прочерк не подсказывает, что по строке нужно нажать.
 */
export function SelectRow({ label, options, value, onChange, placeholder = 'Выбрать', divider }) {
  const btnRef = useRef(null)
  const [anchor, setAnchor] = useState(null)
  const current = options.find(o => o.id === value)

  return (
    <div style={{ ...s.row, ...(divider ? s.divider : null) }}>
      <div style={s.rowContent}>
        <div style={s.rowTitle}>{label}</div>
      </div>
      <button
        ref={btnRef}
        className="press-tile"
        onClick={() => { haptic.light(); setAnchor(btnRef.current?.getBoundingClientRect() || null) }}
        aria-label={label}
        style={s.select}
      >
        <span style={{ ...s.value, ...(current ? null : s.valueEmpty) }}>
          {current ? current.label : placeholder}
        </span>
        <span style={{ ...s.selectChev, transform: anchor ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <ChevronIcon size={16} color="var(--color-text-secondary)" />
        </span>
      </button>

      {anchor && (
        <AnchorMenu
          anchorRect={anchor}
          align="right"
          gap={8}
          onClose={() => setAnchor(null)}
          items={options.map(o => ({
            key: o.id,
            // Галочка у выбранного — иначе в списке из двух слов не видно,
            // что одно из них уже стоит в строке.
            icon: o.id === value ? <UiIcon name="check" size={18} color="var(--color-primary)" /> : null,
            label: o.label,
            onClick: () => { if (o.id !== value) onChange?.(o.id) }
          }))}
        />
      )}
    </div>
  )
}

/**
 * Честная строка-заглушка под будущую механику: раздел уже виден и понятен,
 * но не притворяется рабочим. Лучше пустого экрана и лучше кнопки, которая
 * ничего не делает без объяснения.
 */
export function SoonNote({ children }) {
  return <div style={s.soon}>{children}</div>
}

const s = {
  card: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)', overflow: 'hidden'
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
    padding: 'var(--space-4)', minHeight: '56px', width: '100%',
    background: 'transparent', border: 'none', textAlign: 'left'
  },
  rowColumn: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    padding: 'var(--space-4)', width: '100%'
  },
  rowButton: { cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  // Вложенный под-тумблер (например, «веса» под «Любимыми упражнениями»):
  // сдвиг вправо и чуть приглушённый фон показывают подчинённость.
  rowNested: { paddingLeft: '34px', background: 'rgba(255, 255, 255, 0.02)' },
  rowTitleNested: { fontSize: 'var(--text-button-size)' },
  divider: { borderTop: '1px solid var(--color-border)' },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-label)', color: 'var(--color-text)'
  },
  rowHint: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', marginTop: 'var(--space-05)', lineHeight: 1.35
  },
  value: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-primary)'
  },
  valueEmpty: { color: 'var(--color-text-secondary)', fontWeight: 'var(--weight-text)' },

  // Переключатель — пилюля (радиус = половине высоты), а не «почти круглый».
  switch: {
    position: 'relative', flexShrink: 0, width: '42px', height: '24px',
    borderRadius: 'var(--radius-pill)', border: 'none', padding: 0, cursor: 'pointer',
    transition: 'background 0.2s ease', WebkitTapHighlightColor: 'transparent'
  },
  knob: {
    position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px',
    borderRadius: '50%', background: 'var(--color-text)',
    transition: 'transform 0.2s var(--ease-ios)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
  },

  fieldWrap: { display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-15)', flexShrink: 0 },
  input: {
    width: '72px', textAlign: 'right', background: 'transparent', border: 'none', outline: 'none',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-primary)'
  },
  unit: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },

  // Селектор: значение + шеврон. Отдельного фона нет — строка формы и так
  // читается как кликабельная, а заливка спорила бы с полями ввода рядом.
  select: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
    flexShrink: 0, padding: 0, background: 'transparent', border: 'none',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent'
  },
  selectChev: {
    display: 'inline-flex', lineHeight: 0,
    transition: 'transform 0.18s var(--ease-ios)'
  },

  soon: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    padding: 'var(--space-4) var(--space-5) 0', maxWidth: '320px', margin: '0 auto'
  }
}
