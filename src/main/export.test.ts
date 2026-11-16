import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { writeCsvs, writeXlsx } from './export'
import { buildReport } from '../shared/report'
import { DEFAULT_SETTINGS, emptyContent, type Job } from '../shared/types'

const job = (id: number, over: Partial<Job> = {}): Job => ({
  id, customerId: 1, customerName: 'Dale, Jr.', title: `Job ${id}`, description: '', vehicleYear: '2014', vehicleMake: 'Ford',
  vehicleModel: 'F-150', vin: '', mileage: '', status: 'Paid', quoteType: 'flat', quotedPrice: 400, estHours: 2,
  estPartsCost: 0, riskFlags: [], content: emptyContent(), salesTax: 5, paymentDate: '2026-10-05', paymentMethod: 'Card',
  createdAt: '2026-10-01', startedAt: '2026-10-02', finishedAt: '2026-10-05', ...over,
})

describe('file export round trip', () => {
  const report = buildReport(
    [job(1), job(2, { status: 'Done', finishedAt: '2026-11-03' })],
    [{ id: 1, jobId: 1, tech: 'Owner', date: '2026-10-03', hours: 2, note: 'x', timerStart: null }],
    [{ id: 1, jobId: 1, description: 'Pads', cost: 50, charged: 75, supplier: 'NAPA' }],
    DEFAULT_SETTINGS,
  )
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopboard-export-'))

  it('xlsx has the four tabs with matching rows and totals', async () => {
    const f = path.join(dir, 'out.xlsx')
    await writeXlsx(report, f, 'Test Shop')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(f)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Jobs', 'Labor', 'Parts', 'Monthly summary'])
    const jobs = wb.getWorksheet('Jobs')!
    expect(jobs.rowCount).toBe(3)
    expect(jobs.getRow(2).getCell(3).value).toBe('Dale, Jr.')
    expect(jobs.getRow(2).getCell(12).value).toBe(400 + 75 + 5) // total billed
    const months = wb.getWorksheet('Monthly summary')!
    expect(months.getRow(2).getCell(1).value).toBe('2026-10')
    expect(months.getRow(3).getCell(14).value).toBe(400 + 5) // November job Done, unpaid
  })

  it('csv writes one file per tab and quotes commas', () => {
    const files = writeCsvs(report, path.join(dir, 'csv'))
    expect(files.map((f) => path.basename(f))).toEqual(['jobs.csv', 'labor.csv', 'parts.csv', 'monthly-summary.csv'])
    expect(fs.readFileSync(files[0], 'utf8')).toContain('"Dale, Jr."')
  })
})
