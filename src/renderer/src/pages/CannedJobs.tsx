import { useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, Empty, Field, fmtHours, fmtMoney, LazyInput, LazyNum, LazyText, Menu } from '../ui'
import { laborRate, matrixPrice } from '../../../shared/calc'
import { LINE_KINDS, type CannedJob, type CannedLine, type LineKind } from '../../../shared/types'

export function CannedJobs() {
  const { data, act, can } = useData()
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState<number | null>(data.cannedJobs[0]?.id ?? null)
  const sel = data.cannedJobs.find((c) => c.id === selId)
  const cats = [...new Set(data.cannedJobs.map((c) => c.category || 'Other'))].sort()
  const s = q.trim().toLowerCase()

  const priceOf = (l: CannedLine) => (l.kind === 'labor' ? l.price || laborRate(l.laborRateId, data.settings) : l.kind === 'part' && !l.price ? matrixPrice(l.cost, data.settings) : l.price)
  const total = (c: CannedJob) => c.lines.reduce((a, l) => a + (l.kind === 'discount' ? -1 : 1) * l.qty * priceOf(l), 0)

  // Usage: how often it's been put on ROs, and avg clocked vs billed hours on completed ones.
  const usage = (c: CannedJob) => {
    const jobs = data.jobs.filter((j) => j.cannedJobId === c.id)
    const done = jobs.filter((j) => j.status === 'approved' && data.ros.find((r) => r.id === j.roId)?.status === 'completed')
    const clocked = done.map((j) => data.labor.filter((l) => l.jobId === j.id).reduce((a, l) => a + l.hours, 0)).filter((h) => h > 0)
    const billed = done.map((j) => data.lines.filter((l) => l.jobId === j.id && l.kind === 'labor').reduce((a, l) => a + l.qty, 0))
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    return { used: jobs.length, clocked: avg(clocked), billed: avg(billed) }
  }
  const save = (patch: Partial<CannedJob>) => sel && act(() => api.save('cannedJobs', { id: sel.id, ...patch }))
  const setLine = (i: number, p: Partial<CannedLine>) => sel && save({ lines: sel.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) })
  const addLine = (kind: LineKind) => sel && save({ lines: [...sel.lines, { kind, description: '', partNumber: '', qty: 1, cost: 0, price: kind === 'labor' ? 0 : 0, laborRateId: data.settings.defaultLaborRateId, taxable: kind !== 'discount' }] })

  return (
    <div className="page">
      <div className="page-head"><h1>Canned jobs</h1><span className="muted">Standard jobs with set lines. Pick them on any RO.</span><span className="grow" />
        <button className="btn primary" onClick={async () => { const c = await act(() => api.save('cannedJobs', { name: 'New canned job', category: 'Other' })); if (c) setSelId(c.id) }}>+ New canned job</button></div>
      <div className="master-detail">
        <aside className="card flush">
          <div style={{ padding: 8 }}><input className="sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search canned jobs" /></div>
          {cats.map((cat) => {
            const list = data.cannedJobs.filter((c) => (c.category || 'Other') === cat && c.name.toLowerCase().includes(s))
            if (!list.length) return null
            return (
              <div key={cat}>
                <div className="small strong muted" style={{ padding: '8px 12px 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat}</div>
                {list.map((c) => (
                  <button key={c.id} className={`menu-item ${c.id === selId ? 'on' : ''}`} style={{ height: 44, borderRadius: 0 }} onClick={() => setSelId(c.id)}>
                    <span className="grow ellipsis">{c.name}</span>{can.prices && <span className="small muted num">{fmtMoney(total(c), false)}</span>}
                  </button>
                ))}
              </div>
            )
          })}
          {!data.cannedJobs.length && <Empty text="No canned jobs yet." />}
        </aside>
        {sel ? (
          <section className="stack">
            <div className="card stack">
              <div className="grid3">
                <Field label="Name"><LazyText value={sel.name} onCommit={(name) => save({ name })} /></Field>
                <Field label="Category"><LazyInput value={sel.category} onCommit={(category) => save({ category })} /></Field>
                <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
                  <Field label="Remind every (months)"><LazyNum value={sel.intervalMonths} step="1" onCommit={(intervalMonths) => save({ intervalMonths })} /></Field>
                  <Field label="or miles"><LazyNum value={sel.intervalMiles} step="1000" onCommit={(intervalMiles) => save({ intervalMiles })} /></Field>
                </div>
              </div>
              <Field label="Notes (copied onto the RO job)"><LazyInput value={sel.notes} onCommit={(notes) => save({ notes })} /></Field>
              {(() => { const u = usage(sel); return <div className="small muted">Used {u.used}×{u.billed != null ? ` · avg ${fmtHours(u.clocked)} clocked vs ${fmtHours(u.billed)} billed` : ''}{u.clocked != null && u.billed != null && u.clocked > u.billed ? ' — consider raising the book hours' : ''}</div> })()}
            </div>
            <div className="job">
              <div className="job-head"><b className="grow">{sel.name}</b>{can.prices && <b className="num">{fmtMoney(total(sel))}</b>}</div>
              {sel.lines.length > 0 && (
                <div style={{ overflowX: 'auto' }}><table className="lines" style={{ minWidth: 620 }}><tbody>{sel.lines.map((l, i) => (
                  <tr key={i}>
                    <td><select className="sm" value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as LineKind })} style={{ width: 92 }} aria-label="Line type">{LINE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></td>
                    <td><LazyText value={l.description} placeholder="Description" onCommit={(description) => setLine(i, { description })} />
                      {l.kind === 'part' && <LazyInput className="sub mono" value={l.partNumber} placeholder="Part #" onCommit={(partNumber) => setLine(i, { partNumber })} />}</td>
                    <td style={{ width: 72 }}><LazyNum value={l.qty} step="0.1" aria-label={l.kind === 'labor' ? 'Hours' : 'Qty'} onCommit={(qty) => setLine(i, { qty })} /></td>
                    {can.prices && <>
                      <td style={{ width: 110 }}>{l.kind === 'labor' ? (
                        <select className="sm" value={l.laborRateId} onChange={(e) => setLine(i, { laborRateId: e.target.value })} aria-label="Labor rate">{data.settings.laborRates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                      ) : <LazyNum prefix="$" value={l.cost} aria-label="Cost" onCommit={(cost) => setLine(i, { cost })} />}<div className="small faint" style={{ paddingLeft: 6 }}>{l.kind === 'labor' ? 'rate' : 'cost'}</div></td>
                      <td style={{ width: 110 }}>{l.kind === 'labor' ? <span className="small muted">${laborRate(l.laborRateId, data.settings)}/h</span> : <LazyNum prefix="$" value={l.price} aria-label="Price (0 = matrix)" onCommit={(price) => setLine(i, { price })} />}
                        {l.kind === 'part' && !l.price && <div className="small faint" style={{ paddingLeft: 6 }}>matrix</div>}</td>
                      <td className="n strong" style={{ width: 90 }}>{fmtMoney((l.kind === 'discount' ? -1 : 1) * l.qty * priceOf(l))}</td>
                    </>}
                    <td style={{ width: 40 }}><Menu label="⋯" items={[{ label: 'Delete line', danger: true, onClick: () => save({ lines: sel.lines.filter((_, k) => k !== i) }) }]} /></td>
                  </tr>
                ))}</tbody></table></div>
              )}
              <div className="job-foot">{(['labor', 'part', 'fee', 'sublet'] as LineKind[]).map((k) => <button key={k} className="btn ghost sm" onClick={() => addLine(k)}>+ {k[0].toUpperCase() + k.slice(1)}</button>)}</div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Leave a part's price at $0 to price it from the parts matrix when it's added to an RO. A reminder interval creates a service reminder when the job is completed.</p>
            {can.delete && <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={async () => { if (await confirmDialog(`Delete the canned job "${sel.name}"?`)) { await act(() => api.remove('cannedJobs', sel.id)); setSelId(null) } }}>Delete canned job</button>}
          </section>
        ) : <div className="card"><Empty text="Pick a canned job, or create one. You can also save any RO job as canned from its ⋯ menu." /></div>}
      </div>
    </div>
  )
}
