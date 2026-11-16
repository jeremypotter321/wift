import { actuals, contentScore, hourlyCost } from './calc'
import type { Job, LaborEntry, Part, Settings } from './types'

export type Cell = string | number
export interface Table {
  name: string
  headers: string[]
  /** Column formats, used by the .xlsx writer. */
  formats: ('text' | 'money' | 'hours' | 'pct' | 'int' | 'date')[]
  rows: Cell[][]
}
export interface Report {
  from: string
  to: string
  tables: Table[]
}

/** The date a job counts toward for the books: finished, else started, else created. */
export const jobDate = (j: Job) => j.finishedAt || j.startedAt || j.createdAt
const inRange = (d: string, from: string, to: string) => (!from || d >= from) && (!to || d <= to)
const r2 = (n: number) => Math.round(n * 100) / 100
const vehicle = (j: Job) => [j.vehicleYear, j.vehicleMake, j.vehicleModel].filter(Boolean).join(' ')

/**
 * Build the accountant's workbook: Jobs, Labor, Parts, Monthly summary.
 * Leads and declined jobs are left out (no money moved). The monthly summary counts only Done and Paid jobs.
 */
export function buildReport(jobs: Job[], labor: LaborEntry[], parts: Part[], s: Settings, from = '', to = ''): Report {
  const billable = jobs.filter((j) => j.status !== 'Lead' && j.status !== 'Declined' && inRange(jobDate(j), from, to))
  const ids = new Set(billable.map((j) => j.id))
  const laborBy = groupBy(labor, (l) => l.jobId)
  const partsBy = groupBy(parts, (p) => p.jobId)
  const byId = new Map(jobs.map((j) => [j.id, j]))

  const jobRows: Cell[][] = []
  const months = new Map<string, MonthAcc>()
  for (const j of billable.sort((a, b) => jobDate(a).localeCompare(jobDate(b)) || a.id - b.id)) {
    const a = actuals(j, laborBy.get(j.id) ?? [], partsBy.get(j.id) ?? [], s)
    const laborCost = r2(a.hours * hourlyCost(s))
    const paid = j.status === 'Paid'
    jobRows.push([
      jobDate(j), `J-${String(j.id).padStart(4, '0')}`, j.customerName ?? '', vehicle(j), j.title, j.status,
      a.laborRevenue, a.partsRevenue, a.partsCost, r2(a.revenue - a.partsCost), j.salesTax, r2(a.revenue + j.salesTax),
      a.hours, laborCost, a.profit, a.effectiveHourly ?? '', paid ? 'Paid' : 'Unpaid', j.paymentDate, j.paymentMethod,
      contentScore(j.content),
    ])
    if (j.status === 'Done' || j.status === 'Paid') {
      const m = jobDate(j).slice(0, 7)
      const acc = months.get(m) ?? newMonth()
      acc.jobs += 1
      acc.labor += a.laborRevenue
      acc.partsRev += a.partsRevenue
      acc.partsCost += a.partsCost
      acc.tax += j.salesTax
      acc.hours += a.hours
      acc.laborCost += laborCost
      acc.profit += a.profit
      if (!paid) acc.unpaid += a.revenue + j.salesTax
      months.set(m, acc)
    }
  }

  const laborRows: Cell[][] = labor
    .filter((l) => ids.has(l.jobId) && l.timerStart == null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((l) => {
      const j = byId.get(l.jobId)!
      return [l.date, `J-${String(j.id).padStart(4, '0')}`, j.title, l.tech, l.hours, r2(l.hours * hourlyCost(s)), l.note]
    })

  const partRows: Cell[][] = parts
    .filter((p) => ids.has(p.jobId))
    .map((p) => {
      const j = byId.get(p.jobId)!
      return [jobDate(j), `J-${String(j.id).padStart(4, '0')}`, j.title, p.description, p.supplier, p.cost, p.charged, r2(p.charged - p.cost)]
    })

  const monthRows: Cell[][] = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, a]) => {
      const revenue = a.labor + a.partsRev
      const gp = revenue - a.partsCost - a.laborCost
      return [
        m, a.jobs, r2(a.labor), r2(a.partsRev), r2(revenue), r2(a.partsCost), r2(a.laborCost), r2(gp),
        revenue > 0 ? r2(gp / revenue) : 0, r2(a.tax), r2(a.hours), a.hours > 0 ? r2((revenue - a.partsCost) / a.hours) : 0,
        r2(a.profit), r2(a.unpaid),
      ]
    })

  return {
    from,
    to,
    tables: [
      {
        name: 'Jobs',
        headers: ['Date', 'Job #', 'Customer', 'Vehicle', 'Job', 'Status', 'Labor revenue', 'Parts revenue', 'Parts cost',
          'Gross after parts', 'Sales tax', 'Total billed', 'Hours', 'Labor + overhead cost', 'Job profit', 'Effective $/hr',
          'Payment', 'Payment date', 'Payment method', 'Content score'],
        formats: ['date', 'text', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'money',
          'hours', 'money', 'money', 'money', 'text', 'date', 'text', 'int'],
        rows: jobRows,
      },
      {
        name: 'Labor',
        headers: ['Date', 'Job #', 'Job', 'Tech', 'Hours', 'Labor + overhead cost', 'Note'],
        formats: ['date', 'text', 'text', 'text', 'hours', 'money', 'text'],
        rows: laborRows,
      },
      {
        name: 'Parts',
        headers: ['Job date', 'Job #', 'Job', 'Part', 'Supplier', 'Cost', 'Charged', 'Margin'],
        formats: ['date', 'text', 'text', 'text', 'text', 'money', 'money', 'money'],
        rows: partRows,
      },
      {
        name: 'Monthly summary',
        headers: ['Month', 'Jobs done', 'Labor revenue', 'Parts revenue', 'Total revenue', 'Parts cost (COGS)',
          'Labor + overhead cost', 'Gross profit', 'Gross profit %', 'Sales tax collected', 'Hours worked',
          'Effective $/hr', 'Job profit', 'Unpaid (A/R)'],
        formats: ['text', 'int', 'money', 'money', 'money', 'money', 'money', 'money', 'pct', 'money', 'hours', 'money', 'money', 'money'],
        rows: monthRows,
      },
    ],
  }
}

interface MonthAcc { jobs: number; labor: number; partsRev: number; partsCost: number; tax: number; hours: number; laborCost: number; profit: number; unpaid: number }
const newMonth = (): MonthAcc => ({ jobs: 0, labor: 0, partsRev: 0, partsCost: 0, tax: 0, hours: 0, laborCost: 0, profit: 0, unpaid: 0 })

function groupBy<T>(xs: T[], key: (x: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>()
  for (const x of xs) {
    const k = key(x)
    const arr = m.get(k)
    if (arr) arr.push(x)
    else m.set(k, [x])
  }
  return m
}

/** RFC 4180 CSV for one table. */
export function toCsv(t: Table): string {
  const esc = (c: Cell) => {
    const s = String(c ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [t.headers, ...t.rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
