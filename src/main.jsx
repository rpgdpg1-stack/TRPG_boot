import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'

// Инициализируем Sentry до рендера. DSN берётся из env (VITE_SENTRY_DSN).
// Если DSN не задан (локальная разработка без .env) — Sentry не активируется,
// поэтому в дев-режиме ничего лишнего не шлётся.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Шлём ошибки только из боевой сборки (в dev отлаживаем по консоли).
    enabled: import.meta.env.PROD,
    // Откуда прилетела ошибка. Оба хостинга шлют в один проект Sentry, но
    // фильтруются по этому тегу: production — Timeweb (боевой trpg1.ru),
    // vercel — запасной аэродром. Считается по адресу, настраивать нечего.
    environment: window.location.hostname.endsWith('vercel.app')
      ? 'vercel'
      : 'production',
    // Версия сборки. Совпадает с релизом, под которым уходят source maps
    // (см. vite.config.js) — без этого Sentry не сопоставит карты со сборкой.
    release: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : undefined,
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