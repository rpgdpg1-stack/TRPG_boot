import { useEffect, useState } from 'react'

/**
 * Высота экранной клавиатуры (px), 0 когда закрыта. Через visualViewport API.
 *
 * Идея: visualViewport — видимая часть экрана. Когда вылезает клавиатура, его
 * height уменьшается на её высоту. Высота клавиатуры =
 * window.innerHeight − visualViewport.height − visualViewport.offsetTop.
 *
 * Применение: центрированному оверлею модалки даём paddingBottom = этот inset —
 * модалка сама плавно приподнимается над клавиатурой (flex-center делает всё).
 * Для страницы — можно дать paddingBottom скролл-контейнеру.
 *
 * Фолбэк: если visualViewport нет (очень старый клиент) — всегда 0.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // < 80px — это не клавиатура (адресная строка/мелкие колебания), гасим.
      setInset(kb > 80 ? kb : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
