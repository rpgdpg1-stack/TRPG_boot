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
 *    После остановки по центру появляется прозрачная стеклянная кнопка ▶ —
 *    повтор ТОЛЬКО по ней (тап по всей миниатюре больше не перезапускает:
 *    случайное касание картинки не должно гонять ролик). Нажатие «растёт» и
 *    отменяется, если увести палец, — как крестик CloseCross.
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

/**
 * Проиграть ролик с начала, не роняя приложение.
 *
 * `play()` возвращает промис, и Safari отклоняет его с AbortError, когда старт
 * прервали: ушли с экрана, сменился источник, следом вызвали pause(). Синхронный
 * try/catch такой отказ НЕ ловит — он улетал в Sentry необработанным падением
 * (TRPG-REACT-4, 29.08.2026). Ловим сам промис: для человека это просто
 * непроигравшаяся гифка, поломки тут нет.
 */
function restartPlay(v) {
  try {
    v.currentTime = 0
    v.play()?.catch(() => { /* старт прервали — ничего страшного */ })
  } catch { /* ignore */ }
}

// playSize — диаметр кнопки ▶: 44 в миниатюре модалки, крупнее на большом кадре техники.
export default function ExerciseVideo({ videoUrl, previewUrl, size = 'full', playSize = 52 }) {
  // Размеры скругления: 33px для full (на всю ширину модалки/страницы),
  // 14px для compact (если когда-то понадобится в маленькой карточке).
  const borderRadius = size === 'compact' ? '14px' : '33px'
  const playsRef = useRef(0)
  const videoRef = useRef(null)
  const [pressed, setPressed] = useState(false)
  // Ролик доиграл и стоит — показываем кнопку повтора.
  const [ended, setEnded] = useState(false)

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
      setEnded(false)
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
      restartPlay(v)
    } else {
      try { v.pause(); v.currentTime = 0 } catch { /* ignore */ }
      setEnded(true)
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

  // Кнопка ▶ — проиграть ещё один цикл заново + лёгкая хаптика.
  const replay = () => {
    const v = videoRef.current
    if (!v) return
    haptic.light()
    playsRef.current = 0
    setEnded(false)
    restartPlay(v)
  }

  // Вся миниатюра тапается только при неудавшейся загрузке (повторить загрузку).
  // Повтор ролика — отдельной кнопкой ▶ (PlayAgainButton).
  const interactive = !!videoUrl && failed
  const wrapHandlers = interactive ? {
    onClick: (e) => { e.stopPropagation(); retry() },
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

      {videoUrl && src && !failed && ended && <PlayAgainButton onPlay={replay} size={playSize} />}
    </div>
  )
}

/**
 * Прозрачная круглая кнопка ▶ поверх застывшего кадра — стекло как в iOS:
 * тёмная полупрозрачная заливка + блюр + тонкий светлый хайрлайн. Тёмная, а не
 * белая: фон роликов белый, белое стекло на нём просто исчезло бы.
 *
 * 44px — минимальная зона под палец, и при этом кнопка не закрывает кадр
 * миниатюры 118px (занимает ~37% ширины, движение за ней видно).
 *
 * Нажатие: палец опустился — кружок растёт; увёл за пределы — вернулся, ничего
 * не случилось; отпустил на кнопке — повтор. Следующий синтетический click
 * гасим: без этого он долетал до оверлея модалки и мог её закрыть.
 */
function PlayAgainButton({ onPlay, size = 52 }) {
  const ref = useRef(null)
  const armed = useRef(false)
  const [press, setPress] = useState(false)

  const inside = (e) => {
    const r = ref.current?.getBoundingClientRect()
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  }
  const down = (e) => { e.stopPropagation(); armed.current = true; setPress(true) }
  const move = (e) => { if (armed.current && !inside(e)) { armed.current = false; setPress(false) } }
  const up = (e) => {
    e.stopPropagation()
    const was = armed.current
    armed.current = false
    setPress(false)
    if (was) onPlay()
  }
  const cancel = () => { armed.current = false; setPress(false) }

  return (
    <div style={styles.playLayer}>
      <button
        ref={ref}
        type="button"
        aria-label="Проиграть ещё раз"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...styles.playBtn,
          width: `${size}px`,
          height: `${size}px`,
          transform: press ? 'scale(var(--press-scale-up))' : 'scale(1)'
        }}
      >
        {/* Значок ~0.41 диаметра — пропорция та же при любом размере кнопки. */}
        <svg width={Math.round(size * 0.41)} height={Math.round(size * 0.41)} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', marginLeft: '2px' }}>
          <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z" fill="currentColor" />
        </svg>
      </button>
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
  // Слой по центру кадра: сам не ловит касаний, только кнопка.
  playLayer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) both'
  },
  playBtn: {
    pointerEvents: 'auto',
    width: '52px',
    height: '52px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: 'none',
    // Icon Button · Glass + волосок — общий рецепт стекла (над движущимся видео).
    background: 'var(--glass-bg)',
    backdropFilter: 'var(--glass-filter)',
    WebkitBackdropFilter: 'var(--glass-filter)',
    boxShadow: 'var(--glass-hairline), var(--glass-shadow)',
    color: 'var(--color-text)',
    opacity: 0.92,
    cursor: 'pointer',
    touchAction: 'none',
    WebkitTapHighlightColor: 'transparent',
    transition: 'transform var(--press-out) var(--ease-ios)'
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
