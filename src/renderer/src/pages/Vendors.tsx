import { useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, Empty, Field } from '../ui'
import type { Vendor } from '../../../shared/types'

export function Vendors() {
  const { data, act, can } = useData()
  const nav = useNav()
  const [open, setOpen] = useState<Partial<Vendor> | null>(null)
  const openPos = (id: number) => data.pos.filter((p) => p.vendorId === id && (p.status === 'draft' || p.status === 'ordered'))
  return (
    <div className="page">
      <div className="page-head"><h1>Vendors</h1><span className="grow" /><button className="btn primary" onClick={() => setOpen({ name: '' })}>+ New vendor</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: open ? 'minmax(0,1fr) 400px' : '1fr', gap: 16, alignItems: 'start' }}>
        <section className="card flush">
          {data.vendors.length === 0 ? <Empty text="No vendors yet." /> : (
            <table><thead><tr><th>Vendor</th><th>Account #</th><th>Rep</th><th>Phone</th><th className="n">Parts</th><th className="n">Open POs</th></tr></thead>
              <tbody>{data.vendors.map((v) => (
                <tr key={v.id} className={`click ${open?.id === v.id ? 'sel' : ''}`} onClick={() => setOpen(v)}>
                  <td><b>{v.name}</b></td><td className="mono">{v.accountNumber}</td><td>{v.contact}</td><td>{v.phone}</td>
                  <td className="n">{data.parts.filter((p) => p.vendorId === v.id).length}</td><td className="n">{openPos(v.id).length}</td>
                </tr>
              ))}</tbody></table>
          )}
        </section>
        {open && (
          <aside className="card stack" style={{ position: 'sticky', top: 12 }}>
            <div className="row between"><h2 style={{ margin: 0 }}>{open.id ? open.name : 'New vendor'}</h2><button className="btn ghost icon" aria-label="Close" onClick={() => setOpen(null)}>✕</button></div>
            {(['name', 'accountNumber', 'contact', 'phone', 'email', 'website'] as const).map((k) => (
              <Field key={k} label={{ name: 'Name', accountNumber: 'Account #', contact: 'Rep / contact', phone: 'Phone', email: 'Email', website: 'Website / ordering portal' }[k]}>
                <input value={open[k] ?? ''} onChange={(e) => setOpen({ ...open, [k]: e.target.value })} />
              </Field>
            ))}
            <Field label="Notes"><textarea value={open.notes ?? ''} onChange={(e) => setOpen({ ...open, notes: e.target.value })} /></Field>
            <div className="row">
              <button className="btn primary" disabled={!open.name?.trim()} onClick={async () => { const v = await act(() => api.save('vendors', open)); if (v) setOpen(v as Vendor) }}>Save</button>
              {open.website && <button className="btn" onClick={() => api.openLink(/^https?:/.test(open.website!) ? open.website! : `https://${open.website}`)}>Open website</button>}
              {open.id && can.delete && <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={async () => { if (await confirmDialog(`Delete ${open.name}?`)) { await act(() => api.remove('vendors', open.id!)); setOpen(null) } }}>Delete</button>}
            </div>
            {open.id && openPos(open.id).length > 0 && (
              <div><h3>Open POs</h3>{openPos(open.id).map((p) => <button key={p.id} className="menu-item" onClick={() => nav({ page: 'po', id: p.id })}>PO {p.number} · {p.status}</button>)}</div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
