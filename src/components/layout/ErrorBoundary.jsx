import { Component } from 'react'
import * as Sentry from '@sentry/react'

/**
 * ErrorBoundary — перехватывает ошибки во всех дочерних компонентах
 * и показывает дружелюбный экран вместо белого пятна.
 *
 * Правка #6: для Mini App белый экран = смерть, юзер не понимает что произошло
 * и закрывает приложение. С ErrorBoundary он видит "что-то сломалось, перезапусти"
 * и кнопку перезапуска.
 *
 * ErrorBoundary должен быть классовым компонентом — это требование React,
 * хуками этого сделать нельзя.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    // Вызывается при ошибке в дочернем компоненте.
    // Возвращаем новый state — React сделает повторный рендер с этим состоянием.
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Логируем для отладки (видно в консоли в dev).
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)

    // Шлём в Sentry с контекстом стека компонентов. Если Sentry не
    // инициализирован (DSN пуст / dev) — вызов безопасен, просто ничего не делает.
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    })
  }

  handleReload = () => {
    // Тактильный отклик — как у остальных кнопок приложения.
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium') } catch (e) { /* ignore */ }
    // Жёсткая перезагрузка со сбросом кешей + cache-busting URL — иначе Telegram
    // мог бы снова поднять тот же битый/старый бандл из кеша WebView.
    try {
      if (window.caches && window.caches.keys) {
        window.caches.keys().then(ks => ks.forEach(k => window.caches.delete(k)))
      }
    } catch (e) { /* ignore */ }
    window.location.replace(window.location.pathname + '?r=' + Date.now())
  }

  handleClose = () => {
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light') } catch (e) { /* ignore */ }
    // Выход в бота Telegram — оттуда чистый повторный вход.
    try { window.Telegram?.WebApp?.close() } catch (e) { /* ignore */ }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Экран ошибки — простой и понятный
    return (
      <div style={styles.container}>
        {/* Монохромная иконка вместо системного эмодзи — она не выбивается из стиля. */}
        <div style={styles.icon}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3.2 1.6 21h20.8L12 3.2Zm0 4 6.9 11.8H5.1L12 7.2Z" fill="var(--color-offline)" />
            <path d="M11 10h2v5h-2v-5Zm0 6.2h2v2h-2v-2Z" fill="var(--color-offline)" />
          </svg>
        </div>

        <div style={styles.title}>Что-то пошло не так</div>

        <div style={styles.message}>
          Приложение наткнулось на неожиданную ошибку.<br />
          Перезапусти — обычно это помогает.
        </div>

        {/* В дев-режиме показываем детали ошибки, в проде скрываем */}
        {import.meta.env.DEV && this.state.error && (
          <div style={styles.errorDetails}>
            <div style={styles.errorTitle}>Детали (только dev):</div>
            <div style={styles.errorText}>
              {this.state.error.message || String(this.state.error)}
            </div>
          </div>
        )}

        <button onClick={this.handleReload} style={styles.button} className="press-tile">
          Перезапустить
        </button>

        <button onClick={this.handleClose} style={styles.closeButton} className="press-tile">
          Закрыть приложение
        </button>
      </div>
    )
  }
}

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-5)',
    zIndex: 9999,
    // Композиция собранная: между иконкой и заголовком 8, между текстом и кнопкой 12.
    gap: 'var(--space-2)'
  },
  icon: { lineHeight: 0, marginBottom: 'var(--space-2)' },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-title-size)',
    color: 'var(--color-text)',
    letterSpacing: '0.4px',
    textAlign: 'center'
  },
  message: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    maxWidth: '300px'
  },
  errorDetails: {
    width: '100%',
    maxWidth: '320px',
    background: 'rgba(232, 69, 69, 0.08)',
    border: '1px solid rgba(232, 69, 69, 0.2)',
    borderRadius: 'var(--radius-medium)',
    padding: 'var(--space-3) var(--space-4)',
    marginTop: 'var(--space-1)'
  },
  errorTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-caption-size)',
    color: '#E84545',
    letterSpacing: '1px',
    marginBottom: 'var(--space-15)'
  },
  errorText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-word',
    lineHeight: 1.4
  },
  button: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-6)',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-body-size)',
    fontWeight: 700,
    letterSpacing: '0.2px',
    borderRadius: 'var(--radius-medium)',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(158, 209, 83, 0.3)'
  },
  closeButton: {
    marginTop: 'var(--space-1)',
    padding: 'var(--space-3) var(--space-5)',
    background: 'transparent',
    // Заметнее обычной подписи — это действие, а не текст.
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer'
  }
}