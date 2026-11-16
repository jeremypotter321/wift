import { matrixPrice, roTotals } from '../shared/calc'
import type { CannedLine, JobStatus, LineKind, TemplateItem } from '../shared/types'
import * as db from './db'
import * as ops from './ops'

const sec = (section: string, names: string[]): TemplateItem[] => names.map((name) => ({ section, name }))

/** Euro-focused courtesy inspection. Includes the leak points German cars are known for. */
const COURTESY: TemplateItem[] = [
  ...sec('Under hood', ['Engine oil level / condition', 'Coolant level / condition', 'Coolant expansion tank', 'Brake fluid', 'Drive belt', 'Hoses',
    'Battery test / terminals', 'Engine air filter', 'Cabin filter']),
  ...sec('Known euro leak points', ['Valve cover gasket', 'Oil filter housing / cooler gasket', 'Oil pan gasket', 'Rear main seal',
    'Water pump / thermostat housing', 'Power steering lines']),
  ...sec('Brakes', ['Front pads (mm)', 'Rear pads (mm)', 'Front rotors', 'Rear rotors', 'Brake lines / hoses', 'Pad wear sensors']),
  ...sec('Tires & wheels', ['LF tread (/32)', 'RF tread (/32)', 'LR tread (/32)', 'RR tread (/32)', 'Tire pressure / TPMS', 'Wheel bearings']),
  ...sec('Steering & suspension', ['Control arm bushings', 'Tie rod ends', 'Ball joints', 'Shocks / struts', 'Sway bar links', 'CV boots / axles']),
  ...sec('Underbody', ['Exhaust / mounts', 'Transmission leaks', 'Differential / transfer case', 'Driveshaft / flex disc']),
  ...sec('Lights & electrical', ['Headlights', 'Brake / tail lights', 'Turn signals', 'Wipers / washers', 'Warning lights / stored fault codes']),
]
const PREPURCHASE: TemplateItem[] = [
  ...COURTESY,
  ...sec('Pre-purchase extras', ['Road test', 'Cold start / timing chain noise', 'Fault code scan (all modules)', 'Service history / records', 'Body / paint / rust', 'Frame / prior accident signs']),
]

const L = (kind: LineKind, description: string, qty: number, cost = 0, price = 0, laborRateId = 'std'): CannedLine =>
  ({ kind, description, partNumber: '', qty, cost, price, laborRateId, taxable: true })

const CANNED: { name: string; category: string; months: number; miles: number; lines: CannedLine[] }[] = [
  { name: 'Oil service (European spec synthetic)', category: 'Maintenance', months: 12, miles: 10000,
    lines: [L('labor', 'Oil and filter service, reset service indicator', 0.8), L('part', 'Synthetic oil, OE approved (qt)', 7, 9.5), L('part', 'Oil filter kit', 1, 14)] },
  { name: 'Brake fluid flush (DOT 4 LV)', category: 'Maintenance', months: 24, miles: 0,
    lines: [L('labor', 'Pressure bleed brake system', 0.8), L('part', 'DOT 4 low-viscosity brake fluid (1 L)', 1, 22)] },
  { name: 'Coolant flush (OE coolant)', category: 'Maintenance', months: 48, miles: 0,
    lines: [L('labor', 'Drain, fill and vacuum-bleed cooling system', 1.2), L('part', 'OE-spec coolant (gal)', 2, 38)] },
  { name: 'Spark plugs', category: 'Maintenance', months: 0, miles: 60000, lines: [L('labor', 'Replace spark plugs', 1.5), L('part', 'Spark plug', 6, 14)] },
  { name: 'Dual-clutch (DSG) fluid service', category: 'Maintenance', months: 0, miles: 40000,
    lines: [L('labor', 'DSG fluid and filter service', 1.5), L('part', 'DSG fluid + filter kit', 1, 120)] },
  { name: 'Front brake pads & rotors', category: 'Brakes', months: 0, miles: 0,
    lines: [L('labor', 'Replace front pads and rotors', 1.8), L('part', 'Front brake pads', 1, 85), L('part', 'Front rotors (pair)', 1, 180), L('part', 'Pad wear sensor', 1, 18)] },
  { name: 'Diagnostic (first hour)', category: 'Diagnosis', months: 0, miles: 0, lines: [L('labor', 'Diagnose concern, scan all modules', 1, 0, 0, 'diag')] },
  { name: 'Valve cover gasket', category: 'Engine', months: 0, miles: 0, lines: [L('labor', 'Replace valve cover gasket', 3), L('part', 'Valve cover gasket set', 1, 95)] },
  { name: 'Oil filter housing gasket', category: 'Engine', months: 0, miles: 0, lines: [L('labor', 'Replace oil filter housing gaskets', 3.5), L('part', 'Oil filter housing gasket kit', 1, 45)] },
]

/** Starter templates and canned jobs every new install gets (only when the shop has none yet). */
export function ensureDefaults() {
  db.batch(() => {
    if (!db.list('templates').length) {
      db.insert('templates', { name: 'Courtesy inspection', items: COURTESY })
      db.insert('templates', { name: 'Pre-purchase inspection', items: PREPURCHASE })
    }
    if (!db.list('cannedJobs').length) {
      for (const c of CANNED) db.insert('cannedJobs', { name: c.name, category: c.category, intervalMonths: c.months, intervalMiles: c.miles, lines: c.lines })
    }
  })
}

// ---------- demo data ----------
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const at = (dayOffset: number, hh: number, mm = 0) => {
  const d = new Date(Date.now() + dayOffset * 86_400_000)
  d.setHours(hh, mm, 0, 0)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function loadSample() {
  db.batch(() => {
    ensureDefaults()
    const s = db.getSettings()
    const owner = db.list('users')[0]
    const luis = db.insert('users', { name: 'Luis', role: 'tech', pin: '', color: '#0F766E' })
    const sam = db.insert('users', { name: 'Sam', role: 'advisor', pin: '', color: '#6D28D9' })
    void sam
    const euro = db.insert('vendors', { name: 'Euro Parts Supply', phone: '555-0140', accountNumber: 'SB-2231' })
    const local = db.insert('vendors', { name: 'Local Parts Store', phone: '555-0177' })

    const parts = [
      db.insert('parts', { partNumber: 'OF-11427', description: 'Oil filter kit (BMW N55/B58)', brand: 'Mann', vendorId: euro.id, cost: 12.4, onHand: 6, minQty: 4, location: 'A1' }),
      db.insert('parts', { partNumber: 'OIL-5W30-LL', description: 'Synthetic oil 5W-30 LL-01 (qt)', brand: 'Liqui Moly', vendorId: euro.id, cost: 9.5, onHand: 30, minQty: 20, location: 'Fluids', category: 'fluid' }),
      db.insert('parts', { partNumber: 'BF-DOT4LV', description: 'DOT 4 LV brake fluid (1 L)', brand: 'ATE', vendorId: euro.id, cost: 22, onHand: 2, minQty: 3, location: 'Fluids', category: 'fluid' }),
      db.insert('parts', { partNumber: 'PAD-F-G20', description: 'Front brake pads (G20 3 Series)', brand: 'Textar', vendorId: euro.id, cost: 85, onHand: 1, minQty: 1, location: 'B3' }),
      db.insert('parts', { partNumber: 'WIPER-24', description: 'Wiper blade 24"', brand: 'Bosch', vendorId: local.id, cost: 11, onHand: 0, minQty: 2, location: 'C2' }),
      db.insert('parts', { partNumber: 'T-2254018', description: 'Tire 225/40R18 92Y', brand: 'Michelin PS4S', vendorId: local.id, cost: 205, onHand: 4, minQty: 0, location: 'Tire rack', category: 'tire', tireSize: '225/40R18' }),
    ]

    const people: [string, string, string, Partial<Record<'year' | 'make' | 'model' | 'engine' | 'vin' | 'plate' | 'color', string>> & { mileage: number }][] = [
      ['Dale Hendricks', '555-0101', 'dale@example.com', { year: '2017', make: 'BMW', model: '340i', engine: 'B58 3.0L I6 turbo', plate: 'DHB 340', color: 'Alpine White', mileage: 78400 }],
      ['Marcus Lee', '555-0102', 'marcus@example.com', { year: '1987', make: 'Porsche', model: '911 Carrera', engine: '3.2L flat-6', plate: 'ML 911', color: 'Guards Red', mileage: 121300 }],
      ['Priya Shah', '555-0103', 'priya@example.com', { year: '2011', make: 'Volkswagen', model: 'GTI', engine: 'EA888 2.0T', plate: 'PRS 2011', color: 'Candy White', mileage: 132800 }],
      ['Tom Becker', '555-0104', 'tom@example.com', { year: '2019', make: 'Audi', model: 'S4', engine: '3.0T V6', plate: 'TB S4', color: 'Navarra Blue', mileage: 54100 }],
      ['Angela Ruiz', '555-0105', 'angela@example.com', { year: '2015', make: 'Mercedes-Benz', model: 'E350', engine: 'M276 3.5L V6', plate: 'AR E350', color: 'Obsidian Black', mileage: 98200 }],
      ['Kevin O\'Neil', '555-0106', 'kevin@example.com', { year: '2008', make: 'BMW', model: 'M3', engine: 'S65 4.0L V8', plate: 'KO E92', color: 'Jerez Black', mileage: 88700 }],
      ['Sandra Kim', '555-0107', 'sandra@example.com', { year: '2020', make: 'Volkswagen', model: 'Atlas', engine: 'VR6 3.6L', plate: 'SK ATL', color: 'Pure Gray', mileage: 41200 }],
    ]
    const cv = people.map(([name, phone, email, v]) => {
      const c = db.insert('customers', { name, phone, email })
      const veh = db.insert('vehicles', { customerId: c.id, ...v })
      return { c, v: veh }
    })

    type J = { title: string; status: JobStatus; lines: [LineKind, string, number, number, number?, number?][]; canned?: string }
    const mk = (i: number, ro: { status: 'estimate' | 'wip' | 'completed'; stage: string; created: number; concern: string; jobs: J[]; clock?: [number, number][]; paid?: boolean | number; risk?: string[]; content?: Record<string, number>; promised?: number }) => {
      const { c, v } = cv[i]
      const r = ops.createRo({ customerId: c.id, vehicleId: v.id, concern: ro.concern })
      db.update('ros', r.id, {
        createdAt: day(ro.created), status: ro.status, stage: ro.stage, techId: luis.id, riskFlags: (ro.risk ?? []) as never,
        content: { rarity: 0, transformation: 0, story: 0, satisfying: 0, trend: 0, ...ro.content },
        startedAt: ro.status !== 'estimate' ? day(ro.created) : '', completedAt: ro.status === 'completed' ? day(Math.max(0, ro.created - 1)) : '',
        authorizedAt: ro.status !== 'estimate' ? day(ro.created) : '', authorizedBy: ro.status !== 'estimate' ? c.name : '',
        promisedAt: ro.promised != null ? at(ro.promised, 17) : '', mileageIn: v.mileage, mileageOut: ro.status === 'completed' ? v.mileage + 6 : 0,
      })
      ro.jobs.forEach((j, k) => {
        const job = db.insert('jobs', { roId: r.id, title: j.title, status: j.status, sort: k, techId: luis.id })
        j.lines.forEach(([kind, description, qty, costOrRate, price, invIdx], n) => {
          const isLabor = kind === 'labor'
          const cost = isLabor ? 0 : costOrRate
          db.insert('lines', {
            jobId: job.id, kind, description, qty, cost, sort: n, laborRateId: 'std',
            price: isLabor ? costOrRate || s.laborRates[0].rate : price ?? (kind === 'part' ? matrixPrice(cost, s) : cost),
            inventoryPartId: invIdx != null ? parts[invIdx].id : null,
          })
        })
      })
      ro.clock?.forEach(([d, hours], n) => db.insert('labor', { roId: r.id, userId: n % 2 ? owner.id : luis.id, date: day(d), hours, note: '' }))
      return r
    }

    const r1 = mk(0, { status: 'completed', stage: 'Picked up', created: 9, concern: 'Oil service due, squeal from front brakes', paid: true,
      jobs: [
        { title: 'Oil service (European spec synthetic)', status: 'approved', lines: [['labor', 'Oil and filter service', 0.8, 0], ['part', 'Synthetic oil 5W-30 LL-01 (qt)', 7, 9.5, undefined, 1], ['part', 'Oil filter kit', 1, 12.4, undefined, 0]] },
        { title: 'Front brake pads & rotors', status: 'approved', lines: [['labor', 'Replace front pads and rotors', 1.8, 0], ['part', 'Front brake pads', 1, 85], ['part', 'Front rotors (pair)', 1, 180], ['part', 'Pad wear sensor', 1, 18]] },
        { title: 'Rear pads (recommended)', status: 'declined', lines: [['labor', 'Replace rear pads', 1.2, 0], ['part', 'Rear brake pads', 1, 70]] },
      ], clock: [[9, 2.4]] })
    const r2 = mk(1, { status: 'wip', stage: 'Waiting on parts', created: 6, concern: 'Engine-out reseal, chain tensioner, carb/injection refresh', promised: 10,
      risk: ['rust', 'unknownHistory', 'partsAvailability'], content: { rarity: 2, transformation: 2, story: 2, satisfying: 2, trend: 1 },
      jobs: [
        { title: 'Engine-out reseal', status: 'approved', lines: [['labor', 'Remove/install engine, reseal case and covers', 22, 0], ['part', 'Engine gasket set', 1, 640], ['sublet', 'Machine shop: case inspection', 1, 450, 600]] },
        { title: 'Upgraded chain tensioners', status: 'approved', lines: [['labor', 'Install pressure-fed tensioner upgrade', 3, 0], ['part', 'Tensioner upgrade kit', 1, 390]] },
        { title: 'Clutch kit while engine out', status: 'pending', lines: [['labor', 'Replace clutch (engine already out)', 1.5, 0], ['part', 'Clutch kit', 1, 520]] },
      ], clock: [[6, 7], [5, 7.5], [3, 6]] })
    const r3 = mk(2, { status: 'wip', stage: 'In progress', created: 1, concern: 'Coolant smell, low coolant warning', promised: 0, risk: ['electrical'],
      jobs: [
        { title: 'Diagnostic (first hour)', status: 'approved', lines: [['labor', 'Pressure test cooling system', 1, 160]] },
        { title: 'Water pump / thermostat housing', status: 'approved', lines: [['labor', 'Replace water pump and thermostat housing', 3.2, 0], ['part', 'Water pump + thermostat housing kit', 1, 210], ['part', 'OE-spec coolant (gal)', 2, 38]] },
      ], clock: [[1, 1.2]] })
    mk(3, { status: 'estimate', stage: 'Waiting on customer', created: 0, concern: 'Wants maintenance + tune', content: { transformation: 1, trend: 2 },
      jobs: [
        { title: 'Spark plugs', status: 'pending', lines: [['labor', 'Replace spark plugs', 1.5, 0], ['part', 'Spark plug', 6, 14]] },
        { title: 'Dual-clutch (DSG) fluid service', status: 'pending', lines: [['labor', 'S tronic fluid and filter service', 1.5, 0], ['part', 'Fluid + filter kit', 1, 120]] },
      ] })
    const r5 = mk(4, { status: 'completed', stage: 'Ready for pickup', created: 3, concern: 'Oil leak on driveway', paid: 300,
      jobs: [{ title: 'Oil filter housing gasket', status: 'approved', lines: [['labor', 'Replace oil filter housing gaskets', 3.5, 0], ['part', 'Oil filter housing gasket kit', 1, 45]] }],
      clock: [[3, 4.1]] })
    mk(5, { status: 'estimate', stage: 'Needs authorization', created: 0, concern: 'Rod bearing service before track season',
      risk: ['specialTools', 'noDeposit'], content: { rarity: 2, transformation: 1, story: 2, satisfying: 2, trend: 2 },
      jobs: [{ title: 'Rod bearing replacement', status: 'pending', lines: [['labor', 'Replace rod bearings and bolts', 14, 0], ['part', 'Rod bearing + bolt kit', 1, 780]] }] })

    // Payments
    const pay = (roId: number, amount: number, method: string, d: number) => db.insert('payments', { roId, amount, method, date: day(d) })
    const totalOf = (roId: number) => {
      const jobs = db.list('jobs', 'ro_id = ?', [roId])
      const ids = new Set(jobs.map((j) => j.id))
      return roTotals({ ro: db.get('ros', roId)!, jobs, lines: db.list('lines').filter((l) => ids.has(l.jobId)), labor: db.list('labor', 'ro_id = ?', [roId]), payments: [] }, s, db.list('users')).total
    }
    pay(r1.id, totalOf(r1.id), 'Card', 8)
    pay(r5.id, 300, 'Cash', 2)
    pay(r2.id, 1500, 'Transfer', 6) // deposit

    // Inspection on the GTI
    const tpl = db.list('templates')[0]
    const insp = ops.startInspection(r3.id, tpl.id, luis.id)
    const items = db.list('inspectionItems', 'inspection_id = ?', [insp.id])
    items.forEach((it, i) => {
      const rating = it.name.startsWith('Water pump') ? 'now' : it.name.startsWith('Valve cover') || it.name.startsWith('Rear pads') ? 'soon' : i < 30 ? 'good' : ''
      db.update('inspectionItems', it.id, { rating, note: rating === 'now' ? 'Seeping at housing seam, crust on block' : rating === 'soon' ? 'Light seepage' : '' })
    })

    // Appointments this week
    db.insert('appointments', { customerId: cv[6].c.id, vehicleId: cv[6].v.id, title: 'Oil service + inspection', start: at(0, 9), end: at(0, 10), userId: luis.id, dropOff: false })
    db.insert('appointments', { customerId: cv[3].c.id, vehicleId: cv[3].v.id, title: 'Plugs + DSG service', start: at(1, 8), end: at(1, 12), userId: luis.id })
    db.insert('appointments', { customerId: cv[0].c.id, vehicleId: cv[0].v.id, title: 'Rear pads (declined last visit)', start: at(2, 13), end: at(2, 15), userId: owner.id })

    // Purchase order waiting on parts for the 911
    const po = ops.createPo(euro.id, r2.id)
    db.update('pos', po.id, { status: 'ordered', orderedAt: day(5) })
    db.insert('poLines', { poId: po.id, partNumber: '930-GSK', description: 'Engine gasket set', qty: 1, cost: 640 })

    // Reminders + content
    db.insert('reminders', { customerId: cv[0].c.id, vehicleId: cv[0].v.id, service: 'Brake fluid flush (DOT 4 LV)', dueDate: day(-20) })
    db.insert('reminders', { customerId: cv[6].c.id, vehicleId: cv[6].v.id, service: 'Oil service (European spec synthetic)', dueDate: day(10) })
    db.insert('posts', { roId: r2.id, platform: 'TikTok', date: day(4), views: 48200, likes: 3900 })
    db.insert('posts', { roId: r2.id, platform: 'YouTube', date: day(2), views: 12100, likes: 860 })

    // Clock Luis in, on the GTI
    ops.startClock(r3.id, db.list('jobs', 'ro_id = ?', [r3.id])[1].id, luis.id)
  })
}
