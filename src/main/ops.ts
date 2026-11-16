import { matrixPrice, laborRate, round2 } from '../shared/calc'
import type { JobStatus, RoStatus } from '../shared/types'
import * as db from './db'

const today = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()
const addMonths = (iso: string, m: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + m)
  return d.toISOString().slice(0, 10)
}

// ---------- repair orders ----------
export function createRo(data: { customerId?: number | null; vehicleId?: number | null; concern?: string; appointmentId?: number | null }) {
  return db.batch(() => {
    const s = db.getSettings()
    const vehicle = data.vehicleId ? db.get('vehicles', data.vehicleId) : null
    const ro = db.insert('ros', {
      number: s.nextRoNumber,
      customerId: data.customerId ?? vehicle?.customerId ?? null,
      vehicleId: data.vehicleId ?? null,
      concern: data.concern ?? '',
      mileageIn: vehicle?.mileage ?? 0,
      advisorId: db.list('users', "role IN ('owner','advisor') AND active = 1")[0]?.id ?? null,
    })
    db.saveSettings({ nextRoNumber: s.nextRoNumber + 1 })
    if (data.appointmentId) db.update('appointments', data.appointmentId, { roId: ro.id, status: 'arrived' })
    return ro
  })
}

export function deleteRo(roId: number) {
  db.batch(() => {
    const ro = db.get('ros', roId)
    if (ro?.stockApplied) revertStock(roId)
    for (const j of db.list('jobs', 'ro_id = ?', [roId])) deleteJob(j.id)
    for (const t of ['labor', 'payments', 'posts'] as const) for (const r of db.list(t, 'ro_id = ?', [roId])) db.remove(t, r.id)
    for (const i of db.list('inspections', 'ro_id = ?', [roId])) deleteInspection(i.id)
    for (const a of db.list('appointments', 'ro_id = ?', [roId])) db.update('appointments', a.id, { roId: null })
    for (const p of db.list('pos', 'ro_id = ?', [roId])) db.update('pos', p.id, { roId: null })
    db.remove('ros', roId)
  })
}

export function deleteJob(jobId: number) {
  db.batch(() => {
    for (const l of db.list('lines', 'job_id = ?', [jobId])) db.remove('lines', l.id)
    for (const e of db.list('labor', 'job_id = ?', [jobId])) db.update('labor', e.id, { jobId: null })
    for (const it of db.list('inspectionItems', 'job_id = ?', [jobId])) db.update('inspectionItems', it.id, { jobId: null })
    db.remove('jobs', jobId)
  })
}

export function addJob(roId: number, title: string) {
  const sort = db.list('jobs', 'ro_id = ?', [roId]).length
  const ro = db.get('ros', roId)
  // On an RO that's already authorized, new work needs its own approval.
  return db.insert('jobs', { roId, title, sort, status: 'pending', techId: ro?.techId ?? null })
}

/** Add a canned job's lines to an RO as a new job. Part prices with no set price follow the matrix. */
export function addCannedJob(roId: number, cannedJobId: number) {
  return db.batch(() => {
    const cj = db.get('cannedJobs', cannedJobId)
    if (!cj) throw new Error('Canned job not found')
    const s = db.getSettings()
    const job = addJob(roId, cj.name)
    db.update('jobs', job.id, { cannedJobId, notes: cj.notes })
    cj.lines.forEach((l, i) => {
      const price = l.kind === 'labor' ? l.price || laborRate(l.laborRateId, s) : l.kind === 'part' && !l.price ? matrixPrice(l.cost, s) : l.price
      db.insert('lines', { ...l, jobId: job.id, price, sort: i })
    })
    return job
  })
}

/** Counter authorization: per-job decisions + signature. Any approval moves an estimate to work in progress. */
export function authorize(roId: number, decisions: Record<number, JobStatus>, name: string, signature: string) {
  return db.batch(() => {
    for (const [id, status] of Object.entries(decisions)) db.update('jobs', Number(id), { status })
    const ro = db.get('ros', roId)!
    const anyApproved = Object.values(decisions).includes('approved')
    db.update('ros', roId, {
      authorizedBy: name,
      authorizedAt: nowIso(),
      signature,
      ...(ro.status === 'estimate' && anyApproved ? { status: 'wip' as const, stage: 'In progress', startedAt: ro.startedAt || today() } : {}),
    })
    return db.get('ros', roId)
  })
}

export function setRoStatus(roId: number, status: RoStatus) {
  return db.batch(() => {
    const ro = db.get('ros', roId)!
    if (ro.status === status) return ro
    if (status === 'completed') {
      for (const e of db.list('labor', 'ro_id = ? AND timer_start IS NOT NULL', [roId])) stopClock(e.id)
      if (!ro.stockApplied) applyStock(roId)
      createRemindersFor(roId)
      const vehicle = ro.vehicleId ? db.get('vehicles', ro.vehicleId) : null
      if (vehicle && ro.mileageOut > vehicle.mileage) db.update('vehicles', vehicle.id, { mileage: ro.mileageOut })
      return db.update('ros', roId, { status, stage: 'Ready for pickup', completedAt: today(), mileageOut: ro.mileageOut || ro.mileageIn })
    }
    if (ro.status === 'completed') revertStock(roId) // reopening
    return db.update('ros', roId, {
      status,
      stage: status === 'wip' ? 'In progress' : 'Not started',
      completedAt: '',
      startedAt: status === 'wip' ? ro.startedAt || today() : ro.startedAt,
    })
  })
}

/** Approved part lines tied to inventory leave stock when the RO is completed. */
function applyStock(roId: number) {
  for (const l of approvedPartLines(roId)) {
    const p = db.get('parts', l.inventoryPartId!)
    if (p) db.update('parts', p.id, { onHand: round2(p.onHand - l.qty) })
  }
  db.update('ros', roId, { stockApplied: true })
}
function revertStock(roId: number) {
  for (const l of approvedPartLines(roId)) {
    const p = db.get('parts', l.inventoryPartId!)
    if (p) db.update('parts', p.id, { onHand: round2(p.onHand + l.qty) })
  }
  db.update('ros', roId, { stockApplied: false })
}
function approvedPartLines(roId: number) {
  const jobs = new Set(db.list('jobs', "ro_id = ? AND status = 'approved'", [roId]).map((j) => j.id))
  return db.list('lines', "kind = 'part' AND inventory_part_id IS NOT NULL").filter((l) => jobs.has(l.jobId))
}

/** Canned jobs with a service interval schedule the next visit when the work is completed. */
function createRemindersFor(roId: number) {
  const ro = db.get('ros', roId)!
  for (const j of db.list('jobs', "ro_id = ? AND status = 'approved' AND canned_job_id IS NOT NULL", [roId])) {
    const cj = db.get('cannedJobs', j.cannedJobId!)
    if (!cj || (!cj.intervalMonths && !cj.intervalMiles)) continue
    if (db.list('reminders', 'source_ro_id = ? AND service = ?', [roId, cj.name]).length) continue
    // A newer reminder for the same service on this vehicle replaces the old one.
    for (const old of db.list('reminders', "vehicle_id = ? AND service = ? AND status = 'open'", [ro.vehicleId ?? -1, cj.name])) {
      db.update('reminders', old.id, { status: 'done' })
    }
    db.insert('reminders', {
      customerId: ro.customerId, vehicleId: ro.vehicleId, service: cj.name, sourceRoId: roId,
      dueDate: cj.intervalMonths ? addMonths(today(), cj.intervalMonths) : '',
      dueMiles: cj.intervalMiles ? (ro.mileageOut || ro.mileageIn) + cj.intervalMiles : 0,
    })
  }
}

// ---------- job clocks + time clock ----------
/** Start a job clock. A tech runs one clock at a time: starting a new one stops theirs. */
export function startClock(roId: number, jobId: number | null, userId: number | null) {
  return db.batch(() => {
    if (userId) for (const e of db.list('labor', 'user_id = ? AND timer_start IS NOT NULL', [userId])) stopClock(e.id)
    if (userId && !db.list('punches', "user_id = ? AND clock_out = ''", [userId]).length) punchIn(userId)
    const ro = db.get('ros', roId)
    if (ro?.status === 'estimate') {
      /* clocking diagnostic time on an estimate is allowed; status stays */
    } else if (ro && ro.status === 'wip' && ro.stage !== 'In progress') db.update('ros', roId, { stage: 'In progress' })
    return db.insert('labor', { roId, jobId, userId, date: today(), hours: 0, timerStart: nowIso() })
  })
}
export function stopClock(laborId: number) {
  const e = db.get('labor', laborId)
  if (!e?.timerStart) return e
  const hrs = (Date.now() - new Date(e.timerStart).getTime()) / 3_600_000
  return db.update('labor', laborId, { hours: round2(e.hours + hrs), timerStart: null })
}
export function punchIn(userId: number) {
  if (db.list('punches', "user_id = ? AND clock_out = ''", [userId]).length) return null
  return db.insert('punches', { userId, clockIn: nowIso(), clockOut: '' })
}
export function punchOut(userId: number) {
  return db.batch(() => {
    for (const e of db.list('labor', 'user_id = ? AND timer_start IS NOT NULL', [userId])) stopClock(e.id)
    for (const p of db.list('punches', "user_id = ? AND clock_out = ''", [userId])) db.update('punches', p.id, { clockOut: nowIso() })
  })
}

// ---------- purchase orders ----------
export function createPo(vendorId: number | null, roId: number | null = null) {
  return db.batch(() => {
    const s = db.getSettings()
    const po = db.insert('pos', { number: s.nextPoNumber, vendorId, roId })
    db.saveSettings({ nextPoNumber: s.nextPoNumber + 1 })
    return po
  })
}
/** Receive quantities per PO line. Stock goes up; lines without an inventory part get one created. */
export function receivePo(poId: number, received: Record<number, number>) {
  return db.batch(() => {
    const po = db.get('pos', poId)!
    for (const [lineId, qty] of Object.entries(received)) {
      if (!(qty > 0)) continue
      const line = db.get('poLines', Number(lineId))
      if (!line || line.poId !== poId) continue
      let partId = line.inventoryPartId
      if (!partId) {
        const existing = line.partNumber ? db.list('parts', 'part_number = ?', [line.partNumber])[0] : undefined
        partId = existing?.id ?? db.insert('parts', { partNumber: line.partNumber, description: line.description, cost: line.cost, vendorId: po.vendorId }).id
        db.update('poLines', line.id, { inventoryPartId: partId })
      }
      const part = db.get('parts', partId)!
      db.update('parts', partId, { onHand: round2(part.onHand + qty), cost: line.cost || part.cost })
      db.update('poLines', line.id, { receivedQty: round2(line.receivedQty + qty) })
    }
    const lines = db.list('poLines', 'po_id = ?', [poId])
    const done = lines.length > 0 && lines.every((l) => l.receivedQty >= l.qty)
    const next = db.update('pos', poId, done ? { status: 'received', receivedAt: today() } : {})
    // Parts arrived for an RO that was waiting on them.
    if (done && po.roId) {
      const ro = db.get('ros', po.roId)
      if (ro?.stage === 'Waiting on parts') db.update('ros', ro.id, { stage: 'In progress' })
    }
    return next
  })
}

// ---------- inspections ----------
export function startInspection(roId: number, templateId: number, userId: number | null) {
  return db.batch(() => {
    const t = db.get('templates', templateId)
    if (!t) throw new Error('Inspection template not found')
    const insp = db.insert('inspections', { roId, name: t.name, userId })
    t.items.forEach((it, i) => db.insert('inspectionItems', { inspectionId: insp.id, section: it.section, name: it.name, sort: i }))
    return insp
  })
}
export function deleteInspection(id: number) {
  db.batch(() => {
    for (const it of db.list('inspectionItems', 'inspection_id = ?', [id])) db.remove('inspectionItems', it.id)
    db.remove('inspections', id)
  })
}
/** Turn a yellow/red finding into a pending job on the RO, ready for the customer to approve. */
export function recommendJob(itemId: number) {
  return db.batch(() => {
    const it = db.get('inspectionItems', itemId)!
    if (it.jobId && db.get('jobs', it.jobId)) return db.get('jobs', it.jobId)!
    const insp = db.get('inspections', it.inspectionId)!
    const job = addJob(insp.roId, it.name)
    db.update('jobs', job.id, { notes: [`From inspection (${it.rating === 'now' ? 'needs attention now' : 'needs attention soon'})`, it.note].filter(Boolean).join(': ') })
    db.update('inspectionItems', itemId, { jobId: job.id })
    return job
  })
}

// ---------- guarded deletes ----------
export function deleteCustomer(id: number) {
  if (db.list('ros', 'customer_id = ?', [id]).length) throw new Error('This customer has repair orders. Delete or reassign those first.')
  db.batch(() => {
    for (const v of db.list('vehicles', 'customer_id = ?', [id])) db.update('vehicles', v.id, { customerId: null })
    for (const r of db.list('reminders', 'customer_id = ?', [id])) db.remove('reminders', r.id)
    db.remove('customers', id)
  })
}
export function deleteVehicle(id: number) {
  if (db.list('ros', 'vehicle_id = ?', [id]).length) throw new Error('This vehicle has repair orders. Delete those first.')
  db.batch(() => {
    for (const r of db.list('reminders', 'vehicle_id = ?', [id])) db.remove('reminders', r.id)
    db.remove('vehicles', id)
  })
}
export function deletePo(id: number) {
  db.batch(() => {
    for (const l of db.list('poLines', 'po_id = ?', [id])) db.remove('poLines', l.id)
    db.remove('pos', id)
  })
}
