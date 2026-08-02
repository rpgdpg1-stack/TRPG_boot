import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic, webApp } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, ValueRow } from '../components/FormControls'
import pkg from '../../package.json'

/**
 * О приложении — версия и правовые документы.
 *
 * Единственный экран настроек, который обязан быть рабочим к релизу: без
 * доступной политики конфиденциальности приложение не примут в сторы и не
 * пропустят по требованиям Telegram.
 *
 * Версия здесь не украшение — по ней пользователь отвечает на вопрос
 * поддержки «какая у вас сборка», поэтому она первой строкой и её видно.
 */
const LINKS = {
  privacy: 'https://telegra.ph/',   // TODO: заменить на реальный документ
  terms: 'https://telegra.ph/'
}

export default function About() {
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate('/settings'))
    lockVerticalSwipes()
  }, [navigate])

  const open = (url) => {
    haptic.light()
    if (webApp?.openLink) webApp.openLink(url)
    else window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>О приложении</ScreenTitle>

      <SectionLabel>Сборка</SectionLabel>
      <FormCard>
        <ValueRow label="Версия" value={pkg.version} />
        <ValueRow label="Платформа" divider value={webApp?.platform || 'web'} />
      </FormCard>

      <SectionLabel style={{ marginTop: 'var(--space-6)' }}>Документы</SectionLabel>
      <FormCard>
        <ValueRow label="Политика конфиденциальности" value="Открыть" onClick={() => open(LINKS.privacy)} />
        <ValueRow label="Условия использования" divider value="Открыть" onClick={() => open(LINKS.terms)} />
      </FormCard>

      <div style={styles.foot}>TRPG · тренировки как игра</div>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  foot: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-caption-size)',
    fontWeight: 'var(--weight-label)', letterSpacing: '1.5px',
    color: 'var(--color-text-secondary)', textAlign: 'center',
    paddingTop: 'var(--space-8)'
  }
}
