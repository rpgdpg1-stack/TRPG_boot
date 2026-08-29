import { useRef, useState, useEffect, useCallback } from 'react'
import { haptic } from '../lib/telegram'
import { getMediaBlob } from '../lib/media-cache'
import { onNetworkChange } from '../lib/network-status'
import ExercisePlaceholder from './ExercisePlaceholder'

/**
 * Видео-превью упражнения.
 *
 * Используется в:
 *  - ExerciseActionMenu (мини-модалка по long-press) — width = 100% модалки
 *  - ExerciseInfo (полноэкранная страница инфо) — width = 100% контентной зоны
 *
 * Поведение:
 *  - Если есть video_url → автоплей без звука, проигрывается MAX_PLAYS раза и
 *    ЗАМИРАЕТ на первом кадре (не крутится бесконечно, чтобы не отвлекать).
 *    Заново проигрывается при следующем открытии (компонент перемонтируется).
 *  - Если только preview_url → показываем картинку
 *  - Если ничего → эмодзи-заглушка на белом фоне
 *
 * ОТКУДА БЕРЁТСЯ РОЛИК. Не прямой ссылкой, а через `media-cache`: файл
 * скачивается целиком, ложится в Cache API и играется из блоба. Так он
 * работает и без сети, и не обрывается на слабой связи. Раньше `<video>`
 * тянул файл кусками прямо с хранилища — на плохом интернете данные не
 * доходили, ошибки при этом не было, и человек видел застывший постер
 * (превью) вместо движения, без единого намёка, что что-то пошло не так.
 * Теперь такой случай честно откатывается на превью с подписью «Повторить»:
 * тап перезапускает загрузку, и она же повторяется сама, когда вернётся сеть.
 *
 * Квадратное соотношение (aspect-ratio: 1) — задаётся CSS.
 * Скругление 33px — для консистентности с карточками упражнений.
 *
 * Технические тонкости:
 *  - muted ОБЯЗАТЕЛЕН для autoplay в iOS Safari и Telegram WebView
 *  - playsInline ОБЯЗАТЕЛЕН чтобы видео не открывалось в полноэкранном плеере
 *  - poster={preview_url} — пока ролик готовится, показываем картинку
 *  - play() возвращает промис: браузер может отклонить автостарт, поэтому
 *    повторяем попытку по canplay, а не считаем, что запуск удался
 */
const MAX_PLAYS = 1 // сколько раз проиграть перед остановкой на первом кадре

export default function ExerciseVideo({ videoUrl, previewUrl, size = 'full' }) {
  // Размеры скругления: 33px для full (на всю ширину модалки/страницы),
  // 14px для compact (если когда-то понадобится в маленькой карточке).
  const borderRadius = size === 'compact' ? '14px' : '33px'
  const playsRef = useRef(0)
  const videoRef = useRef(null)
  const [pressed, setPressed] = useState(false)

  // Готовый к показу ролик (blob:-ссылка) и признак «не смогли достать».
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  // Меняем, чтобы попросить загрузку заново (тап по превью, возврат сети).
  const [attempt, setAttempt] = useState(0)

  // Забираем ролик через кеш. Каждая попытка живёт в своём эффекте: при
  // размонтировании освобождаем blob-ссылку, иначе они копятся в памяти.
  useEffect(() => {
    if (!videoUrl) { setSrc(null); setFailed(false); return }

    let cancelled = false
    let objectUrl = null

    setFailed(false)
    getMediaBlob(videoUrl).then(blob => {
      if (cancelled) return
      if (!blob) { setFailed(true); return }
      objectUrl = URL.createObjectURL(blob)
      playsRef.current = 0
      setSrc(objectUrl)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [videoUrl, attempt])

  // Сеть вернулась, а ролик так и не доехал — пробуем ещё раз сами.
  useEffect(() => {
    if (!failed) return
    return onNetworkChange((online) => {
      if (online) setAttempt(a => a + 1)
    })
  }, [failed])

  const retry = useCallback(() => {
    haptic.light()
    setAttempt(a => a + 1)
  }, [])

  // Счётчик проигрываний. loop убран: после каждого конца сами решаем — ещё раз
  // или стоп на первом кадре (currentTime=0 + pause).
  const handleEnded = (e) => {
    const v = e.currentTarget
    playsRef.current += 1
    if (playsRef.current < MAX_PLAYS) {
      try { v.currentTime = 0; v.play() } catch { /* ignore */ }
    } else {
      try { v.pause(); v.currentTime = 0 } catch { /* ignore */ }
    }
  }

  // Браузер может отклонить автостарт (политика автовоспроизведения, ролик
  // ещё не готов). Пробуем запустить руками, когда данных уже хватает.
  const handleCanPlay = (e) => {
    const v = e.currentTarget
    if (playsRef.current >= MAX_PLAYS || !v.paused) return
    const started = v.play()
    if (started?.catch) started.catch(() => { /* запустится по тапу */ })
  }

  // Тап по миниатюре с видео — проиграть ещё один цикл заново + лёгкая хаптика.
  const replay = () => {
    const v = videoRef.current
    if (!v) return
    haptic.light()
    playsRef.current = 0
    try { v.currentTime = 0; v.play() } catch { /* ignore */ }
  }

  // Интерактивна миниатюра с видео (есть что переигрывать) и неудавшаяся
  // загрузка (есть что повторить).
  const interactive = !!videoUrl && (!!src || failed)
  const onTap = failed ? retry : replay
  const wrapHandlers = interactive ? {
    onClick: (e) => { e.stopPropagation(); onTap() },
    onPointerDown: (e) => { e.stopPropagation(); setPressed(true) },
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    onPointerCancel: () => setPressed(false)
  } : {}

  return (
    <div
      {...wrapHandlers}
      style={{
        ...styles.wrap,
        borderRadius,
        cursor: interactive ? 'pointer' : 'default',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        transition: 'transform 0.12s var(--ease-ios)'
      }}
    >
      {videoUrl && src && !failed ? (
        <video
          ref={videoRef}
          src={src}
          poster={previewUrl || undefined}
          autoPlay
          muted
          playsInline
          preload="auto"
          onLoadStart={() => { playsRef.current = 0 }}
          onCanPlay={handleCanPlay}
          onEnded={handleEnded}
          onError={() => setFailed(true)}
          style={styles.video}
        />
      ) : previewUrl ? (
        <>
          <img src={previewUrl} alt="" style={styles.img} draggable={false} />
          {/* Ролик не доехал: говорим об этом прямо и даём повторить тапом —
              молчаливый застывший кадр читался как «видео сломалось». */}
          {failed && <span style={styles.retryHint}>Повторить</span>}
        </>
      ) : (
        <ExercisePlaceholder size={56} />
      )}
    </div>
  )
}

const styles = {
  // Квадратная "рамка" — aspect-ratio гарантирует что высота = ширина
  // на любом устройстве, без хаков с padding-bottom
  wrap: {
    width: '100%',
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    background: 'var(--color-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },
  // Подпись поверх превью — та же стеклянная пилюля, что у статуса сети.
  retryHint: {
    position: 'absolute',
    bottom: 'var(--space-4)',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: 'var(--space-15) var(--space-4)',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--surface-glass)',
    backdropFilter: 'var(--blur-glass)',
    WebkitBackdropFilter: 'var(--blur-glass)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    pointerEvents: 'none'
  }
}
