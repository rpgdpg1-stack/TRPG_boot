import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ID сборки: вшивается в бандл (__BUILD_ID__) и кладётся рядом в version.json.
// Рантайм сверяет их при пробуждении приложения (lib/version-check.js) — если
// на сервере уже другая сборка, значит WebView Telegram держит старый бандл
// (замороженная/восстановленная страница) → жёсткая перезагрузка на свежую.
const buildId = Date.now().toString(36)

export default defineConfig({
  plugins: [
    react(),
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
    }
  ],
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  },
  server: {
    port: 5173
  }
})
