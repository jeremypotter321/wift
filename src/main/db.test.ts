import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import initSqlJs from 'sql.js'
import { beforeEach, describe, expect, it } from 'vitest'
import * as db from './db'
import * as ops from './ops'
import { ensureDefaults, loadSample } from './seed'
import { indexData } from '../shared/bundle'
import { buildReport } from '../shared/report'

describe('v1 → v2 migration', () => {
  it('converts v1 jobs into repair orders without losing labor, parts, payments or posts', async () => {
    // Build a real v1 database file.
    const SQL = await initSqlJs()
    const v1 = new SQL.Database()
    v1.exec(`CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
      CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '', notes TEXT DEFAULT '');
      CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '',
        vehicle_year TEXT DEFAULT '', vehicle_make TEXT DEFAULT '', vehicle_model TEXT DEFAULT '', vin TEXT DEFAULT '', mileage TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Lead', quote_type TEXT NOT NULL DEFAULT 'flat', quoted_price REAL DEFAULT 0, est_hours REAL DEFAULT 0,
        est_parts_cost REAL DEFAULT 0, risk_flags TEXT DEFAULT '[]', content TEXT DEFAULT '{}', sales_tax REAL DEFAULT 0, payment_date TEXT DEFAULT '',
        payment_method TEXT DEFAULT '', created_at TEXT NOT NULL, started_at TEXT DEFAULT '', finished_at TEXT DEFAULT '');
      CREATE TABLE labor (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, tech TEXT DEFAULT '', date TEXT NOT NULL, hours REAL DEFAULT 0, note TEXT DEFAULT '', timer_start TEXT);
      CREATE TABLE parts (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, description TEXT DEFAULT '', cost REAL DEFAULT 0, charged REAL DEFAULT 0, supplier TEXT DEFAULT '');
      CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, platform TEXT DEFAULT '', url TEXT DEFAULT '', date TEXT DEFAULT '', views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0);
      PRAGMA user_version = 1;`)
    v1.run(`INSERT INTO settings VALUES (1, ?)`, [JSON.stringify({ shopName: 'Hendricks Euro', laborRate: 150, techs: ['Owner', 'Luis'] })])
    v1.run(`INSERT INTO customers (name) VALUES ('Dale')`)
    v1.run(`INSERT INTO jobs (customer_id, title, vehicle_year, vehicle_make, vehicle_model, status, quote_type, quoted_price, est_hours, risk_flags, content, sales_tax, payment_method, created_at, started_at, finished_at, payment_date)
            VALUES (1, 'Brakes', '2017', 'BMW', '340i', 'Paid', 'flat', 400, 2, '["rust"]', '{"rarity":2}', 10, 'Card', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-03')`)
    v1.run(`INSERT INTO jobs (customer_id, title, status, quote_type, est_hours, est_parts_cost, created_at) VALUES (1, 'Diag', 'Quoted', 'hourly', 1.5, 100, '2026-10-10')`)
    v1.run(`INSERT INTO labor (job_id, tech, date, hours) VALUES (1, 'Luis', '2026-10-02', 2.5)`)
    v1.run(`INSERT INTO parts (job_id, description, cost, charged) VALUES (1, 'Pads', 80, 120)`)
    v1.run(`INSERT INTO posts (job_id, platform, views) VALUES (1, 'TikTok', 900)`)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopboard-mig-'))
    fs.writeFileSync(path.join(dir, 'shopboard.db'), Buffer.from(v1.export()))

    await db.openDb(dir)
    const s = db.getSettings()
    expect(s.shopName).toBe('Hendricks Euro')
    expect(s.laborRates[0].rate).toBe(150)
    expect(s.nextRoNumber).toBe(1003)
    expect(db.list('users').map((u) => [u.name, u.role])).toEqual([['Owner', 'owner'], ['Luis', 'tech']])

    const [diag, brakes] = db.list('ros') // number DESC
    expect(brakes.number).toBe(1001)
    expect(brakes.status).toBe('completed')
    expect(brakes.riskFlags).toEqual(['rust'])
    expect(brakes.content.rarity).toBe(2)
    expect(db.get('vehicles', brakes.vehicleId!)?.model).toBe('340i')
    const lines = db.list('lines')
    expect(lines.filter((l) => l.kind === 'labor').map((l) => l.qty * l.price)).toEqual([400, 1.5 * 150])
    expect(lines.find((l) => l.description === 'Pads')?.price).toBe(120)
    expect(lines.find((l) => l.description === 'Parts (estimated)')?.cost).toBe(100)
    expect(db.list('labor')[0].userId).toBe(db.list('users')[1].id)
    expect(db.list('payments')[0].amount).toBe(400 + 120 + 10)
    expect(db.list('posts')[0].views).toBe(900)
    expect(diag.status).toBe('estimate')
    expect(db.list('jobs', 'ro_id = ?', [diag.id])[0].status).toBe('pending')
    // v1 tables are left in place (no DROP).
    expect(db.all("SELECT name FROM sqlite_master WHERE name = 'jobs'").length).toBe(1)
  })
})

describe('shop operations', () => {
  beforeEach(async () => {
    await db.openMemoryDb()
    ensureDefaults()
  })

  it('RO numbers increment; canned jobs price parts from the matrix', () => {
    const a = ops.createRo({})
    const b = ops.createRo({})
    expect(b.number).toBe(a.number + 1)
    const oil = db.list('cannedJobs').find((c) => c.name.startsWith('Oil service'))!
    const job = ops.addCannedJob(a.id, oil.id)
    const lines = db.list('lines', 'job_id = ?', [job.id])
    expect(lines.find((l) => l.kind === 'labor')!.price).toBe(140)
    expect(lines.find((l) => l.description === 'Oil filter kit')!.price).toBe(28) // $14 cost, 100% tier
  })

  it('authorizing moves the estimate to WIP; declined jobs stay on the RO', () => {
    const ro = ops.createRo({})
    const j1 = ops.addJob(ro.id, 'A')
    const j2 = ops.addJob(ro.id, 'B')
    const next = ops.authorize(ro.id, { [j1.id]: 'approved', [j2.id]: 'declined' }, 'Dale', 'data:image/png;base64,x')
    expect(next!.status).toBe('wip')
    expect(next!.authorizedBy).toBe('Dale')
    expect(db.get('jobs', j2.id)!.status).toBe('declined')
  })

  it('completing uses stock and schedules reminders; reopening puts stock back', () => {
    const part = db.insert('parts', { description: 'Filter', cost: 10, onHand: 5 })
    const veh = db.insert('vehicles', { make: 'BMW', mileage: 50000 })
    const ro = ops.createRo({ vehicleId: veh.id })
    const oil = db.list('cannedJobs').find((c) => c.name.startsWith('Oil service'))!
    const job = ops.addCannedJob(ro.id, oil.id)
    db.insert('lines', { jobId: job.id, kind: 'part', description: 'Filter', qty: 2, cost: 10, price: 20, inventoryPartId: part.id })
    ops.authorize(ro.id, { [job.id]: 'approved' }, 'X', '')
    db.update('ros', ro.id, { mileageOut: 50020 })
    ops.setRoStatus(ro.id, 'completed')
    expect(db.get('parts', part.id)!.onHand).toBe(3)
    expect(db.get('vehicles', veh.id)!.mileage).toBe(50020)
    const rem = db.list('reminders')[0]
    expect(rem.service).toBe(oil.name)
    expect(rem.dueMiles).toBe(60020)
    ops.setRoStatus(ro.id, 'wip')
    expect(db.get('parts', part.id)!.onHand).toBe(5)
    ops.setRoStatus(ro.id, 'completed')
    expect(db.list('reminders')).toHaveLength(1) // not duplicated
  })

  it('one job clock per tech; clocking in punches the time clock', () => {
    const tech = db.insert('users', { name: 'T', role: 'tech' })
    const ro = ops.createRo({})
    const a = ops.startClock(ro.id, null, tech.id)
    const b = ops.startClock(ro.id, null, tech.id)
    expect(db.get('labor', a.id)!.timerStart).toBeNull()
    expect(db.get('labor', b.id)!.timerStart).not.toBeNull()
    expect(db.list('punches', "user_id = ? AND clock_out = ''", [tech.id])).toHaveLength(1)
    ops.punchOut(tech.id)
    expect(db.get('labor', b.id)!.timerStart).toBeNull()
    expect(db.list('punches', "clock_out = ''")).toHaveLength(0)
  })

  it('receiving a PO adds stock, creates unknown parts, and frees an RO waiting on parts', () => {
    const ro = ops.createRo({})
    db.update('ros', ro.id, { status: 'wip', stage: 'Waiting on parts' })
    const po = ops.createPo(null, ro.id)
    const known = db.insert('parts', { partNumber: 'P1', description: 'Known', onHand: 1 })
    const l1 = db.insert('poLines', { poId: po.id, inventoryPartId: known.id, qty: 2, cost: 5 })
    const l2 = db.insert('poLines', { poId: po.id, partNumber: 'NEW-1', description: 'New part', qty: 1, cost: 40 })
    ops.receivePo(po.id, { [l1.id]: 1 })
    expect(db.get('pos', po.id)!.status).toBe('draft') // partly received
    ops.receivePo(po.id, { [l1.id]: 1, [l2.id]: 1 })
    expect(db.get('parts', known.id)!.onHand).toBe(3)
    expect(db.list('parts', 'part_number = ?', ['NEW-1'])[0].onHand).toBe(1)
    expect(db.get('pos', po.id)!.status).toBe('received')
    expect(db.get('ros', ro.id)!.stage).toBe('In progress')
  })

  it('inspection findings become pending jobs once', () => {
    const ro = ops.createRo({})
    const t = db.list('templates')[0]
    const insp = ops.startInspection(ro.id, t.id, null)
    const items = db.list('inspectionItems', 'inspection_id = ?', [insp.id])
    expect(items.length).toBe(t.items.length)
    db.update('inspectionItems', items[0].id, { rating: 'now', note: 'Low and dark' })
    const j = ops.recommendJob(items[0].id)
    expect(ops.recommendJob(items[0].id)!.id).toBe(j!.id)
    expect(db.get('jobs', j!.id)!.notes).toContain('Low and dark')
  })

  it('guarded deletes: customer with ROs refuses; RO delete cascades', () => {
    const c = db.insert('customers', { name: 'C' })
    const ro = ops.createRo({ customerId: c.id })
    expect(() => ops.deleteCustomer(c.id)).toThrow(/repair orders/)
    const j = ops.addJob(ro.id, 'J')
    db.insert('lines', { jobId: j.id, kind: 'labor', qty: 1, price: 100 })
    ops.deleteRo(ro.id)
    expect(db.list('jobs')).toHaveLength(0)
    expect(db.list('lines')).toHaveLength(0)
    ops.deleteCustomer(c.id)
    expect(db.list('customers')).toHaveLength(0)
  })

  it('sample data loads and the accountant report balances', () => {
    loadSample()
    const snap = {
      settings: db.getSettings(), users: db.list('users'), customers: db.list('customers'), vehicles: db.list('vehicles'), ros: db.list('ros'),
      jobs: db.list('jobs'), lines: db.list('lines'), labor: db.list('labor'), payments: db.list('payments'),
    }
    const r = buildReport(snap)
    const inv = r.tables[0]
    const col = (n: string) => inv.headers.indexOf(n)
    expect(inv.rows.length).toBe(2) // two completed ROs
    for (const row of inv.rows) expect(Number(row[col('Total')])).toBeCloseTo(Number(row[col('Paid')]) + Number(row[col('Balance')]), 2)
    const paidRow = inv.rows.find((row) => row[col('Status')] === 'Paid')
    expect(paidRow).toBeTruthy()
    // The first RO's seeded payment equals its total.
    const ix = indexData(snap)
    const first = snap.ros.find((x) => x.number === Math.min(...snap.ros.map((y) => y.number)))!
    expect(ix.totals(first.id).totals.balance).toBe(0)
  })
})
