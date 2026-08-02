import { useEffect, useState } from 'react'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import { GroupLabel, SectionLabel } from '../components/GroupLabel'

/**
 * Экран "Восстановление" — карточки полезных советов по восстановлению,
 * разбитые на 5 категорий: сон, питание, мышцы, нервная система, здоровье.
 *
 * Внутри каждой категории советы отсортированы по частоте — самые частые сверху.
 * Тап по карточке показывает popup "Скоро" — детальный экран будет позже.
 */

const CATEGORIES = [
  {
    id: 'sleep',
    icon: '🛌',
    title: 'СОН',
    subtitle: 'Без него остальное не работает',
    color: '#B47BFF', // фиолетовый — спокойствие, ночь
    items: [
      { id: 'sleep-hours',    title: 'Сон 7-9 часов',          freq: 'каждый день' },
      { id: 'sleep-dark',     title: 'Темнота в комнате',       freq: 'каждый день' },
      { id: 'sleep-early',    title: 'Засыпать до 23:00',       freq: 'каждый день' },
      { id: 'sleep-noscreen', title: 'Без экранов за час до сна', freq: 'каждый день' }
    ]
  },
  {
    id: 'nutrition',
    icon: '🥗',
    title: 'ПИТАНИЕ',
    subtitle: 'Топливо для восстановления',
    color: '#9ED153', // зелёный — свежесть, природа
    items: [
      { id: 'food-water',   title: 'Вода 30 мл на кг веса',     freq: 'каждый день' },
      { id: 'food-protein', title: 'Белок 1.6-2 г на кг веса',   freq: 'каждый день' },
      { id: 'food-veggies', title: 'Овощи 400+ г',               freq: 'каждый день' },
      { id: 'food-creatine', title: 'Креатин 5 г',                freq: 'каждый день' }
    ]
  },
  {
    id: 'muscles',
    icon: '💪',
    title: 'МЫШЦЫ И СУСТАВЫ',
    subtitle: 'Снять нагрузку и зажимы',
    color: 'var(--cat-cardio)', // категория «мышцы и суставы»
    items: [
      { id: 'mus-stretch',  title: 'Растяжка 5-10 мин',           freq: 'каждый день' },
      { id: 'mus-roll',     title: 'Самомассаж роллом 15 мин',    freq: '2-3 раза в неделю' },
      { id: 'mus-restday',  title: 'Полный выходной от силовых',  freq: '1-2 раза в неделю' },
      { id: 'mus-massage',  title: 'Профессиональный массаж',     freq: '1-2 раза в месяц' },
      { id: 'mus-deload',   title: 'Разгрузочная неделя',          freq: 'каждые 6-8 недель' }
    ]
  },
  {
    id: 'nervous',
    icon: '🧠',
    title: 'НЕРВНАЯ СИСТЕМА',
    subtitle: 'Голова — главный орган',
    color: '#3FA2F7', // голубой — спокойствие, ясность
    items: [
      { id: 'nerv-walk',    title: 'Прогулка 30+ минут',     freq: 'каждый день' },
      { id: 'nerv-shower',  title: 'Контрастный душ',         freq: '3-5 раз в неделю' },
      { id: 'nerv-sauna',   title: 'Баня / сауна',            freq: '1-2 раза в месяц' }
    ]
  },
  {
    id: 'health',
    icon: '🩺',
    title: 'ЗДОРОВЬЕ',
    subtitle: 'Регулярный контроль',
    color: '#E84545', // красный — медицина, важно
    items: [
      { id: 'hlt-blood', title: 'Анализ крови (общий + био)', freq: '2 раза в год' },
      { id: 'hlt-vitd',  title: 'Витамин D',                   freq: '2 раза в год' },
      { id: 'hlt-checkup', title: 'Чек-ап у терапевта',         freq: '1 раз в год' },
      { id: 'hlt-ecg',   title: 'ЭКГ (если 30+)',              freq: '1 раз в год' }
    ]
  }
]

export default function Recovery() {
  const [popupItem, setPopupItem] = useState(null)

  // Этот экран корневой во вкладке — кнопка назад от Telegram не нужна
  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  const handleCardTap = (item) => {
    haptic.light()
    setPopupItem(item)
  }

  const closePopup = () => setPopupItem(null)

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Заголовок страницы */}
      <header style={styles.header}>
        <ScreenTitle>Восстановление</ScreenTitle>
        <SectionLabel caps style={{ marginBottom: 0, paddingLeft: 0 }}>СОВЕТЫ ДЛЯ ПРОГРЕССА</SectionLabel>
      </header>

      {/* Список категорий */}
      <div style={styles.sectionsWrap}>
        {CATEGORIES.map(category => (
          <section key={category.id} style={styles.section}>

            {/* Заголовок категории */}
            <div style={styles.categoryHeader}>
              <span style={styles.categoryIcon}>{category.icon}</span>
              <div style={styles.categoryHeaderText}>
                <GroupLabel color={category.color} style={{ paddingBottom: 0 }}>
                  {category.title}
                </GroupLabel>
                <div style={styles.categorySubtitle}>{category.subtitle}</div>
              </div>
            </div>

            {/* Карточки советов */}
            <div style={styles.itemsList}>
              {category.items.map(item => (
                <button
                  key={item.id}
                  className="press-tile"
                  onClick={() => handleCardTap(item)}
                  style={styles.itemCard}
                >
                  <div style={styles.itemContent}>
                    <div style={styles.itemTitle}>{item.title}</div>
                    <div style={styles.itemFreq}>{item.freq}</div>
                  </div>
                  <span style={styles.itemArrow}>›</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Popup-заглушка при тапе по карточке */}
      {popupItem && (
        <div style={popupStyles.overlay} onClick={closePopup}>
          <div style={popupStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={popupStyles.icon}>📖</div>
            <div style={popupStyles.title}>{popupItem.title}</div>
            <div style={popupStyles.freq}>{popupItem.freq}</div>
            <div style={popupStyles.message}>
              Скоро тут будет:<br />
              подробные рекомендации, исследования,<br />
              советы по внедрению в жизнь
            </div>
            <button onClick={closePopup} style={popupStyles.closeButton}>
              ОК
            </button>
          </div>

          <style>{`
            @keyframes recoveryOverlayFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes recoveryPanelScaleIn {
              0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {},
  header: {
    marginBottom: 'var(--space-5)',
    textAlign: 'center'
  },
  sectionsWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)'
  },
  section: {},
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
    paddingLeft: 'var(--space-1)'
  },
  categoryIcon: {
    fontSize: 'var(--text-heading-size)',
    lineHeight: 1,
    flexShrink: 0
  },
  categoryHeaderText: {
    flex: 1,
    minWidth: 0
  },
  categorySubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-15)'
  },
  itemCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-5)',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-medium)',
    width: '100%',
    textAlign: 'left',
    minHeight: '60px',
    border: 'none'
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)'
  },
  itemTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1.3
  },
  itemFreq: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
  },
  itemArrow: {
    fontSize: 'var(--text-title-size)',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}

const popupStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 'var(--space-5)',
    animation: 'recoveryOverlayFadeIn 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-medium)',
    padding: 'var(--space-6) var(--space-6) var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    animation: 'recoveryPanelScaleIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  icon: {
    fontSize: '36px',
    lineHeight: 1
  },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-title-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    textAlign: 'center',
    lineHeight: 1.3
  },
  freq: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    marginBottom: 'var(--space-1)'
  },
  message: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    marginBottom: 'var(--space-2)'
  },
  closeButton: {
    width: '100%',
    padding: 'var(--space-3)',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: 'var(--radius-small)',
    border: 'none',
    cursor: 'pointer'
  }
}