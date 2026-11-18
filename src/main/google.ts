import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { safeStorage, shell } from 'electron'
import { google, type sheets_v4 } from 'googleapis'
import type { Report, Table } from '../shared/report'

/**
 * drive.file: the app can only see spreadsheets it created itself.
 * calendar.events: add, change and remove events (appointments) on the shop's calendar; it can't change calendar settings or sharing.
 */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const SCOPES = ['https://www.googleapis.com/auth/drive.file', CALENDAR_SCOPE]
let tokenFile = ''

export function initGoogle(dataDir: string) {
  tokenFile = path.join(dataDir, 'google-token.bin')
}

function readToken(): Record<string, unknown> | null {
  if (!fs.existsSync(tokenFile)) return null
  try {
    const raw = fs.readFileSync(tokenFile)
    return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8'))
  } catch {
    return null
  }
}
function writeToken(t: unknown) {
  const s = JSON.stringify(t)
  fs.writeFileSync(tokenFile, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s, 'utf8'))
}

export const isConnected = () => readToken() != null
/** Tokens from before Calendar was added (11-17) don't carry the calendar scope: the shop has to reconnect once. */
export const calendarAllowed = () => String(readToken()?.scope ?? '').includes(CALENDAR_SCOPE)
export function disconnect() {
  if (fs.existsSync(tokenFile)) fs.rmSync(tokenFile)
}

/**
 * Desktop OAuth with a loopback redirect: listen on 127.0.0.1, send the user's browser to Google's consent page,
 * catch the redirect, swap the code for tokens. Runs only when the user clicks Connect in Settings.
 */
export async function connect(clientId: string, clientSecret: string): Promise<void> {
  if (!clientId || !clientSecret) throw new Error('Add the Google client ID and secret in Settings first (see docs/GOOGLE_SETUP.md).')
  const server = http.createServer()
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res))
  const port = (server.address() as AddressInfo).port
  const redirect = `http://127.0.0.1:${port}`
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirect)
  const url = auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Google sign-in timed out after 5 minutes.')), 5 * 60_000)
    server.on('request', (req, res) => {
      const u = new URL(req.url ?? '/', redirect)
      const c = u.searchParams.get('code')
      const err = u.searchParams.get('error')
      if (!c && !err) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<html><body style="font-family:system-ui;padding:40px"><h2>${err ? 'Google sign-in was cancelled.' : 'Copper Calibration is connected to Google.'}</h2><p>You can close this tab and go back to Copper Calibration.</p></body></html>`)
      clearTimeout(timer)
      if (err) reject(new Error(`Google sign-in failed: ${err}`))
      else resolve(c!)
    })
    void shell.openExternal(url)
  }).finally(() => server.close())

  const { tokens } = await auth.getToken(code)
  writeToken(tokens)
}

function authClient(clientId: string, clientSecret: string) {
  const token = readToken()
  if (!token) throw new Error('Not connected to Google. Connect in Settings.')
  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials(token)
  auth.on('tokens', (t) => writeToken({ ...token, ...t }))
  return auth
}
const client = (clientId: string, clientSecret: string) => google.sheets({ version: 'v4', auth: authClient(clientId, clientSecret) })

// ---------- Google Calendar: appointments → the shop's business calendar ----------
export interface CalendarEvent {
  apptId: number
  cancelled: boolean
  summary: string
  description: string
  location: string
  start: string // local "YYYY-MM-DDTHH:mm"
  end: string
}
/** Event ids must be base32hex (0-9, a-v): derive one from the appointment id so an appointment always maps to the same event. */
export const eventId = (apptId: number) => `ccappt${apptId}`

/**
 * Create, update or remove each appointment's event. Upsert by the fixed event id: update first, insert on 404.
 * (Updating a deleted event brings it back, so a re-booked appointment reuses its id.)
 */
export async function syncCalendar(events: CalendarEvent[], opts: { clientId: string; clientSecret: string; calendarId: string }) {
  if (!calendarAllowed()) throw new Error('Google is connected without Calendar access. Disconnect and connect again in Settings ▸ Google to allow Calendar.')
  const cal = google.calendar({ version: 'v3', auth: authClient(opts.clientId, opts.clientSecret) })
  const calendarId = opts.calendarId || 'primary'
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const code = (e: unknown) => (e as { code?: number; status?: number }).code ?? (e as { status?: number }).status
  let written = 0
  let removed = 0
  for (const ev of events) {
    const id = eventId(ev.apptId)
    if (ev.cancelled) {
      try {
        await cal.events.delete({ calendarId, eventId: id })
        removed++
      } catch (e) {
        if (code(e) !== 404 && code(e) !== 410) throw e
      }
      continue
    }
    const body = {
      id, summary: ev.summary, description: ev.description, location: ev.location, status: 'confirmed',
      start: { dateTime: `${ev.start}:00`, timeZone }, end: { dateTime: `${(ev.end || ev.start)}:00`, timeZone },
    }
    try {
      await cal.events.update({ calendarId, eventId: id, requestBody: body })
    } catch (e) {
      if (code(e) !== 404) throw e
      await cal.events.insert({ calendarId, requestBody: body })
    }
    written++
  }
  return { written, removed }
}

const SHEET_FMT: Partial<Record<Table['formats'][number], sheets_v4.Schema$NumberFormat>> = {
  money: { type: 'CURRENCY', pattern: '$#,##0.00' },
  hours: { type: 'NUMBER', pattern: '0.00' },
  pct: { type: 'PERCENT', pattern: '0.0%' },
  int: { type: 'NUMBER', pattern: '0' },
}

/**
 * Push the report to the shop's spreadsheet. Creates it on the first push (returns the new id),
 * then rewrites every tab on later pushes so the accountant always sees the full current picture.
 */
export async function pushReport(
  report: Report,
  opts: { clientId: string; clientSecret: string; spreadsheetId: string; title: string },
): Promise<{ spreadsheetId: string; url: string }> {
  const sheets = client(opts.clientId, opts.clientSecret)
  let id = opts.spreadsheetId
  let existing: sheets_v4.Schema$Spreadsheet | null = null
  if (id) {
    try {
      existing = (await sheets.spreadsheets.get({ spreadsheetId: id })).data
    } catch (e: unknown) {
      const status = (e as { code?: number }).code
      if (status !== 404 && status !== 403) throw e
      id = '' // deleted or no longer ours: make a fresh one
    }
  }
  if (!id) {
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title: opts.title }, sheets: report.tables.map((t) => ({ properties: { title: t.name } })) },
    })
    id = created.data.spreadsheetId!
    existing = created.data
  }

  // Make sure every tab exists.
  const have = new Map((existing?.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]))
  const missing = report.tables.filter((t) => !have.has(t.name))
  if (missing.length) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: missing.map((t) => ({ addSheet: { properties: { title: t.name } } })) },
    })
    for (const r of res.data.replies ?? []) {
      const p = r.addSheet?.properties
      if (p) have.set(p.title!, p.sheetId!)
    }
  }

  // Rewrite values.
  await sheets.spreadsheets.values.batchClear({ spreadsheetId: id, requestBody: { ranges: report.tables.map((t) => `'${t.name}'`) } })
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: 'RAW',
      data: report.tables.map((t) => ({ range: `'${t.name}'!A1`, values: [t.headers, ...t.rows] })),
    },
  })

  // Header style, frozen row, column number formats.
  const requests: sheets_v4.Schema$Request[] = []
  for (const t of report.tables) {
    const sheetId = have.get(t.name)!
    requests.push({
      updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' },
    })
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.114, green: 0.306, blue: 0.847 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    })
    t.formats.forEach((f, i) => {
      const nf = SHEET_FMT[f]
      if (!nf) return
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
          cell: { userEnteredFormat: { numberFormat: nf } },
          fields: 'userEnteredFormat.numberFormat',
        },
      })
    })
    requests.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: t.headers.length } } })
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } })

  return { spreadsheetId: id, url: `https://docs.google.com/spreadsheets/d/${id}/edit` }
}
