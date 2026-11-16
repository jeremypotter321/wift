import { useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { JobForm, type Draft } from '../JobForm'
import { useStore } from '../store'
import { VerdictCard } from '../ui'
import { verdict } from '../../../shared/calc'
import { emptyContent, type JobStatus } from '../../../shared/types'

export const blankDraft = (): Draft => ({
  id: 0, customerId: null, customerName: '', title: '', description: '', vehicleYear: '', vehicleMake: '', vehicleModel: '',
  vin: '', mileage: '', status: 'Lead', quoteType: 'flat', quotedPrice: 0, estHours: 0, estPartsCost: 0, riskFlags: [],
  content: emptyContent(), salesTax: 0, paymentDate: '', paymentMethod: '', createdAt: '', startedAt: '', finishedAt: '',
})

export function NewJob() {
  const { data, act } = useStore()
  const nav = useNav()
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const v = useMemo(() => (data ? verdict(draft, data.settings) : null), [draft, data])
  if (!data || !v) return null

  async function save(status: JobStatus) {
    const { id: _id, ...rest } = draft
    const job = await act(() => api.saveJob({ ...rest, status, title: draft.title.trim() || 'Untitled job' }))
    if (job) nav({ page: 'job', id: job.id })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Should I take it?</h1>
        <span className="muted">Price the job up and the verdict updates as you type.</span>
      </div>
      <div className="evaluate">
        <JobForm draft={draft} set={set} settings={data.settings} customers={data.customers} />
        <div className="sticky stack">
          <VerdictCard v={v} />
          <div className="card stack">
            <span className="small muted">Save it to keep it. You can change everything later.</span>
            <button className="btn primary big block" onClick={() => save('Quoted')}>Save as quoted</button>
            <div className="grid2">
              <button className="btn" onClick={() => save('Accepted')}>Taking it</button>
              <button className="btn" onClick={() => save('Lead')}>Save as lead</button>
            </div>
            <button className="btn ghost block" onClick={() => save('Declined')}>Passing: save as declined</button>
          </div>
        </div>
      </div>
    </div>
  )
}
