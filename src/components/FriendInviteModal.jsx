import ModalShell from './ModalShell'
import ActionButton from './ActionButton'

/**
 * Сообщение о переходе по ссылке-приглашению.
 *
 * Нужно ровно для одного случая: человек с уже существующим аккаунтом открыл
 * ссылку друга. Раньше в этой ситуации не происходило видимого НИЧЕГО —
 * приложение молча открывалось на главной, дружба заводилась в базе, и понять
 * это можно было только сходив в «Друзей». Молчание тут читается как поломка.
 *
 * Тексты разные для «только что подружились» и «вы и так друзья»: во втором
 * случае поздравлять не с чем, но подтвердить переход всё равно нужно.
 */
export default function FriendInviteModal({ name, already, onClose }) {
  return (
    <ModalShell onClose={onClose} contentStyle={styles.card}>
        <div style={styles.emoji}>💪</div>
        <div style={styles.title}>
          {already ? 'Вы уже друзья' : 'Теперь вы друзья'}
        </div>
        <div style={styles.text}>
          {name
            ? <>С <b style={styles.name}>{name}</b> — теперь видно тренировки друг друга.</>
            : 'Друг добавлен — теперь видно тренировки друг друга.'}
        </div>
        <ActionButton variant="accent" size="sm" onClick={onClose} style={styles.button}>
          Отлично
        </ActionButton>
      </ModalShell>
  )
}

const styles = {
  card: {
    width: '100%', maxWidth: '320px',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    textAlign: 'center',
    boxShadow: 'var(--shadow-modal)'
  },
  emoji: { fontSize: '40px', lineHeight: 1, marginBottom: 'var(--space-3)' },
  title: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-heading-size)',
    fontWeight: 800, color: 'var(--color-text)'
  },
  text: {
    margin: 'var(--space-2) 0 var(--space-5)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    lineHeight: 1.45, color: 'var(--color-text-secondary)'
  },
  name: { color: 'var(--color-text)' },
  button: { width: '100%' }
}
