/**
 * Выбор картинки и видео упражнения под пол человека.
 *
 * Одно упражнение — одна запись в базе, но медиа у неё может быть в двух
 * вариантах: мужской и женский. Отдельного упражнения с буквой в id не заводим,
 * меняются только ссылки.
 *
 * ПРАВИЛО, одинаковое в обе стороны:
 *   1. есть вариант своего пола — показываем его;
 *   2. нет своего, но есть другого — показываем его. Женщине без женской гифки
 *      достанется мужская, мужчине без мужской — женская. Показать движение
 *      чужой моделью лучше, чем не показать вовсе;
 *   3. нет ни одного — пусто, дальше нарисуется заглушка.
 *
 * Старые preview_url / video_url остаются последним запасным вариантом:
 * они заполнены у всех, кто попал в базу до разделения по полу.
 */

import { getPersonalSync, savePersonal } from './personal-data'
import { cacheInvalidate } from './cache'
import { dropCatalogMemory } from '../features/programs/customProgram'

/**
 * Пол из личных данных. Не выбран — считаем мужским: так было до появления
 * выбора, и мужские гифки есть почти у всех упражнений.
 */
export function currentGender() {
  return getPersonalSync().sex === 'female' ? 'female' : 'male'
}

/**
 * Ссылки на медиа под указанный пол.
 * @returns {{preview_url: string|null, video_url: string|null}}
 */
export function pickMedia(ex, gender = currentGender()) {
  if (!ex) return { preview_url: null, video_url: null }

  const свой  = gender === 'female' ? 'female' : 'male'
  const чужой = gender === 'female' ? 'male' : 'female'

  const выбрать = (поле) =>
    ex[`${поле}_url_${свой}`] || ex[`${поле}_url_${чужой}`] || ex[`${поле}_url`] || null

  return { preview_url: выбрать('preview'), video_url: выбрать('video') }
}

/**
 * Проставить упражнению ссылки под пол — так, чтобы дальше по коду всё читалось
 * из привычных preview_url / video_url и ни один компонент не пришлось менять.
 */
export function applyGender(ex, gender = currentGender()) {
  if (!ex) return ex
  return { ...ex, ...pickMedia(ex, gender) }
}

/** То же для списка. */
export function applyGenderAll(list, gender = currentGender()) {
  if (!Array.isArray(list)) return list
  const g = gender
  return list.map(ex => applyGender(ex, g))
}

/**
 * Сменить пол в настройках.
 *
 * Каталог в памяти хранится уже разложенным под пол, поэтому его сбрасываем —
 * при следующем чтении ссылки соберутся заново. Диск и сеть не трогаем:
 * там лежат оба варианта, перекачивать нечего.
 */
export async function setGender(gender) {
  const v = gender === 'female' ? 'female' : 'male'
  await savePersonal({ sex: v })
  dropMediaCaches()
  return v
}

/**
 * Сбросить кеши, в которых лежат уже разложенные под пол ссылки.
 *
 * На диске и в сети хранятся оба варианта, перекачивать нечего — гасим только
 * память, чтобы при следующем чтении ссылки собрались заново.
 */
export function dropMediaCaches() {
  cacheInvalidate('exercises:all')
  cacheInvalidate('workout-day')
  // Каталог конструктора живёт в переменной модуля, до неё cacheInvalidate
  // не дотягивается — сбрасываем отдельно.
  dropCatalogMemory()
}
