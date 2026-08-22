/**
 * Подчистка source maps после сборки.
 *
 * Карты нужны только Sentry — плагин загружает их и удаляет сам. Но если
 * загрузка сорвалась (например, сборочная площадка не достучалась до Sentry),
 * плагин ничего не удаляет, и карты уезжают на боевой сайт: по ним читается
 * весь исходный код приложения. Этот шаг выполняется последним в `npm run build`
 * и сносит карты в любом случае — успешной была загрузка или нет.
 */
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const dir = 'dist/assets'

let files = []
try {
  files = await readdir(dir)
} catch {
  process.exit(0) // сборки нет — чистить нечего
}

const maps = files.filter((f) => f.endsWith('.map'))
await Promise.all(maps.map((f) => rm(join(dir, f), { force: true })))

if (maps.length) console.log(`[strip-maps] удалено карт: ${maps.length}`)
