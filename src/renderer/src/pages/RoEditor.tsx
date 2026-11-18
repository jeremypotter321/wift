import { useEffect, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import {
  Avatar, confirmDialog, ContentEditor, Empty, fmtDate, fmtHours, fmtMoney, Hourly, LazyInput, LazyNum, LazyText, Menu, NumInput, RiskEditor, RoPill, Tabs, VerdictCard,
} from '../ui'
import { JobCard } from '../ro/JobCard'
import { InspectionTab } from '../ro/InspectionTab'
import { CannedPicker, CustomerPicker, PaymentModal, PrintModal, SignatureModal, VehicleModal } from '../ro/Modals'
import { contentScore, hourlyTint, keywordContent, payState, verdict } from '../../../shared/calc'
import { vehicleName } from '../../../shared/bundle'
import { CONTENT_FACTORS, PLATFORMS, RO_STAGES, type ContentFactor, type RepairOrder } from '../../../shared/types'

type Tab = 'jobs' | 'inspection' | 'payments' | 'notes' | 'content'
type ModalKind = null | 'sign' | 'print-estimate' | 'print-invoice' | 'print-inspection' | 'pay' | 'customer' | 'vehicle' | 'canned'

export function RoEditor({ id, initialTab }: { id: number; initialTab?: string }) {
  const { data, ix, act, can, toast } = useData()
  const nav = useNav()
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'jobs')
  const [modal, setModal] = useState<ModalKind>(null)
  const [verdictOpen, setVerdictOpen] = useState(false)
  const ro = data.ros.find((r) => r.id === id)
  if (!ro) return <div className="page"><Empty text="This repair order no longer exists." action={<button className="btn" onClick={() => nav({ page: 'board' })}>Back to job board</button>} /></div>

  const { bundle: b, totals: t } = ix.totals(id)
  const customer = b.customer
  const vehicle = ro.vehicleId ? ix.vehicles.get(ro.vehicleId) ?? null : null
  const v = verdict(b, data.settings, data.users)
  const s = data.settings
  const save = (p: Partial<RepairOrder>) => act(() => api.save('ros', { id, ...p }))
  const paid = payState(ro, t)
  const inspItems = data.inspectionItems.filter((i) => data.inspections.some((x) => x.roId === id && x.id === i.inspectionId))
  const nowCount = inspItems.filter((i) => i.rating === 'now').length
  const steps = ['Estimate', 'Work in progress', 'Completed', 'Paid']
  const stepIdx = paid === 'Paid' ? 3 : ro.status === 'completed' ? 2 : ro.status === 'wip' ? 1 : 0
  const anyApproved = b.jobs.some((j) => j.status === 'approved')

  async function complete() {
    if (ro!.mileageOut && ro!.mileageOut < ro!.mileageIn) return toast('Mileage out is lower than mileage in.')
    const pending = b.jobs.filter((j) => j.status === 'pending').length
    if (pending && !(await confirmDialog(`${pending} job${pending > 1 ? 's are' : ' is'} still pending approval and won't be billed. Complete anyway?`, 'Complete work'))) return
    await act(() => api.setRoStatus(id, 'completed'))
  }

  return (
    <div className="page">
      <div className="ro-header">
        <div className="row wrap">
          <button className="link small" onClick={() => nav({ page: 'board' })}>Job board</button><span className="faint">/</span>
          <h1 className="mono">RO {ro.number}</h1>
          <RoPill ro={ro} t={t} />
          <select className="sm" style={{ width: 170 }} aria-label="Stage" value={ro.stage} onChange={(e) => save({ stage: e.target.value })}>
            {RO_STAGES[ro.status].map((st) => <option key={st}>{st}</option>)}
          </select>
          <span className="grow" />
          <div className="stepper" aria-label="Progress">
            {steps.map((st, i) => <span key={st} className={i === stepIdx ? 'cur' : ''}>{i < stepIdx ? '✓ ' : ''}{st}</span>)}
          </div>
          <Menu label="⋯" items={[
            ro.status !== 'estimate' && { label: 'Move back to estimate', onClick: () => act(() => api.setRoStatus(id, 'estimate')) },
            ro.status === 'completed' && { label: 'Reopen (back to work in progress)', onClick: () => act(() => api.setRoStatus(id, 'wip')) },
            ro.status === 'completed' && !ro.pickedUpAt && { label: 'Mark picked up', onClick: () => save({ pickedUpAt: new Date().toISOString().slice(0, 10), stage: 'Picked up' }) },
            can.delete && { label: 'Delete RO', danger: true, onClick: async () => { if (await confirmDialog(`Delete RO ${ro.number} with all its jobs, payments and inspections?`)) { await act(() => api.remove('ros', id)); nav({ page: 'board' }) } } },
          ]} />
        </div>
        <div className="ro-cells">
          <div>
            <div className="lbl">Customer</div>
            {customer ? (
              <div><button className="link strong" onClick={() => nav({ page: 'customer', id: customer.id })}>{customer.name}</button>
                <div className="small muted">{customer.phone}{customer.phone && <button className="link small" style={{ marginLeft: 6 }} onClick={() => { void navigator.clipboard.writeText(customer.phone); toast('Phone copied') }}>copy</button>}</div>
                <button className="link small" onClick={() => setModal('customer')}>change</button></div>
            ) : <button className="btn sm" onClick={() => setModal('customer')}>+ Choose customer</button>}
          </div>
          <div>
            <div className="lbl">Vehicle</div>
            {vehicle ? (
              <div>
                <button className="link strong" onClick={() => nav({ page: 'vehicle', id: vehicle.id })}>{vehicleName(vehicle)}</button>
                <div className="row wrap small" style={{ gap: 6 }}>
                  {vehicle.engine && <span className="chip">{vehicle.engine}</span>}
                  {vehicle.plate && <span className="muted">{vehicle.plate}</span>}
                  {vehicle.vin && <span className="mono muted" title={vehicle.vin}>…{vehicle.vin.slice(-8)}</span>}
                </div>
                <VehicleSwitch roId={id} customerId={ro.customerId} current={vehicle.id} onAdd={() => setModal('vehicle')} />
              </div>
            ) : ro.customerId ? <VehicleSwitch roId={id} customerId={ro.customerId} current={null} onAdd={() => setModal('vehicle')} /> : <span className="faint small">Choose a customer first</span>}
          </div>
          <div>
            <div className="lbl">Mileage in / out</div>
            <div className="row" style={{ gap: 4 }}>
              <div style={{ width: 96 }}><LazyNum value={ro.mileageIn} step="1" aria-label="Mileage in" onCommit={(mileageIn) => save({ mileageIn })} /></div>
              <div style={{ width: 96 }}><LazyNum value={ro.mileageOut} step="1" className={ro.mileageOut && ro.mileageOut < ro.mileageIn ? 'err' : ''} aria-label="Mileage out" onCommit={(mileageOut) => save({ mileageOut })} /></div>
            </div>
            {ro.mileageOut > 0 && ro.mileageOut < ro.mileageIn && <div className="small neg">Out is lower than in</div>}
          </div>
          <div>
            <div className="lbl">Promised</div>
            <input type="datetime-local" className="sm" value={ro.promisedAt} onChange={(e) => save({ promisedAt: e.target.value })} aria-label="Promised time" />
          </div>
          <div>
            <div className="lbl">Advisor · Tech</div>
            <div className="stack tight">
              <select className="sm" aria-label="Advisor" value={ro.advisorId ?? ''} onChange={(e) => save({ advisorId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>{data.users.filter((u) => u.active && u.role !== 'tech').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="sm" aria-label="Lead tech" value={ro.techId ?? ''} onChange={(e) => save({ techId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No tech</option>{data.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="ro-body">
        <div>
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[
            ['jobs', `Jobs (${b.jobs.length})`],
            ['inspection', <>Inspection {nowCount > 0 && <span className="pill p-red nodot">{nowCount} Now</span>}</>],
            ...(can.payments ? [['payments', `Payments (${b.payments.length})`] as [Tab, string]] : []),
            ['notes', 'Notes & history'],
            ['content', `Content (${contentScore(ro.content)}/10)`],
          ]} />

          {tab === 'jobs' && (
            <div>
              <div className="card concern-card" style={{ marginBottom: 12, padding: 16 }}>
                <label className="field">Customer concern<LazyText className="concern-input" value={ro.concern} placeholder="What the customer says is wrong, in their words" onCommit={(concern) => save({ concern })} /></label>
              </div>
              {b.jobs.length === 0 && <div className="card" style={{ marginBottom: 12 }}><Empty text="No jobs yet. Add a job or pick a canned job." /></div>}
              {b.jobs.map((j) => <JobCard key={j.id} job={j} lines={b.lines.filter((l) => l.jobId === j.id)} />)}
              <div className="row wrap">
                <button className="btn" onClick={() => act(() => api.addJob(id, 'New job'))}>+ Add job</button>
                <button className="btn" onClick={() => setModal('canned')}>Add canned job…</button>
                {can.prices && <button className="btn" title={`Adds a Diagnosis job with the ${fmtMoney(s.diagnosisFee)} diagnosis fee (Settings ▸ Supplies & fees)`} onClick={async () => {
                  const j = await act(() => api.addJob(id, 'Diagnosis'))
                  if (j) await act(() => api.save('lines', { jobId: j.id, kind: 'fee', description: 'Diagnosis', qty: 1, price: s.diagnosisFee, taxable: false, sort: 0 }))
                }}>+ Diagnosis ({fmtMoney(s.diagnosisFee, false)})</button>}
                {can.prices && b.lines.some((l) => l.kind === 'part') && <button className="btn" title="Puts this RO's parts on draft purchase orders, one per vendor" onClick={async () => {
                  const r = await act(() => api.orderPartsForRo(id))
                  if (!r) return
                  if (!r.pos.length) toast(r.skipped ? 'Every part on this RO is already on a purchase order' : 'No parts to order')
                  else { toast(`${r.pos.length === 1 ? `PO ${r.pos[0].number}` : `${r.pos.length} purchase orders`} drafted for this RO's parts`); if (r.pos.length === 1) nav({ page: 'po', id: r.pos[0].id }) }
                }}>Order parts</button>}
                {ro.status !== 'estimate' && <span className="small muted">New jobs start as Pending and need the customer's approval.</span>}
              </div>
            </div>
          )}
          {tab === 'inspection' && <InspectionTab roId={id} onPrint={() => setModal('print-inspection')} />}
          {tab === 'payments' && (
            <div className="card flush">
              <div className="card-head"><h2>Payments</h2><button className="btn sm primary" disabled={ro.status === 'estimate' && t.total <= 0} onClick={() => setModal('pay')}>Take payment</button></div>
              {b.payments.length === 0 ? <Empty text="No payments yet. Deposits can be taken at any stage." /> : (
                <table>
                  <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="n">Amount</th><th /></tr></thead>
                  <tbody>{b.payments.map((p) => (
                    <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.method}</td><td className="muted">{p.reference || p.note}</td><td className="n">{fmtMoney(p.amount)}</td>
                      <td className="n" style={{ width: 90 }}>{can.delete && <button className="btn ghost sm" onClick={async () => { if (await confirmDialog(`Delete this ${fmtMoney(p.amount)} payment?`)) await act(() => api.remove('payments', p.id)) }}>Delete</button>}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
          {tab === 'notes' && <NotesTab roId={id} />}
          {tab === 'content' && <ContentTab roId={id} />}
        </div>

        <aside className="rail">
          {can.profit && (ro.status === 'estimate' || verdictOpen ? (
            <VerdictCard v={v}>
              <details style={{ marginTop: 10 }}>
                <summary className="small strong" style={{ cursor: 'pointer' }}>Risks ({ro.riskFlags.length})</summary>
                <RiskEditor value={ro.riskFlags} onChange={(riskFlags) => save({ riskFlags })} />
              </details>
              {ro.status !== 'estimate' && <button className="link small" onClick={() => setVerdictOpen(false)}>Collapse</button>}
            </VerdictCard>
          ) : (
            <button className="verdict-line" onClick={() => setVerdictOpen(true)}>
              <span className="small muted">Verdict on the estimate:</span>
              <b className={v.level === 'Take' ? 'tint-good' : v.level === 'Maybe' ? 'tint-warn' : 'tint-bad'}>{v.level ?? '—'}</b>
              <span className="small muted">{v.projectedHourly != null ? `${fmtMoney(v.projectedHourly, false)}/h` : ''}</span>
            </button>
          ))}

          {can.prices && (
            <div className="card">
              <div className="totals">
                <span>Parts</span><span className="r">{fmtMoney(t.parts)}</span>
                <span>Labor</span><span className="r">{fmtMoney(t.labor)}</span>
                {t.fees > 0 && <><span>Fees</span><span className="r">{fmtMoney(t.fees)}</span></>}
                {t.sublet > 0 && <><span>Sublet</span><span className="r">{fmtMoney(t.sublet)}</span></>}
                <span>Discount <span className="row" style={{ display: 'inline-flex', width: 70, verticalAlign: 'middle' }}><NumInput className="sm" value={ro.discountPct} aria-label="Discount percent" onChange={(discountPct) => save({ discountPct })} /></span> %</span>
                <span className="r">{t.discount ? `−${fmtMoney(t.discount)}` : '—'}</span>
                <span>Shop supplies {ro.suppliesOverride == null ? <span className="faint small">({s.shopSuppliesPct}% of labor{s.shopSuppliesCap ? `, max $${s.shopSuppliesCap}` : ''})</span> : <button className="link small" onClick={() => save({ suppliesOverride: null })}>reset</button>}</span>
                <span className="r">{ro.suppliesOverride == null ? <button className="link" title="Click to waive" onClick={() => save({ suppliesOverride: 0 })}>{fmtMoney(t.supplies)}</button> : fmtMoney(t.supplies)}</span>
                <span>Tax{customer?.taxExempt ? ' (exempt)' : ''}</span><span className="r">{fmtMoney(t.tax)}</span>
                <span className="rule" />
                <span className="big">Total</span><span className="big r">{fmtMoney(t.total)}</span>
                <span>Paid</span><span className="r">{fmtMoney(t.paid)}</span>
                <span className="big">Balance</span><span className={`big r ${paid === 'A/R' ? 'neg' : ''}`}>{fmtMoney(t.balance)}</span>
              </div>
              {t.pendingTotal > 0 && <p className="small muted" style={{ margin: '8px 0 0' }}>+ {fmtMoney(t.pendingTotal)} in jobs awaiting approval (not in total).</p>}
              {t.declinedTotal > 0 && <p className="small muted" style={{ margin: '4px 0 0' }}>{fmtMoney(t.declinedTotal)} declined.</p>}
            </div>
          )}

          {can.profit && (
            <div className="shop-only">
              <div className="small muted" style={{ marginBottom: 6 }}>🔒 Shop only. Never printed.</div>
              <div className="totals">
                <span>Cost (parts, sublet, labor)</span><span className="r">{fmtMoney(t.partsCost + t.subletCost + t.feesCost + t.laborCost)}</span>
                <span className="strong">Gross profit</span><span className="r strong">{fmtMoney(t.grossProfit)} {t.gpPct != null && <span className="muted">({Math.round(t.gpPct)}%)</span>}</span>
                <span>Parts GP</span><span className="r">{t.partsGpPct != null ? `${Math.round(t.partsGpPct)}%` : '—'}</span>
                <span>Labor GP</span><span className="r">{t.laborGpPct != null ? `${Math.round(t.laborGpPct)}%` : '—'}</span>
                <span>Hours sold / clocked</span><span className="r">{fmtHours(t.soldHours)} / {fmtHours(t.clockedHours)}</span>
                <span>Effective $/hr</span><span className="r"><Hourly v={t.effectiveHourly} tint={hourlyTint(t.effectiveHourly, s)} /> <span className="faint small">vs {fmtMoney(s.targetHourly, false)}</span></span>
              </div>
            </div>
          )}

          <div className="stack tight">
            {ro.status === 'estimate' && can.prices && <button className="btn primary lg block" disabled={!b.jobs.length} onClick={() => setModal('sign')}>Get signature</button>}
            {ro.status === 'estimate' && can.prices && anyApproved && <button className="btn block" onClick={() => act(() => api.setRoStatus(id, 'wip'))}>Start work (approved by phone)</button>}
            {ro.status === 'wip' && <button className="btn primary lg block" onClick={complete}>Complete work</button>}
            {ro.status === 'wip' && b.jobs.some((j) => j.status === 'pending') && can.prices && <button className="btn block" onClick={() => setModal('sign')}>Get approval for new jobs</button>}
            {ro.status === 'completed' && paid !== 'Paid' && can.payments && <button className="btn primary lg block" onClick={() => setModal('pay')}>Take payment</button>}
            {ro.status === 'completed' && paid === 'A/R' && !ro.pickedUpAt && can.payments && <button className="btn block" onClick={() => save({ pickedUpAt: new Date().toISOString().slice(0, 10), stage: 'Picked up' })}>Post to A/R (car leaves unpaid)</button>}
            {can.prices && <button className="btn block" onClick={() => setModal(ro.status === 'completed' ? 'print-invoice' : 'print-estimate')}>{ro.status === 'completed' ? 'Print invoice' : 'Print estimate'}</button>}
          </div>
        </aside>
      </div>

      {modal === 'sign' && <SignatureModal roId={id} onClose={() => setModal(null)} />}
      {modal === 'pay' && <PaymentModal roId={id} onClose={() => setModal(null)} />}
      {(modal === 'print-estimate' || modal === 'print-invoice' || modal === 'print-inspection') && (
        <PrintModal roId={id} initial={modal === 'print-estimate' ? 'estimate' : modal === 'print-invoice' ? 'invoice' : 'inspection'} onClose={() => setModal(null)} />
      )}
      {modal === 'customer' && <CustomerPicker onClose={() => setModal(null)} onPick={async (c) => {
        setModal(null)
        const veh = data.vehicles.filter((x) => x.customerId === c.id)
        await save({ customerId: c.id, vehicleId: veh.length === 1 ? veh[0].id : ro.vehicleId && data.vehicles.find((x) => x.id === ro.vehicleId)?.customerId === c.id ? ro.vehicleId : null, mileageIn: veh.length === 1 ? veh[0].mileage : ro.mileageIn })
      }} />}
      {modal === 'vehicle' && <VehicleModal customerId={ro.customerId} onClose={() => setModal(null)} onSaved={async (veh) => { setModal(null); await save({ vehicleId: veh.id, mileageIn: veh.mileage || ro.mileageIn }) }} />}
      {modal === 'canned' && <CannedPicker onClose={() => setModal(null)} onPick={async (cid) => { setModal(null); await act(() => api.addCannedJob(id, cid)) }} />}
    </div>
  )
}

function VehicleSwitch({ roId, customerId, current, onAdd }: { roId: number; customerId: number | null; current: number | null; onAdd: () => void }) {
  const { data, act } = useData()
  const mine = data.vehicles.filter((v) => v.customerId === customerId)
  return (
    <select className="sm" style={{ marginTop: 4, width: 'auto', maxWidth: '100%' }} aria-label={current ? 'Change vehicle' : 'Choose vehicle'} value="" onChange={(e) => {
      if (e.target.value === 'new') return onAdd()
      const v = e.target.value === 'remove' ? undefined : mine.find((x) => x.id === Number(e.target.value))
      void act(() => api.save('ros', { id: roId, vehicleId: v?.id ?? null, ...(v ? { mileageIn: v.mileage } : {}) }))
    }}>
      <option value="" disabled>{current ? 'Change vehicle…' : 'Choose vehicle…'}</option>
      {mine.filter((v) => v.id !== current).map((v) => <option key={v.id} value={v.id}>{vehicleName(v)}{v.plate ? ` · ${v.plate}` : ''}</option>)}
      {current && <option value="remove">Remove vehicle from RO</option>}
      <option value="new">+ Add vehicle…</option>
    </select>
  )
}

function NotesTab({ roId }: { roId: number }) {
  const { data, ix, act } = useData()
  const { bundle: b } = ix.totals(roId)
  const ro = b.ro
  const user = (id: number | null) => (id ? data.users.find((u) => u.id === id) : undefined)
  const events: { date: string; text: string; img?: string }[] = [
    { date: ro.createdAt, text: `RO ${ro.number} created${ro.advisorId ? ` by ${user(ro.advisorId)?.name}` : ''}` },
    ...(ro.authorizedAt ? [{ date: ro.authorizedAt, text: `Approved by ${ro.authorizedBy || 'customer'}: ${b.jobs.filter((j) => j.status === 'approved').length} approved, ${b.jobs.filter((j) => j.status === 'declined').length} declined`, img: ro.signature }] : []),
    ...(ro.startedAt ? [{ date: ro.startedAt, text: 'Work started' }] : []),
    ...b.labor.filter((l) => !l.timerStart).map((l) => ({ date: l.date, text: `${user(l.userId)?.name ?? 'Tech'} clocked ${fmtHours(l.hours)}${l.note ? `: ${l.note}` : ''}` })),
    ...data.inspections.filter((i) => i.roId === roId).map((i) => ({ date: i.createdAt, text: `Inspection started: ${i.name}` })),
    ...(ro.completedAt ? [{ date: ro.completedAt, text: 'Work completed' }] : []),
    ...b.payments.map((p) => ({ date: p.date, text: `Payment ${fmtMoney(p.amount)} (${p.method})` })),
    ...(ro.pickedUpAt ? [{ date: ro.pickedUpAt, text: 'Picked up' }] : []),
  ].sort((a, b2) => a.date.localeCompare(b2.date))
  return (
    <div className="stack">
      <div className="card"><label className="field">Internal notes (never printed)<textarea defaultValue={ro.notes} onBlur={(e) => e.target.value !== ro.notes && act(() => api.save('ros', { id: roId, notes: e.target.value }))} /></label>
        <label className="field" style={{ marginTop: 12 }}>PO # (fleet customers)<LazyInput value={ro.poNumber} onCommit={(poNumber) => act(() => api.save('ros', { id: roId, poNumber }))} /></label>
      </div>
      <div className="card flush">
        <div className="card-head"><h2>History</h2></div>
        <table><tbody>{events.map((e, i) => (
          <tr key={i}><td style={{ width: 130 }} className="muted">{fmtDate(e.date)}</td><td>{e.text}{e.img && <img src={e.img} alt="Signature" style={{ height: 36, display: 'block', marginTop: 4, border: '1px solid var(--divider)' }} />}</td></tr>
        ))}</tbody></table>
      </div>
    </div>
  )
}

function ContentTab({ roId }: { roId: number }) {
  const { data, ix, act } = useData()
  const roText = (rid: number) => {
    const b = ix.bundle(rid)
    const v = b.ro.vehicleId ? ix.vehicles.get(b.ro.vehicleId) : null
    return [v && [v.year, v.make, v.model, v.trim, v.engine].join(' '), b.ro.concern, b.ro.notes, ...b.jobs.map((j) => `${j.title} ${j.notes}`), ...b.lines.map((l) => l.description)].filter(Boolean).join(' · ')
  }
  const ro = data.ros.find((r) => r.id === roId)!
  const posts = data.posts.filter((p) => p.roId === roId)
  const [platform, setPlatform] = useState<string>(PLATFORMS[0])
  const [url, setUrl] = useState('')
  const kw = keywordContent(roText(roId), data.settings)
  const matched = (Object.entries(kw.hits) as [ContentFactor, string[]][]).filter(([, w]) => w.length)
  // Settings ▸ Content keywords ▸ "Score automatically": an unscored RO takes the keyword score once.
  useEffect(() => {
    if (data.settings.contentAutoScore && contentScore(ro.content) === 0 && contentScore(kw.scores) > 0) void act(() => api.save('ros', { id: roId, content: kw.scores }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roId])
  return (
    <div className="content-split">
      <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Content score</h2><b className="num" style={{ fontSize: 24 }}>{contentScore(ro.content)}/10</b></div>
        <p className="small muted">Would this job make a good TikTok / YouTube / Instagram post? A score of {data.settings.contentBumpScore}+ raises the take-it verdict a level.</p>
        <ContentEditor value={ro.content} onChange={(content) => act(() => api.save('ros', { id: roId, content }))} />
        <div className="kw-box">
          <div className="row between">
            <b className="small">Keyword score: {contentScore(kw.scores)}/10</b>
            <button className="btn sm" disabled={JSON.stringify(kw.scores) === JSON.stringify(ro.content)} onClick={() => act(() => api.save('ros', { id: roId, content: kw.scores }))}>Use keyword score</button>
          </div>
          <div className="small muted">{matched.length ? matched.map(([k, words]) => `${CONTENT_FACTORS[k]}: ${words.join(', ')}`).join(' · ') : 'No keywords matched. Edit the lists in Settings ▸ Content keywords.'}</div>
        </div>
      </div>
      <div className="card flush">
        <div className="card-head"><h2>Posts</h2><span className="small muted num">{posts.reduce((a, p) => a + p.views, 0).toLocaleString()} views</span></div>
        <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--divider)' }}>
          <select style={{ width: 130, flex: 'none' }} value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
          <input placeholder="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn primary" onClick={async () => { await act(() => api.save('posts', { roId, platform, url })); setUrl('') }}>Add post</button>
        </div>
        {posts.length === 0 ? <Empty text="Not posted yet." /> : (
          <table><thead><tr><th>Platform</th><th>Date</th><th className="n">Views</th><th className="n">Likes</th><th /></tr></thead>
            <tbody>{posts.map((p) => (
              <tr key={p.id}>
                <td>{p.url ? <button className="link" onClick={() => api.openLink(p.url)}>{p.platform}</button> : p.platform}</td><td>{fmtDate(p.date)}</td>
                <td className="n" style={{ width: 120 }}><LazyNum value={p.views} step="1" aria-label="Views" onCommit={(views) => act(() => api.save('posts', { id: p.id, views }))} /></td>
                <td className="n" style={{ width: 100 }}><LazyNum value={p.likes} step="1" aria-label="Likes" onCommit={(likes) => act(() => api.save('posts', { id: p.id, likes }))} /></td>
                <td style={{ width: 70 }}><button className="btn ghost sm" onClick={() => act(() => api.remove('posts', p.id))}>Delete</button></td>
              </tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  )
}

