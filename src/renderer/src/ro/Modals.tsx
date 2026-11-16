import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { Field, fmtMoney, Modal, NumInput, Seg, todayIso } from '../ui'
import { inspectionDocument, roDocument, type DocOptions } from '../docs'
import { lineAmount, matrixPrice, roTotals } from '../../../shared/calc'
import { vehicleName } from '../../../shared/bundle'
import { PAYMENT_METHODS, type Customer, type InventoryPart, type JobStatus, type Vehicle } from '../../../shared/types'

// ---------- signature / authorization ----------
export function SignatureModal({ roId, onClose }: { roId: number; onClose: () => void }) {
  const { data, ix, act, toast } = useData()
  const b = ix.bundle(roId)
  const live = b.jobs.filter((j) => j.status !== 'declined' || true)
  const [decisions, setDecisions] = useState<Record<number, JobStatus>>(() =>
    Object.fromEntries(live.map((j) => [j.id, j.status === 'declined' ? 'declined' : 'approved'])),
  )
  const [name, setName] = useState(b.customer?.name ?? '')
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hasInk, setHasInk] = useState(false)
  const drawing = useRef(false)

  const approvedTotal = roTotals({ ...b, ro: { ...b.ro, status: 'wip' }, jobs: b.jobs.map((j) => ({ ...j, status: decisions[j.id] ?? j.status })) }, data.settings, data.users).total

  useEffect(() => {
    const c = canvas.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
    const g = c.getContext('2d')!
    g.scale(ratio, ratio)
    g.lineWidth = 2.2
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = '#0f172a'
  }, [])
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const clear = () => {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }
  async function sign() {
    const sig = canvas.current!.toDataURL('image/png')
    const r = await act(() => api.authorize(roId, decisions, name.trim(), sig))
    if (r) {
      const n = Object.values(decisions).filter((d) => d === 'approved').length
      toast(`Approved ${n} of ${live.length} jobs · ${fmtMoney(approvedTotal)}`)
      onClose()
    }
  }
  return (
    <Modal title="Customer approval" size="wide" onClose={onClose}
      foot={<><button className="btn lg" onClick={onClose}>Cancel</button><button className="btn primary lg" disabled={!hasInk || !name.trim()} onClick={sign}>Approve and sign</button></>}>
      <div className="stack" style={{ fontSize: 16 }}>
        {live.map((j) => {
          const amt = b.lines.filter((l) => l.jobId === j.id).reduce((a, l) => a + lineAmount(l), 0)
          return (
            <div key={j.id} className="row between" style={{ minHeight: 48 }}>
              <span className="grow"><b>{j.title}</b></span>
              <span className="num" style={{ width: 110, textAlign: 'right' }}>{fmtMoney(amt)}</span>
              <Seg className="appr" options={['approved', 'declined'] as const} labels={{ approved: '✓ Approve', declined: '✕ Decline' }}
                value={(decisions[j.id] === 'declined' ? 'declined' : 'approved') as 'approved' | 'declined'} onChange={(v) => setDecisions({ ...decisions, [j.id]: v })} />
            </div>
          )
        })}
        <div className="row between" style={{ fontSize: 20, fontWeight: 600 }}><span>Approved total (with tax and supplies)</span><span className="num">{fmtMoney(approvedTotal)}</span></div>
        <div className="sigpad">
          <canvas ref={canvas} aria-label="Signature area"
            onPointerDown={(e) => { drawing.current = true; canvas.current!.setPointerCapture(e.pointerId); const g = canvas.current!.getContext('2d')!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y) }}
            onPointerMove={(e) => { if (!drawing.current) return; const g = canvas.current!.getContext('2d')!; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); setHasInk(true) }}
            onPointerUp={() => { drawing.current = false }} />
          <div className="base" />
          {!hasInk && <span className="hint">Sign here</span>}
        </div>
        <div className="row between">
          <button className="link" onClick={clear}>Clear signature</button>
          <span className="small muted">Signed at {new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        <Field label="Printed name"><input style={{ height: 48, fontSize: 16 }} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ---------- print / PDF preview ----------
export function PrintModal({ roId, initial, onClose }: { roId: number; initial: 'estimate' | 'invoice' | 'inspection'; onClose: () => void }) {
  const { data, ix, act, toast } = useData()
  const b = ix.bundle(roId)
  const t = ix.totals(roId).totals
  const v = b.ro.vehicleId ? ix.vehicles.get(b.ro.vehicleId) ?? null : null
  const insp = data.inspections.filter((i) => i.roId === roId).at(-1)
  const [doc, setDoc] = useState<'estimate' | 'invoice' | 'inspection'>(initial)
  const [o, setO] = useState<Omit<DocOptions, 'kind'>>({ partNumbers: true, laborHours: true, includeDeclined: false, message: '', stripes: false })
  const html = useMemo(() => {
    if (doc === 'inspection') return insp ? inspectionDocument(b, insp, data.inspectionItems.filter((i) => i.inspectionId === insp.id), data.settings, v, o.stripes) : '<p style="font-family:sans-serif;padding:24px">No inspection on this RO yet.</p>'
    return roDocument(b, t, data.settings, v, { ...o, kind: doc })
  }, [doc, o, b, t, data, v, insp])
  // The preview iframe can't reach shopfile:// images under the srcdoc sandbox the same way, so photos show in the PDF.
  const file = `RO ${b.ro.number} ${doc}`
  return (
    <Modal title="Print / PDF" size="xl" onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Close</button>
        <button className="btn" onClick={async () => { const f = await act(() => api.printDocument(html, file, 'pdf')); if (f) toast('PDF saved and opened') }}>Save PDF</button>
        <button className="btn primary" onClick={() => act(() => api.printDocument(html, file, 'print'))}>Print</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, height: '100%' }}>
        <div className="stack">
          <Field label="Document"><Seg options={['estimate', 'invoice', 'inspection'] as const} labels={{ estimate: 'Estimate', invoice: 'Invoice', inspection: 'Inspection' }} value={doc} onChange={setDoc} /></Field>
          {doc !== 'inspection' && (
            <>
              <label className="check"><input type="checkbox" checked={o.partNumbers} onChange={(e) => setO({ ...o, partNumbers: e.target.checked })} />Show part numbers</label>
              <label className="check"><input type="checkbox" checked={o.laborHours} onChange={(e) => setO({ ...o, laborHours: e.target.checked })} />Show labor hours and rate</label>
              <label className="check"><input type="checkbox" checked={o.includeDeclined} onChange={(e) => setO({ ...o, includeDeclined: e.target.checked })} />Include declined jobs as "Recommended, not approved"</label>
              <Field label="Message to customer"><textarea value={o.message} onChange={(e) => setO({ ...o, message: e.target.value })} /></Field>
            </>
          )}
          <label className="check"><input type="checkbox" checked={o.stripes} onChange={(e) => setO({ ...o, stripes: e.target.checked })} />Stripe rule at the top</label>
          <p className="small muted" style={{ margin: 0 }}>Cost, profit, the verdict and the content score are never printed. Photos appear in the PDF and printout.</p>
        </div>
        <div className="doc-preview"><iframe title="Preview" srcDoc={html} sandbox="" /></div>
      </div>
    </Modal>
  )
}

// ---------- take payment ----------
export function PaymentModal({ roId, onClose }: { roId: number; onClose: () => void }) {
  const { ix, act, toast } = useData()
  const t = ix.totals(roId).totals
  const [rows, setRows] = useState([{ amount: Math.max(0, t.balance), method: 'Card', reference: '', tendered: 0 }])
  const total = rows.reduce((a, r) => a + r.amount, 0)
  const set = (i: number, p: Partial<(typeof rows)[number]>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)))
  async function record() {
    const ok = await act(() => api.saveMany(rows.filter((r) => r.amount > 0).map((r) => ({ entity: 'payments' as const, data: { roId, amount: Math.round(r.amount * 100) / 100, method: r.method, reference: r.reference, date: todayIso() } }))))
    if (ok) { toast(`Recorded ${fmtMoney(total)}`); onClose() }
  }
  return (
    <Modal title="Take payment" onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!(total > 0)} onClick={record}>Record {fmtMoney(total)}</button></>}>
      <div className="stack">
        <div className="row between"><span className="muted">Balance due</span><b className="num" style={{ fontSize: 18 }}>{fmtMoney(t.balance)}</b></div>
        {rows.map((r, i) => (
          <div key={i} className="card stack tight">
            <Seg options={PAYMENT_METHODS} value={r.method as (typeof PAYMENT_METHODS)[number]} onChange={(method) => set(i, { method })} />
            <div className="grid2">
              <Field label="Amount"><NumInput prefix="$" value={r.amount} onChange={(amount) => set(i, { amount })} /></Field>
              {r.method === 'Cash' ? (
                <Field label="Cash tendered"><NumInput prefix="$" value={r.tendered} onChange={(tendered) => set(i, { tendered })} /></Field>
              ) : (
                <Field label={r.method === 'Check' ? 'Check #' : r.method === 'Card' ? 'Last 4 / auth code' : 'Reference'}><input value={r.reference} onChange={(e) => set(i, { reference: e.target.value })} /></Field>
              )}
            </div>
            {r.method === 'Cash' && r.tendered > r.amount && <div className="strong">Change due: {fmtMoney(r.tendered - r.amount)}</div>}
            {r.method === 'Card' && <div className="small muted">Run the card on your terminal, then record it here.</div>}
            {rows.length > 1 && <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setRows(rows.filter((_, k) => k !== i))}>Remove</button>}
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRows([...rows, { amount: Math.max(0, t.balance - total), method: 'Cash', reference: '', tendered: 0 }])}>+ Add another payment (split)</button>
      </div>
    </Modal>
  )
}

// ---------- customer + vehicle ----------
export function CustomerPicker({ onPick, onClose }: { onPick: (c: Customer) => void; onClose: () => void }) {
  const { data, act } = useData()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Partial<Customer> | null>(null)
  const s = q.trim().toLowerCase()
  const digits = s.replace(/\D/g, '')
  const hits = data.customers.filter((c) => !s || c.name.toLowerCase().includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))).slice(0, 12)
  if (form) {
    return (
      <Modal title="New customer" onClose={onClose}
        foot={<><button className="btn" onClick={() => setForm(null)}>Back</button><button className="btn primary" disabled={!form.name?.trim()} onClick={async () => { const c = await act(() => api.save('customers', form)); if (c) onPick(c as Customer) }}>Save customer</button></>}>
        <CustomerFields value={form} onChange={setForm} />
      </Modal>
    )
  }
  return (
    <Modal title="Choose customer" onClose={onClose}>
      <div className="stack">
        <input autoFocus placeholder="Name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <div>
          {hits.map((c) => <button key={c.id} className="menu-item" style={{ height: 44 }} onClick={() => onPick(c)}><b>{c.name}</b><span className="muted small">{c.phone}</span></button>)}
        </div>
        <button className="btn" onClick={() => setForm({ name: q.trim() })}>+ New customer{q.trim() ? ` "${q.trim()}"` : ''}</button>
      </div>
    </Modal>
  )
}
export function CustomerFields({ value, onChange }: { value: Partial<Customer>; onChange: (c: Partial<Customer>) => void }) {
  const set = (p: Partial<Customer>) => onChange({ ...value, ...p })
  return (
    <div className="stack">
      <div className="grid2">
        <Field label="Name"><input autoFocus value={value.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Company (optional)"><input value={value.company ?? ''} onChange={(e) => set({ company: e.target.value })} /></Field>
      </div>
      <div className="grid2">
        <Field label="Phone"><input value={value.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Email"><input type="email" value={value.email ?? ''} onChange={(e) => set({ email: e.target.value })} /></Field>
      </div>
      <Field label="Address"><input value={value.address ?? ''} onChange={(e) => set({ address: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Preferred contact">
          <select value={value.contactPref ?? 'call'} onChange={(e) => set({ contactPref: e.target.value as Customer['contactPref'] })}><option value="call">Call</option><option value="text">Text</option><option value="email">Email</option></select>
        </Field>
        <Field label="Second phone"><input value={value.phone2 ?? ''} onChange={(e) => set({ phone2: e.target.value })} /></Field>
      </div>
      <div className="row wrap" style={{ gap: 16 }}>
        <label className="check"><input type="checkbox" checked={value.marketingOptIn ?? true} onChange={(e) => set({ marketingOptIn: e.target.checked })} />OK to send service reminders</label>
        <label className="check"><input type="checkbox" checked={!!value.taxExempt} onChange={(e) => set({ taxExempt: e.target.checked })} />Tax exempt</label>
        <label className="check"><input type="checkbox" checked={!!value.fleet} onChange={(e) => set({ fleet: e.target.checked })} />Fleet account</label>
      </div>
    </div>
  )
}

export function VehicleModal({ initial, customerId, onSaved, onClose }: { initial?: Vehicle; customerId: number | null; onSaved: (v: Vehicle) => void; onClose: () => void }) {
  const { act } = useData()
  const [v, setV] = useState<Partial<Vehicle>>(initial ?? { customerId })
  const [decoding, setDecoding] = useState(false)
  const [note, setNote] = useState('')
  const set = (p: Partial<Vehicle>) => setV({ ...v, ...p })
  async function decode() {
    setDecoding(true)
    setNote('')
    try {
      const r = await api.decodeVin(v.vin ?? '')
      setV((cur) => ({ ...cur, year: r.year || cur.year, make: r.make || cur.make, model: r.model || cur.model, trim: r.trim || cur.trim, engine: r.engine || cur.engine, decoded: { ...r.decoded, decodedOn: todayIso() } }))
      setNote(r.error ? `Decoded with a warning: ${r.error}` : 'Decoded from NHTSA.')
    } catch (e) {
      setNote(String((e as Error).message).replace(/^Error invoking remote method 'api': (Error: )?/, ''))
    } finally {
      setDecoding(false)
    }
  }
  return (
    <Modal title={initial ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={async () => { const r = await act(() => api.save('vehicles', v)); if (r) onSaved(r as Vehicle) }}>Save vehicle</button></>}>
      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="VIN" className="grow"><input className="mono" maxLength={17} value={v.vin ?? ''} onChange={(e) => set({ vin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Field>
          <button className="btn" disabled={decoding || (v.vin ?? '').length !== 17} onClick={decode}>{decoding ? 'Decoding…' : 'Decode VIN'}</button>
        </div>
        {note && <div className="small muted">{note}</div>}
        <div className="grid3">
          <Field label="Year"><input value={v.year ?? ''} onChange={(e) => set({ year: e.target.value })} /></Field>
          <Field label="Make"><input value={v.make ?? ''} onChange={(e) => set({ make: e.target.value })} /></Field>
          <Field label="Model"><input value={v.model ?? ''} onChange={(e) => set({ model: e.target.value })} /></Field>
        </div>
        <div className="grid2">
          <Field label="Trim"><input value={v.trim ?? ''} onChange={(e) => set({ trim: e.target.value })} /></Field>
          <Field label="Engine (code / size)"><input value={v.engine ?? ''} onChange={(e) => set({ engine: e.target.value })} placeholder="e.g. B58 3.0L I6" /></Field>
        </div>
        <div className="grid3">
          <Field label="Plate"><input value={v.plate ?? ''} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} /></Field>
          <Field label="Color"><input value={v.color ?? ''} onChange={(e) => set({ color: e.target.value })} /></Field>
          <Field label="Mileage"><NumInput value={v.mileage ?? 0} step="1" onChange={(mileage) => set({ mileage })} /></Field>
        </div>
        <Field label="Notes"><textarea value={v.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

// ---------- canned job picker ----------
export function CannedPicker({ onPick, onClose }: { onPick: (id: number) => void; onClose: () => void }) {
  const { data } = useData()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const cats = [...new Set(data.cannedJobs.map((c) => c.category).filter(Boolean))]
  const used = (id: number) => data.jobs.filter((j) => j.cannedJobId === id).length
  const hits = data.cannedJobs.filter((c) => (!cat || c.category === cat) && c.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Modal title="Add canned job" onClose={onClose}>
      <div className="stack">
        <div className="row">
          <input autoFocus placeholder="Search canned jobs" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && hits[0] && onPick(hits[0].id)} />
          <select style={{ width: 190, flex: 'none' }} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div>
          {hits.map((c) => {
            const hrs = c.lines.filter((l) => l.kind === 'labor').reduce((a, l) => a + l.qty, 0)
            return (
              <button key={c.id} className="menu-item" style={{ height: 48 }} onClick={() => onPick(c.id)}>
                <span className="grow"><b>{c.name}</b><br /><span className="small muted">{c.category} · {hrs} h book{used(c.id) ? ` · used ${used(c.id)}×` : ''}</span></span>
              </button>
            )
          })}
          {!hits.length && <div className="empty">No canned jobs match. Build them in Library ▸ Canned jobs.</div>}
        </div>
      </div>
    </Modal>
  )
}

// ---------- inventory part picker ----------
export function PartPicker({ onPick, onClose }: { onPick: (p: InventoryPart | null, price: number) => void; onClose: () => void }) {
  const { data } = useData()
  const [q, setQ] = useState('')
  const s = q.trim().toLowerCase()
  const hits = data.parts.filter((p) => !s || p.partNumber.toLowerCase().includes(s) || p.description.toLowerCase().includes(s) || p.brand.toLowerCase().includes(s)).slice(0, 20)
  return (
    <Modal title="Add part" onClose={onClose} foot={<button className="btn" onClick={() => onPick(null, 0)}>Blank part line (not from stock)</button>}>
      <div className="stack">
        <input autoFocus placeholder="Search inventory by part # or description" value={q} onChange={(e) => setQ(e.target.value)} />
        <table>
          <thead><tr><th>Part #</th><th>Description</th><th className="n">On hand</th><th className="n">Price</th></tr></thead>
          <tbody>
            {hits.map((p) => {
              const price = p.price || matrixPrice(p.cost, data.settings)
              return (
                <tr key={p.id} className="click" onClick={() => onPick(p, price)}>
                  <td className="mono">{p.partNumber}</td><td>{p.description}<div className="small muted">{p.brand}</div></td>
                  <td className={`n ${p.onHand <= 0 ? 'neg' : ''}`}>{p.onHand}</td><td className="n">{fmtMoney(price)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!hits.length && <div className="empty">Nothing in inventory matches.</div>}
      </div>
    </Modal>
  )
}

export const vehicleLabel = (v?: Vehicle | null) => (v ? vehicleName(v) : '')
