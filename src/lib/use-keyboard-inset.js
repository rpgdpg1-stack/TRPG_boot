import { useEffect, useState } from 'react'

/**
 * Высота экранной клавиатуры (px), 0 когда закрыта. Через visualViewport API.
 *
 * visualViewport — видимая часть экрана; при открытии клавиатуры его height
 * уменьшается на её высоту. Высота клавиатуры =
 * window.innerHeight − visualViewport.height − visualViewport.offsetTop.
 *
 * Применение: центрированному оверлею модалки даём paddingBottom = inset — модалка
 * поднимается над клавиатурой САМА, и iOS не приходится скроллить поле ввода
 * (иначе курсор/выделение «телепортируется» при скролле).
 *
 * Фолбэк: нет visualViewport (очень старый клиент) → всегда 0.
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
