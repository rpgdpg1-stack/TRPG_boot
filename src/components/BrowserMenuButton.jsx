import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'

/**
 * Кнопка «⋯» для браузерной версии — то, что в Telegram рисует сам клиент.
 *
 * Внутри Telegram за этими точками живёт системное меню (обновить, добавить
 * на экран, условия). Повторять его целиком незачем: половина пунктов там
 * про сам Telegram. Берём только то, что имеет смысл в браузере и чего иначе
 * не достать — обновление страницы и настройки приложения.
 *
 * Панель выезжает ИЗ КНОПКИ: точка роста в правом верхнем углу, поэтому меню
 * читается как продолжение нажатия, а не как всплывшее ниоткуда. Тот же приём
 * у меню долгого нажатия по программе и по другу.
 */
export default function BrowserMenuButton() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)   // отдельный флаг для анимации
  const closeTimer = useRef(null)

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Открытие: сначала монтируем в свёрнутом виде, следующим кадром разворачиваем.
  // Без этой паузы браузер применит конечное состояние сразу и анимации не будет.
  const openMenu = () => {
    haptic.light()
    setOpen(true)
    requestAnimationFrame(() => setShown(true))
  }

  const closeMenu = () => {
    setShown(false)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 170)
  }

  // Выбор протяжкой — как в меню долгого нажатия: палец опустился на панель
  // и ведёт по пунктам, подсветка идёт за ним, отпустил над нужным = выбрал.
  const [pressed, setPressed] = useState(null)
  const dragging = useRef(false)
  const justPicked = useRef(false)

  const keyAtPoint = (x, y) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest?.('[data-menu-key]')?.getAttribute('data-menu-key') || null
  }

  const items = [
    {
      key: 'reload',
      icon: 'ui:change',
      title: 'Обновить страницу',
      onClick: () => window.location.reload()
    },
    {
      key: 'settings',
      icon: 'ui:settings',
      title: 'Настройки',
      onClick: () => { closeMenu(); navigate('/settings') }
    }
  ]

  return (
    <>
      <button type="button" onClick={openMenu} style={styles.button} aria-label="Меню">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && createPortal(
        <>
          {/* Тап мимо закрывает. Фон прозрачный: меню маленькое, затемнять
              под ним весь экран — слишком громкий жест для двух пунктов. */}
          <div style={styles.backdrop} onClick={closeMenu} />
          <div
            style={{
              ...styles.menu,
              opacity: shown ? 1 : 0,
              transform: shown ? 'scale(1)' : 'scale(0.9)'
            }}
            onPointerDown={(e) => {
              dragging.current = true
              justPicked.current = false
              setPressed(keyAtPoint(e.clientX, e.clientY))
            }}
            onPointerMove={(e) => {
              if (dragging.current) setPressed(keyAtPoint(e.clientX, e.clientY))
            }}
            onPointerUp={(e) => {
              if (!dragging.current) return
              dragging.current = false
              const key = keyAtPoint(e.clientX, e.clientY)
              setPressed(null)
              if (!key) return
              justPicked.current = true
              haptic.light()
              items.find(i => i.key === key)?.onClick()
            }}
            onPointerCancel={() => { dragging.current = false; setPressed(null) }}
          >
            {items.map(it => (
              <button
                key={it.key}
                type="button"
                data-menu-key={it.key}
                onClick={() => {
                  if (justPicked.current) { justPicked.current = false; return }
                  it.onClick()
                }}
                style={{
                  ...styles.row,
                  background: pressed === it.key ? 'var(--layer-2)' : 'transparent'
                }}
              >
                <UiIcon name={it.icon.slice(3)} size={20} color="var(--color-text-secondary)" />
                <span style={styles.rowTitle}>{it.title}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

const styles = {
  button: {
    position: 'fixed',
    top: 'calc(var(--tg-nav-top, 56px) + (var(--tg-nav-height, 44px) - 32px) / 2)',
    right: 'var(--space-4)',
    height: '32px',
    minWidth: '44px',
    zIndex: 'var(--z-nav, 60)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-glass)',
    backdropFilter: 'var(--blur-glass)',
    WebkitBackdropFilter: 'var(--blur-glass)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)',
    WebkitTapHighlightColor: 'transparent'
  },
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-nav, 60)', background: 'transparent'
  },
  menu: {
    position: 'fixed',
    top: 'calc(var(--tg-nav-top, 56px) + var(--tg-nav-height, 44px) + var(--space-1))',
    right: 'var(--space-4)',
    minWidth: '220px',
    zIndex: 'calc(var(--z-nav, 60) + 1)',
    background: 'var(--surface-glass)',
    backdropFilter: 'var(--blur-glass)',
    WebkitBackdropFilter: 'var(--blur-glass)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-2)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
    // Растём из правого верхнего угла — оттуда, где кнопка.
    transformOrigin: 'top right',
    transition: 'opacity 0.16s ease, transform 0.17s cubic-bezier(0.2, 0.7, 0.3, 1)'
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-3)',
    border: 'none', background: 'transparent',
    borderRadius: 'var(--radius-pill)',
    width: '100%', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent'
  },
  rowTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    color: 'var(--color-text)'
  }
}
