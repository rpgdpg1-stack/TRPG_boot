import { useRef, useState } from 'react'
import { haptic } from '../lib/telegram'

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
 * Квадратное соотношение (aspect-ratio: 1) — задаётся CSS.
 * Скругление 33px — для консистентности с карточками упражнений.
 *
 * Технические тонкости:
 *  - muted ОБЯЗАТЕЛЕН для autoplay в iOS Safari и Telegram WebView
 *  - playsInline ОБЯЗАТЕЛЕН чтобы видео не открывалось в полноэкранном плеере
 *  - preload="metadata" — не качаем весь файл сразу, ждём пока компонент в DOM
 *  - poster={preview_url} — пока видео грузится, показываем картинку (нет белого моргания)
 */
const MAX_PLAYS = 1 // сколько раз проиграть перед остановкой на первом кадре

export default function ExerciseVideo({ videoUrl, previewUrl, size = 'full' }) {
  // Размеры скругления: 33px для full (на всю ширину модалки/страницы),
  // 14px для compact (если когда-то понадобится в маленькой карточке).
  const borderRadius = size === 'compact' ? '14px' : '33px'
  const playsRef = useRef(0)
  const videoRef = useRef(null)
  const [pressed, setPressed] = useState(false)

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

  // Тап по миниатюре с видео — проиграть ещё один цикл заново + лёгкая хаптика.
  const replay = () => {
    const v = videoRef.current
    if (!v) return
    haptic.light()
    playsRef.current = 0
    try { v.currentTime = 0; v.play() } catch { /* ignore */ }
  }

  // Интерактивна только миниатюра с видео (есть что переигрывать). Микро-пресс —
  // лёгкий вжим на тап (тактильный отклик на действие).
  const interactive = !!videoUrl
  const wrapHandlers = interactive ? {
    onClick: (e) => { e.stopPropagation(); replay() },
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
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          poster={previewUrl || undefined}
          autoPlay
          muted
          playsInline
          preload="metadata"
          onLoadStart={() => { playsRef.current = 0 }}
          onEnded={handleEnded}
          style={styles.video}
        />
      ) : previewUrl ? (
        <img src={previewUrl} alt="" style={styles.img} draggable={false} />
      ) : (
        <div style={styles.placeholder}>💪</div>
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
    background: '#FFFFFF',
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
  placeholder: {
    fontSize: '64px',
    opacity: 0.4
  }
}