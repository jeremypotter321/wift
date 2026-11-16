import { useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, Empty, fmtDate, fmtMoney, LazyInput, RoPill, todayIso } from '../ui'
import { VehicleModal } from '../ro/Modals'
import { lineAmount } from '../../../shared/calc'
import { vehicleName } from '../../../shared/bundle'

const SPEC_KEYS: [string, string][] = [
  ['DisplacementL', 'Displacement (L)'], ['EngineCylinders', 'Cylinders'], ['EngineModel', 'Engine model'], ['FuelTypePrimary', 'Fuel'],
  ['DriveType', 'Drive'], ['TransmissionStyle', 'Transmission'], ['BodyClass', 'Body'], ['Doors', 'Doors'], ['PlantCountry', 'Built in'], ['Series', 'Series'],
]

/** Due status for a reminder: overdue → Now colours, within 30 days / 1,000 mi → Soon, else Good. */
export function dueState(dueDate: string, dueMiles: number, mileage: number): { word: string; cls: string } {
  const days = dueDate ? Math.round((new Date(dueDate + 'T12:00:00').getTime() - Date.now()) / 86_400_000) : Infinity
  const miles = dueMiles ? dueMiles - mileage : Infinity
  if (days < 0 || miles < 0) return { word: '✕ Overdue', cls: 'p-red' }
  if (days <= 30 || miles <= 1000) return { word: '! Due soon', cls: 'p-amber' }
  return { word: '✓ OK', cls: 'p-green' }
}

export function VehicleDetail({ id }: { id: number }) {
  const { data, ix, act, can, toast } = useData()
  const nav = useNav()
  const [editing, setEditing] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const v = data.vehicles.find((x) => x.id === id)
  if (!v) return <div className="page"><Empty text="Vehicle not found." /></div>
  const owner = v.customerId ? ix.customers.get(v.customerId) : null
  const ros = data.ros.filter((r) => r.vehicleId === id).sort((a, b) => b.number - a.number)
  const reminders = data.reminders.filter((r) => r.vehicleId === id && r.status === 'open')
  const declined = data.jobs.filter((j) => j.status === 'declined' && ros.some((r) => r.id === j.roId))
  const decoded = v.decoded ?? {}

  async function decode() {
    setDecoding(true)
    try {
      const r = await api.decodeVin(v!.vin)
      await act(() => api.save('vehicles', { id, decoded: { ...r.decoded, decodedOn: todayIso() }, year: v!.year || r.year, make: v!.make || r.make, model: v!.model || r.model, trim: v!.trim || r.trim, engine: v!.engine || r.engine }))
      toast('VIN decoded')
    } catch (e) {
      toast(String((e as Error).message).replace(/^Error invoking remote method 'api': (Error: )?/, ''))
    } finally {
      setDecoding(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        {owner && <><button className="link small" onClick={() => nav({ page: 'customer', id: owner.id })}>{owner.name}</button><span className="faint">/</span></>}
        <h1>{vehicleName(v) || 'Vehicle'}</h1>
        {v.engine && <span className="chip">{v.engine}</span>}
        {v.plate && <span className="muted">{v.plate}</span>}
        <span className="grow" />
        {can.prices && <button className="btn primary" onClick={async () => { const r = await act(() => api.createRo({ customerId: v.customerId, vehicleId: id })); if (r) nav({ page: 'ro', id: r.id }) }}>+ New RO</button>}
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        {can.delete && <button className="btn danger" onClick={async () => { if (await confirmDialog(`Delete ${vehicleName(v)}?`)) { await act(() => api.remove('vehicles', id)); if (owner) nav({ page: 'customer', id: owner.id }) } }}>Delete</button>}
      </div>
      <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
        <div className="stack">
          <section className="card flush">
            <div className="card-head"><h2>Maintenance due</h2></div>
            {reminders.length === 0 ? <Empty text="No open service reminders. They're created when a canned job with an interval is completed." /> : (
              <table><thead><tr><th>Service</th><th>Due</th><th>Status</th><th /></tr></thead>
                <tbody>{reminders.map((r) => {
                  const st = dueState(r.dueDate, r.dueMiles, v.mileage)
                  return (
                    <tr key={r.id}>
                      <td>{r.service}</td>
                      <td className="small">{[r.dueDate && fmtDate(r.dueDate), r.dueMiles ? `${r.dueMiles.toLocaleString()} mi` : ''].filter(Boolean).join(' or ')}</td>
                      <td><span className={`pill nodot ${st.cls}`}>{st.word}</span></td>
                      <td className="n"><button className="btn ghost sm" onClick={() => act(() => api.save('reminders', { id: r.id, status: 'dismissed' }))}>Dismiss</button></td>
                    </tr>
                  )
                })}</tbody></table>
            )}
          </section>
          {declined.length > 0 && (
            <section className="card flush">
              <div className="card-head"><h2>Previously declined</h2></div>
              <table><tbody>{declined.map((j) => {
                const r = ros.find((x) => x.id === j.roId)!
                return <tr key={j.id} className="click" onClick={() => nav({ page: 'ro', id: r.id })}><td>{j.title}</td><td className="muted">RO {r.number} · {fmtDate(r.createdAt)}</td>
                  {can.prices && <td className="n">{fmtMoney(data.lines.filter((l) => l.jobId === j.id).reduce((a, l) => a + lineAmount(l), 0))}</td>}</tr>
              })}</tbody></table>
            </section>
          )}
          <section className="card flush">
            <div className="card-head"><h2>Service history</h2></div>
            {ros.length === 0 ? <Empty text="No repair orders for this vehicle yet." /> : (
              <table><thead><tr><th>Date</th><th>Mileage</th><th>RO</th><th>Work</th><th>Status</th>{can.prices && <th className="n">Total</th>}</tr></thead>
                <tbody>{ros.map((r) => {
                  const t = ix.totals(r.id).totals
                  const jobs = data.jobs.filter((j) => j.roId === r.id && j.status === 'approved').map((j) => j.title)
                  return (
                    <tr key={r.id} className="click" onClick={() => nav({ page: 'ro', id: r.id })}>
                      <td>{fmtDate(r.completedAt || r.createdAt)}</td><td className="num">{r.mileageIn ? r.mileageIn.toLocaleString() : '—'}</td><td className="mono">{r.number}</td>
                      <td className="small ellipsis" style={{ maxWidth: 280 }}>{jobs.join(', ') || <span className="faint">—</span>}</td><td><RoPill ro={r} t={t} /></td>
                      {can.prices && <td className="n">{fmtMoney(t.total)}</td>}
                    </tr>
                  )
                })}</tbody></table>
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="card stack tight">
            <h3>Vehicle</h3>
            <div className="row between"><span className="muted">VIN</span><span className="mono small">{v.vin || '—'}</span></div>
            <div className="row between"><span className="muted">Mileage</span><span className="num">{v.mileage ? v.mileage.toLocaleString() : '—'}</span></div>
            <div className="row between"><span className="muted">Color</span><span>{v.color || '—'}</span></div>
            <div className="row between"><span className="muted">Trim</span><span>{v.trim || '—'}</span></div>
            <label className="field">Notes<LazyInput value={v.notes} onCommit={(notes) => act(() => api.save('vehicles', { id, notes }))} /></label>
          </section>
          <section className="card stack tight">
            <h3>Specs</h3>
            {decoded.decodedOn ? (
              <>
                {SPEC_KEYS.filter(([k]) => decoded[k]).map(([k, label]) => <div key={k} className="row between small"><span className="muted">{label}</span><span>{decoded[k]}</span></div>)}
                <div className="small faint">Decoded from NHTSA on {fmtDate(decoded.decodedOn)}</div>
              </>
            ) : (
              <div className="stack tight"><span className="small muted">Not decoded.</span><button className="btn sm" disabled={v.vin.length !== 17 || decoding} onClick={decode}>{decoding ? 'Decoding…' : 'Decode VIN'}</button>
                {v.vin.length !== 17 && <span className="small faint">Add the 17-character VIN to decode.</span>}</div>
            )}
          </section>
        </aside>
      </div>
      {editing && <VehicleModal initial={v} customerId={v.customerId} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </div>
  )
}
