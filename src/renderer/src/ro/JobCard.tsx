import { useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, fmtMoney, LazyInput, LazyNum, LazyText, Menu, Seg, useElapsed } from '../ui'
import { PartPicker } from './Modals'
import { laborRate, lineAmount, matrixMarkupPct, matrixPrice } from '../../../shared/calc'
import type { JobStatus, LineKind, RoJob, RoLine } from '../../../shared/types'

const ICON: Record<LineKind, string> = { labor: '🔧', part: '▣', fee: '▤', sublet: '⇄', discount: '−' }
const KIND_LABEL: Record<LineKind, string> = { labor: 'Labor', part: 'Part', fee: 'Fee', sublet: 'Sublet', discount: 'Discount' }

export function JobCard({ job, lines }: { job: RoJob; lines: RoLine[] }) {
  const { data, act, can, user, toast } = useData()
  const s = data.settings
  const [picking, setPicking] = useState(false)
  const total = lines.reduce((a, l) => a + lineAmount(l), 0)
  const techs = data.users.filter((u) => u.active)
  const saveLine = (id: number, p: Partial<RoLine>) => act(() => api.save('lines', { id, ...p }))
  const addLine = (kind: LineKind, extra: Partial<RoLine> = {}) =>
    act(() => api.save('lines', {
      jobId: job.id, kind, sort: lines.length, qty: 1, laborRateId: s.defaultLaborRateId,
      price: kind === 'labor' ? laborRate(s.defaultLaborRateId, s) : 0,
      description: kind === 'fee' ? '' : kind === 'labor' ? job.title : '', taxable: kind !== 'discount', ...extra,
    }))
  const setStatus = (status: JobStatus) => act(() => api.save('jobs', { id: job.id, status }))

  async function saveAsCanned() {
    const r = await act(() => api.save('cannedJobs', {
      name: job.title, category: 'Saved from RO', notes: job.notes,
      lines: lines.map((l) => ({ kind: l.kind, description: l.description, partNumber: l.partNumber, qty: l.qty, cost: l.cost, price: l.kind === 'part' ? 0 : l.price, laborRateId: l.laborRateId, taxable: l.taxable })),
    }))
    if (r) toast(`Saved "${job.title}" as a canned job`)
  }

  return (
    <div className={`job ${job.status === 'declined' ? 'declined' : ''}`}>
      <div className="job-head">
        <LazyText className="title" value={job.title} aria-label="Job name" onCommit={(title) => act(() => api.save('jobs', { id: job.id, title }))} />
        <select className="sm" style={{ width: 104 }} aria-label="Tech for this job" value={job.techId ?? ''} onChange={(e) => act(() => api.save('jobs', { id: job.id, techId: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">No tech</option>
          {techs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {can.prices && (
          <Seg className="appr" options={['pending', 'approved', 'declined'] as const} labels={{ pending: 'Pending', approved: '✓ Approved', declined: '✕ Declined' }} value={job.status} onChange={setStatus} />
        )}
        {can.prices && <b className="num" style={{ minWidth: 90, textAlign: 'right' }}>{fmtMoney(total)}</b>}
        <Menu label="⋯" items={[
          can.prices && { label: 'Save as canned job', onClick: saveAsCanned },
          can.delete && { label: 'Delete job', danger: true, onClick: async () => { if (await confirmDialog(`Delete the job "${job.title}" and its lines?`)) await act(() => api.remove('jobs', job.id)) } },
        ]} />
      </div>
      {job.notes && <div className="small muted" style={{ padding: '6px 12px 0' }}>{job.notes}</div>}
      {job.status === 'declined' ? (
        <div className="small muted" style={{ padding: '8px 12px' }}>Declined. Kept on the RO for follow-up{job.declinedReason ? `: ${job.declinedReason}` : ''}.</div>
      ) : (
        <>
          {lines.length > 0 && (
            <table className="lines">
              <tbody>
                {lines.map((l) => <LineRow key={l.id} l={l} jobId={job.id} roId={job.roId} save={saveLine} userId={user?.id ?? null} />)}
              </tbody>
            </table>
          )}
          <div className="job-foot">
            <button className="btn ghost sm" onClick={() => addLine('labor')}>+ Labor</button>
            <button className="btn ghost sm" onClick={() => setPicking(true)}>+ Part</button>
            <button className="btn ghost sm" onClick={() => addLine('fee', { description: s.feePresets[0]?.name ?? 'Fee', price: s.feePresets[0]?.amount ?? 0, taxable: s.feePresets[0]?.taxable ?? false })}>+ Fee</button>
            <button className="btn ghost sm" onClick={() => addLine('sublet', { description: 'Sublet' })}>+ Sublet</button>
            {can.prices && <button className="btn ghost sm" onClick={() => addLine('discount', { description: 'Discount', taxable: false })}>+ Discount</button>}
            <span className="grow" />
            {can.prices && lines.length > 0 && <span className="small muted">{lines.filter((l) => l.kind === 'labor').reduce((a, l) => a + l.qty, 0)} h sold</span>}
          </div>
        </>
      )}
      {picking && (
        <PartPicker onClose={() => setPicking(false)} onPick={(p, price) => {
          setPicking(false)
          void addLine('part', p ? { description: p.description, partNumber: p.partNumber, cost: p.cost, price, inventoryPartId: p.id, vendorId: p.vendorId } : { description: '' })
        }} />
      )}
    </div>
  )
}

function LineRow({ l, roId, jobId, save, userId }: { l: RoLine; roId: number; jobId: number; save: (id: number, p: Partial<RoLine>) => void; userId: number | null }) {
  const { data, act, can } = useData()
  const s = data.settings
  const running = data.labor.find((e) => e.timerStart && e.jobId === jobId && e.userId === userId)
  const elapsed = useElapsed(running?.timerStart)
  const matrix = l.kind === 'part' && l.cost > 0 ? matrixPrice(l.cost, s) : null
  const overridden = matrix != null && Math.abs(matrix - l.price) > 0.009
  const showCost = can.profit && (l.kind === 'part' || l.kind === 'sublet' || l.kind === 'fee')

  return (
    <tr>
      <td aria-label={KIND_LABEL[l.kind]} title={KIND_LABEL[l.kind]}>{ICON[l.kind]}</td>
      <td>
        <LazyText value={l.description} placeholder={KIND_LABEL[l.kind]} aria-label="Description" onCommit={(description) => save(l.id, { description })} />
        {l.kind === 'part' && <LazyInput className="sub mono" value={l.partNumber} placeholder="Part #" aria-label="Part number" onCommit={(partNumber) => save(l.id, { partNumber })} />}
        {l.kind === 'labor' && can.prices && (
          <select className="sm" style={{ height: 22, fontSize: 11, border: 0, color: 'var(--text-3)', width: 'auto', paddingLeft: 6 }} aria-label="Labor rate" value={l.laborRateId}
            onChange={(e) => save(l.id, { laborRateId: e.target.value, price: laborRate(e.target.value, s) })}>
            {s.laborRates.map((r) => <option key={r.id} value={r.id}>{r.name} · ${r.rate}/h</option>)}
          </select>
        )}
      </td>
      <td style={{ width: 44 }}>
        {l.kind === 'labor' && (
          <button className={`clock-btn ${running ? 'running' : ''}`} aria-label={running ? 'Stop job clock' : 'Start job clock'} title={running ? `Running ${elapsed}` : 'Start job clock'}
            onClick={() => act(() => (running ? api.stopClock(running.id) : api.startClock(roId, jobId, userId)))}>{running ? '■' : '▶'}</button>
        )}
      </td>
      <td style={{ width: 72 }}><LazyNum value={l.qty} step="0.1" aria-label={l.kind === 'labor' ? 'Hours' : 'Quantity'} onCommit={(qty) => save(l.id, { qty })} /></td>
      {can.prices && (
        <td style={{ width: 120 }}>
          <LazyNum value={l.price} prefix="$" aria-label="Unit price" onCommit={(price) => save(l.id, { price })} />
          {showCost && (
            <div className="cost">cost <LazyNum value={l.cost} prefix="$" aria-label="Unit cost" onCommit={(cost) => save(l.id, { cost, ...(l.kind === 'part' && !overridden ? { price: matrixPrice(cost, s) } : {}) })} /></div>
          )}
          {matrix != null && (
            <button className={`matrix-chip ${overridden ? 'override' : ''}`} style={{ marginLeft: 6 }}
              title={overridden ? `Matrix price is ${fmtMoney(matrix)}. Click to reset.` : `Cost ${fmtMoney(l.cost)} → +${matrixMarkupPct(l.cost, s)}% markup`}
              onClick={() => overridden && save(l.id, { price: matrix })}>
              {overridden ? 'Override · reset' : `Matrix ×${(1 + matrixMarkupPct(l.cost, s) / 100).toFixed(2)}`}
            </button>
          )}
        </td>
      )}
      {can.prices && <td className="n strong" style={{ width: 96 }}>{fmtMoney(lineAmount(l))}</td>}
      <td style={{ width: 40 }}>
        <Menu label="⋯" items={[
          { label: l.taxable ? 'Mark not taxable' : 'Mark taxable', onClick: () => save(l.id, { taxable: !l.taxable }) },
          { label: 'Delete line', danger: true, onClick: () => act(() => api.remove('lines', l.id)) },
        ]} />
      </td>
    </tr>
  )
}
