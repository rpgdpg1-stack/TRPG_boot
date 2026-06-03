import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, confirm as tgConfirm } from '../lib/telegram'
import { clearAllData, resetProgramDayCycle, devResetBadgesOnly } from '../lib/storage'
import { refreshCurrentUser } from '../lib/auth'
import UiIcon from '../components/UiIcon'

/**
 * Экран настроек.
 *
 * Разделы сгруппированы по смыслу (как РАЗДЕЛЫ на главной): заголовок секции +
 * единая карточка со строками, разделители между строками, серая подсветка
 * строки при тапе/скролле (className="tg-row").
 *
 * Группа СБРОС — обнулялки:
 *  - "Сбросить порядок дней" — стирает только цикл A/B/C
 *  - "Сбросить значки лиг" (DEV) — удаляет league_badges, мускулы остаются
 *  - "Сбросить прогресс" — полный обнул
 * У них цветной заголовок (жёлтый/оранжевый) как маркер опасного действия.
 */
export default function Settings() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const groups = [
    {
      title: 'ОСНОВНОЕ',
      items: [
        { id: 'library',       icon: '📚', title: 'Справочник упражнений', subtitle: 'База с техникой и видео' },
        { id: 'notifications', icon: '🔔', title: 'Уведомления',           subtitle: 'Напоминания о тренировках' },
        { id: 'about',         icon: 'ℹ️', title: 'О приложении',          subtitle: 'Версия · Политика' }
      ]
    },
    {
      title: 'ПОДДЕРЖКА',
      items: [
        { id: 'support',  icon: '💬', title: 'Поддержка',           subtitle: 'Написать в отдел заботы' },
        { id: 'feedback', icon: '💡', title: 'Идеи и предложения',  subtitle: 'Помоги улучшить приложение' },
        { id: 'gift',     icon: '🎁', title: 'Подарить сертификат', subtitle: 'Скоро' }
      ]
    },
    {
      title: 'СБРОС',
      items: [
        { id: 'debug-reset-days',   icon: '🔄', title: 'Сбросить порядок дней', subtitle: 'Начать цикл A/B/C заново',          tone: 'warning' },
        { id: 'debug-reset-badges', icon: '🏅', title: 'Сбросить значки лиг',   subtitle: 'DEV · для теста модалок',           tone: 'warning' },
        { id: 'debug-reset',        icon: '🧹', title: 'Сбросить прогресс',     subtitle: 'Обнулить мускулы, квесты, стрик',   tone: 'danger' }
      ]
    }
  ]

  const handleSectionTap = async (item) => {
    haptic.light()

    if (item.id === 'debug-reset-days') {
      const confirmed = await tgConfirm(
        'Сбросить порядок дней?\n\nПрогресс, мускулы и стрик НЕ пострадают.\n\nПосле сброса все три буквы дней станут серыми — выберешь сам с какого дня хочешь начать.'
      )
      if (!confirmed) return

      try {
        await resetProgramDayCycle('split')
        haptic.success()
        window.alert('Порядок дней сброшен. Перезайди в приложение чтобы увидеть изменения.')
      } catch (err) {
        console.error('[Settings] reset days failed:', err)
        haptic.error()
        window.alert('Не удалось сбросить порядок дней. Проверь подключение.')
      }
      return
    }

    // Дев-сброс ТОЛЬКО значков лиг — для теста модалок
    if (item.id === 'debug-reset-badges') {
      const confirmed = await tgConfirm(
        'Сбросить значки лиг?\n\nЭто dev-инструмент для тестов модалок.\nМускулы, стрик и история начислений НЕ пострадают — только удалятся все полученные значки.\n\nПри следующем тапе квеста модалка значка появится снова.'
      )
      if (!confirmed) return

      try {
        const ok = await devResetBadgesOnly()
        if (ok) {
          haptic.success()
          window.alert('Значки сброшены. Тапни любой квест или заверши тренировку — должна появиться модалка значка той лиги в которой ты сейчас.')
        } else {
          haptic.error()
          window.alert('Не удалось сбросить значки. Проверь подключение.')
        }
      } catch (err) {
        console.error('[Settings] reset badges failed:', err)
        haptic.error()
        window.alert('Не удалось сбросить значки. Проверь подключение.')
      }
      return
    }

    if (item.id === 'debug-reset') {
      const confirmed = await tgConfirm(
        'Сбросить весь прогресс?\n\nУдалятся: мускулы, недельный стрик, все выполненные квесты, история начислений и значки лиг.\n\nЭто действие нельзя отменить.'
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

  // Цвет заголовка строки по тону (опасные действия)
  const titleColor = (tone) =>
    tone === 'danger' ? '#FF8C42'
    : tone === 'warning' ? '#FFD700'
    : 'var(--color-text)'

  return (
    <div className="page page-fade" style={styles.page}>

      {groups.map((group, gIdx) => (
        <section key={group.title}>
          <div style={{
            ...styles.groupTitle,
            marginTop: gIdx === 0 ? '8px' : '24px'
          }}>
            {group.title}
          </div>

          <div style={styles.groupCard}>
            {group.items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                className="tg-row"
                style={{
                  ...styles.row,
                  borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <span style={styles.rowIcon}>{item.icon}</span>

                <div style={styles.rowContent}>
                  <div style={{ ...styles.rowTitle, color: titleColor(item.tone) }}>
                    {item.title}
                  </div>
                  <div style={styles.rowSubtitle}>{item.subtitle}</div>
                </div>

                <span style={styles.rowArrow}>›</span>
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
  // === Группы (как РАЗДЕЛЫ на главной) ===
  groupTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    marginBottom: '12px',
    paddingLeft: '4px'
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
    gap: '14px',
    padding: '14px 18px',
    width: '100%',
    minHeight: '60px',
    textAlign: 'left',
    background: 'transparent',
    border: 'none'
  },
  rowIcon: {
    fontSize: '20px',
    width: '28px',
    textAlign: 'center',
    flexShrink: 0
  },
  rowContent: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '2px'
  },
  rowSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  rowArrow: {
    fontSize: '18px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}