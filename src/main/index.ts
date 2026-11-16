import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as db from './db'
import { writeCsvs, writeXlsx } from './export'
import * as g from './google'
import { loadSample } from './seed'
import { buildReport } from '../shared/report'
import type { Settings } from '../shared/types'

const dataDir = process.env.SHOPBOARD_DATA_DIR || app.getPath('userData')
const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'))
let win: BrowserWindow | null = null

function report(from: string, to: string) {
  return buildReport(db.listJobs(), db.allLabor(), db.allParts(), db.getSettings(), from, to)
}
const rangeLabel = (from: string, to: string) => `${from || 'start'}_to_${to || new Date().toISOString().slice(0, 10)}`

/** Everything the renderer may call. Nothing outside this object is reachable over IPC. */
const api = {
  snapshot: () => ({
    settings: db.getSettings(),
    jobs: db.listJobs(),
    labor: db.allLabor(),
    parts: db.allParts(),
    posts: db.allPosts(),
    customers: db.listCustomers(),
    timer: db.runningTimer(),
    googleConnected: g.isConnected(),
  }),
  saveSettings: (p: Partial<Settings>) => db.saveSettings(p),
  saveJob: db.saveJob,
  deleteJob: db.deleteJob,
  saveLabor: db.saveLabor,
  deleteLabor: db.deleteLabor,
  startTimer: db.startTimer,
  stopTimer: db.stopTimer,
  savePart: db.savePart,
  deletePart: db.deletePart,
  savePost: db.savePost,
  deletePost: db.deletePost,
  saveCustomer: db.saveCustomer,

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
    const dir = path.join(r.filePaths[0], `shopboard-${rangeLabel(from, to)}`)
    const files = writeCsvs(report(from, to), dir)
    shell.showItemInFolder(files[0])
    return dir
  },
  async pushSheets(from: string, to: string) {
    const s = db.getSettings()
    const res = await g.pushReport(report(from, to), {
      clientId: s.googleClientId,
      clientSecret: s.googleClientSecret,
      spreadsheetId: s.googleSpreadsheetId,
      title: `${s.shopName}: Shopboard accounting`,
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
      defaultPath: path.join(app.getPath('documents'), `shopboard-backup-${new Date().toISOString().slice(0, 10)}.db`),
      filters: [{ name: 'Shopboard database', extensions: ['db'] }],
    })
    if (r.canceled || !r.filePath) return null
    db.save()
    fs.copyFileSync(db.dbPath(), r.filePath)
    return r.filePath
  },
  async restore() {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Restore a Shopboard backup',
      defaultPath: path.join(dataDir, 'backups'),
      filters: [{ name: 'Shopboard database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (r.canceled || !r.filePaths[0]) return false
    await db.restoreFrom(r.filePaths[0], dataDir, wasmDir)
    return true
  },
  openDataFolder: () => shell.openPath(dataDir),
  /** Only http(s) links, and only from a user click (post links, the Sheet link). */
  openLink: (url: string) => (/^https?:\/\//i.test(url) ? shell.openExternal(url) : undefined),
  loadSample: () => loadSample(),
}
export type Api = typeof api

ipcMain.handle('api', async (_e, method: string, args: unknown[]) => {
  const fn = (api as Record<string, (...a: unknown[]) => unknown>)[method]
  if (!Object.hasOwn(api, method) || typeof fn !== 'function') throw new Error(`Unknown method ${method}`)
  return fn(...args)
})

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    title: 'Shopboard',
    backgroundColor: '#F8FAFC',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => {
    if (!process.env.SHOPBOARD_HIDDEN) win?.show()
  })
  // Links never open inside the app window.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  await db.openDb(dataDir, wasmDir)
  g.initGoogle(dataDir)
  if (process.env.SHOPBOARD_SEED === '1' && db.isEmpty()) loadSample()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => {
  db.save()
  if (process.platform !== 'darwin') app.quit()
})
