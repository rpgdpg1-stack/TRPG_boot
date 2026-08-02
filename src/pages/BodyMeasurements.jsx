import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { localGet, localSet } from '../utils/storage'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, TextField, SoonNote } from '../components/FormControls'

/**
 * Замеры тела — обхваты в сантиметрах.
 *
 * Почему замеры, а не только вес: при наборе массы вес может стоять на месте,
 * пока меняются обхваты. Экран существует ровно ради этого — показать прогресс,
 * которого не видно на весах.
 *
 * Порядок полей сверху вниз повторяет тело — так их проще заполнять по очереди,
 * не выискивая нужную строку.
 *
 * Пока без сервера и без истории: значения лежат локально. История замеров с
 * графиком встанет туда же, где сейчас график веса.
 */
const KEY = 'body-measurements'

const FIELDS = [
  { id: 'neck',     label: 'Шея' },
  { id: 'chest',    label: 'Грудь' },
  { id: 'biceps',   label: 'Бицепс' },
  { id: 'waist',    label: 'Талия' },
  { id: 'hips',     label: 'Бёдра' },
  { id: 'thigh',    label: 'Бедро' }
]

export default function BodyMeasurements() {
  const navigate = useNavigate()
  const [data, setData] = useState(() => {
    try { return JSON.parse(localGet(KEY) || '{}') } catch { return {} }
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const set = (key, value) => {
    // До 3 цифр и один знак после запятой — обхваты точнее не меряют.
    const clean = String(value).replace(/[^\d.,]/g, '').replace(',', '.').slice(0, 5)
    const next = { ...data, [key]: clean }
    setData(next)
    localSet(KEY, JSON.stringify(next))
  }

  const filled = FIELDS.filter(f => data[f.id]).length

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Замеры тела</ScreenTitle>

      <SectionLabel>Обхваты{filled > 0 ? ` · ${filled} из ${FIELDS.length}` : ''}</SectionLabel>
      <FormCard>
        {FIELDS.map((f, i) => (
          <TextField
            key={f.id}
            label={f.label} unit="см" inputMode="decimal" divider={i > 0}
            value={data[f.id]} placeholder="—"
            onChange={(v) => set(f.id, v)}
          />
        ))}
      </FormCard>

      <SoonNote>
        Замеряй раз в 2–4 недели, утром до еды и всегда в одном месте — иначе
        разброс будет больше самих изменений. История с графиком появится позже,
        рядом с графиком веса.
      </SoonNote>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' }
}
