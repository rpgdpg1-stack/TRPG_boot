import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { loadFavoritesEntries, getActiveDay, toggleFavoriteProgram } from '../lib/storage'
import { getProgramBySlug, getProgramsByCategory } from '../features/programs/registry'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import UiIcon from './UiIcon'
import PixelHeart from './PixelHeart'
import ProgramCard from './ProgramCard'

/**
 * Список избранного по разделам — общий для страницы «Избранное» и профиля.
 *
 * Вертикально, по разделам (лимит избранного 1 на раздел). Аккуратный заголовок
 * раздела (иконка + название), под ним карточка избранной программы + сердце
 * (тап снимает), либо заглушка «Добавить в избранное» → переход в раздел.
 */

// Разделы, где есть хоть одна программа (там можно держать избранное).
const FAV_CATEGORIES = CATEGORY_ORDER.filter(id => getProgramsByCategory(id).length > 0)

export default function FavoritesList() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = () => {
    loadFavoritesEntries(async (slug) => {
      const prog = getProgramBySlug(slug)
      if (!prog) return null
      const activeDay = await getActiveDay(slug)
      return { prog, activeDay }
    }).then(list => {
      setEntries(list)
      setLoaded(true)
    })
  }

  useEffect(() => { load() }, [])

  const entryByCategory = (catId) => entries.find(e => e.categoryId === catId) || null

  const handleRemove = async (catId, slug) => {
    haptic.medium()
    await toggleFavoriteProgram(catId, slug)
    load()
  }

  const handleAdd = (catId) => {
    haptic.light()
    navigate(`/category/${catId}`)
  }

  if (!loaded) return <div style={styles.skeleton} />

  return (
    <>
      {FAV_CATEGORIES.map(catId => {
        const meta = CATEGORY_META[catId]
        const entry = entryByCategory(catId)
        return (
          <section key={catId} style={styles.section}>
            <div style={styles.secHeader}>
              <UiIcon name={meta.iconName} size={20} color={meta.color} />
              <span style={styles.secTitle}>{meta.title}</span>
            </div>

            {entry
              ? <ProgramCard
                  prog={entry.prog}
                  isFav
                  onToggleFav={() => handleRemove(catId, entry.prog.slug)}
                  onDeleted={load}
                  heart="center"
                  dots
                />
              : <EmptyCard onAdd={() => handleAdd(catId)} />}
          </section>
        )
      })}
    </>
  )
}

function EmptyCard({ onAdd }) {
  return (
    <button onClick={onAdd} className="press-tile" style={styles.emptyCard}>
      <span style={styles.emptyHeart}><PixelHeart filled={false} size={20} /></span>
      Добавить в избранное
    </button>
  )
}

const styles = {
  skeleton: {
    height: '130px',
    borderRadius: 'var(--radius-card)',
    background: 'rgba(255,255,255,0.04)'
  },
  section: { marginBottom: '20px' },
  secHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
    paddingLeft: '4px'
  },
  secTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1.5px'
  },
  emptyCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    minHeight: '130px',
    padding: '16px 18px',
    border: '1.5px dashed rgba(255,255,255,0.15)',
    borderRadius: 'var(--radius-card)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    cursor: 'pointer'
  },
  emptyHeart: { display: 'inline-flex' }
}
