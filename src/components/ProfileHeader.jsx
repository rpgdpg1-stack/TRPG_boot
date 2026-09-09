import { formatRelative } from '../utils/history'
import Avatar from './Avatar'

/**
 * Карточка-шапка профиля (соц-концепция без статусов — см. память проекта).
 * Переиспользуется на странице Профиль и в модалке профиля друга.
 *
 * Состав (компактно):
 *   [ АВАТАР ]  Имя                          [ rightAction? ]
 *               Последняя тренировка
 *               9 дней назад
 *   [ bottomAction? ]
 *
 * **Бицепса со счётчиком недели здесь БОЛЬШЕ НЕТ** (сентябрь 2026). Он пытался
 * быть сразу статусом активности и счётчиком, а расшифровать его состояния
 * (серый / бежевый / с цифрой) человек был не обязан. Тот же вопрос «я
 * тренируюсь на этой неделе?» уже закрыт строкой недели на главной, где счётчик
 * и остался. Здесь достаточно строки «Последняя тренировка N дней назад» — это
 * конкретный факт, одинаково понятный и себе, и другу.
 *
 * `rightAction` — что стоит справа вместо бицепса. В СВОЁМ профиле пусто, у
 * ДРУГА — золотой кубок рекордов (`ProfileMetrics mode="icon"`). Когда он есть,
 * строка «последняя тренировка» переносится на две строки, чтобы не налезать
 * на иконку.
 *
 * Пропсы: user, lastWorkout, statsLoading, rightAction, sections, bottomAction.
 */
export default function ProfileHeader({
  user,
  lastWorkout = null,
  // Тренируется прямо сейчас — заменяет строку «когда тренировался».
  isTraining = false,
  statsLoading = false,
  showLastWorkout = true,
  rightAction = null,          // справа от имени: кубок рекордов у друга
  sections = [],               // доп. секции внутри карточки (статистика, любимые) с разделителем
  bottomAction = null
}) {
  const displayName = user?.first_name || 'ATHLETE'

  // Полной фразой: «2 дня назад» под именем не говорит, о чём этот срок. В
  // СПИСКЕ друзей строка остаётся короткой — там она в ряду однотипных строк и
  // читается из контекста; здесь же это отдельная карточка про одного человека.
  const when = lastWorkout ? formatRelative(lastWorkout.finished_at) : null

  return (
    <div style={styles.card}>
      <div style={styles.topPanel}>
        <Avatar
          src={user?.photo_url}
          name={displayName}
          size={AVATAR_SIZE}
          radius="var(--radius-card)"
          letterSize="var(--text-hero-size)"
          letterWeight={800}
        />

        <div style={styles.infoColumn}>
          <span style={styles.name}>{displayName}</span>
          {showLastWorkout && (
            <div style={styles.lastRow}>
              {statsLoading ? (
                <span style={styles.skeletonLine} />
              ) : (
                <span style={{
                  ...(isTraining ? styles.trainingNow : styles.lastWhen),
                  // Рядом иконка — колонка узкая, и без запрета фраза рвётся по
                  // словам («Последняя / тренировка / 9 дней назад»). Перенос там
                  // задан явным <br/>, большего не нужно.
                  ...(rightAction ? styles.lastWhenFixed : null)
                }}>
                  {isTraining
                    ? 'Тренируется сейчас'
                    : when
                      // Рядом стоит иконка — переносим срок на вторую строку, иначе
                      // длинная фраза («Последняя тренировка 10 дней назад») налезает
                      // на неё. Свободна вся ширина — оставляем одной строкой.
                      ? (rightAction
                          ? <>Последняя тренировка<br />{when}</>
                          : `Последняя тренировка ${when}`)
                      : 'Ещё не тренировался'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Справа от имени — кубок рекордов (у друга) или ничего (свой профиль). */}
        {rightAction}
      </div>

      {/* Доп. секции внутри карточки (статистика, любимые) — каждая с разделителем. */}
      {sections.map((node, i) => (
        <div key={i} style={styles.section}>{node}</div>
      ))}

      {bottomAction && <div style={styles.bottomAction}>{bottomAction}</div>}

      <style>{`
        @keyframes headerSkeletonPulse { 0%,100%{opacity:0.4} 50%{opacity:0.9} }
      `}</style>
    </div>
  )
}

const AVATAR_SIZE = 104

const styles = {
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0',
    padding: 'var(--space-4)', background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', width: '100%'
  },
  // Доп. секция внутри карточки: разделитель НЕ до краёв (inset по паддингу карточки,
  // как принято для разграничителей), симметричные отступы сверху/снизу (16/16 —
  // paddingTop секции и paddingBottom карточки). Без negative-margin → линия не
  // упирается в края карточки.
  section: {
    marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--border-hairline)'
  },
  bottomAction: {
    marginLeft: '-16px', marginRight: '-16px', marginBottom: '-16px',
    borderTop: '1px solid var(--border-hairline)'
  },
  topPanel: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)' },
  infoColumn: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-15)' },
  // lineHeight 1.3, а не 1.1: `overflow: hidden` нужен многоточию, но он режет
  // всё, что вышло за строку, — при 1.1 хвосты «p», «g», «у», «д» упирались
  // в край и обрезались («Rpgdpg» терял низ обеих g). Высота строки должна
  // вмещать выносные элементы, иначе многоточие оплачивается обрезкой букв.
  name: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-heading-size)', fontWeight: 700, color: 'var(--color-text)',
    lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0
  },
  lastRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: '18px' },
  // Без nowrap: фраза стала длинной («Последняя тренировка 100 дней назад») и на
  // узком экране обязана переноситься сама, а не вылезать за карточку. Явный
  // перенос у друга (<br/>) от этого не зависит.
  lastWhen: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', lineHeight: 1.35
  },
  lastWhenFixed: { whiteSpace: 'nowrap' },
  // Тот же кегль и место, что у «3 дня назад», но акцентным цветом: карточка
  // друга не должна противоречить списку, из которого её открыли.
  trainingNow: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    color: 'var(--color-primary)'
  },
  skeletonLine: {
    display: 'inline-block', width: '110px', height: '10px', borderRadius: 'var(--radius-small)',
    background: 'var(--layer-2)', animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  }
}
