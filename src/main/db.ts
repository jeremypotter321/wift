import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import {
  DEFAULT_SETTINGS,
  emptyContent,
  type ContentPost,
  type Customer,
  type Job,
  type JobFull,
  type LaborEntry,
  type Part,
  type Settings,
} from '../shared/types'

let db: Database
let dbFile = ''
const KEEP_BACKUPS = 15

const MIGRATIONS: string[] = [
  `CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
   CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '', notes TEXT DEFAULT '');
   CREATE TABLE jobs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
     title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '',
     vehicle_year TEXT DEFAULT '', vehicle_make TEXT DEFAULT '', vehicle_model TEXT DEFAULT '', vin TEXT DEFAULT '', mileage TEXT DEFAULT '',
     status TEXT NOT NULL DEFAULT 'Lead', quote_type TEXT NOT NULL DEFAULT 'flat',
     quoted_price REAL DEFAULT 0, est_hours REAL DEFAULT 0, est_parts_cost REAL DEFAULT 0,
     risk_flags TEXT DEFAULT '[]', content TEXT DEFAULT '{}',
     sales_tax REAL DEFAULT 0, payment_date TEXT DEFAULT '', payment_method TEXT DEFAULT '',
     created_at TEXT NOT NULL, started_at TEXT DEFAULT '', finished_at TEXT DEFAULT '');
   CREATE TABLE labor (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     tech TEXT DEFAULT '', date TEXT NOT NULL, hours REAL DEFAULT 0, note TEXT DEFAULT '', timer_start TEXT);
   CREATE TABLE parts (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     description TEXT DEFAULT '', cost REAL DEFAULT 0, charged REAL DEFAULT 0, supplier TEXT DEFAULT '');
   CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     platform TEXT DEFAULT '', url TEXT DEFAULT '', date TEXT DEFAULT '', views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0);`,
]

export async function openDb(dataDir: string, wasmDir?: string): Promise<void> {
  const SQL = await initSqlJs(wasmDir ? { locateFile: (f) => path.join(wasmDir, f) } : undefined)
  fs.mkdirSync(dataDir, { recursive: true })
  dbFile = path.join(dataDir, 'shopboard.db')
  if (fs.existsSync(dbFile)) {
    backup(dataDir)
    db = new SQL.Database(fs.readFileSync(dbFile))
  } else {
    db = new SQL.Database()
  }
  db.run('PRAGMA foreign_keys = ON')
  migrate()
}

function backup(dataDir: string) {
  const dir = path.join(dataDir, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.copyFileSync(dbFile, path.join(dir, `shopboard-${stamp}.db`))
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort()
  for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, f))
}

function migrate() {
  const version = (db.exec('PRAGMA user_version')[0]?.values[0][0] as number) ?? 0
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.run('BEGIN')
    db.exec(MIGRATIONS[v])
    db.run(`PRAGMA user_version = ${v + 1}`)
    db.run('COMMIT')
  }
  if (!one('SELECT id FROM settings WHERE id = 1')) {
    db.run('INSERT INTO settings (id, json) VALUES (1, ?)', [JSON.stringify(DEFAULT_SETTINGS)])
  }
  save()
}

/** Atomic write: temp file then rename, so a crash mid-write can't corrupt the DB. */
export function save() {
  const tmp = dbFile + '.tmp'
  fs.writeFileSync(tmp, Buffer.from(db.export()))
  fs.renameSync(tmp, dbFile)
}

export const dbPath = () => dbFile

/** Replace the live DB with a file the user picked (restore from backup). */
export async function restoreFrom(file: string, dataDir: string, wasmDir?: string) {
  const SQL = await initSqlJs(wasmDir ? { locateFile: (f) => path.join(wasmDir, f) } : undefined)
  const candidate = new SQL.Database(fs.readFileSync(file))
  candidate.exec('SELECT count(*) FROM jobs') // throws if it isn't a Shopboard DB
  candidate.close()
  save()
  backup(dataDir)
  fs.copyFileSync(file, dbFile)
  db = new SQL.Database(fs.readFileSync(dbFile))
  db.run('PRAGMA foreign_keys = ON')
  migrate()
}

type Row = Record<string, SqlValue>
function all(sql: string, params: SqlValue[] = []): Row[] {
  const st = db.prepare(sql)
  st.bind(params)
  const rows: Row[] = []
  while (st.step()) rows.push(st.getAsObject())
  st.free()
  return rows
}
const one = (sql: string, params: SqlValue[] = []) => all(sql, params)[0]
function run(sql: string, params: SqlValue[] = []): number {
  db.run(sql, params)
  const id = one('SELECT last_insert_rowid() AS id')?.id as number
  save()
  return id
}
const today = () => new Date().toISOString().slice(0, 10)

// ---------- settings ----------
export function getSettings(): Settings {
  const row = one('SELECT json FROM settings WHERE id = 1')
  return { ...DEFAULT_SETTINGS, ...(row ? JSON.parse(row.json as string) : {}) }
}
export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  run('UPDATE settings SET json = ? WHERE id = 1', [JSON.stringify(next)])
  return next
}

// ---------- customers ----------
const toCustomer = (r: Row): Customer => ({
  id: r.id as number, name: r.name as string, phone: (r.phone as string) ?? '', email: (r.email as string) ?? '', notes: (r.notes as string) ?? '',
})
export const listCustomers = () => all('SELECT * FROM customers ORDER BY name COLLATE NOCASE').map(toCustomer)
export function saveCustomer(c: Partial<Customer> & { name: string }): Customer {
  if (c.id) {
    run('UPDATE customers SET name=?, phone=?, email=?, notes=? WHERE id=?', [c.name, c.phone ?? '', c.email ?? '', c.notes ?? '', c.id])
    return toCustomer(one('SELECT * FROM customers WHERE id=?', [c.id]))
  }
  const id = run('INSERT INTO customers (name, phone, email, notes) VALUES (?,?,?,?)', [c.name, c.phone ?? '', c.email ?? '', c.notes ?? ''])
  return toCustomer(one('SELECT * FROM customers WHERE id=?', [id]))
}
/** Find a customer by exact name (case-insensitive), or create one. */
export function ensureCustomer(name: string): number | null {
  const n = name.trim()
  if (!n) return null
  const hit = one('SELECT id FROM customers WHERE name = ? COLLATE NOCASE', [n])
  return hit ? (hit.id as number) : saveCustomer({ name: n }).id
}

// ---------- jobs ----------
const toJob = (r: Row): Job => ({
  id: r.id as number,
  customerId: (r.customer_id as number) ?? null,
  customerName: (r.customer_name as string) ?? '',
  title: r.title as string,
  description: (r.description as string) ?? '',
  vehicleYear: (r.vehicle_year as string) ?? '',
  vehicleMake: (r.vehicle_make as string) ?? '',
  vehicleModel: (r.vehicle_model as string) ?? '',
  vin: (r.vin as string) ?? '',
  mileage: (r.mileage as string) ?? '',
  status: r.status as Job['status'],
  quoteType: r.quote_type as Job['quoteType'],
  quotedPrice: (r.quoted_price as number) ?? 0,
  estHours: (r.est_hours as number) ?? 0,
  estPartsCost: (r.est_parts_cost as number) ?? 0,
  riskFlags: JSON.parse((r.risk_flags as string) || '[]'),
  content: { ...emptyContent(), ...JSON.parse((r.content as string) || '{}') },
  salesTax: (r.sales_tax as number) ?? 0,
  paymentDate: (r.payment_date as string) ?? '',
  paymentMethod: (r.payment_method as string) ?? '',
  createdAt: r.created_at as string,
  startedAt: (r.started_at as string) ?? '',
  finishedAt: (r.finished_at as string) ?? '',
})
const JOB_SELECT = 'SELECT j.*, c.name AS customer_name FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id'

export const listJobs = () => all(`${JOB_SELECT} ORDER BY j.created_at DESC, j.id DESC`).map(toJob)

export function getJob(id: number): JobFull | null {
  const r = one(`${JOB_SELECT} WHERE j.id = ?`, [id])
  if (!r) return null
  return { job: toJob(r), labor: laborFor(id), parts: partsFor(id), posts: postsFor(id) }
}

export function saveJob(j: Partial<Job> & { customerName?: string }): Job {
  const prev = j.id ? toJob(one(`${JOB_SELECT} WHERE j.id = ?`, [j.id])) : null
  // A partial update (e.g. just a status change) must keep the existing customer.
  const customerId =
    j.customerName !== undefined ? ensureCustomer(j.customerName)
    : j.customerId !== undefined ? j.customerId
    : (prev?.customerId ?? null)
  const merged: Job = { ...(prev ?? blankJob()), ...j, customerId } as Job
  // Stamp start / finish dates the first time a job reaches those statuses.
  if (merged.status === 'In progress' && !merged.startedAt) merged.startedAt = today()
  if ((merged.status === 'Done' || merged.status === 'Paid') && !merged.finishedAt) merged.finishedAt = today()
  if (merged.status === 'Paid' && !merged.paymentDate) merged.paymentDate = today()
  const vals: SqlValue[] = [
    merged.customerId, merged.title, merged.description, merged.vehicleYear, merged.vehicleMake, merged.vehicleModel,
    merged.vin, merged.mileage, merged.status, merged.quoteType, merged.quotedPrice || 0, merged.estHours || 0,
    merged.estPartsCost || 0, JSON.stringify(merged.riskFlags), JSON.stringify(merged.content), merged.salesTax || 0,
    merged.paymentDate, merged.paymentMethod, merged.startedAt, merged.finishedAt,
  ]
  const cols = `customer_id=?, title=?, description=?, vehicle_year=?, vehicle_make=?, vehicle_model=?, vin=?, mileage=?, status=?, quote_type=?,
    quoted_price=?, est_hours=?, est_parts_cost=?, risk_flags=?, content=?, sales_tax=?, payment_date=?, payment_method=?, started_at=?, finished_at=?`
  let id = j.id
  if (id) {
    run(`UPDATE jobs SET ${cols} WHERE id = ?`, [...vals, id])
  } else {
    id = run(
      `INSERT INTO jobs (customer_id, title, description, vehicle_year, vehicle_make, vehicle_model, vin, mileage, status, quote_type,
        quoted_price, est_hours, est_parts_cost, risk_flags, content, sales_tax, payment_date, payment_method, started_at, finished_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...vals, merged.createdAt || today()],
    )
  }
  return toJob(one(`${JOB_SELECT} WHERE j.id = ?`, [id]))
}

export const deleteJob = (id: number) => void run('DELETE FROM jobs WHERE id = ?', [id])

function blankJob(): Job {
  return {
    id: 0, customerId: null, title: '', description: '', vehicleYear: '', vehicleMake: '', vehicleModel: '', vin: '', mileage: '',
    status: 'Lead', quoteType: 'flat', quotedPrice: 0, estHours: 0, estPartsCost: 0, riskFlags: [], content: emptyContent(),
    salesTax: 0, paymentDate: '', paymentMethod: '', createdAt: today(), startedAt: '', finishedAt: '',
  }
}

// ---------- labor ----------
const toLabor = (r: Row): LaborEntry => ({
  id: r.id as number, jobId: r.job_id as number, tech: (r.tech as string) ?? '', date: r.date as string,
  hours: (r.hours as number) ?? 0, note: (r.note as string) ?? '', timerStart: (r.timer_start as string) ?? null,
})
export const laborFor = (jobId: number) => all('SELECT * FROM labor WHERE job_id = ? ORDER BY date, id', [jobId]).map(toLabor)
export const allLabor = () => all('SELECT * FROM labor ORDER BY date, id').map(toLabor)
export function saveLabor(l: Partial<LaborEntry> & { jobId: number }): LaborEntry {
  if (l.id) {
    run('UPDATE labor SET tech=?, date=?, hours=?, note=? WHERE id=?', [l.tech ?? '', l.date ?? today(), l.hours ?? 0, l.note ?? '', l.id])
    return toLabor(one('SELECT * FROM labor WHERE id=?', [l.id]))
  }
  const id = run('INSERT INTO labor (job_id, tech, date, hours, note) VALUES (?,?,?,?,?)', [l.jobId, l.tech ?? '', l.date ?? today(), l.hours ?? 0, l.note ?? ''])
  return toLabor(one('SELECT * FROM labor WHERE id=?', [id]))
}
export const deleteLabor = (id: number) => void run('DELETE FROM labor WHERE id = ?', [id])

/** The one running timer, if any (only one runs at a time across the shop). */
export function runningTimer(): (LaborEntry & { jobTitle: string }) | null {
  const r = one('SELECT l.*, j.title AS job_title FROM labor l JOIN jobs j ON j.id = l.job_id WHERE l.timer_start IS NOT NULL LIMIT 1')
  return r ? { ...toLabor(r), jobTitle: r.job_title as string } : null
}
export function startTimer(jobId: number, tech: string): LaborEntry {
  const running = runningTimer()
  if (running) stopTimer(running.id)
  const id = run('INSERT INTO labor (job_id, tech, date, hours, note, timer_start) VALUES (?,?,?,0,?,?)', [jobId, tech, today(), '', new Date().toISOString()])
  return toLabor(one('SELECT * FROM labor WHERE id=?', [id]))
}
export function stopTimer(laborId: number): LaborEntry {
  const r = toLabor(one('SELECT * FROM labor WHERE id=?', [laborId]))
  if (r.timerStart) {
    const hrs = (Date.now() - new Date(r.timerStart).getTime()) / 3_600_000
    run('UPDATE labor SET hours = ?, timer_start = NULL WHERE id = ?', [Math.round((r.hours + hrs) * 100) / 100, laborId])
  }
  return toLabor(one('SELECT * FROM labor WHERE id=?', [laborId]))
}

// ---------- parts ----------
const toPart = (r: Row): Part => ({
  id: r.id as number, jobId: r.job_id as number, description: (r.description as string) ?? '', cost: (r.cost as number) ?? 0,
  charged: (r.charged as number) ?? 0, supplier: (r.supplier as string) ?? '',
})
export const partsFor = (jobId: number) => all('SELECT * FROM parts WHERE job_id = ? ORDER BY id', [jobId]).map(toPart)
export const allParts = () => all('SELECT * FROM parts ORDER BY id').map(toPart)
export function savePart(p: Partial<Part> & { jobId: number }): Part {
  const v = [p.description ?? '', p.cost ?? 0, p.charged ?? 0, p.supplier ?? '']
  if (p.id) {
    run('UPDATE parts SET description=?, cost=?, charged=?, supplier=? WHERE id=?', [...v, p.id])
    return toPart(one('SELECT * FROM parts WHERE id=?', [p.id]))
  }
  const id = run('INSERT INTO parts (job_id, description, cost, charged, supplier) VALUES (?,?,?,?,?)', [p.jobId, ...v])
  return toPart(one('SELECT * FROM parts WHERE id=?', [id]))
}
export const deletePart = (id: number) => void run('DELETE FROM parts WHERE id = ?', [id])

// ---------- content posts ----------
const toPost = (r: Row): ContentPost => ({
  id: r.id as number, jobId: r.job_id as number, platform: (r.platform as string) ?? '', url: (r.url as string) ?? '',
  date: (r.date as string) ?? '', views: (r.views as number) ?? 0, likes: (r.likes as number) ?? 0,
})
export const postsFor = (jobId: number) => all('SELECT * FROM posts WHERE job_id = ? ORDER BY date, id', [jobId]).map(toPost)
export const allPosts = () => all('SELECT * FROM posts ORDER BY date, id').map(toPost)
export function savePost(p: Partial<ContentPost> & { jobId: number }): ContentPost {
  const v = [p.platform ?? '', p.url ?? '', p.date ?? today(), p.views ?? 0, p.likes ?? 0]
  if (p.id) {
    run('UPDATE posts SET platform=?, url=?, date=?, views=?, likes=? WHERE id=?', [...v, p.id])
    return toPost(one('SELECT * FROM posts WHERE id=?', [p.id]))
  }
  const id = run('INSERT INTO posts (job_id, platform, url, date, views, likes) VALUES (?,?,?,?,?,?)', [p.jobId, ...v])
  return toPost(one('SELECT * FROM posts WHERE id=?', [id]))
}
export const deletePost = (id: number) => void run('DELETE FROM posts WHERE id = ?', [id])

export const isEmpty = () => !one('SELECT id FROM jobs LIMIT 1')
