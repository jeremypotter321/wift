import { useMemo, useState } from 'react'
import { useNav } from '../App'
import { useJobRows } from '../derive'
import { useStore } from '../store'
import { Empty, fmtDate, fmtHours, Hourly, Money, StatusPill, vehicleOf } from '../ui'
import { jobDate } from '../../../shared/report'
import { JOB_STATUSES } from '../../../shared/types'

export function Jobs({ initialStatus }: { initialStatus?: string }) {
  const { data } = useStore()
  const rows = useJobRows(data)
  const nav = useNav()
  const [status, setStatus] = useState(initialStatus ?? '')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (status && r.job.status !== status) return false
      const d = jobDate(r.job)
      if (from && d < from) return false
      if (to && d > to) return false
      if (needle) {
        const hay = `${r.job.title} ${r.job.customerName} ${vehicleOf(r.job)} ${r.job.vin}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [rows, status, q, from, to])

  const chips = [
    status && { label: `Status: ${status}`, clear: () => setStatus('') },
    q && { label: `"${q}"`, clear: () => setQ('') },
    from && { label: `From ${fmtDate(from)}`, clear: () => setFrom('') },
    to && { label: `To ${fmtDate(to)}`, clear: () => setTo('') },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  return (
    <div className="page">
      <div className="page-head">
        <h1>Jobs</h1>
        <span className="muted num">{shown.length} of {rows.length}</span>
        <span className="grow" />
        <button className="btn primary" onClick={() => nav({ page: 'new' })}>+ New job</button>
      </div>

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input style={{ width: 280 }} placeholder="Search job, customer, vehicle, VIN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <input type="date" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <span className="muted">to</span>
        <input type="date" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>
      {chips.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {chips.map((c) => (
            <span className="chip" key={c.label}>
              {c.label}
              <button aria-label={`Remove ${c.label}`} onClick={c.clear}>×</button>
            </span>
          ))}
          <button className="btn ghost" style={{ height: 28 }} onClick={() => { setStatus(''); setQ(''); setFrom(''); setTo('') }}>Clear all</button>
        </div>
      )}

      <section className="card flush">
        {shown.length === 0 ? (
          <Empty
            text={rows.length === 0 ? 'No jobs yet.' : 'No jobs match these filters.'}
            action={rows.length === 0 ? <button className="btn primary" onClick={() => nav({ page: 'new' })}>+ New job</button> : undefined}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Job</th><th>Customer</th><th>Vehicle</th><th>Status</th>
                <th className="n">Hours</th><th className="n">Profit</th><th className="n">$/hr</th><th className="n">Content</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.job.id} className="click" tabIndex={0} onClick={() => nav({ page: 'job', id: r.job.id })} onKeyDown={(e) => e.key === 'Enter' && nav({ page: 'job', id: r.job.id })}>
                  <td className="num muted">{fmtDate(jobDate(r.job))}</td>
                  <td style={{ fontWeight: 600 }}>{r.job.title}</td>
                  <td>{r.job.customerName}</td>
                  <td className="muted">{vehicleOf(r.job)}</td>
                  <td><StatusPill s={r.job.status} /></td>
                  <td className="n">{r.act.hours > 0 ? fmtHours(r.act.hours) : <span className="muted">{fmtHours(r.job.estHours)} est</span>}</td>
                  <td className="n"><Money v={r.profit} />{r.profitIsEstimate && <span className="small muted"> est</span>}</td>
                  <td className="n"><Hourly v={r.hourly} tint={r.tint} /></td>
                  <td className="n">{r.content}/10</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
