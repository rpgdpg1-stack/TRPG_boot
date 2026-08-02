import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, confirm as tgConfirm } from '../lib/telegram'
import { clearAllData, resetProgramDayCycle } from '../lib/storage'
import { refreshCurrentUser } from '../lib/auth'
import { PROGRAMS } from '../features/programs/registry'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import { SectionLabel } from '../components/GroupLabel'

/**
 * Экран настроек.
 *
 * Сверху — шапка с иконкой настроек и заголовком «НАСТРОЙКИ» (чтобы понимать
 * на какой странице находишься).
 *
 * Разделы сгруппированы по смыслу (как РАЗДЕЛЫ на главной): заголовок + единая
 * карточка со строками, разделители, серая подсветка .tg-row.
 *
 * Группа «Сброс» — обнулялки (цветной заголовок строки как маркер опасности).
 */
export default function Settings() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const groups = [
    {
      title: 'Основное',
      items: [
        { id: 'privacy',       icon: 'ui:privacy',       iconColor: 'var(--color-text-secondary)', title: 'Приватность',  subtitle: 'Что видят друзья',           path: '/privacy' },
        { id: 'notifications', icon: 'ui:notifications', iconColor: 'var(--color-text-secondary)', title: 'Уведомления',  subtitle: 'Напоминания о тренировках',  soon: true, path: '/notifications' },
        { id: 'about',         icon: 'ui:info',          iconColor: 'var(--color-text-secondary)', title: 'О приложении', subtitle: 'Версия · Политика',          path: '/about' }
      ]
    },
    {
      title: 'Поддержка',
      items: [
        { id: 'support',  icon: 'ui:support', iconColor: 'var(--color-text-secondary)', title: 'Поддержка',           subtitle: 'Частые вопросы · Написать',  path: '/support' },
        { id: 'feedback', icon: 'ui:idea',    iconColor: 'var(--color-text-secondary)', title: 'Идеи и предложения',  subtitle: 'Помоги улучшить приложение', soon: true, path: '/feedback' },
        { id: 'gift',     icon: 'ui:gift',    iconColor: 'var(--color-text-secondary)', title: 'Подарить сертификат', subtitle: 'Подарок другу',              soon: true, path: '/gift' }
      ]
    },
    {
      title: 'Сброс',
      items: [
        { id: 'debug-reset-days', icon: 'ui:reset_days',     iconColor: 'var(--color-warning)', title: 'Сбросить порядок дней', subtitle: 'Дни во всех программах станут серыми', tone: 'warning' },
        { id: 'debug-reset',      icon: 'ui:reset_progress', iconColor: 'var(--color-error)', title: 'Сбросить прогресс',     subtitle: 'Полное обнуление — как с нуля',        tone: 'danger' }
      ]
    }
  ]

  const handleSectionTap = async (item) => {
    // «Скоро» = не готов бэкенд, но экран уже можно посмотреть (см. Profile).
    if (!item.path && !item.tone) return
    haptic.light()

    if (item.path) { navigate(item.path); return }

    if (item.id === 'debug-reset-days') {
      const confirmed = await tgConfirm(
        'Сбросить порядок дней?\n\nПрогресс, мускулы и стрик НЕ пострадают.\n\nПосле сброса все три буквы дней станут серыми — выберешь сам с какого дня хочешь начать.'
      )
      if (!confirmed) return

      try {
        // Сбрасываем цикл дней у всех программ, а не только у split —
        // чтобы кнопка работала и для будущих программ без правок здесь.
        for (const prog of PROGRAMS) {
          await resetProgramDayCycle(prog.slug)
        }
        haptic.success()
        window.alert('Порядок дней сброшен. Перезайди в приложение чтобы увидеть изменения.')
      } catch (err) {
        console.error('[Settings] reset days failed:', err)
        haptic.error()
        window.alert('Не удалось сбросить порядок дней. Проверь подключение.')
      }
      return
    }


    if (item.id === 'debug-reset') {
      const confirmed = await tgConfirm(
        'Сбросить весь прогресс?\n\nУдалятся: мускулы, недельный стрик, все квесты, история начислений, значки лиг, история тренировок и полученные подстраховки.\n\nЭто действие нельзя отменить.'
      )
      if (!confirmed) return

      try {
        await clearAllData()
        await refreshCurrentUser()
        window.dispatchEvent(new CustomEvent('xp-updated'))
        haptic.success()
        window.alert('Прогресс сброшен. Перезагрузи приложение чтобы увидеть изменения.')
      } catch (err) {
        console.error('[Settings] reset failed:', err)
        haptic.error()
        window.alert('Не удалось сбросить прогресс. Проверь подключение к интернету.')
      }
      return
    }
  }

  const titleColor = (tone) =>
    tone === 'danger' ? 'var(--color-error)'
    : tone === 'warning' ? 'var(--color-warning)'
    : 'var(--color-text)'

  return (
    <div className="page page-fade" style={styles.page}>

      <ScreenTitle>Настройки</ScreenTitle>

      {groups.map((group, gIdx) => (
        <section key={group.title}>
          <SectionLabel style={{ marginTop: gIdx === 0 ? 'var(--space-1)' : 'var(--space-6)' }}>
            {group.title}
          </SectionLabel>

          <div style={styles.groupCard}>
            {group.items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                className={item.path || item.tone ? 'tg-row' : undefined}
                disabled={!item.path && !item.tone}
                style={{
                  ...styles.row,
                  borderTop: idx === 0 ? 'none' : '1px solid var(--highlight-recent)',
                  ...(item.soon ? styles.rowSoon : {})
                }}
              >
                <UiIcon
                  name={item.icon.slice(3)}
                  size={22}
                  color={item.soon ? 'var(--color-text-secondary)' : (item.iconColor || 'var(--color-text)')}
                  style={{ width: '28px', height: '22px' }}
                />

                <div style={styles.rowContent}>
                  <div style={{ ...styles.rowTitle, color: item.soon ? 'var(--color-text)' : titleColor(item.tone) }}>
                    {item.title}
                  </div>
                  <div style={styles.rowSubtitle}>{item.subtitle}</div>
                </div>

                {item.soon
                  ? <span style={styles.soonTag}>Скоро</span>
                  : <span style={styles.rowArrow}>›</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const styles = {
  page: {},
  groupCard: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    width: '100%',
    minHeight: '60px',
    textAlign: 'left',
    background: 'transparent',
    border: 'none'
  },
  rowSoon: { opacity: 0.5, cursor: 'default' },
  soonTag: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-caption-size)',
    letterSpacing: '1px', color: 'var(--color-text-secondary)', textTransform: 'uppercase'
  },
  rowContent: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-body-size)',
    fontWeight: 700,
    marginBottom: 'var(--space-05)'
  },
  rowSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },
  rowArrow: {
    fontSize: 'var(--text-title-size)',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}