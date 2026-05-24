/**
 * Зацикленный видео-превью упражнения.
 *
 * Используется в:
 *  - ExerciseActionMenu (мини-модалка по long-press) — width = 100% модалки
 *  - ExerciseInfo (полноэкранная страница инфо) — width = 100% контентной зоны
 *
 * Поведение:
 *  - Если есть video_url → играем mp4 с автоплеем, без звука, зацикленно
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
export default function ExerciseVideo({ videoUrl, previewUrl, size = 'full' }) {
  // Размеры скругления: 33px для full (на всю ширину модалки/страницы),
  // 14px для compact (если когда-то понадобится в маленькой карточке).
  const borderRadius = size === 'compact' ? '14px' : '33px'

  return (
    <div style={{ ...styles.wrap, borderRadius }}>
      {videoUrl ? (
        <video
          src={videoUrl}
          poster={previewUrl || undefined}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
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