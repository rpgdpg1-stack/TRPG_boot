import { useState, useEffect } from 'react'
import { cloudGet, cloudSet } from './cloud-storage'
import { localGet, localSet } from '../utils/storage'

/**
 * Выбранное место программы (Зал/Дом/Улица) с запоминанием между сессиями и
 * устройствами. Ключ `program-place:<slug>`. Используется переключателем места
 * (PlaceSwitcher) и экраном дня тренировки — оба читают один и тот же выбор.
 *
 * Старт мгновенный из localStorage; затем догоняем из Telegram CloudStorage
 * (кросс-девайс). Если сохранённое место исчезло из доступных (удалили в
 * конструкторе) — откатываемся на первое доступное.
 *
 * places — массив доступных мест программы (getProgramPlaces). Возвращает
 * [place, setPlace].
 */
export function placeKey(slug) {
  return `program-place:${slug}`
}

export function useProgramPlace(slug, places) {
  const key = placeKey(slug)
  const placesKey = places.join(',')

  const [place, setPlaceState] = useState(() => {
    const saved = localGet(key)
    return (saved && places.includes(saved)) ? saved : (places[0] || 'gym')
  })

  // Догоняем из облака (другое устройство).
  useEffect(() => {
    let alive = true
    cloudGet(key).then(v => {
      if (alive && v && places.includes(v)) setPlaceState(v)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, placesKey])

  // Выбранное место пропало из доступных — откат на первое.
  useEffect(() => {
    if (places.length && !places.includes(place)) setPlaceState(places[0])
  }, [placesKey, place, places])

  const setPlace = (loc) => {
    setPlaceState(loc)
    localSet(key, loc)
    cloudSet(key, loc)
  }

  return [place, setPlace]
}
