import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, confirm as tgConfirm } from '../lib/telegram'
import { clearAllData, resetProgramDayCycle } from '../lib/storage'
import { refreshCurrentUser } from '../lib/auth'
import { PROGRAMS } from '../features/programs/registry'
import { ACCENTS, getAccentSync, setAccent } from '../lib/accent'
import ScreenTitle from '../components/ScreenTitle'

/**
 * Экран настроек.
 *
 * Сверху — шапка с иконкой настроек и заголовком «НАСТРОЙКИ» (чтобы понимать
 * на какой странице находишься).
 *
 * Разделы сгруппированы по смыслу (как РАЗДЕЛЫ на главной): заголовок + единая
 * карточка со строками, разделители, серая подсветка .tg-row.
 *
 * Группа СБРОС — обнулялки (цветной заголовок строки как маркер опасности).
 */
export default function Settings() {
  const navigate = useNavigate()
  const [accentId, setAccentId] = useState(() => getAccentSync().id)

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const pickAccent = (id) => {
    if (id === accentId) return
    haptic.selection()
    setAccentId(id)
    setAccent(id) // применяет на :root + сохраняет (local + CloudStorage кросс-девайс)
  }

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
        { id: 'debug-reset-days', icon: '🔄', title: 'Сбросить порядок дней', subtitle: 'Дни во всех программах станут серыми', tone: 'warning' },
        { id: 'debug-reset',      icon: '🧹', title: 'Сбросить прогресс',     subtitle: 'Полное обнуление — как с нуля',        tone: 'danger' }
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
    tone === 'danger' ? '#FF8C42'
    : tone === 'warning' ? '#FFD700'
    : 'var(--color-text)'

  return (
    <div className="page page-fade" style={styles.page}>

      <ScreenTitle>Настройки</ScreenTitle>

      {/* Цветовая схема — «цвет взаимодействия». Тап меняет тему во всём приложении. */}
      <div style={{ ...styles.groupTitle, marginTop: '4px' }}>ЦВЕТОВАЯ СХЕМА</div>
      <div style={styles.accentCard}>
        {ACCENTS.map((a) => {
          const selected = a.id === accentId
          return (
            <button
              key={a.id}
              onClick={() => pickAccent(a.id)}
              aria-label={a.name}
              className="press-tile"
              style={styles.swatchBtn}
            >
              <span
                style={{
                  ...styles.swatch,
                  background: a.value,
                  boxShadow: selected
                    ? `0 0 0 2px var(--color-card), 0 0 0 4px ${a.value}`
                    : 'none'
                }}
              >
                {selected && <span style={{ ...styles.swatchCheck, color: a.on }}>✓</span>}
              </span>
            </button>
          )
        })}
      </div>

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
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '32px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1,
    margin: 0
  },
  groupTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
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
  accentCard: {
    // Жёсткая сетка 5 колонок → ровно 5 сверху и 5 снизу (а не «по ширине»).
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '14px',
    justifyItems: 'center',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    padding: '18px 20px'
  },
  // Хит-зона ≥44px вокруг кружка-свотча.
  swatchBtn: {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer'
  },
  swatch: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'box-shadow 0.2s ease'
  },
  swatchCheck: {
    fontSize: '16px',
    fontWeight: 800,
    lineHeight: 1
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