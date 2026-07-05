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
        <div style={styles.icon}>⚠️</div>

        <div style={styles.title}>ЧТО-ТО ПОШЛО НЕ ТАК</div>

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

        <button onClick={this.handleReload} style={styles.button}>
          ПЕРЕЗАПУСТИТЬ
        </button>

        <button onClick={this.handleClose} style={styles.closeButton}>
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
    padding: '20px',
    zIndex: 9999,
    gap: '16px'
  },
  icon: {
    fontSize: '64px',
    lineHeight: 1,
    marginBottom: '8px'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '18px',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    textAlign: 'center'
  },
  message: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
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
    padding: '12px 14px',
    marginTop: '4px'
  },
  errorTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '10px',
    color: '#E84545',
    letterSpacing: '1px',
    marginBottom: '6px'
  },
  errorText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-word',
    lineHeight: 1.4
  },
  button: {
    marginTop: '12px',
    padding: '14px 32px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '2px',
    borderRadius: 'var(--radius-medium)',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(158, 209, 83, 0.3)'
  },
  closeButton: {
    marginTop: '4px',
    padding: '10px 20px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer'
  }
}