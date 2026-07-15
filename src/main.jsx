import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import { initAccent } from './lib/accent'

// Применяем выбранный акцент из localStorage ДО рендера — чтобы не было вспышки
// дефолтного цвета (кросс-девайс синк из облака догоняет позже, в App).
initAccent()

// Инициализируем Sentry до рендера. DSN берётся из env (VITE_SENTRY_DSN).
// Если DSN не задан (локальная разработка без .env) — Sentry не активируется,
// поэтому в дев-режиме ничего лишнего не шлётся.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Шлём ошибки только из боевой сборки (в dev отлаживаем по консоли).
    enabled: import.meta.env.PROD,
    // Доля трасс производительности. 0 — не собираем перформанс, только ошибки.
    tracesSampleRate: 0,
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)