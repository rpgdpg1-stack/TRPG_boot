import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, confirm as tgConfirm } from '../lib/telegram'
import { clearAllData, resetProgramDayCycle } from '../lib/storage'
import { refreshCurrentUser } from '../lib/auth'
import { PROGRAMS } from '../features/programs/registry'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'

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
        { id: 'privacy',       icon: 'ui:privacy',       iconColor: '#9E86FF', title: 'Приватность',  subtitle: 'Что видят друзья',           path: '/privacy' },
        { id: 'notifications', icon: 'ui:notifications', title: 'Уведомления',  subtitle: 'Напоминания о тренировках',  soon: true },
        { id: 'about',         icon: 'ui:info',          title: 'О приложении', subtitle: 'Версия · Политика',          soon: true }
      ]
    },
    {
      title: 'Поддержка',
      items: [
        { id: 'support',  icon: 'ui:support', title: 'Поддержка',           subtitle: 'Написать в отдел заботы',    soon: true },
        { id: 'feedback', icon: 'ui:idea',    title: 'Идеи и предложения',  subtitle: 'Помоги улучшить приложение', soon: true },
        { id: 'gift',     icon: 'ui:gift',    title: 'Подарить сертификат', subtitle: 'Подарок другу',              soon: true }
      ]
    },
    {
      title: 'Сброс',
      items: [
        { id: 'debug-reset-days', icon: 'ui:reset_days',     iconColor: '#FFD700', title: 'Сбросить порядок дней', subtitle: 'Дни во всех программах станут серыми', tone: 'warning' },
        { id: 'debug-reset',      icon: 'ui:reset_progress', iconColor: '#E84545', title: 'Сбросить прогресс',     subtitle: 'Полное обнуление — как с нуля',        tone: 'danger' }
      ]
    }
  ]

  const handleSectionTap = async (item) => {
    if (item.soon) return
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
          <div style={{ ...styles.groupTitle, marginTop: gIdx === 0 ? '4px' : '24px' }}>
            {group.title}
          </div>

          <div style={styles.groupCard}>
            {group.items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                className={item.soon ? undefined : 'tg-row'}
                disabled={item.soon}
                style={{
                  ...styles.row,
                  borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
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
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 'var(--text-display-size)',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1,
    margin: 0
  },
  // Заголовок группы — как в профиле: Manrope, обычный регистр («Основное»),
  // без моношрифта и разрядки.
  groupTitle: {
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.2px',
    marginBottom: 'var(--space-3)',
    paddingLeft: 'var(--space-1)'
  },
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