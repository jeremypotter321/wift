import { useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, csvOf, Empty, Field, fmtMoney, LazyInput, LazyNum, LazyText, Menu, Modal, NumInput, Tabs, todayIso } from '../ui'
import { matrixPrice } from '../../../shared/calc'
import type { InventoryPart, PartCategory } from '../../../shared/types'

export function Inventory() {
  const { data, act, can } = useData()
  const nav = useNav()
  const [tab, setTab] = useState<'part' | 'tire'>('part')
  const [q, setQ] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [quick, setQuick] = useState<Partial<InventoryPart>>({ partNumber: '', description: '', cost: 0, onHand: 0 })
  const [adjust, setAdjust] = useState<InventoryPart | null>(null)
  const [importing, setImporting] = useState(false)

  // Committed = on approved jobs of open ROs (not yet taken out of stock). Incoming = on ordered POs.
  const committed = useMemo(() => {
    const m = new Map<number, number>()
    const openJobs = new Set(data.jobs.filter((j) => j.status === 'approved' && data.ros.some((r) => r.id === j.roId && !r.stockApplied)).map((j) => j.id))
    for (const l of data.lines) if (l.kind === 'part' && l.inventoryPartId && openJobs.has(l.jobId)) m.set(l.inventoryPartId, (m.get(l.inventoryPartId) ?? 0) + l.qty)
    return m
  }, [data])
  const incoming = useMemo(() => {
    const m = new Map<number, number>()
    const ordered = new Set(data.pos.filter((p) => p.status === 'ordered').map((p) => p.id))
    for (const l of data.poLines) if (l.inventoryPartId && ordered.has(l.poId)) m.set(l.inventoryPartId, (m.get(l.inventoryPartId) ?? 0) + Math.max(0, l.qty - l.receivedQty))
    return m
  }, [data])

  const s = q.trim().toLowerCase()
  const rows = data.parts
    .filter((p) => (tab === 'tire' ? p.category === 'tire' : p.category !== 'tire'))
    .filter((p) => !s || `${p.partNumber} ${p.description} ${p.brand} ${p.tireSize} ${p.location}`.toLowerCase().includes(s))
    .map((p) => ({ p, committed: committed.get(p.id) ?? 0, incoming: incoming.get(p.id) ?? 0, available: p.onHand - (committed.get(p.id) ?? 0) }))
    .filter((r) => !lowOnly || r.available <= r.p.minQty)
  const value = data.parts.reduce((a, p) => a + Math.max(0, p.onHand) * p.cost, 0)
  const save = (id: number, patch: Partial<InventoryPart>) => act(() => api.save('parts', { id, ...patch }))
  const vendor = (id: number | null) => data.vendors.find((v) => v.id === id)?.name ?? ''

  return (
    <div className="page">
      <div className="page-head">
        <h1>Inventory</h1>
        {can.prices && <span className="muted">{data.parts.length} items · {fmtMoney(value, false)} at cost</span>}
        <span className="grow" />
        <button className="btn" onClick={() => setImporting(true)}>Import CSV</button>
        <button className="btn" onClick={() => act(() => api.saveCsv(`inventory-${todayIso()}.csv`, csvOf(['Part #', 'Description', 'Brand', 'Category', 'Tire size', 'Location', 'On hand', 'Reorder at', 'Cost', 'Price', 'Vendor'],
          data.parts.map((p) => [p.partNumber, p.description, p.brand, p.category, p.tireSize, p.location, p.onHand, p.minQty, p.cost, p.price, vendor(p.vendorId)]))))}>Export CSV</button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['part', 'Parts & fluids'], ['tire', 'Tires']]} />
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="sm" style={{ width: 300 }} placeholder={tab === 'tire' ? 'Search size, brand, part #' : 'Search part #, description, brand, bin'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
        <label className="check small"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />Low or out only</label>
      </div>
      <section className="card flush" style={{ overflowX: 'auto' }}>
        <table className="inv">
          <thead><tr><th>Part #</th><th>Description</th>{tab === 'tire' && <th>Size</th>}<th>Bin</th><th className="n">On hand</th><th className="n">Committed</th><th className="n">Available</th><th className="n">Incoming</th><th className="n">Reorder at</th>{can.prices && <><th className="n">Cost</th><th className="n">Price</th></>}<th /></tr></thead>
          <tbody>
            <tr style={{ background: 'var(--canvas)' }}>
              <td><input className="sm mono" placeholder="Part #" value={quick.partNumber} onChange={(e) => setQuick({ ...quick, partNumber: e.target.value })} aria-label="New part number" /></td>
              <td><input className="sm" placeholder="+ Quick add: description" value={quick.description} onChange={(e) => setQuick({ ...quick, description: e.target.value })} aria-label="New part description" /></td>
              {tab === 'tire' && <td><input className="sm" placeholder="225/40R18" value={quick.tireSize ?? ''} onChange={(e) => setQuick({ ...quick, tireSize: e.target.value })} /></td>}
              <td />
              <td><NumInput className="sm" value={quick.onHand ?? 0} aria-label="On hand" onChange={(onHand) => setQuick({ ...quick, onHand })} /></td>
              <td colSpan={4} />
              {can.prices && <><td><NumInput className="sm" prefix="$" value={quick.cost ?? 0} aria-label="Cost" onChange={(cost) => setQuick({ ...quick, cost })} /></td><td /></>}
              <td><button className="btn sm primary" disabled={!quick.description?.trim()} onClick={async () => { await act(() => api.save('parts', { ...quick, category: tab === 'tire' ? 'tire' : 'part' })); setQuick({ partNumber: '', description: '', cost: 0, onHand: 0 }) }}>Add</button></td>
            </tr>
            {rows.map(({ p, committed: c, incoming: inc, available }) => (
              <tr key={p.id}>
                <td><LazyInput className="sm mono" value={p.partNumber} aria-label="Part number" onCommit={(partNumber) => save(p.id, { partNumber })} /></td>
                <td><LazyText className="sm" value={p.description} aria-label="Description" onCommit={(description) => save(p.id, { description })} /><div className="small muted" style={{ paddingLeft: 8 }}>{[p.brand, vendor(p.vendorId)].filter(Boolean).join(' · ')}</div></td>
                {tab === 'tire' && <td style={{ minWidth: 110 }}><LazyInput className="sm" value={p.tireSize} onCommit={(tireSize) => save(p.id, { tireSize })} /></td>}
                <td><LazyInput className="sm" value={p.location} aria-label="Bin" onCommit={(location) => save(p.id, { location })} /></td>
                <td className="n num strong">{p.onHand}</td>
                <td className="n num">{c || '—'}</td>
                <td className="n">{available <= 0 ? <span className="pill p-red nodot">Out {available}</span> : available <= p.minQty ? <span className="pill p-amber nodot">Low {available}</span> : <span className="num">{available}</span>}</td>
                <td className="n num">{inc || '—'}</td>
                <td className="n"><LazyNum className="sm" value={p.minQty} step="1" aria-label="Reorder at" onCommit={(minQty) => save(p.id, { minQty })} /></td>
                {can.prices && <>
                  <td className="n"><LazyNum className="sm" prefix="$" value={p.cost} aria-label="Cost" onCommit={(cost) => save(p.id, { cost })} /></td>
                  <td className="n" style={{ width: 100 }}>{p.price ? fmtMoney(p.price) : <span className="muted" title="From the pricing matrix">{fmtMoney(matrixPrice(p.cost, data.settings))}</span>}</td>
                </>}
                <td style={{ width: 40 }}>
                  <Menu label="⋯" items={[
                    { label: 'Adjust stock…', onClick: () => setAdjust(p) },
                    { label: 'Create purchase order', onClick: async () => {
                      const po = await act(() => api.createPo(p.vendorId))
                      if (po) { await act(() => api.save('poLines', { poId: po.id, inventoryPartId: p.id, partNumber: p.partNumber, description: p.description, qty: Math.max(1, p.minQty * 2 - available), cost: p.cost })); nav({ page: 'po', id: po.id }) }
                    } },
                    can.delete && { label: 'Delete part', danger: true, onClick: async () => { if (await confirmDialog(`Delete ${p.description}?`)) await act(() => api.remove('parts', p.id)) } },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text={data.parts.length ? 'Nothing matches.' : 'No parts in stock yet. Add a part above or import a CSV.'} />}
      </section>
      {adjust && <AdjustModal part={adjust} onClose={() => setAdjust(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  )
}

function AdjustModal({ part, onClose }: { part: InventoryPart; onClose: () => void }) {
  const { act } = useData()
  const [count, setCount] = useState(part.onHand)
  const [reason, setReason] = useState('Count correction')
  return (
    <Modal title={`Adjust stock: ${part.description}`} onClose={onClose} foot={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!reason.trim()} onClick={async () => {
        await act(() => api.save('parts', { id: part.id, onHand: count, notes: `${part.notes ? part.notes + '\n' : ''}${todayIso()}: ${part.onHand} → ${count} (${reason})` }))
        onClose()
      }}>Save</button></>}>
      <div className="stack">
        <Field label={`New on-hand count (now ${part.onHand})`}><NumInput value={count} step="1" onChange={setCount} /></Field>
        <Field label="Reason (kept with the part)"><select value={reason} onChange={(e) => setReason(e.target.value)}>{['Count correction', 'Damaged', 'Returned to vendor', 'Used in shop', 'Lost / shrinkage', 'Other'].map((r) => <option key={r}>{r}</option>)}</select></Field>
        {part.notes && <pre className="small muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{part.notes}</pre>}
      </div>
    </Modal>
  )
}

/** CSV columns (header names, any order): Part #, Description, Brand, Category, Tire size, Location, On hand, Reorder at, Cost, Price. */
function ImportModal({ onClose }: { onClose: () => void }) {
  const { act, toast } = useData()
  const [rows, setRows] = useState<Partial<InventoryPart>[]>([])
  const [err, setErr] = useState('')
  const parse = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const split = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim())
    const head = split(lines[0] ?? '').map((h) => h.toLowerCase())
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
    const idx = { pn: col('part #', 'part number', 'sku'), d: col('description', 'name'), b: col('brand'), c: col('category'), t: col('tire size', 'size'), l: col('location', 'bin'), o: col('on hand', 'qty', 'quantity'), m: col('reorder at', 'min'), cost: col('cost'), p: col('price') }
    if (idx.d < 0) return setErr('The CSV needs a "Description" column.')
    setErr('')
    setRows(lines.slice(1).map(split).map((r) => ({
      partNumber: r[idx.pn] ?? '', description: r[idx.d] ?? '', brand: r[idx.b] ?? '', category: (['part', 'tire', 'fluid', 'other'].includes(r[idx.c]) ? r[idx.c] : 'part') as PartCategory,
      tireSize: r[idx.t] ?? '', location: r[idx.l] ?? '', onHand: Number(r[idx.o]) || 0, minQty: Number(r[idx.m]) || 0, cost: Number(r[idx.cost]) || 0, price: Number(r[idx.p]) || 0,
    })).filter((r) => r.description))
  }
  return (
    <Modal title="Import inventory CSV" size="wide" onClose={onClose} foot={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!rows.length} onClick={async () => { await act(() => api.saveMany(rows.map((d) => ({ entity: 'parts' as const, data: d })))); toast(`Imported ${rows.length} parts`); onClose() }}>Import {rows.length} parts</button></>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Columns: Part #, Description, Brand, Category (part / tire / fluid), Tire size, Location, On hand, Reorder at, Cost, Price. Only Description is required.</p>
        <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) parse(await f.text()) }} />
        {err && <div className="neg small">{err}</div>}
        {rows.length > 0 && (
          <table><thead><tr><th>Part #</th><th>Description</th><th className="n">On hand</th><th className="n">Cost</th></tr></thead>
            <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}><td className="mono">{r.partNumber}</td><td>{r.description}</td><td className="n">{r.onHand}</td><td className="n">{fmtMoney(r.cost)}</td></tr>)}</tbody></table>
        )}
        {rows.length > 8 && <span className="small muted">…and {rows.length - 8} more</span>}
      </div>
    </Modal>
  )
}
