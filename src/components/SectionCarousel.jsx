import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import { getProgramBySlug } from '../features/programs/registry'
import { onActiveWorkoutChange } from '../lib/active-workout'
import { getActiveDaySync, toggleFavoriteProgram } from '../lib/storage'
import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { formatRelative } from '../utils/history'
import UiIcon from './UiIcon'
import ChevronIcon from './ChevronIcon'
import ProgramCard from './ProgramCard'

/**
 * Разделы на главной. Вверху — КОМПАКТНЫЙ СЕЛЕКТОР (иконка раздела + название +
 * шеврон); тап → выпадающий список всех разделов (иконка + название). Ниже —
 * закреплённая программа выбранного раздела (`ProgramCard`, тап начинает/продолжает;
 * ⋯ → Закрепить/Открепить; нет закрепа — заглушка) + ссылка «Все программы ›».
 * Пейджер и свайп убраны — переключение только через селектор.
 *
 * Закреплённая программа = `favorite_programs[category]` (CloudStorage, одна на раздел).
 */

const LAST_CAT_KEY = 'category-swiper-last'
const idxOfCat = (id) => { const i = CATEGORY_ORDER.indexOf(id); return i >= 0 ? i : 0 }

function readPinnedMap() {
  try { return JSON.parse(localGet('favorite_programs') || '{}') || {} } catch { return {} }
}

export default function SectionCarousel({ onSectionChange }) {
  const navigate = useNavigate()

  const [idx, setIdx] = useState(() => idxOfCat(localGet(LAST_CAT_KEY)))
  const [open, setOpen] = useState(false)          // выпадающий список разделов
  const [pinnedTick, setPinnedTick] = useState(0)  // ре-чтение закрепа/последней

  // Старт/финиш тренировки → перечитать «последнюю» и состояние карточки.
  useEffect(() => onActiveWorkoutChange(() => setPinnedTick(t => t + 1)), [])

  // Догоняем выбранный раздел из облака (кросс-девайс).
  useEffect(() => {
    let alive = true
    cloudGet(LAST_CAT_KEY).then(id => {
      if (alive && id && CATEGORY_ORDER.includes(id)) setIdx(idxOfCat(id))
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const cats = CATEGORY_ORDER.map(id => ({ id, ...CATEGORY_META[id] }))
  const cat = cats[idx]

  // Сообщаем наверх текущий раздел — для акцентного свечения фона на главной.
  useEffect(() => {
    const id = CATEGORY_ORDER[idx]
    onSectionChange?.({ id, color: CATEGORY_META[id]?.color })
  }, [idx, onSectionChange])

  const selectCat = (id) => {
    setOpen(false)
    const next = idxOfCat(id)
    if (next === idx) return
    haptic.light()
    setIdx(next)
    localSet(LAST_CAT_KEY, id)
    cloudSet(LAST_CAT_KEY, id)
  }

  // Закреплённая программа раздела.
  void pinnedTick
  const pinnedSlug = readPinnedMap()[cat.id] || null
  const pinnedProg = pinnedSlug ? getProgramBySlug(pinnedSlug) : null
  const lastDate = pinnedSlug ? localGet(`program:${pinnedSlug}:last_day_date`) : null
  const lastText = pinnedProg
    ? (lastDate ? `Последняя тренировка · ${formatRelative(lastDate)}` : 'Ещё не начинали')
    : null

  const openSection = () => { haptic.light(); navigate(`/category/${cat.id}`) }

  const onToggleFav = async () => {
    if (!pinnedSlug) return
    await toggleFavoriteProgram(cat.id, pinnedSlug)
    setPinnedTick(t => t + 1)
  }

  // Тап по карточке — ProgramCard навигирует по своему onOpen.
  const guardedOpen = () => {
    haptic.light()
    if (!pinnedProg) return
    if (pinnedProg.kind === 'swim') { navigate(`/swim/${pinnedSlug}`, { state: { fromHome: true } }); return }
    const day = getActiveDaySync(pinnedSlug) || (pinnedProg.data?.days ? Object.keys(pinnedProg.data.days)[0] : 'A')
    navigate(`/workout/${pinnedSlug}/${day}`, { state: { fromHome: true } })
  }

  return (
    <div style={styles.wrap}>
      {/* Компактный селектор раздела + выпадающий список */}
      <div style={styles.selectorWrap}>
        <button
          style={styles.selector}
          className="press-tile"
          onClick={() => { haptic.light(); setOpen(o => !o) }}
          aria-label="Выбрать раздел"
        >
          <UiIcon name={cat.iconName} size={28} color={cat.color} />
          <span style={styles.selectorText}>{cat.title}</span>
          <span style={{ ...styles.selectorChev, transform: open ? 'rotate(180deg)' : 'none' }}>
            <ChevronIcon size={18} color="var(--color-text-secondary)" />
          </span>
        </button>

        {open && (
          <>
            <div style={styles.dropClose} onClick={() => setOpen(false)} aria-hidden="true" />
            <div style={styles.dropdown}>
              {cats.map(c => {
                const on = c.id === cat.id
                return (
                  <button
                    key={c.id}
                    className="press-tile"
                    style={styles.dropItem}
                    onClick={() => selectCat(c.id)}
                  >
                    <UiIcon name={c.iconName} size={22} color={on ? c.color : 'var(--color-text-secondary)'} />
                    <span style={{ ...styles.dropItemText, color: on ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                      {c.title}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Последняя тренировка — НАД карточкой, по центру. В разделе без закрепа
          (заглушка) держим ту же высоту строки (nbsp), чтобы блок не прыгал. */}
      <div style={styles.lastLine}>{lastText || ' '}</div>

      {/* Закреплённая программа — сама карточка (как внутри раздела) */}
      {pinnedProg ? (
        <ProgramCard
          key={pinnedSlug}
          prog={pinnedProg}
          dots
          isFav
          cta
          background="var(--surface-raised)"
          onToggleFav={onToggleFav}
          onOpen={guardedOpen}
          onDeleted={() => setPinnedTick(t => t + 1)}
        />
      ) : (
        <button style={styles.pinEmpty} className="press-tile" onClick={openSection}>
          <span style={styles.pinEmptyText}>Закрепить программу</span>
          <span style={styles.pinEmptyHint}>Выбери в разделе — она появится здесь</span>
        </button>
      )}

      {/* Все программы — текст-ссылка со стрелкой (на экран раздела) */}
      <button style={styles.allLink} className="tg-row" onClick={openSection}>
        Все программы
        <span style={styles.chevRight}><ChevronIcon size={15} color="var(--color-text-secondary)" /></span>
      </button>
    </div>
  )
}

const styles = {
  // Единый блок раздела (главный акцент экрана): селектор-заголовок + последняя
  // тренировка + карточка программы + «Все программы» — обёрнуты и залиты.
  wrap: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '14px 14px 8px'
  },
  // Селектор-заголовок слева («Силовая ▼»): иконка + название + шеврон.
  selectorWrap: { position: 'relative', display: 'flex', justifyContent: 'flex-start', marginBottom: '2px' },
  selector: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    padding: '4px 4px',
    background: 'transparent', border: 'none',
    cursor: 'pointer'
  },
  // Крупнее навбар-заголовка «Тренировки» (18px) — «геройский» селектор раздела.
  selectorText: {
    fontFamily: 'var(--font-manrope)', fontSize: '22px', fontWeight: 800,
    color: 'var(--color-text)', letterSpacing: '0.2px'
  },
  selectorChev: {
    display: 'inline-flex', marginTop: '1px', marginLeft: '-1px',
    transition: 'transform 0.2s var(--ease-ios)'
  },
  // Прозрачный слой для закрытия по тапу мимо списка.
  dropClose: { position: 'fixed', inset: 0, zIndex: 40 },
  // Выпадающий список — по центру под селектором.
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 41,
    minWidth: '190px',
    padding: '6px',
    background: 'var(--surface-raised)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-medium)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
    display: 'flex', flexDirection: 'column', gap: '2px'
  },
  dropItem: {
    display: 'flex', alignItems: 'center', gap: '11px',
    width: '100%', padding: '10px 12px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-small)',
    cursor: 'pointer', textAlign: 'left'
  },
  dropItemText: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600 },
  // «Последняя тренировка …» — над карточкой, по левому краю. Тише названия
  // (легче/тусклее), ближе к карточке. minHeight держит высоту в пустом разделе.
  lastLine: {
    minHeight: '15px', marginBottom: '5px', paddingLeft: '2px',
    fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.4)', textAlign: 'left'
  },
  pinEmpty: {
    width: '100%',
    minHeight: '106px',
    borderRadius: 'var(--radius-card)',
    background: 'var(--surface-raised)',
    border: '1px dashed rgba(255, 255, 255, 0.18)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
    cursor: 'pointer'
  },
  pinEmptyText: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' },
  pinEmptyHint: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)' },
  allLink: {
    width: '100%',
    marginTop: '6px',
    padding: '6px 4px 6px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-medium)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer'
  },
  // Шеврон-стрелка «вправо» у «Все программы» (тот же ChevronIcon, повёрнут).
  chevRight: { display: 'inline-flex', transform: 'rotate(-90deg)', marginLeft: '2px' }
}
