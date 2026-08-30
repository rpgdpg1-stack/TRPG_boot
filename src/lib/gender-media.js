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

import { getPrefSync, setPref } from './prefs'
import { cacheInvalidate } from './cache'

export const GENDER_KEY = 'gender'

/** Пол из настроек. Не выбран — считаем мужским: так было до появления выбора. */
export function currentGender() {
  return getPrefSync(GENDER_KEY, 'male') === 'female' ? 'female' : 'male'
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
  await setPref(GENDER_KEY, v)
  cacheInvalidate('exercises:all')
  cacheInvalidate('workout-day')
  return v
}
