import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import { ENTITIES, toCamel, toSnake, type EntityName, type EntityTypes } from '../shared/entities'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

let db: Database
let dbFile = ''
let SQL: Awaited<ReturnType<typeof initSqlJs>>
const KEEP_BACKUPS = 15

type Row = Record<string, SqlValue>
export function all(sql: string, params: SqlValue[] = []): Row[] {
  const st = db.prepare(sql)
  st.bind(params)
  const rows: Row[] = []
  while (st.step()) rows.push(st.getAsObject())
  st.free()
  return rows
}
export const one = (sql: string, params: SqlValue[] = []) => all(sql, params)[0]
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Schema history. Each entry runs once, in order, inside a transaction.
 *  1. v1: settings, customers, jobs, labor, parts, posts.
 *  2. v2: every table in shared/entities.ts, then v1 data copied into repair orders (v1 tables kept, no longer read).
 * After the list runs, ensureColumns() adds any column a newer build expects (additive only, never drops).
 */
const MIGRATIONS: ((d: Database) => void)[] = [
  (d) =>
    d.exec(`CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
     CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '', notes TEXT DEFAULT '');
     CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '',
       vehicle_year TEXT DEFAULT '', vehicle_make TEXT DEFAULT '', vehicle_model TEXT DEFAULT '', vin TEXT DEFAULT '', mileage TEXT DEFAULT '',
       status TEXT NOT NULL DEFAULT 'Lead', quote_type TEXT NOT NULL DEFAULT 'flat', quoted_price REAL DEFAULT 0, est_hours REAL DEFAULT 0,
       est_parts_cost REAL DEFAULT 0, risk_flags TEXT DEFAULT '[]', content TEXT DEFAULT '{}', sales_tax REAL DEFAULT 0, payment_date TEXT DEFAULT '',
       payment_method TEXT DEFAULT '', created_at TEXT NOT NULL, started_at TEXT DEFAULT '', finished_at TEXT DEFAULT '');
     CREATE TABLE labor (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, tech TEXT DEFAULT '', date TEXT NOT NULL, hours REAL DEFAULT 0, note TEXT DEFAULT '', timer_start TEXT);
     CREATE TABLE parts (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, description TEXT DEFAULT '', cost REAL DEFAULT 0, charged REAL DEFAULT 0, supplier TEXT DEFAULT '');
     CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, platform TEXT DEFAULT '', url TEXT DEFAULT '', date TEXT DEFAULT '', views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0);`),
  (d) => {
    for (const spec of Object.values(ENTITIES)) {
      if (spec.table === 'customers') continue // exists from v1; ensureColumns adds the new fields
      d.exec(`CREATE TABLE IF NOT EXISTS ${spec.table} (id INTEGER PRIMARY KEY AUTOINCREMENT)`)
    }
    ensureColumns(d)
    convertV1(d)
  },
]

function sqlType(v: unknown) {
  if (typeof v === 'number' || typeof v === 'boolean') return 'REAL'
  if (v === null) return 'NUMERIC'
  return 'TEXT'
}
function sqlDefault(v: unknown): string {
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  if (v === null) return 'NULL'
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

/** Add any column the current entity definitions expect but the table lacks. Additive only. */
function ensureColumns(d: Database) {
  for (const spec of Object.values(ENTITIES)) {
    const have = new Set((d.exec(`PRAGMA table_info(${spec.table})`)[0]?.values ?? []).map((r) => String(r[1])))
    for (const [k, v] of Object.entries(spec.blank())) {
      const col = toSnake(k)
      if (!have.has(col)) d.exec(`ALTER TABLE ${spec.table} ADD COLUMN ${col} ${sqlType(v)} DEFAULT ${sqlDefault(v)}`)
    }
  }
}

export async function openDb(dataDir: string, wasmDir?: string): Promise<void> {
  SQL = await initSqlJs(wasmDir ? { locateFile: (f) => path.join(wasmDir, f) } : undefined)
  fs.mkdirSync(dataDir, { recursive: true })
  dbFile = path.join(dataDir, 'shopboard.db')
  if (fs.existsSync(dbFile)) {
    backup(dataDir)
    db = new SQL.Database(fs.readFileSync(dbFile))
  } else db = new SQL.Database()
  migrate()
}

/** In-memory DB for tests. */
export async function openMemoryDb(): Promise<void> {
  SQL = await initSqlJs()
  db = new SQL.Database()
  dbFile = ''
  migrate()
}

function backup(dataDir: string) {
  const dir = path.join(dataDir, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.copyFileSync(dbFile, path.join(dir, `shopboard-${stamp}.db`))
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, f))
}

function migrate() {
  const version = (db.exec('PRAGMA user_version')[0]?.values[0][0] as number) ?? 0
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.run('BEGIN')
    try {
      MIGRATIONS[v](db)
      db.run(`PRAGMA user_version = ${v + 1}`)
      db.run('COMMIT')
    } catch (e) {
      db.run('ROLLBACK')
      throw e
    }
  }
  ensureColumns(db)
  if (!one('SELECT id FROM settings WHERE id = 1')) db.run('INSERT INTO settings (id, json) VALUES (1, ?)', [JSON.stringify(DEFAULT_SETTINGS)])
  if (!one('SELECT id FROM users LIMIT 1')) insert('users', { name: 'Owner', role: 'owner' })
  save()
}

/** Atomic write: temp file then rename, so a crash mid-write can't corrupt the DB. */
export function save() {
  if (!dbFile) return
  const tmp = dbFile + '.tmp'
  fs.writeFileSync(tmp, Buffer.from(db.export()))
  fs.renameSync(tmp, dbFile)
}
export const dbPath = () => dbFile

export async function restoreFrom(file: string, dataDir: string) {
  const candidate = new SQL.Database(fs.readFileSync(file))
  candidate.exec('SELECT count(*) FROM settings') // throws if it isn't a Shopboard DB
  candidate.close()
  save()
  backup(dataDir)
  fs.copyFileSync(file, dbFile)
  db = new SQL.Database(fs.readFileSync(dbFile))
  migrate()
}

/** Run several writes as one unit; saves once at the end. */
export function tx<T>(fn: () => T): T {
  db.run('BEGIN')
  try {
    const r = fn()
    db.run('COMMIT')
    save()
    return r
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}
let inTx = 0
const autosave = () => { if (!inTx) save() }

// ---------- generic entity store ----------
function decode<E extends EntityName>(e: E, r: Row): EntityTypes[E] {
  const spec = ENTITIES[e]
  const blank = spec.blank() as Record<string, unknown>
  const out: Record<string, unknown> = { id: r.id }
  for (const k of Object.keys(blank)) {
    const v = r[toSnake(k)]
    if ((spec.json as readonly string[]).includes(k)) out[k] = v == null || v === '' ? blank[k] : JSON.parse(String(v))
    else if ((spec.bool as readonly string[]).includes(k)) out[k] = Boolean(v)
    else if (typeof blank[k] === 'string') out[k] = v == null ? '' : String(v)
    else out[k] = v ?? blank[k]
  }
  return out as unknown as EntityTypes[E]
}
function encode<E extends EntityName>(e: E, k: string, v: unknown): SqlValue {
  const spec = ENTITIES[e]
  if ((spec.json as readonly string[]).includes(k)) return JSON.stringify(v ?? null)
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === undefined) return null
  return v as SqlValue
}

export function list<E extends EntityName>(e: E, where = '', params: SqlValue[] = []): EntityTypes[E][] {
  const spec = ENTITIES[e]
  return all(`SELECT * FROM ${spec.table} ${where ? 'WHERE ' + where : ''} ORDER BY ${spec.order}`, params).map((r) => decode(e, r))
}
export function get<E extends EntityName>(e: E, id: number): EntityTypes[E] | null {
  const r = one(`SELECT * FROM ${ENTITIES[e].table} WHERE id = ?`, [id])
  return r ? decode(e, r) : null
}
export function insert<E extends EntityName>(e: E, data: Partial<EntityTypes[E]>): EntityTypes[E] {
  const spec = ENTITIES[e]
  const rec = { ...(spec.blank() as object), ...data } as Record<string, unknown>
  delete rec.id
  const keys = Object.keys(spec.blank())
  db.run(`INSERT INTO ${spec.table} (${keys.map(toSnake).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => encode(e, k, rec[k])))
  const id = one('SELECT last_insert_rowid() AS id')!.id as number
  autosave()
  return get(e, id)!
}
export function update<E extends EntityName>(e: E, id: number, patch: Partial<EntityTypes[E]>): EntityTypes[E] {
  const spec = ENTITIES[e]
  const allowed = new Set(Object.keys(spec.blank()))
  const keys = Object.keys(patch).filter((k) => allowed.has(k))
  if (keys.length) {
    db.run(`UPDATE ${spec.table} SET ${keys.map((k) => `${toSnake(k)} = ?`).join(', ')} WHERE id = ?`, [
      ...keys.map((k) => encode(e, k, (patch as Record<string, unknown>)[k])),
      id,
    ])
    autosave()
  }
  const rec = get(e, id)
  if (!rec) throw new Error(`${e} #${id} not found`)
  return rec
}
export function upsert<E extends EntityName>(e: E, data: Partial<EntityTypes[E]> & { id?: number }): EntityTypes[E] {
  return data.id ? update(e, data.id, data) : insert(e, data)
}
export function remove(e: EntityName, id: number) {
  db.run(`DELETE FROM ${ENTITIES[e].table} WHERE id = ?`, [id])
  autosave()
}
/** Group writes into one transaction + one save. Re-entrant: an inner batch joins the outer one. */
export function batch<T>(fn: () => T): T {
  if (inTx) return fn()
  inTx++
  try {
    return tx(fn)
  } finally {
    inTx--
  }
}

// ---------- settings ----------
export function getSettings(): Settings {
  const row = one('SELECT json FROM settings WHERE id = 1')
  return { ...DEFAULT_SETTINGS, ...(row ? JSON.parse(row.json as string) : {}) }
}
export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  db.run('UPDATE settings SET json = ? WHERE id = 1', [JSON.stringify(next)])
  autosave()
  return next
}
export const isEmpty = () => !one('SELECT id FROM repair_orders LIMIT 1')

// ---------- v1 → v2 data conversion (runs once inside migration 2) ----------
function convertV1(d: Database) {
  const q = (sql: string) => {
    const r = d.exec(sql)[0]
    return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []
  }
  const ins = (table: string, rec: Record<string, unknown>) => {
    const keys = Object.keys(rec)
    d.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => rec[k] as SqlValue))
    return d.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }
  const sRow = q('SELECT json FROM settings WHERE id = 1')[0]
  const v1 = sRow ? JSON.parse(String(sRow.json)) : {}
  const v1Jobs = q('SELECT * FROM jobs ORDER BY id')

  // Users from v1 tech names (first one is the owner).
  const techs: string[] = Array.isArray(v1.techs) && v1.techs.length ? v1.techs : ['Owner']
  const userId = new Map<string, number>()
  techs.forEach((name, i) =>
    userId.set(name, ins('users', { name, role: i === 0 ? 'owner' : 'tech', pin: '', hourly_cost: 0, color: '#1D4ED8', active: 1 })),
  )

  const rate = Number(v1.laborRate) || 140
  const markup = 1 + (Number(v1.partsMarkupPct) || 50) / 100
  const settings = {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(Object.entries(v1).filter(([k]) => k in DEFAULT_SETTINGS)),
    laborRates: [{ id: 'std', name: 'Standard', rate }, { id: 'diag', name: 'Diagnostic', rate: rate + 20 }],
    nextRoNumber: 1001 + v1Jobs.length,
  }
  d.run('UPDATE settings SET json = ? WHERE id = 1', [JSON.stringify(settings)])

  const STATUS: Record<string, [string, string]> = {
    Lead: ['estimate', 'Not started'], Quoted: ['estimate', 'Waiting on customer'], Declined: ['estimate', 'Waiting on customer'],
    Accepted: ['wip', 'In progress'], 'In progress': ['wip', 'In progress'], 'Waiting on parts': ['wip', 'Waiting on parts'],
    Done: ['completed', 'Ready for pickup'], Paid: ['completed', 'Picked up'],
  }
  v1Jobs.forEach((j, i) => {
    const [status, stage] = STATUS[String(j.status)] ?? ['estimate', 'Not started']
    const hasVehicle = j.vehicle_year || j.vehicle_make || j.vehicle_model || j.vin
    const vehicleId = hasVehicle
      ? ins('vehicles', { customer_id: j.customer_id, year: j.vehicle_year, make: j.vehicle_make, model: j.vehicle_model, vin: j.vin, mileage: Number(j.mileage) || 0, created_at: j.created_at })
      : null
    const roId = ins('repair_orders', {
      number: 1001 + i, customer_id: j.customer_id, vehicle_id: vehicleId, status, stage, concern: j.description,
      risk_flags: j.risk_flags || '[]', content: j.content || '{}', created_at: j.created_at, started_at: j.started_at,
      completed_at: j.finished_at, picked_up_at: j.status === 'Paid' ? j.payment_date || j.finished_at : '',
      authorized_at: status !== 'estimate' ? j.started_at || j.created_at : '', stock_applied: 0,
    })
    const jobStatus = j.status === 'Declined' ? 'declined' : status === 'estimate' ? 'pending' : 'approved'
    const jobId = ins('ro_jobs', { ro_id: roId, title: j.title, status: jobStatus, sort: 0 })

    const labor = q(`SELECT * FROM labor WHERE job_id = ${Number(j.id)}`)
    const actualHours = labor.reduce((a, l) => a + Number(l.hours || 0), 0)
    const estHours = Number(j.est_hours) || 0
    if (j.quote_type === 'flat') {
      const price = Number(j.quoted_price) || 0
      const qty = estHours > 0 ? estHours : 1
      ins('ro_lines', { job_id: jobId, kind: 'labor', description: j.title, qty, price: Math.round((price / qty) * 100) / 100, labor_rate_id: 'std', taxable: 1, sort: 0 })
    } else {
      const qty = status !== 'estimate' && actualHours > 0 ? actualHours : estHours
      ins('ro_lines', { job_id: jobId, kind: 'labor', description: j.title, qty, price: rate, labor_rate_id: 'std', taxable: 1, sort: 0 })
    }
    const parts = q(`SELECT * FROM parts WHERE job_id = ${Number(j.id)}`)
    parts.forEach((p, k) =>
      ins('ro_lines', { job_id: jobId, kind: 'part', description: p.description, qty: 1, cost: p.cost, price: p.charged, taxable: 1, sort: k + 1 }),
    )
    if (!parts.length && Number(j.est_parts_cost) > 0) {
      const c = Number(j.est_parts_cost)
      ins('ro_lines', { job_id: jobId, kind: 'part', description: 'Parts (estimated)', qty: 1, cost: c, price: Math.round(c * markup * 100) / 100, taxable: 1, sort: 1 })
    }
    for (const l of labor) {
      ins('labor_entries', { ro_id: roId, job_id: jobId, user_id: userId.get(String(l.tech)) ?? null, date: l.date, hours: l.hours, note: l.note, timer_start: null })
    }
    for (const p of q(`SELECT * FROM posts WHERE job_id = ${Number(j.id)}`)) {
      ins('content_posts', { ro_id: roId, platform: p.platform, url: p.url, date: p.date, views: p.views, likes: p.likes })
    }
    // A v1 "Paid" job becomes a completed RO with a payment for what was billed.
    if (j.status === 'Paid') {
      const billed = d.exec(`SELECT COALESCE(SUM(qty * price), 0) FROM ro_lines WHERE job_id = ${jobId}`)[0].values[0][0] as number
      ins('payments', { ro_id: roId, date: j.payment_date || j.finished_at || today(), amount: Math.round((billed + Number(j.sales_tax || 0)) * 100) / 100, method: j.payment_method || 'Other', reference: '', note: 'Converted from v1' })
    }
  })
}
