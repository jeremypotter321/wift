import { useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, Empty, fmtDate, fmtMoney, LazyInput, LazyNum, Pill, todayIso } from '../ui'
import type { PurchaseOrder } from '../../../shared/types'

export function poPill(po: PurchaseOrder, partly: boolean) {
  if (po.status === 'ordered' && partly) return <Pill word="Partly received" cls="p-amber" />
  return <Pill word={po.status[0].toUpperCase() + po.status.slice(1)} cls={{ draft: 'p-slate', ordered: 'p-blue', received: 'p-green', cancelled: 'p-slate' }[po.status]} />
}

export function PurchaseOrders() {
  const { data, act } = useData()
  const nav = useNav()
  const [show, setShow] = useState<'open' | 'all'>('open')
  const list = data.pos.filter((p) => show === 'all' || (p.status !== 'received' && p.status !== 'cancelled'))
  return (
    <div className="page">
      <div className="page-head">
        <h1>Purchase orders</h1>
        <select className="sm" style={{ width: 140 }} value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')}><option value="open">Open</option><option value="all">All</option></select>
        <span className="grow" />
        <button className="btn primary" onClick={async () => { const po = await act(() => api.createPo(data.vendors[0]?.id ?? null)); if (po) nav({ page: 'po', id: po.id }) }}>+ New PO</button>
      </div>
      <section className="card flush">
        {list.length === 0 ? <Empty text="No open purchase orders." /> : (
          <table>
            <thead><tr><th>PO</th><th>Vendor</th><th>For RO</th><th>Created</th><th>Status</th><th className="n">Lines</th><th className="n">Total</th></tr></thead>
            <tbody>{list.map((po) => {
              const lines = data.poLines.filter((l) => l.poId === po.id)
              const partly = lines.some((l) => l.receivedQty > 0) && lines.some((l) => l.receivedQty < l.qty)
              return (
                <tr key={po.id} className="click" onClick={() => nav({ page: 'po', id: po.id })}>
                  <td className="mono">PO {po.number}</td><td>{data.vendors.find((v) => v.id === po.vendorId)?.name ?? '—'}</td>
                  <td className="mono">{po.roId ? data.ros.find((r) => r.id === po.roId)?.number : '—'}</td><td>{fmtDate(po.createdAt)}</td><td>{poPill(po, partly)}</td>
                  <td className="n">{lines.length}</td><td className="n">{fmtMoney(lines.reduce((a, l) => a + l.qty * l.cost, 0))}</td>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function PoDetail({ id }: { id: number }) {
  const { data, act, can, toast } = useData()
  const nav = useNav()
  const po = data.pos.find((p) => p.id === id)
  const [receiving, setReceiving] = useState<Record<number, number> | null>(null)
  if (!po) return <div className="page"><Empty text="Purchase order not found." /></div>
  const lines = data.poLines.filter((l) => l.poId === id)
  const partly = lines.some((l) => l.receivedQty > 0) && lines.some((l) => l.receivedQty < l.qty)
  const editable = po.status === 'draft'
  const save = (p: Partial<PurchaseOrder>) => act(() => api.save('pos', { id, ...p }))
  const vendorParts = data.parts.filter((p) => !po.vendorId || p.vendorId === po.vendorId || !p.vendorId)

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <button className="link small" onClick={() => nav({ page: 'pos' })}>Purchase orders</button><span className="faint">/</span>
        <h1 className="mono">PO {po.number}</h1>{poPill(po, partly)}
        <span className="grow" />
        {po.status === 'draft' && <button className="btn primary" disabled={!lines.length} onClick={() => save({ status: 'ordered', orderedAt: todayIso() })}>Mark ordered</button>}
        {po.status === 'ordered' && !receiving && <button className="btn primary" onClick={() => setReceiving(Object.fromEntries(lines.map((l) => [l.id, 0])))}>Receive items</button>}
        {po.status !== 'received' && po.status !== 'cancelled' && <button className="btn" onClick={() => save({ status: 'cancelled' })}>Cancel PO</button>}
        {can.delete && <button className="btn danger" onClick={async () => { if (await confirmDialog(`Delete PO ${po.number}?`)) { await act(() => api.remove('pos', id)); nav({ page: 'pos' }) } }}>Delete</button>}
      </div>
      <div className="card grid3" style={{ marginBottom: 12 }}>
        <label className="field">Vendor<select disabled={!editable} value={po.vendorId ?? ''} onChange={(e) => save({ vendorId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label className="field">For repair order<select value={po.roId ?? ''} onChange={(e) => save({ roId: e.target.value ? Number(e.target.value) : null })}><option value="">Stock order</option>{data.ros.filter((r) => r.status !== 'completed' || r.id === po.roId).map((r) => <option key={r.id} value={r.id}>RO {r.number}</option>)}</select></label>
        <label className="field">Notes<LazyInput value={po.notes} onCommit={(notes) => save({ notes })} /></label>
      </div>
      <section className="card flush">
        <table>
          <thead><tr><th>Part #</th><th>Description</th><th className="n">Ordered</th><th className="n">Received</th>{receiving && <th className="n">Receiving now</th>}<th className="n">Unit cost</th><th className="n">Total</th><th /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{editable ? <LazyInput className="sm mono" value={l.partNumber} onCommit={(partNumber) => act(() => api.save('poLines', { id: l.id, partNumber }))} /> : <span className="mono">{l.partNumber}</span>}</td>
                <td>{editable ? <LazyInput className="sm" value={l.description} onCommit={(description) => act(() => api.save('poLines', { id: l.id, description }))} /> : l.description}</td>
                <td className="n" style={{ width: 90 }}>{editable ? <LazyNum className="sm" value={l.qty} step="1" onCommit={(qty) => act(() => api.save('poLines', { id: l.id, qty }))} /> : l.qty}</td>
                <td className={`n ${l.receivedQty >= l.qty ? 'tint-good' : ''}`}>{l.receivedQty}</td>
                {receiving && <td className="n" style={{ width: 110 }}><input type="number" className="sm" min={0} value={receiving[l.id] ?? 0} onChange={(e) => setReceiving({ ...receiving, [l.id]: Number(e.target.value) || 0 })} aria-label={`Receive ${l.description}`} /></td>}
                <td className="n" style={{ width: 110 }}>{editable ? <LazyNum className="sm" prefix="$" value={l.cost} onCommit={(cost) => act(() => api.save('poLines', { id: l.id, cost }))} /> : fmtMoney(l.cost)}</td>
                <td className="n">{fmtMoney(l.qty * l.cost)}</td>
                <td style={{ width: 70 }}>{editable && <button className="btn ghost sm" onClick={() => act(() => api.remove('poLines', l.id))}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={receiving ? 6 : 5}>Total</td><td className="n">{fmtMoney(lines.reduce((a, l) => a + l.qty * l.cost, 0))}</td><td /></tr></tfoot>
        </table>
        {editable && (
          <div className="row" style={{ padding: 12, borderTop: '1px solid var(--divider)' }}>
            <select className="sm" style={{ width: 320 }} value="" aria-label="Add from inventory" onChange={async (e) => {
              const p = data.parts.find((x) => x.id === Number(e.target.value))
              if (p) await act(() => api.save('poLines', { poId: id, inventoryPartId: p.id, partNumber: p.partNumber, description: p.description, cost: p.cost, qty: Math.max(1, p.minQty) }))
            }}><option value="">+ Add from inventory…</option>{vendorParts.map((p) => <option key={p.id} value={p.id}>{p.partNumber} · {p.description}</option>)}</select>
            <button className="btn sm" onClick={() => act(() => api.save('poLines', { poId: id, description: 'New part', qty: 1 }))}>+ Add a part not in inventory</button>
          </div>
        )}
        {receiving && (
          <div className="row end" style={{ padding: 12, borderTop: '1px solid var(--divider)' }}>
            <button className="btn" onClick={() => setReceiving(Object.fromEntries(lines.map((l) => [l.id, Math.max(0, l.qty - l.receivedQty)])))}>Receive all</button>
            <button className="btn" onClick={() => setReceiving(null)}>Cancel</button>
            <button className="btn primary" onClick={async () => { await act(() => api.receivePo(id, receiving)); setReceiving(null); toast('Received. Stock updated.') }}>Confirm receipt</button>
          </div>
        )}
      </section>
      <p className="small muted">Receiving adds to on-hand stock. Parts not yet in inventory are created. When everything arrives, an RO marked "Waiting on parts" goes back to In progress.</p>
    </div>
  )
}
