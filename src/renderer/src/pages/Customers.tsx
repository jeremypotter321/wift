import { useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, daysAgo, Empty, fmtDate, fmtMoney, Modal, RoPill, Tabs } from '../ui'
import { CustomerFields, VehicleModal } from '../ro/Modals'
import { lineAmount } from '../../../shared/calc'
import { vehicleName } from '../../../shared/bundle'
import type { Customer } from '../../../shared/types'

export function Customers() {
  const { data, ix, act, can } = useData()
  const nav = useNav()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'' | 'balance' | 'fleet' | 'optin'>('')
  const [adding, setAdding] = useState<Partial<Customer> | null>(null)

  const rows = useMemo(() => data.customers.map((c) => {
    const ros = data.ros.filter((r) => r.customerId === c.id)
    const balance = ros.filter((r) => r.status === 'completed').reduce((a, r) => a + Math.max(0, ix.totals(r.id).totals.balance), 0)
    const last = ros.map((r) => r.completedAt || r.createdAt).sort().at(-1) ?? ''
    const vehicles = data.vehicles.filter((v) => v.customerId === c.id)
    return { c, balance, last, vehicles }
  }), [data, ix])
  const s = q.trim().toLowerCase()
  const digits = s.replace(/\D/g, '')
  const shown = rows.filter(({ c, balance }) =>
    (!s || c.name.toLowerCase().includes(s) || c.company.toLowerCase().includes(s) || c.email.toLowerCase().includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))) &&
    (filter !== 'balance' || balance > 0) && (filter !== 'fleet' || c.fleet) && (filter !== 'optin' || c.marketingOptIn))

  return (
    <div className="page">
      <div className="page-head">
        <h1>Customers</h1><span className="muted num">{shown.length}</span>
        <input className="sm" style={{ width: 260 }} placeholder="Name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        <select className="sm" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
          <option value="">All customers</option><option value="balance">Has a balance</option><option value="fleet">Fleet</option><option value="optin">Opted in to reminders</option>
        </select>
        <span className="grow" />
        <button className="btn primary" onClick={() => setAdding({ name: '' })}>+ New customer</button>
      </div>
      <section className="card flush">
        {shown.length === 0 ? <Empty text={data.customers.length ? 'No customers match.' : 'No customers yet.'} action={<button className="btn" onClick={() => setAdding({ name: q })}>+ New customer</button>} /> : (
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Vehicles</th><th>Last visit</th>{can.prices && <th className="n">Balance</th>}<th>Reminders</th></tr></thead>
            <tbody>{shown.map(({ c, balance, last, vehicles }) => (
              <tr key={c.id} className="click" onClick={() => nav({ page: 'customer', id: c.id })}>
                <td><b>{c.name}</b>{c.company && <div className="small muted">{c.company}</div>}{c.fleet && <span className="pill p-violet nodot" style={{ marginLeft: 6 }}>Fleet</span>}</td>
                <td className="num">{c.phone}</td>
                <td className="small">{vehicles[0] ? vehicleName(vehicles[0]) : <span className="faint">—</span>}{vehicles.length > 1 ? ` +${vehicles.length - 1}` : ''}</td>
                <td className="muted">{fmtDate(last)}</td>
                {can.prices && <td className={`n ${balance > 0 ? 'neg strong' : ''}`}>{balance > 0 ? fmtMoney(balance) : '—'}</td>}
                <td className="small">{c.marketingOptIn ? <span title="Opted in">✓ Opted in</span> : <span className="faint">Off</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      {adding && (
        <Modal title="New customer" onClose={() => setAdding(null)}
          foot={<><button className="btn" onClick={() => setAdding(null)}>Cancel</button><button className="btn primary" disabled={!adding.name?.trim()} onClick={async () => { const c = await act(() => api.save('customers', adding)); setAdding(null); if (c) nav({ page: 'customer', id: c.id }) }}>Save</button></>}>
          <CustomerFields value={adding} onChange={setAdding} />
        </Modal>
      )}
    </div>
  )
}

export function CustomerDetail({ id }: { id: number }) {
  const { data, ix, act, can } = useData()
  const nav = useNav()
  const [tab, setTab] = useState<'open' | 'history' | 'declined'>('open')
  const [editing, setEditing] = useState<Partial<Customer> | null>(null)
  const [addVehicle, setAddVehicle] = useState(false)
  const c = data.customers.find((x) => x.id === id)
  if (!c) return <div className="page"><Empty text="Customer not found." /></div>
  const vehicles = data.vehicles.filter((v) => v.customerId === id)
  const ros = data.ros.filter((r) => r.customerId === id)
  const open = ros.filter((r) => r.status !== 'completed' || ix.totals(r.id).totals.balance > 0.005)
  const history = ros.filter((r) => r.status === 'completed')
  const declined = data.jobs.filter((j) => j.status === 'declined' && ros.some((r) => r.id === j.roId))
  const arRos = ros.filter((r) => r.status === 'completed' && ix.totals(r.id).totals.balance > 0.005)
  const aging = [0, 0, 0, 0]
  for (const r of arRos) {
    const age = daysAgo(r.completedAt)
    aging[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += ix.totals(r.id).totals.balance
  }
  const newRo = async (vehicleId?: number) => {
    const r = await act(() => api.createRo({ customerId: id, vehicleId: vehicleId ?? (vehicles.length === 1 ? vehicles[0].id : null) }))
    if (r) nav({ page: 'ro', id: r.id })
  }
  const roTable = (list: typeof ros) => list.length === 0 ? <Empty text="Nothing here." /> : (
    <table><thead><tr><th>RO</th><th>Date</th><th>Vehicle</th><th>Status</th>{can.prices && <th className="n">Total</th>}</tr></thead>
      <tbody>{list.map((r) => {
        const t = ix.totals(r.id).totals
        return (
          <tr key={r.id} className="click" onClick={() => nav({ page: 'ro', id: r.id })}>
            <td className="mono">{r.number}</td><td>{fmtDate(r.completedAt || r.createdAt)}</td><td>{vehicleName(r.vehicleId ? ix.vehicles.get(r.vehicleId) : null)}</td>
            <td><RoPill ro={r} t={t} /></td>{can.prices && <td className="n">{fmtMoney(t.total)}</td>}
          </tr>
        )
      })}</tbody></table>
  )

  return (
    <div className="page">
      <div className="page-head">
        <button className="link small" onClick={() => nav({ page: 'customers' })}>Customers</button><span className="faint">/</span>
        <h1>{c.name}</h1>
        {c.fleet && <span className="pill p-violet nodot">Fleet</span>}{c.taxExempt && <span className="pill p-slate nodot">Tax exempt</span>}
        <span className="grow" />
        {can.prices && <button className="btn primary" onClick={() => newRo()}>+ New RO</button>}
        <button className="btn" onClick={() => setEditing(c)}>Edit</button>
        {can.delete && <button className="btn danger" onClick={async () => { if (await confirmDialog(`Delete ${c.name}?`)) { const ok = await act(() => api.remove('customers', id)); if (ok !== undefined) nav({ page: 'customers' }) } }}>Delete</button>}
      </div>
      <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
        <div className="stack">
          <section className="card flush">
            <div className="card-head"><h2>Vehicles</h2><button className="btn sm" onClick={() => setAddVehicle(true)}>+ Add vehicle</button></div>
            {vehicles.length === 0 ? <Empty text="No vehicles yet." /> : (
              <table><thead><tr><th>Vehicle</th><th>Engine</th><th>Plate</th><th>VIN</th><th className="n">Mileage</th><th /></tr></thead>
                <tbody>{vehicles.map((v) => (
                  <tr key={v.id} className="click" onClick={() => nav({ page: 'vehicle', id: v.id })}>
                    <td><b>{vehicleName(v)}</b></td><td className="small">{v.engine}</td><td>{v.plate}</td><td className="mono small">{v.vin}</td>
                    <td className="n num">{v.mileage ? v.mileage.toLocaleString() : '—'}</td>
                    <td className="n">{can.prices && <button className="btn sm" onClick={(e) => { e.stopPropagation(); void newRo(v.id) }}>New RO</button>}</td>
                  </tr>
                ))}</tbody></table>
            )}
          </section>
          <section className="card flush">
            <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={setTab} tabs={[['open', `Open (${open.length})`], ['history', `History (${history.length})`], ['declined', `Declined jobs (${declined.length})`]]} /></div>
            {tab === 'open' && roTable(open)}
            {tab === 'history' && roTable(history)}
            {tab === 'declined' && (declined.length === 0 ? <Empty text="No declined work." /> : (
              <table><thead><tr><th>Job</th><th>RO</th><th>Date</th>{can.prices && <th className="n">Amount</th>}</tr></thead>
                <tbody>{declined.map((j) => {
                  const r = ros.find((x) => x.id === j.roId)!
                  const amt = data.lines.filter((l) => l.jobId === j.id).reduce((a, l) => a + lineAmount(l), 0)
                  return <tr key={j.id} className="click" onClick={() => nav({ page: 'ro', id: r.id })}><td>{j.title}</td><td className="mono">{r.number}</td><td>{fmtDate(r.createdAt)}</td>{can.prices && <td className="n">{fmtMoney(amt)}</td>}</tr>
                })}</tbody></table>
            ))}
          </section>
        </div>
        <aside className="stack">
          <section className="card stack tight">
            <h3>Contact</h3>
            {c.phone && <div className="row between"><span className="num">{c.phone}</span><button className="link small" onClick={() => navigator.clipboard.writeText(c.phone)}>copy</button></div>}
            {c.phone2 && <div className="num">{c.phone2}</div>}
            {c.email && <div className="ellipsis">{c.email}</div>}
            {c.address && <div className="small muted">{c.address}</div>}
            <div className="small muted">Prefers {c.contactPref === 'call' ? 'a call' : c.contactPref === 'text' ? 'a text' : 'email'}</div>
            <label className="check small"><input type="checkbox" checked={c.marketingOptIn} onChange={(e) => act(() => api.save('customers', { id, marketingOptIn: e.target.checked }))} />OK to send service reminders</label>
          </section>
          {can.prices && (
            <section className="card stack tight">
              <h3>Balance</h3>
              <div className={`num ${aging.some(Boolean) ? 'neg' : ''}`} style={{ fontSize: 22, fontWeight: 600 }}>{fmtMoney(aging.reduce((a, b) => a + b, 0))}</div>
              <div className="grid4 small">{['0–30', '31–60', '61–90', '90+'].map((l, i) => <div key={l}><div className="muted">{l} d</div><b className="num">{fmtMoney(aging[i], false)}</b></div>)}</div>
            </section>
          )}
          <section className="card"><label className="field">Internal notes<textarea defaultValue={c.notes} onBlur={(e) => e.target.value !== c.notes && act(() => api.save('customers', { id, notes: e.target.value }))} /></label></section>
        </aside>
      </div>
      {editing && (
        <Modal title="Edit customer" onClose={() => setEditing(null)}
          foot={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" disabled={!editing.name?.trim()} onClick={async () => { await act(() => api.save('customers', editing)); setEditing(null) }}>Save</button></>}>
          <CustomerFields value={editing} onChange={setEditing} />
        </Modal>
      )}
      {addVehicle && <VehicleModal customerId={id} onClose={() => setAddVehicle(false)} onSaved={() => setAddVehicle(false)} />}
    </div>
  )
}
