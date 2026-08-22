import { useEffect, useState } from 'react'
import { backButton } from '../lib/telegram'

/**
 * Кнопка «Назад» для браузерной версии — то, что в Telegram рисует сам клиент.
 *
 * ПОВЕДЕНИЕ ОБЩЕЕ С TELEGRAM, И ЭТО ГЛАВНОЕ. Экраны как ставили свой обработчик
 * через backButton.setHandler, так и ставят — здесь мы только показываем кнопку
 * и дёргаем тот же обработчик. Иначе пришлось бы вести вторую, параллельную
 * навигацию, и однажды она разошлась бы с телеграмной: «Назад» из формы вело бы
 * в разные места в зависимости от того, откуда человек зашёл.
 *
 * Кнопки «Закрыть» здесь намеренно нет. В Telegram крестик закрывает окно
 * мини-приложения — в браузере закрывать нечего: вкладку скрипт закрыть не
 * может, а увести человека с сайта по кнопке в шапке было бы враждебно.
 *
 * Встаёт по центру той же полосы, что и заголовок экрана (--tg-nav-top,
 * --tg-nav-height), поэтому кнопка и название всегда на одной линии.
 */
export default function BrowserNavButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => backButton.subscribe(setVisible), [])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={() => backButton.trigger()}
      style={styles.button}
      aria-label="Назад"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 5L8 12l7 7" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={styles.label}>Назад</span>
    </button>
  )
}

const styles = {
  button: {
    position: 'fixed',
    top: 'var(--tg-nav-top, 56px)',
    left: 'var(--space-4)',
    height: 'var(--tg-nav-height, 44px)',
    zIndex: 'var(--z-nav, 60)',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '0 var(--space-3) 0 var(--space-2)',
    // Пилюля-подложка, как у системной кнопки Telegram: на светлых картинках
    // под шапкой белая стрелка иначе теряется.
    background: 'var(--surface-raised)',
    backdropFilter: 'blur(var(--blur-md))',
    WebkitBackdropFilter: 'blur(var(--blur-md))',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    WebkitTapHighlightColor: 'transparent'
  },
  label: { lineHeight: 1 }
}
