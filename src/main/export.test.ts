import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'
import * as db from './db'
import { writeCsvs, writeXlsx } from './export'
import { loadSample } from './seed'
import { buildReport, toCsv, type Report } from '../shared/report'

let report: Report
beforeAll(async () => {
  await db.openMemoryDb()
  loadSample()
  report = buildReport({
    settings: db.getSettings(), users: db.list('users'), customers: db.list('customers'), vehicles: db.list('vehicles'), ros: db.list('ros'),
    jobs: db.list('jobs'), lines: db.list('lines'), labor: db.list('labor'), payments: db.list('payments'),
  })
})

describe('file export round trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopboard-export-'))

  it('xlsx has the five tabs with the same rows as the report', async () => {
    const f = path.join(dir, 'out.xlsx')
    await writeXlsx(report, f, 'Test Shop')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(f)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Invoices', 'Payments', 'Labor', 'Parts', 'Monthly summary'])
    for (const t of report.tables) expect(wb.getWorksheet(t.name)!.rowCount).toBe(t.rows.length + 1)
    const inv = wb.getWorksheet('Invoices')!
    const totalCol = report.tables[0].headers.indexOf('Total') + 1
    expect(inv.getRow(2).getCell(totalCol).value).toBe(report.tables[0].rows[0][totalCol - 1])
  })

  it('csv writes one file per tab and quotes commas', () => {
    const files = writeCsvs(report, path.join(dir, 'csv'))
    expect(files.map((f) => path.basename(f))).toEqual(['invoices.csv', 'payments.csv', 'labor.csv', 'parts.csv', 'monthly-summary.csv'])
    expect(toCsv({ name: 't', headers: ['a'], formats: ['text'], rows: [['x, "y"']] })).toBe('a\r\n"x, ""y"""\r\n')
  })
})
