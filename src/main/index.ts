import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import * as db from './db'
import { writeCsvs, writeXlsx } from './export'
import * as g from './google'
import * as ops from './ops'
import { ensureDefaults, loadSample } from './seed'
import { ENTITIES, type EntityName, type EntityTypes } from '../shared/entities'
import { buildReport } from '../shared/report'
import type { Settings, Snapshot } from '../shared/types'

// A custom data folder (tests, demos) also gets its own browser storage, so the signed-in user etc. never leak between them.
if (process.env.SHOPBOARD_DATA_DIR) app.setPath('userData', path.resolve(process.env.SHOPBOARD_DATA_DIR))
const dataDir = process.env.SHOPBOARD_DATA_DIR || app.getPath('userData')
const photoDir = path.join(dataDir, 'photos')
const docDir = path.join(dataDir, 'documents')
const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'))
let win: BrowserWindow | null = null

// Inspection photos are served to the renderer as shopfile://photo/<name>.
protocol.registerSchemesAsPrivileged([{ scheme: 'shopfile', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

function snapshot(): Snapshot {
  return {
    settings: db.getSettings(),
    users: db.list('users'),
    customers: db.list('customers'),
    vehicles: db.list('vehicles'),
    ros: db.list('ros'),
    jobs: db.list('jobs'),
    lines: db.list('lines'),
    labor: db.list('labor'),
    payments: db.list('payments'),
    inspections: db.list('inspections'),
    inspectionItems: db.list('inspectionItems'),
    templates: db.list('templates'),
    cannedJobs: db.list('cannedJobs'),
    parts: db.list('parts'),
    vendors: db.list('vendors'),
    pos: db.list('pos'),
    poLines: db.list('poLines'),
    appointments: db.list('appointments'),
    punches: db.list('punches'),
    reminders: db.list('reminders'),
    posts: db.list('posts'),
    googleConnected: g.isConnected(),
  }
}
const report = (from: string, to: string) => buildReport(snapshot(), from, to)
const rangeLabel = (from: string, to: string) => `${from || 'start'}_to_${to || new Date().toISOString().slice(0, 10)}`
const assertEntity = (e: string): EntityName => {
  if (!Object.hasOwn(ENTITIES, e)) throw new Error(`Unknown record type ${e}`)
  return e as EntityName
}
/** Records with their own cascade rules go through ops; everything else is a plain delete. */
const GUARDED_DELETE: Partial<Record<EntityName, (id: number) => void>> = {
  ros: ops.deleteRo, jobs: ops.deleteJob, customers: ops.deleteCustomer, vehicles: ops.deleteVehicle, pos: ops.deletePo, inspections: ops.deleteInspection,
}

/** Everything the renderer may call. Nothing outside this object is reachable over IPC. */
const api = {
  snapshot,
  save: <E extends EntityName>(entity: E, data: Partial<EntityTypes[E]> & { id?: number }) => db.upsert(assertEntity(entity) as E, data),
  saveMany: (items: { entity: EntityName; data: Record<string, unknown> & { id?: number } }[]) =>
    db.batch(() => items.map((i) => db.upsert(assertEntity(i.entity), i.data as never))),
  remove: (entity: EntityName, id: number) => {
    const e = assertEntity(entity)
    const guarded = GUARDED_DELETE[e]
    if (guarded) guarded(id)
    else db.remove(e, id)
  },
  saveSettings: (p: Partial<Settings>) => db.saveSettings(p),

  createRo: ops.createRo,
  addJob: ops.addJob,
  addCannedJob: ops.addCannedJob,
  authorize: ops.authorize,
  setRoStatus: ops.setRoStatus,
  startClock: ops.startClock,
  stopClock: ops.stopClock,
  punchIn: ops.punchIn,
  punchOut: ops.punchOut,
  createPo: ops.createPo,
  receivePo: ops.receivePo,
  startInspection: ops.startInspection,
  recommendJob: ops.recommendJob,

  /** VIN decode via NHTSA vPIC (free, public). Only the VIN is sent. */
  async decodeVin(vin: string) {
    const clean = vin.trim().toUpperCase()
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)) throw new Error('A VIN is 17 letters and numbers (no I, O or Q).')
    const res = await net.fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${clean}?format=json`)
    if (!res.ok) throw new Error(`VIN lookup failed (${res.status}). Check the internet connection.`)
    const r = ((await res.json()) as { Results: Record<string, string>[] }).Results[0] ?? {}
    const pick = (k: string) => (r[k] && r[k] !== 'Not Applicable' ? r[k] : '')
    const engine = [pick('DisplacementL') && `${Number(pick('DisplacementL')).toFixed(1)}L`, pick('EngineConfiguration'), pick('EngineCylinders') && `${pick('EngineCylinders')} cyl`, pick('EngineModel')]
      .filter(Boolean).join(' ')
    return {
      year: pick('ModelYear'), make: titleCase(pick('Make')), model: pick('Model'), trim: [pick('Trim'), pick('Series')].filter(Boolean).join(' '),
      engine, decoded: Object.fromEntries(Object.entries(r).filter(([, v]) => v && v !== 'Not Applicable' && v !== '0').slice(0, 80)),
      error: pick('ErrorCode') && pick('ErrorCode') !== '0' ? pick('ErrorText') : '',
    }
  },

  /** Save an inspection photo (data URL from the renderer). Returns the file name. */
  savePhoto(dataUrl: string) {
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(dataUrl)
    if (!m) throw new Error('Unsupported image')
    fs.mkdirSync(photoDir, { recursive: true })
    const name = `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
    fs.writeFileSync(path.join(photoDir, name), Buffer.from(m[2], 'base64'))
    return name
  },

  /** Render a customer document (estimate, invoice, inspection) to PDF, or send it to a printer. */
  async printDocument(html: string, fileName: string, mode: 'pdf' | 'print') {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(withPhotos(html)))
      if (mode === 'print') {
        await new Promise<void>((resolve, reject) => w.webContents.print({ silent: false, printBackground: true }, (ok, err) => (ok || err === 'cancelled' ? resolve() : reject(new Error(err)))))
        return null
      }
      const pdf = await w.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } })
      fs.mkdirSync(docDir, { recursive: true })
      const file = path.join(docDir, fileName.replace(/[^\w .-]+/g, '_') + '.pdf')
      fs.writeFileSync(file, pdf)
      void shell.openPath(file)
      return file
    } finally {
      w.destroy()
    }
  },

  async exportXlsx(from: string, to: string) {
    const s = db.getSettings()
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(app.getPath('documents'), `${s.shopName} accounting ${rangeLabel(from, to)}.xlsx`),
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
    })
    if (r.canceled || !r.filePath) return null
    await writeXlsx(report(from, to), r.filePath, s.shopName)
    shell.showItemInFolder(r.filePath)
    return r.filePath
  },
  async exportCsv(from: string, to: string) {
    const r = await dialog.showOpenDialog(win!, { title: 'Choose a folder for the CSV files', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const dir = path.join(r.filePaths[0], `wift-${rangeLabel(from, to)}`)
    const files = writeCsvs(report(from, to), dir)
    shell.showItemInFolder(files[0])
    return dir
  },
  /** Save any table (reminders list, inventory, etc.) as one CSV. */
  async saveCsv(defaultName: string, csv: string) {
    const r = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('documents'), defaultName), filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (r.canceled || !r.filePath) return null
    fs.writeFileSync(r.filePath, csv)
    shell.showItemInFolder(r.filePath)
    return r.filePath
  },
  async pushSheets(from: string, to: string) {
    const s = db.getSettings()
    const res = await g.pushReport(report(from, to), {
      clientId: s.googleClientId, clientSecret: s.googleClientSecret, spreadsheetId: s.googleSpreadsheetId, title: `${s.shopName}: WIFT accounting`,
    })
    if (res.spreadsheetId !== s.googleSpreadsheetId) db.saveSettings({ googleSpreadsheetId: res.spreadsheetId })
    return res
  },
  async googleConnect() {
    const s = db.getSettings()
    await g.connect(s.googleClientId, s.googleClientSecret)
    return true
  },
  googleDisconnect: () => g.disconnect(),

  async backupNow() {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(app.getPath('documents'), `wift-backup-${new Date().toISOString().slice(0, 10)}.db`),
      filters: [{ name: 'WIFT database', extensions: ['db'] }],
    })
    if (r.canceled || !r.filePath) return null
    db.save()
    fs.copyFileSync(db.dbPath(), r.filePath)
    return r.filePath
  },
  async restore() {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Restore a WIFT backup', defaultPath: path.join(dataDir, 'backups'),
      filters: [{ name: 'WIFT database', extensions: ['db'] }], properties: ['openFile'],
    })
    if (r.canceled || !r.filePaths[0]) return false
    await db.restoreFrom(r.filePaths[0], dataDir)
    return true
  },
  openDataFolder: () => shell.openPath(dataDir),
  /** Only http(s) links, and only from a user click. */
  openLink: (url: string) => (/^https?:\/\//i.test(url) ? shell.openExternal(url) : undefined),
  loadSample: () => loadSample(),
}
export type Api = typeof api

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/^Bmw$/, 'BMW')

/** Printed documents load from a data: URL, so inline the photos they reference. */
function withPhotos(html: string) {
  return html.replace(/shopfile:\/\/photo\/([\w.-]+)/g, (_m, name: string) => {
    const f = path.join(photoDir, path.basename(name))
    if (!fs.existsSync(f)) return ''
    const ext = path.extname(f).slice(1).replace('jpg', 'jpeg')
    return `data:image/${ext};base64,${fs.readFileSync(f).toString('base64')}`
  })
}

ipcMain.handle('api', async (_e, method: string, args: unknown[]) => {
  const fn = (api as Record<string, (...a: unknown[]) => unknown>)[method]
  if (!Object.hasOwn(api, method) || typeof fn !== 'function') throw new Error(`Unknown method ${method}`)
  return fn(...args)
})

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1100, minHeight: 700, title: 'WIFT', backgroundColor: '#F8FAFC', show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.once('ready-to-show', () => {
    if (!process.env.SHOPBOARD_HIDDEN) win?.show()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  protocol.handle('shopfile', (req) => {
    const u = new URL(req.url)
    if (u.host !== 'photo') return new Response('Not found', { status: 404 })
    const f = path.join(photoDir, path.basename(decodeURIComponent(u.pathname)))
    return fs.existsSync(f) ? net.fetch(pathToFileURL(f).toString()) : new Response('Not found', { status: 404 })
  })
  await db.openDb(dataDir, wasmDir)
  ensureDefaults()
  if (process.env.SHOPBOARD_SEED === '1' && db.isEmpty()) loadSample()
  if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(path.join(__dirname, '../../build/icon.png'))
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => {
  db.save()
  if (process.platform !== 'darwin') app.quit()
})
