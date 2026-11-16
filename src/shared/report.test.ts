import { describe, expect, it } from 'vitest'
import { buildReport, toCsv } from './report'
import { DEFAULT_SETTINGS, emptyContent, type Job, type LaborEntry, type Part } from './types'

const s = DEFAULT_SETTINGS
const job = (id: number, over: Partial<Job>): Job => ({
  id, customerId: null, customerName: 'Dale', title: `Job ${id}`, description: '', vehicleYear: '1999', vehicleMake: 'Ford',
  vehicleModel: 'F-150', vin: '', mileage: '', status: 'Paid', quoteType: 'flat', quotedPrice: 500, estHours: 4,
  estPartsCost: 0, riskFlags: [], content: emptyContent(), salesTax: 10, paymentDate: '', paymentMethod: '',
  createdAt: '2026-10-01', startedAt: '', finishedAt: '2026-10-05', ...over,
})
const lab = (jobId: number, hours: number, date = '2026-10-04'): LaborEntry => ({ id: jobId * 10, jobId, tech: 'Owner', date, hours, note: '', timerStart: null })
const part = (jobId: number, cost: number, charged: number): Part => ({ id: jobId, jobId, description: 'Pads', cost, charged, supplier: 'NAPA' })

describe('buildReport', () => {
  const jobs = [
    job(1, {}),
    job(2, { status: 'Done', finishedAt: '2026-10-20', salesTax: 0 }),
    job(3, { status: 'Lead' }),
    job(4, { status: 'Declined' }),
    job(5, { finishedAt: '2026-11-02' }),
    job(6, { status: 'In progress', finishedAt: '', startedAt: '2026-10-25' }),
  ]
  const labor = [lab(1, 4), lab(2, 2), lab(5, 1), lab(6, 3)]
  const parts = [part(1, 100, 150)]

  it('drops leads and declined jobs; filters by date range', () => {
    const r = buildReport(jobs, labor, parts, s, '2026-10-01', '2026-10-31')
    const ids = r.tables[0].rows.map((row) => row[1])
    expect(ids).toEqual(['J-0001', 'J-0002', 'J-0006'])
  })

  it('jobs table has accountant columns with correct money', () => {
    const r = buildReport(jobs, labor, parts, s)
    const row = r.tables[0].rows[0]
    const h = r.tables[0].headers
    const v = (name: string) => row[h.indexOf(name)]
    expect(v('Labor revenue')).toBe(500)
    expect(v('Parts revenue')).toBe(150)
    expect(v('Parts cost')).toBe(100)
    expect(v('Total billed')).toBe(660)
    expect(v('Job profit')).toBe(650 - 100 - 4 * 65)
    expect(v('Payment')).toBe('Paid')
  })

  it('monthly summary counts only Done/Paid and tracks unpaid', () => {
    const r = buildReport(jobs, labor, parts, s)
    const months = r.tables[3].rows
    expect(months.map((m) => m[0])).toEqual(['2026-10', '2026-11'])
    const oct = months[0]
    expect(oct[1]).toBe(2) // job 1 + job 2; in-progress job 6 excluded
    expect(oct[4]).toBe(650 + 500) // total revenue
    expect(oct[13]).toBe(500) // job 2 Done but unpaid
  })

  it('running timers are not exported as labor', () => {
    const r = buildReport(jobs, [...labor, { ...lab(1, 0), id: 99, timerStart: '2026-10-04T10:00:00Z' }], parts, s)
    expect(r.tables[1].rows.length).toBe(4)
  })
})

describe('toCsv', () => {
  it('escapes commas and quotes', () => {
    const csv = toCsv({ name: 't', headers: ['a', 'b'], formats: ['text', 'text'], rows: [['x, y', 'say "hi"']] })
    expect(csv).toBe('a,b\r\n"x, y","say ""hi"""\r\n')
  })
})
