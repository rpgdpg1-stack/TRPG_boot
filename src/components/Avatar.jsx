import { useState } from 'react'

/**
 * Аватар человека — один вид и одно поведение везде: своя карточка профиля,
 * строка друга, модалка чужого профиля.
 *
 * ЧТО ПОКАЗЫВАЕМ, ПОКА ФОТО ЛЕТИТ.
 * Буква — это ЗАМЕНА фото, а не подложка под него. Поэтому:
 *   • фото есть (Telegram отдал ссылку) → пока грузится, видно тихую
 *     пульсирующую плитку, затем проявляется фото. Буквы не бывает вовсе;
 *   • фото нет (вход по почте) или не доехало → сразу буква имени.
 *
 * Раньше буква была нарисована ВСЕГДА, а фото ложилось поверх — и у человека
 * с аватаркой на каждом заходе мелькала чужая по смыслу буква, потом рывком
 * подменялась фотографией. Пульсация честнее: она означает «сейчас будет»,
 * а буква означает «фото не будет». Разные вещи — разный вид.
 *
 * ПОЧЕМУ ФОТО НЕ КЕШИРУЕТСЯ В НАШ КЕШ (как ролики упражнений).
 * Аватарки Telegram отдаются с t.me / telegram.me БЕЗ заголовка
 * Access-Control-Allow-Origin, поэтому забрать их в blob через fetch нельзя —
 * браузер не отдаст данные. Наш `media-cache` тут бессилен: он работает ровно
 * потому, что наше S3 разрешает CORS. Остаётся HTTP-кеш браузера, а Telegram
 * ставит на аватарки `max-age=3600` — через час картинка перезапрашивается.
 * Отсюда и «серая плитка на секунду» при заходе.
 *
 * Что делаем взамен: помним в пределах сессии, какие ссылки уже отрисовались
 * (`shown`). Возврат на экран, переход между вкладками, повторное открытие
 * друга — фото ставится сразу и без проявления. Плавный вход играет только
 * при ПЕРВОМ показе картинки, чтобы не мигало на каждом рендере списка.
 *
 * Полное решение (аватарка в нашем S3 рядом с гифками — тогда и оффлайн, и
 * immutable-кеш) требует серверной части: качать фото при входе и хранить у
 * себя. Пока не сделано.
 */

// URL, которые уже успешно показались в этой сессии. Модульный Set, а не
// состояние: он общий для всех аватаров и переживает размонтирование строк
// при прокрутке списка друзей.
const shown = new Set()

export default function Avatar({
  src,
  name,
  size,
  radius = 'var(--radius-medium)',
  letterSize = 'var(--text-heading-size)',
  letterWeight = 700,
  style
}) {
  const [failed, setFailed] = useState(false)
  // Первый показ этой ссылки — проявляем; уже видели — ставим мгновенно.
  const [ready, setReady] = useState(() => (src ? shown.has(src) : false))

  const letter = (name || '').trim().charAt(0).toUpperCase() || '?'
  const showImg = !!src && !failed
  // Буква — только когда фотографии не будет: её нет или она не загрузилась.
  const showLetter = !src || failed
  // Ждём фото: показываем пульсацию вместо пустой плитки.
  const loading = showImg && !ready

  return (
    <div
      style={{
        position: 'relative',
        width: size, height: size,
        borderRadius: radius,
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-hairline)',
        ...style
      }}
    >
      {/* Пульсация — только пока летит фото. Показывает «сейчас будет». */}
      {loading && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'var(--layer-2)',
            animation: 'skeletonPulse 1.2s ease-in-out infinite'
          }}
        />
      )}

      {/* Буква — когда фотографии не будет: её нет или она не доехала. */}
      {showLetter && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: letterWeight,
            fontSize: letterSize,
            color: 'var(--color-primary)',
            userSelect: 'none'
          }}
        >
          {letter}
        </div>
      )}

      {showImg && (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => { shown.add(src); setReady(true) }}
          // Сеть отвалилась или ссылка протухла — снимаем картинку и оставляем
          // букву. Молча показывать сломанный <img> нельзя: в WebView это серый
          // квадрат с иконкой битого файла.
          onError={() => setFailed(true)}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            opacity: ready ? 1 : 0,
            transition: 'opacity 0.18s ease'
          }}
        />
      )}
    </div>
  )
}
