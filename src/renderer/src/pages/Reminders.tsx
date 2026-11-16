import { useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { csvOf, Empty, fmtDate, Modal, todayIso } from '../ui'
import { dueState } from './VehicleDetail'
import { vehicleName } from '../../../shared/bundle'

const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

export function Reminders() {
  const { data, ix, act, toast } = useData()
  const nav = useNav()
  const [win, setWin] = useState<'30' | 'overdue' | 'all' | 'lapsed'>('30')
  const [optedOnly, setOptedOnly] = useState(true)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [adding, setAdding] = useState(false)

  // Service reminders, plus "lapsed" customers whose last visit is older than the reminder window.
  const rows = useMemo(() => {
    if (win === 'lapsed') {
      const cutoff = new Date(Date.now() - data.settings.reminderMonths * 30 * 86_400_000).toISOString().slice(0, 10)
      return data.vehicles.flatMap((v) => {
        const last = data.ros.filter((r) => r.vehicleId === v.id).map((r) => r.completedAt || r.createdAt).sort().at(-1)
        if (!last || last > cutoff) return []
        return [{ id: -v.id, customerId: v.customerId, vehicleId: v.id, service: `No visit in ${data.settings.reminderMonths}+ months`, dueDate: last, dueMiles: 0, status: 'open' as const, sourceRoId: null, notes: '', last }]
      })
    }
    return data.reminders
      .filter((r) => r.status === 'open')
      .filter((r) => win === 'all' || (win === 'overdue' ? dueState(r.dueDate, r.dueMiles, ix.vehicles.get(r.vehicleId ?? -1)?.mileage ?? 0).cls === 'p-red' : !r.dueDate || r.dueDate <= addDays(30)))
      .map((r) => ({ ...r, last: data.ros.filter((x) => x.vehicleId === r.vehicleId).map((x) => x.completedAt || x.createdAt).sort().at(-1) ?? '' }))
  }, [data, ix, win])
  const shown = rows.filter((r) => !optedOnly || (r.customerId && ix.customers.get(r.customerId)?.marketingOptIn))
  const chosen = shown.filter((r) => sel.has(r.id))
  const target = chosen.length ? chosen : shown

  function lettersHtml() {
    const s = data.settings
    const pages = target.map((r) => {
      const c = r.customerId ? ix.customers.get(r.customerId) : null
      const v = r.vehicleId ? ix.vehicles.get(r.vehicleId) : null
      return `<section style="page-break-after:always;font:11pt/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#000">
        <p><b style="font-size:16pt">${esc(s.shopName)}</b><br>${esc(s.shopAddress)}<br>${esc(s.shopPhone)}</p>
        <p style="margin-top:40px">${esc(c?.name ?? '')}<br>${esc(c?.address ?? '')}</p>
        <p style="margin-top:30px">Hi ${esc((c?.name ?? '').split(' ')[0])},</p>
        <p>Our records show your <b>${esc(vehicleName(v))}</b> is due for <b>${esc(r.service)}</b>${r.dueDate && r.id > 0 ? ` around ${esc(fmtDate(r.dueDate))}` : ''}${r.dueMiles ? ` or ${r.dueMiles.toLocaleString()} miles` : ''}.</p>
        <p>Give us a call at ${esc(s.shopPhone || 'the shop')} to book a time that works for you.</p><p>Thanks,<br>${esc(s.shopName)}</p></section>`
    }).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:Letter;margin:0.75in}</style></head><body>${pages}</body></html>`
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Reminders</h1>
        <select className="sm" style={{ width: 200 }} value={win} onChange={(e) => { setWin(e.target.value as typeof win); setSel(new Set()) }} aria-label="Window">
          <option value="30">Due within 30 days</option><option value="overdue">Overdue</option><option value="all">All open reminders</option><option value="lapsed">Haven't visited lately</option>
        </select>
        <label className="check small"><input type="checkbox" checked={optedOnly} onChange={(e) => setOptedOnly(e.target.checked)} />Opted-in customers only</label>
        <span className="grow" />
        <button className="btn" onClick={() => setAdding(true)}>+ Reminder</button>
      </div>
      <div className="card row wrap" style={{ padding: '8px 12px', marginBottom: 12 }}>
        <span className="small muted">{chosen.length ? `${chosen.length} selected` : `Actions apply to all ${shown.length} shown`}</span>
        <span className="grow" />
        <button className="btn sm" disabled={!target.length} onClick={() => act(() => api.printDocument(lettersHtml(), `Reminder letters ${todayIso()}`, 'pdf'))}>Print letters (PDF)</button>
        <button className="btn sm" disabled={!target.length} onClick={() => act(() => api.saveCsv(`reminders-${todayIso()}.csv`, csvOf(['Customer', 'Phone', 'Email', 'Prefers', 'Vehicle', 'Service', 'Due date', 'Due miles', 'Last visit'],
          target.map((r) => { const c = r.customerId ? ix.customers.get(r.customerId) : null; return [c?.name ?? '', c?.phone ?? '', c?.email ?? '', c?.contactPref ?? '', vehicleName(r.vehicleId ? ix.vehicles.get(r.vehicleId) : null), r.service, r.id > 0 ? r.dueDate : '', r.dueMiles || '', r.last] }))))}>Export CSV</button>
        <button className="btn sm" disabled={!target.some((r) => r.id > 0)} onClick={async () => {
          await act(() => api.saveMany(target.filter((r) => r.id > 0).map((r) => ({ entity: 'reminders' as const, data: { id: r.id, notes: `Contacted ${todayIso()}` } }))))
          toast('Marked contacted')
        }}>Mark contacted</button>
      </div>
      <section className="card flush">
        {shown.length === 0 ? <Empty text="No vehicles due in this window." /> : (
          <table>
            <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Select all" checked={chosen.length === shown.length && shown.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} /></th>
              <th>Customer</th><th>Vehicle</th><th>Service</th><th>Due</th><th>Last visit</th><th>Contact</th><th /></tr></thead>
            <tbody>{shown.map((r) => {
              const c = r.customerId ? ix.customers.get(r.customerId) : null
              const v = r.vehicleId ? ix.vehicles.get(r.vehicleId) : null
              const st = r.id > 0 ? dueState(r.dueDate, r.dueMiles, v?.mileage ?? 0) : null
              return (
                <tr key={r.id} className={sel.has(r.id) ? 'sel' : ''}>
                  <td><input type="checkbox" aria-label={`Select ${c?.name}`} checked={sel.has(r.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(r.id); else n.delete(r.id); setSel(n) }} /></td>
                  <td>{c ? <button className="link" onClick={() => nav({ page: 'customer', id: c.id })}>{c.name}</button> : '—'}</td>
                  <td>{v ? <button className="link" onClick={() => nav({ page: 'vehicle', id: v.id })}>{vehicleName(v)}</button> : '—'}</td>
                  <td>{r.service}{r.notes && <div className="small muted">{r.notes}</div>}</td>
                  <td className="small">{st ? <><span className={`pill nodot ${st.cls}`}>{st.word}</span> {[r.dueDate && fmtDate(r.dueDate), r.dueMiles ? `${r.dueMiles.toLocaleString()} mi` : ''].filter(Boolean).join(' / ')}</> : '—'}</td>
                  <td className="muted">{fmtDate(r.last)}</td>
                  <td className="small">{c?.contactPref === 'call' ? `Call ${c.phone}` : c?.contactPref === 'text' ? `Text ${c.phone}` : c?.email}</td>
                  <td className="n">{r.id > 0 && <button className="btn ghost sm" onClick={() => act(() => api.save('reminders', { id: r.id, status: 'done' }))}>Done</button>}</td>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </section>
      {adding && <AddReminder onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddReminder({ onClose }: { onClose: () => void }) {
  const { data, act } = useData()
  const [vehicleId, setVehicleId] = useState(0)
  const [service, setService] = useState('')
  const [dueDate, setDueDate] = useState(addDays(30))
  const v = data.vehicles.find((x) => x.id === vehicleId)
  return (
    <Modal title="New reminder" onClose={onClose} foot={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!v || !service.trim()} onClick={async () => { await act(() => api.save('reminders', { vehicleId, customerId: v!.customerId, service, dueDate })); onClose() }}>Save</button></>}>
      <div className="stack">
        <label className="field">Vehicle<select value={vehicleId} onChange={(e) => setVehicleId(Number(e.target.value))}><option value={0}>Choose…</option>
          {data.vehicles.map((x) => <option key={x.id} value={x.id}>{vehicleName(x)} · {data.customers.find((c) => c.id === x.customerId)?.name ?? 'no owner'}</option>)}</select></label>
        <label className="field">Service<input value={service} onChange={(e) => setService(e.target.value)} list="canned-names" /></label>
        <datalist id="canned-names">{data.cannedJobs.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <label className="field">Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      </div>
    </Modal>
  )
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
