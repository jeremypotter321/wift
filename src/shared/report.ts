import { contentScore, hourlyCost, lineAmount, lineCost, payState, round2 } from './calc'
import { indexData, vehicleName, type Data } from './bundle'
import type { ContentPost } from './types'

export type Cell = string | number
export type Format = 'text' | 'money' | 'hours' | 'pct' | 'int' | 'date'
export interface Table { name: string; headers: string[]; formats: Format[]; rows: Cell[][] }
export interface Report { from: string; to: string; tables: Table[] }

const inRange = (d: string, from: string, to: string) => !!d && (!from || d >= from) && (!to || d <= to)

/**
 * The accountant's workbook. A sale counts on the day the RO was completed; payments count on the day received.
 * Tabs: Invoices, Payments, Labor, Parts, Monthly summary.
 */
export function buildReport(d: Data & { posts?: ContentPost[] }, from = '', to = ''): Report {
  const ix = indexData(d)
  const completed = d.ros
    .filter((r) => r.status === 'completed' && inRange(r.completedAt, from, to))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.number - b.number)
  const roById = new Map(d.ros.map((r) => [r.id, r]))
  const name = (id: number | null) => (id ? ix.customers.get(id)?.name ?? '' : '')

  const invoiceRows: Cell[][] = []
  const months = new Map<string, Month>()
  for (const ro of completed) {
    const { totals: t } = ix.totals(ro.id)
    const hours = t.clockedHours || t.soldHours
    invoiceRows.push([
      ro.completedAt, ro.number, name(ro.customerId), vehicleName(ro.vehicleId ? ix.vehicles.get(ro.vehicleId) : null),
      t.labor, t.parts, t.fees + t.sublet, t.supplies, t.discount, t.subtotal, t.tax, t.total, t.paid, t.balance,
      payState(ro, t) ?? '', t.partsCost + t.subletCost + t.feesCost, t.laborCost, t.grossProfit, t.gpPct != null ? t.gpPct / 100 : '',
      hours, t.effectiveHourly ?? '', contentScore(ro.content),
    ])
    const m = ro.completedAt.slice(0, 7)
    const a = months.get(m) ?? newMonth()
    a.cars += 1
    a.labor += t.labor
    a.parts += t.parts
    a.other += t.fees + t.sublet + t.supplies
    a.discount += t.discount
    a.sales += t.subtotal
    a.tax += t.tax
    a.partsCost += t.partsCost + t.subletCost + t.feesCost
    a.laborCost += t.laborCost
    a.gp += t.grossProfit
    a.hours += hours
    a.unpaid += Math.max(0, t.balance)
    months.set(m, a)
  }

  const paymentRows: Cell[][] = d.payments
    .filter((p) => inRange(p.date, from, to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((p) => {
      const ro = roById.get(p.roId)
      return [p.date, ro?.number ?? '', name(ro?.customerId ?? null), p.method, p.amount, p.reference, p.note]
    })

  const laborRows: Cell[][] = d.labor
    .filter((l) => l.timerStart == null && inRange(l.date, from, to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((l) => {
      const ro = roById.get(l.roId)
      const job = l.jobId ? d.jobs.find((j) => j.id === l.jobId) : undefined
      const u = l.userId ? ix.users.get(l.userId) : undefined
      return [l.date, ro?.number ?? '', job?.title ?? '', u?.name ?? '', l.hours, round2(l.hours * hourlyCost(d.settings, u)), l.note]
    })

  const partRows: Cell[][] = []
  for (const ro of completed) {
    const b = ix.bundle(ro.id)
    const approved = new Set(b.jobs.filter((j) => j.status === 'approved').map((j) => j.id))
    for (const l of b.lines) {
      if (!approved.has(l.jobId) || (l.kind !== 'part' && l.kind !== 'sublet')) continue
      partRows.push([ro.completedAt, ro.number, l.kind === 'sublet' ? 'Sublet' : 'Part', l.partNumber, l.description, l.qty, l.cost, l.price, lineCost(l), lineAmount(l)])
    }
  }

  const monthRows: Cell[][] = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, a]) => [
      m, a.cars, r(a.labor), r(a.parts), r(a.other), r(a.discount), r(a.sales), r(a.tax), r(a.partsCost), r(a.laborCost), r(a.gp),
      a.sales > 0 ? round2(a.gp / a.sales) : 0, a.cars ? r(a.sales / a.cars) : 0, r(a.hours), a.hours > 0 ? r((a.sales - a.partsCost) / a.hours) : 0, r(a.unpaid),
    ])

  return {
    from, to,
    tables: [
      {
        name: 'Invoices',
        headers: ['Completed', 'RO #', 'Customer', 'Vehicle', 'Labor', 'Parts', 'Fees + sublet', 'Shop supplies', 'Discount', 'Subtotal', 'Sales tax',
          'Total', 'Paid', 'Balance', 'Status', 'Parts + sublet cost', 'Labor + overhead cost', 'Gross profit', 'GP %', 'Hours', 'Effective $/hr', 'Content score'],
        formats: ['date', 'int', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'text',
          'money', 'money', 'money', 'pct', 'hours', 'money', 'int'],
        rows: invoiceRows,
      },
      { name: 'Payments', headers: ['Date', 'RO #', 'Customer', 'Method', 'Amount', 'Reference', 'Note'], formats: ['date', 'int', 'text', 'text', 'money', 'text', 'text'], rows: paymentRows },
      { name: 'Labor', headers: ['Date', 'RO #', 'Job', 'Tech', 'Hours', 'Labor + overhead cost', 'Note'], formats: ['date', 'int', 'text', 'text', 'hours', 'money', 'text'], rows: laborRows },
      {
        name: 'Parts',
        headers: ['Completed', 'RO #', 'Type', 'Part #', 'Description', 'Qty', 'Unit cost', 'Unit price', 'Cost', 'Sold for'],
        formats: ['date', 'int', 'text', 'text', 'text', 'hours', 'money', 'money', 'money', 'money'],
        rows: partRows,
      },
      {
        name: 'Monthly summary',
        headers: ['Month', 'Car count', 'Labor', 'Parts', 'Fees, sublet, supplies', 'Discounts', 'Sales (pre-tax)', 'Sales tax', 'Parts + sublet cost (COGS)',
          'Labor + overhead cost', 'Gross profit', 'GP %', 'Avg repair order', 'Hours', 'Effective $/hr', 'Unpaid (A/R)'],
        formats: ['text', 'int', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'pct', 'money', 'hours', 'money', 'money'],
        rows: monthRows,
      },
    ],
  }
}

interface Month { cars: number; labor: number; parts: number; other: number; discount: number; sales: number; tax: number; partsCost: number; laborCost: number; gp: number; hours: number; unpaid: number }
const newMonth = (): Month => ({ cars: 0, labor: 0, parts: 0, other: 0, discount: 0, sales: 0, tax: 0, partsCost: 0, laborCost: 0, gp: 0, hours: 0, unpaid: 0 })
const r = round2

/** RFC 4180 CSV for one table. */
export function toCsv(t: Table): string {
  const esc = (c: Cell) => {
    const s = String(c ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [t.headers, ...t.rows].map((row) => row.map(esc).join(',')).join('\r\n') + '\r\n'
}
