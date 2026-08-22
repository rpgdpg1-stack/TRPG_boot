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

  // Пока панель открыта, страница под ней не двигается. Без этого палец,
  // ведущий по пунктам, заодно тащил вниз весь экран — и выбрать что-либо
  // протяжкой было нельзя. Метка на корне заодно останавливает ленту разделов
  // (её слушает SectionCarousel), а класс на body гасит прокрутку.
  useEffect(() => {
    if (!open) return
    document.documentElement.classList.add('menu-open')
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.classList.remove('menu-open')
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const closeMenu = () => {
    setShown(false)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 170)
  }

  // Выбор протяжкой — как в меню долгого нажатия: палец опустился на панель
  // и ведёт по пунктам, подсветка идёт за ним, отпустил над нужным = выбрал.
  const [pressed, setPressed] = useState(null)
  const [btnPressed, setBtnPressed] = useState(false)
  const dragging = useRef(false)

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
      <button
        type="button"
        onClick={openMenu}
        onPointerDown={() => setBtnPressed(true)}
        onPointerUp={() => setBtnPressed(false)}
        onPointerCancel={() => setBtnPressed(false)}
        onPointerLeave={() => setBtnPressed(false)}
        style={{ ...styles.button, ...(btnPressed ? styles.buttonPressed : null) }}
        aria-label="Меню"
      >
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
              // Отпустили мимо пунктов — ничего не выбираем.
              if (!key) return
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
                /* Обычного onClick тут НЕТ намеренно. Касание уже обработано
                   на панели (pointerup над пунктом), а браузер после жеста
                   всё равно шлёт click по тому элементу, НА КОТОРОМ палец
                   опустился, — даже если увели его за пределы меню и отпустили
                   в пустоте. Из-за этого «передумал» всё равно срабатывало.
                   Для клавиатуры остаётся onKeyDown. */
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.onClick() }
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
    // Круг, а не пилюля: внутри три точки — фигура симметричная, и вытянутая
    // подложка делала её визуально «съехавшей» вбок. Ширина равна высоте.
    width: '32px',
    height: '32px',
    padding: 0,
    zIndex: 'var(--z-nav, 60)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-glass)',
    backdropFilter: 'var(--blur-glass)',
    WebkitBackdropFilter: 'var(--blur-glass)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)',
    WebkitTapHighlightColor: 'transparent',
    transition: 'transform var(--press-duration) var(--press-ease), background 0.12s ease'
  },
  // Отклик на касание: пилюля чуть подрастает и светлеет — как крестик
  // в меню упражнения. Без него кнопка кажется неживой: она маленькая,
  // и подсветки текста, как у строк списка, тут нет.
  buttonPressed: {
    transform: 'scale(1.08)',
    background: 'var(--layer-2)'
  },
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-nav, 60)', background: 'transparent',
    // Гасим жесты фона: иначе движение пальца мимо панели прокручивало
    // страницу под открытым меню.
    touchAction: 'none',
    overscrollBehavior: 'contain'
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
