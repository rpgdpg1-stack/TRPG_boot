import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Временная страница для проверки подключения Supabase.
 * Читает упражнения из таблицы exercises и выводит первые 10.
 *
 * Если работает — увидим список упражнений на русском.
 * Если ошибка — покажет красным.
 *
 * После успешной проверки эту страницу удалим.
 */
export default function SupabaseTest() {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadExercises() {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, sub_group')
        .order('id')
        .limit(10)

      if (error) {
        console.error('Supabase error:', error)
        setError(error.message)
      } else {
        setExercises(data || [])
      }
      setLoading(false)
    }

    loadExercises()
  }, [])

  return (
    <div className="page page-fade" style={styles.page}>
      <h1 style={styles.title}>SUPABASE TEST</h1>

      {loading && <div style={styles.info}>Загрузка из базы...</div>}

      {error && (
        <div style={styles.error}>
          <div style={styles.errorTitle}>❌ Ошибка подключения:</div>
          <div style={styles.errorText}>{error}</div>
        </div>
      )}

      {!loading && !error && exercises.length === 0 && (
        <div style={styles.info}>База подключена, но упражнений не найдено.</div>
      )}

      {!loading && !error && exercises.length > 0 && (
        <>
          <div style={styles.success}>
            ✅ Подключение работает! Получено упражнений: {exercises.length}
          </div>
          <div style={styles.list}>
            {exercises.map(ex => (
              <div key={ex.id} style={styles.item}>
                <div style={styles.itemId}>{ex.id}</div>
                <div style={styles.itemName}>{ex.name}</div>
                <div style={styles.itemMeta}>
                  {ex.muscle_group} / {ex.sub_group}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const styles = {
  page: {},
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '24px',
    color: 'var(--color-primary)',
    letterSpacing: '2px',
    marginBottom: '20px',
    textAlign: 'center'
  },
  info: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    padding: '20px'
  },
  success: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-primary)',
    background: 'rgba(158, 209, 83, 0.08)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '16px'
  },
  error: {
    fontFamily: 'var(--font-manrope)',
    background: 'rgba(232, 69, 69, 0.08)',
    border: '1px solid rgba(232, 69, 69, 0.3)',
    borderRadius: '12px',
    padding: '14px 16px',
    marginBottom: '16px'
  },
  errorTitle: {
    fontSize: '13px',
    color: '#E84545',
    fontWeight: 700,
    marginBottom: '6px'
  },
  errorText: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-word'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  item: {
    background: 'var(--color-card)',
    borderRadius: '14px',
    padding: '12px 16px'
  },
  itemId: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    marginBottom: '4px'
  },
  itemName: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  itemMeta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  }
}
