import { useEffect, useState, useRef } from 'react'
import ActionButton from './ActionButton'
import ClockIcon from './ClockIcon'
import WeeklyMuscle from './WeeklyMuscle'
import BicepGesture from './BicepGesture'
import { getCurrentUser } from '../lib/auth'
import { EVENTS, on } from '../lib/events'
import { resolveWeeklyStreak } from '../utils/dates'
import { useScrollLock } from '../lib/use-scroll-lock'
import UiIcon from './UiIcon'

/**
 * Модалка завершения тренировки — с фирменным жестом «+1 мускул».
 * ОДНА на все разделы: силовая (`WorkoutDay`), заплыв (`SwimWorkout`) и любой
 * будущий (бег, растяжка). Раздел не рисует свою модалку и не меняет её вид —
 * он только передаёт свои показатели пропсами (`durationLabel`, `distanceLabel`).
 *
 * Сценарий (зачёт/лимит):
 *   1) Модалка появляется СРАЗУ (микроанимация scale+fade) — панель, жест, заголовок
 *      и кнопка стоят на своих местах с первого кадра.
 *   2) Жест играет ВНУТРИ неё: бицепс качается один раз и застывает, «+1» улетает
 *      вверх и гаснет (как на лоадере), искры продолжают лететь.
 *   3) Блоки с данными встают ОЧЕРЕДЬЮ (`blockPopIn`: увеличились и сели на место):
 *      строка показателей → возвращение → рекорды. Следующий ждёт, пока отыграет
 *      предыдущий, — модалка не «доливается» кусками в случайном порядке.
 *   4) «ОК» — модалка уходит обратной микроанимацией, затем `onConfirm`.
 *
 * Почему очередь, а не «показать всё сразу»: показатели зависят от ответа сервера
 * (серия за неделю — от `api_finish_workout`), рекорды и возвращение — от второго
 * запроса (`api_workout_highlights`). Раньше они молча подменяли уже показанные
 * цифры (огонёк прыгал 2→3) и вываливались в панель, когда доедут. Теперь место под
 * строку показателей зарезервировано, а каждый блок ВПЕРВЫЕ появляется уже готовым.
 *
 * Никакие мускулы/очки НЕ копятся — «+1» = «+1 тренировка» (идёт в недельный стрик
 * и счётчики статистики), лимит силовой — 1 в сутки.
 *
 * Состояния: idle | saving | error; offline — завершено без сети (в очередь).
 * При error/offline — обычная иконка (⚠️/📵), без жеста и без задержки.
 */
const CLOSE_MS = 260
// Первый блок очереди ждёт, пока улетит «+1» жеста: цифры не должны вставать
// в кадр, где ещё всё движется.
const FIRST_REVEAL_MS = 620
// Шаг очереди — столько длится само «увеличение и посадка» блока.
const REVEAL_STEP_MS = 520
// Сколько ждём сервер молча. Дольше — в зарезервированной строке проступает
// скелетон, чтобы пустое место не читалось как «всё, больше ничего не будет».
const SKELETON_AFTER_MS = 450
const REVEAL_ANIM = `blockPopIn ${REVEAL_STEP_MS}ms var(--ease-ios) both`

/**
 * Очередь появления блоков. `ready` — сколько блоков С НАЧАЛА очереди уже
 * готовы (данные пришли); возвращает, сколько из них уже показано.
 *
 * Блок встаёт не раньше, чем (а) пришли его данные и (б) отыграл предыдущий.
 * Пришли все разом — очередь всё равно разложит их по шагам; пришли с
 * опозданием — блок появится сразу, но той же анимацией, а не «мигнёт».
 */
function useRevealQueue(ready, firstDelay = FIRST_REVEAL_MS) {
  const [shown, setShown] = useState(0)
  const nextAt = useRef(Date.now() + firstDelay)
  useEffect(() => {
    if (shown >= ready) return
    const t = setTimeout(() => {
      nextAt.current = Date.now() + REVEAL_STEP_MS
      setShown(n => n + 1)
    }, Math.max(0, nextAt.current - Date.now()))
    return () => clearTimeout(t)
  }, [shown, ready])
  return shown
}

/** «32 дня» / «31 день» / «35 дней». */
function daysWord(n) {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}

export default function WorkoutFinishedModal({
  durationLabel = '',
  durationColor = 'var(--color-timer)',
  distanceLabel = '',
  limitNote = '',
  status = 'idle',
  errorMsg = '',
  offline = false,
  alreadyToday = false,
  // Пауза перед этой тренировкой, в днях. Заполнена только когда она длинная
  // (порог — 30 дней): возвращение после месяца тишины стоит отметить.
  comebackDays = null,
  // Что выросло по итогам тренировки: [{ name, value, delta }]. Пусто —
  // блока нет вовсе. Уменьшения сюда не попадают: рекорд — это только рост.
  records = [],
  onConfirm
}) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const isSaving = status === 'saving'
  const isError = status === 'error'
  const celebratory = !isError && !offline

  const [closing, setClosing] = useState(false)

  // Серия за неделю — тем же огоньком, что в шапке главной и в профиле. Тренировка
  // сохраняется параллельно, поэтому досчитываем после USER_CHANGED.
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  useEffect(() => {
    const upd = () => {
      const u = getCurrentUser()
      setStreak(resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week))
    }
    const off = on(EVENTS.USER_CHANGED, upd)
    const off2 = on(EVENTS.USER_READY, upd)
    return () => { off(); off2() }
  }, [])

  // Что вообще будет в очереди. Блок с данными сервера попадает в неё только
  // когда данные ПРИШЛИ, поэтому очередь не «зависает» на том, чего не будет.
  const statsReady = !isSaving && !isError
  const hasComeback = celebratory && comebackDays > 0
  const hasRecords = celebratory && records.length > 0
  const readyCount = statsReady ? 1 + (hasComeback ? 1 : 0) + (hasRecords ? 1 : 0) : 0
  // Оффлайн/ошибку ждать нечего: жеста с улетающим «+1» там нет.
  const shown = useRevealQueue(readyCount, celebratory ? FIRST_REVEAL_MS : 0)
  const statsShown = shown >= 1
  const comebackShown = hasComeback && shown >= 2
  const recordsShown = hasRecords && shown >= (hasComeback ? 3 : 2)

  // Сервер думает дольше обычного — показываем скелетон вместо пустого места.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (statsShown) return
    const t = setTimeout(() => setSlow(true), SKELETON_AFTER_MS)
    return () => clearTimeout(t)
  }, [statsShown])

  const titleText = isError ? 'Не удалось сохранить' : offline ? 'Сохранено локально' : 'Тренировка завершена'
  const buttonText = isSaving ? 'Сохранение…' : isError ? 'Повторить' : 'Готово'

  const handleClick = () => {
    if (isSaving || closing) return
    // Ошибка → повтор сохранения на месте, модалка остаётся. Иначе — плавно уходим.
    if (isError) { onConfirm?.(); return }
    setClosing(true)
    setTimeout(() => onConfirm?.(), CLOSE_MS)
  }

  return (
    <div ref={overlayRef} style={{ ...styles.overlay, opacity: closing ? 0 : 1 }}>
      <div style={{
        ...styles.panel,
        ...(isError ? styles.panelError : null),
        ...(closing ? styles.panelClosing : null)
      }}>
        <div style={styles.content}>
          {/* Жест «+1 мускул» (зачёт/лимит) или иконка ошибки/оффлайна. */}
          {celebratory
            ? <span style={styles.gestureWrap}><BicepGesture size={78} /></span>
            : <div style={styles.flame}><UiIcon name={isError ? 'alert' : 'network_off'} size={48} color="var(--color-offline)" /></div>}

          <div style={styles.body}>
            <div style={{ ...styles.title, color: (isError || offline) ? 'var(--color-offline)' : 'var(--color-primary)' }}>
              {titleText}
            </div>

            {/* Одна строка показателей: серия (огонёк + цифра), дистанция и время.
                Все — тем же кеглем/шрифтом, что счётчик серии на главной и в профиле.
                Место под строку держится ВСЕГДА (`statsSlot`), даже пока идёт
                сохранение: панель не должна прыгать, когда ответит сервер. */}
            {!isError && (
              <div style={styles.statsSlot}>
                {!statsShown && (
                  <div style={{ ...styles.statsRow, opacity: slow ? 1 : 0, transition: 'opacity 200ms ease' }} aria-hidden="true">
                    <span style={{ ...styles.skPill, width: '54px' }} />
                    <span style={{ ...styles.skPill, width: '72px' }} />
                  </div>
                )}
                {statsShown && (
                  <div style={{ ...styles.statsRow, animation: REVEAL_ANIM }}>
                    <span style={styles.stat}>
                      <WeeklyMuscle count={streak} size={22} />
                      {/* Число — акцентный зелёный, как рядом с бицепсом везде.
                          Оранжевый достался ему от огонька, которого больше нет. */}
                      <span style={{ ...styles.statNum, color: streak >= 1 ? 'var(--color-primary)' : 'rgba(255,255,255,0.4)' }}>{streak}</span>
                    </span>
                    {/* Дистанция — только у плавания. Обычная метрика: число
                        акцентом, единица серым. Иконки вида тут НЕТ — строка и так
                        читается, а лишний значок делал её пёстрой. */}
                    {distanceLabel && <Metric label={distanceLabel} />}
                    {durationLabel && (
                      <span style={styles.stat}>
                        {/* Время — СИГНАЛ (уложился / затянул / перебрал), поэтому
                            вся группа целиком в цвет зоны: часы, число и единица.
                            Покрась тут одну цифру — читалось бы как «важное число»,
                            а не как предупреждение. */}
                        <span style={{ ...styles.statClock, color: durationColor }}><ClockIcon size={18} /></span>
                        <Duration label={durationLabel} color={durationColor} />
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Возвращение — эмоциональный контекст всей тренировки, поэтому
                стоит сразу под показателями, до конкретных цифр рекордов.
                Только в успешном исходе: поздравлять с возвращением, когда
                тренировка не сохранилась, — издевательство. */}
            {comebackShown && (
              <div style={{ ...styles.comeback, animation: REVEAL_ANIM }}>
                <UiIcon name="celebration" size={26} />
                <span>
                  <b>{comebackDays}</b> {daysWord(comebackDays)} без тренировок —
                  <br />и ты снова здесь
                </span>
              </div>
            )}

            {/* Рекорды: только рост. Каждая строка — что выросло и насколько. */}
            {recordsShown && (
              <div style={{ ...styles.records, animation: REVEAL_ANIM }}>
                <div style={styles.recordsTitle}>
                  <UiIcon name="trophy" size={18} color="var(--color-primary)" />
                  <span>Новые результаты</span>
                </div>
                {records.map((r) => (
                  <div key={r.name} style={styles.recordRow}>
                    <span style={styles.recordName}>{r.name}</span>
                    <span style={styles.recordValue}>
                      {r.value}
                      {r.delta ? <span style={styles.recordDelta}> (+{r.delta})</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Похвала / заметка о лимите ждут ответа сервера и встают ВМЕСТЕ со
                строкой показателей: иначе «Отличная работа!» успевало моргнуть и
                смениться на «достигнут лимит» прямо на глазах. Высота слота
                фиксирована — панель от подмены не прыгает. */}
            {isError ? (
              <div style={styles.errorMessage}>{errorMsg || 'Проверь подключение к интернету и попробуй ещё раз.'}</div>
            ) : !statsShown ? (
              <div style={styles.praise} aria-hidden="true" />
            ) : offline ? (
              <div style={styles.errorMessage}>Тренировка сохранена на телефоне.<br />Данные обновятся, как только появится интернет.</div>
            ) : alreadyToday ? (
              // Лимит занимает МЕСТО похвалы (не добавляется под ней) — иначе
              // панель прыгала, когда сервер отвечал «уже засчитано».
              <div style={{ ...styles.limitNote, animation: REVEAL_ANIM }}>{limitNote || <>Достигнут лимит — 1 силовая в день.<br />Эта тренировка в статистику не войдёт.</>}</div>
            ) : (
              <div style={{ ...styles.praise, animation: REVEAL_ANIM }}>Отличная работа!</div>
            )}

            {/* Кнопка — крупная (md), как «Начать» в дне: это главное действие
                экрана, мельчить его незачем. */}
            <ActionButton
              variant="primary"
              onClick={handleClick}
              disabled={isSaving}
              style={{ marginTop: 'var(--space-1)', width: '100%', ...(isError ? { background: 'var(--color-offline)', borderColor: '#C46A28', color: 'var(--accent-on)' } : {}) }}
            >
              {buttonText}
            </ActionButton>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wfPanelIn { 0% { opacity: 0; transform: scale(0.92) translateY(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  )
}

/**
 * Время тренировки — вся строка одним цветом зоны (см. комментарий выше).
 * Единица чуть мельче числа, но того же цвета: это одно пятно-сигнал.
 */
function Duration({ label, color }) {
  return (
    <>
      {String(label).split(' ').map((part, i) => (
        <span key={i} style={{ ...(/^\d/.test(part) ? styles.durationNum : styles.durationUnit), color }}>{part}</span>
      ))}
    </>
  )
}

/** Обычная метрика («750 м»): число акцентом, единица серым. */
function Metric({ label }) {
  return (
    <span style={styles.stat}>
      {String(label).split(' ').map((part, i) => (
        <span key={i} style={/^[\d,.]/.test(part) ? styles.metricNum : styles.metricUnit}>{part}</span>
      ))}
    </span>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 12, 12, 0.9)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 'var(--space-5)',
    // Экран под модалкой заморожен: прокрутку гасим здесь (не трогая body —
    // position:fixed на нём дёргает закреплённую шапку дня).
    touchAction: 'none',
    overscrollBehavior: 'contain',
    // Затемнение уже стоит от модалки подтверждения — своего fade-in НЕ делаем,
    // иначе фон мигает на кадр при смене модалок.
    transition: `opacity ${CLOSE_MS}ms ease`
  },
  // Панель появляется сразу, целиком (жест играет уже внутри неё).
  // Обводки и зелёного свечения нет — акцент несут цифры и текст.
  panel: {
    width: '100%', maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    // «+1» жеста улетает вверх и обрезается краями панели, не вылезая наружу.
    overflow: 'hidden',
    animation: `wfPanelIn 0.32s var(--ease-ios) forwards`,
    transition: `opacity ${CLOSE_MS}ms ease, transform ${CLOSE_MS}ms var(--ease-ios)`
  },
  panelError: { border: '1px solid rgba(255, 140, 66, 0.3)' },
  panelClosing: { opacity: 0, transform: 'scale(0.94) translateY(6px)', animation: 'none' },
  content: {
    // Сверху воздуха больше: «+1» улетает вверх и не должен упираться в кромку.
    // Снизу жест подтянут к заголовку (отрицательный margin у сцены).
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)'
  },
  // Жест опущен ниже и придвинут к заголовку.
  gestureWrap: { marginTop: '0', marginBottom: '-16px' },
  flame: { fontSize: '58px', lineHeight: 1, filter: 'drop-shadow(0 0 14px rgba(255, 140, 66, 0.7))' },
  body: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
    transition: `opacity ${CLOSE_MS}ms ease`
  },
  // Обычный регистр (первая заглавная), акцентный зелёный.
  // Ступень выше остальных строк: это главная фраза экрана (title 18 → heading 22).
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-heading-size)', letterSpacing: '0.5px', textAlign: 'center' },
  durationNum: { fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)', letterSpacing: '0.5px' },
  durationUnit: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500 },
  metricNum: { fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)', color: 'var(--color-primary)', letterSpacing: '0.5px' },
  metricUnit: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500, color: 'var(--color-text-secondary)' },
  errorMessage: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.5, padding: 'var(--space-1)' },
  // Похвала и заметка о лимите занимают ОДНУ и ту же строку фиксированной высоты —
  // панель не меняет размер, когда приходит ответ сервера.
  praise: {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-title-size)', color: 'var(--color-text)',
    letterSpacing: '0.5px', textAlign: 'center',
    minHeight: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  // Возвращение. Мягкая плашка на приглушённой поверхности — праздник, но
  // не второй заголовок: главным в модалке остаётся «Тренировка завершена».
  comeback: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--surface-tonal)', borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    lineHeight: 1.35, color: 'var(--color-text)', textAlign: 'left'
  },
  // Рекорды — список, а не абзац: их бывает несколько, и глаз должен
  // пробегать по ним столбиком.
  records: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    width: '100%', textAlign: 'left'
  },
  recordsTitle: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    fontFamily: 'var(--font-manrope)', fontWeight: 700,
    fontSize: 'var(--text-label-size)', color: 'var(--color-primary)'
  },
  recordRow: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 'var(--space-3)'
  },
  recordName: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--text-info)', flex: 1, minWidth: 0
  },
  recordValue: {
    fontFamily: 'var(--font-manrope)', fontWeight: 700,
    fontSize: 'var(--text-label-size)', color: 'var(--color-text)', whiteSpace: 'nowrap'
  },
  // Прирост — тише самого значения: главное «стало», а не «насколько».
  recordDelta: { fontWeight: 500, color: 'var(--color-primary)' },
  // Место под строку показателей держится с первого кадра — панель не прыгает,
  // когда придёт ответ сервера и строка встанет.
  statsSlot: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '26px', width: '100%' },
  // Строка показателей: [огонёк N] [750 м] [часы N мин] — в линию, одинаковым кеглем.
  statsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-5)' },
  // Скелетон строки — проступает, только если сервер думает дольше обычного.
  skPill: { height: '20px', borderRadius: 'var(--radius-xs)', background: 'var(--layer-1)' },
  stat: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' },
  statNum: { fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)', letterSpacing: '0.5px' },
  statClock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  limitNote: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500, color: 'var(--color-text-secondary)',
    textAlign: 'center', lineHeight: 1.45, opacity: 0.85,
    minHeight: '34px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
  }
}
