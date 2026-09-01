import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Плагин dev-сервера: ХРАНИЛИЩЕ ЖИВОЙ СЕССИИ для локального входа.
 *
 * ЗАЧЕМ. Токен обновления у Supabase одноразовый: им воспользовались — выдан
 * новый, старый мёртв. Пока токен лежал строкой в `.env.local`, каждый запуск
 * dev-сборки в чистом профиле браузера сжигал его, и на следующий раз вход не
 * работал — приходилось заново входить по коду с почты и переписывать строку
 * руками. Теперь свежий токен возвращается СЮДА и ложится в файл, поэтому
 * следующий запуск (в том числе из нового профиля Playwright) входит сам.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ `.env.local`. Vite следит за env-файлами и на
 * любое их изменение перезапускает сервер — запись токена в `.env.local`
 * зацикливала бы перезапуски (вошли → записали → рестарт → вошли…).
 * `.dev-session.json` не watch-ится и лежит в .gitignore.
 *
 * БЕЗОПАСНОСТЬ. `apply: 'serve'` — плагина нет ни в боевой сборке, ни в
 * `vite build`. Ручка отвечает только localhost-серверу разработки, а токен
 * и так лежит на этой же машине.
 */

const FILE = '.dev-session.json'
const ROUTE = '/__dev-session'

function читать(root) {
  const p = resolve(root, FILE)
  if (!existsSync(p)) return null
  try {
    const v = JSON.parse(readFileSync(p, 'utf8'))
    return typeof v?.refresh_token === 'string' ? v.refresh_token : null
  } catch { return null }
}

function писать(root, token) {
  const p = resolve(root, FILE)
  writeFileSync(p, JSON.stringify({ refresh_token: token, saved_at: new Date().toISOString() }, null, 2))
}

export default function devSessionPlugin() {
  let root = process.cwd()
  return {
    name: 'dev-session-store',
    apply: 'serve',
    configResolved(config) { root = config.root || process.cwd() },
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          // Файла ещё нет — отдаём посев из .env.local (первый вход после
          // того, как токен добыли руками). Дальше файл ведёт себя сам.
          const token = читать(root) || process.env.VITE_DEV_REFRESH_TOKEN || null
          res.end(JSON.stringify({ refresh_token: token }))
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { refresh_token: token } = JSON.parse(body || '{}')
              if (typeof token === 'string' && token.length > 10) {
                писать(root, token)
                res.end(JSON.stringify({ ok: true }))
                return
              }
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: 'no token' }))
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: e?.message || 'bad json' }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end(JSON.stringify({ ok: false }))
      })
    }
  }
}
