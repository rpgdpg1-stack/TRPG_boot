import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import devSessionPlugin from './scripts/dev-session-plugin.mjs'

// ID сборки: вшивается в бандл (__BUILD_ID__) и кладётся рядом в version.json.
// Рантайм сверяет их при пробуждении приложения (lib/version-check.js) — если
// на сервере уже другая сборка, значит WebView Telegram держит старый бандл
// (замороженная/восстановленная страница) → жёсткая перезагрузка на свежую.
const buildId = Date.now().toString(36)

// Загрузка source maps в Sentry. Без source maps в отчёте видна сжатая каша
// (index-abc123.js:38:23322) вместо «WorkoutDay.jsx, строка 310».
// Включается ТОЛЬКО когда в окружении сборки есть SENTRY_AUTH_TOKEN:
// на хостинге он задан — карты собираются, улетают в Sentry и удаляются из dist;
// локально токена нет — сборка идёт как раньше, карты не создаются и не утекают.
const sentryToken = process.env.SENTRY_AUTH_TOKEN
const sentryPlugin = sentryToken
  ? sentryVitePlugin({
      org: process.env.SENTRY_ORG || 'trpg',
      project: process.env.SENTRY_PROJECT || 'trpg-react',
      // Организация в европейском регионе — иначе загрузка уходит «не туда».
      url: process.env.SENTRY_URL || 'https://de.sentry.io',
      authToken: sentryToken,
      // Имя релиза = наш buildId, тот же, что уходит в Sentry.init.
      release: { name: buildId },
      sourcemaps: {
        // Карты нужны только Sentry — с сервера удаляем, чтобы исходники
        // не лежали в открытом доступе.
        filesToDeleteAfterUpload: ['dist/**/*.map']
      }
    })
  : null

export default defineConfig({
  plugins: [
    react(),
    // Хранилище токена локальной сессии (только dev-сервер, см. плагин).
    devSessionPlugin(),
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ id: buildId })
        })
      }
    },
    sentryPlugin
  ].filter(Boolean),
  build: {
    // Карты генерим только под загрузку в Sentry (см. sentryPlugin выше).
    // 'hidden' — карты создаются, но ссылки на них в коде НЕ остаётся: даже
    // если файл случайно уедет на сервер, браузер о нём не объявит.
    sourcemap: sentryToken ? 'hidden' : false
  },
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  },
  server: {
    port: 5173
  }
})
