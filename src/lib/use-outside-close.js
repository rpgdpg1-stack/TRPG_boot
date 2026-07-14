import { useEffect } from 'react'

/**
 * Закрывает дропдаун при тапе ВНЕ его блока (ref). Надёжнее оверлея-«ловушки»:
 * работает независимо от стекинга/трансформаций и гарантирует, что одновременно
 * открыт только один селектор — тап по другому селектору закроет этот.
 *
 * ref   — контейнер, включающий и кнопку-селектор, и сам дропдаун.
 * open  — открыт ли сейчас.
 * close — колбэк закрытия.
 */
export function useOutsideClose(ref, open, close) {
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, ref, close])
}
