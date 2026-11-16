import type { ContentScores, Customer, LaborEntry, Payment, RepairOrder, RoJob, RoLine, Settings, User } from './types'
import { RISK_FLAGS } from './types'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Customer price for a part from the parts pricing matrix (markup falls as cost rises). */
export function matrixPrice(cost: number, s: Settings): number {
  if (!(cost > 0)) return 0
  const tiers = [...s.partsMatrix].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity))
  const tier = tiers.find((t) => t.upTo == null || cost <= t.upTo) ?? tiers[tiers.length - 1]
  return round2(cost * (1 + (tier?.markupPct ?? 0) / 100))
}
export function matrixMarkupPct(cost: number, s: Settings): number {
  const tiers = [...s.partsMatrix].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity))
  return (tiers.find((t) => t.upTo == null || cost <= t.upTo) ?? tiers[tiers.length - 1])?.markupPct ?? 0
}

export const laborRate = (id: string, s: Settings) =>
  (s.laborRates.find((r) => r.id === id) ?? s.laborRates.find((r) => r.id === s.defaultLaborRateId) ?? s.laborRates[0])?.rate ?? 0

/** Shop cost of one hour of labor: what the tech costs plus the overhead that hour carries. */
export const hourlyCost = (s: Settings, user?: User | null) => (user?.hourlyCost || s.techCost) + s.overheadPerHour

/** Signed customer amount of one line (discount lines are negative). */
export const lineAmount = (l: RoLine) => round2((l.kind === 'discount' ? -1 : 1) * l.qty * l.price)
export const lineCost = (l: RoLine) => (l.kind === 'labor' || l.kind === 'discount' ? 0 : round2(l.qty * l.cost))

export function contentScore(c: ContentScores): number {
  return Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0)
}

export interface RoTotals {
  labor: number
  parts: number
  fees: number
  sublet: number
  discount: number // positive number taken off
  supplies: number
  subtotal: number // before tax
  tax: number
  total: number
  paid: number
  balance: number
  soldHours: number
  clockedHours: number
  partsCost: number
  subletCost: number
  feesCost: number
  laborCost: number
  grossProfit: number
  gpPct: number | null
  partsGpPct: number | null
  laborGpPct: number | null
  effectiveHourly: number | null
  pendingTotal: number // pending jobs not yet approved (pre-tax)
  declinedTotal: number
}

export interface RoBundle {
  ro: RepairOrder
  jobs: RoJob[]
  lines: RoLine[]
  labor: LaborEntry[]
  payments: Payment[]
  customer?: Customer | null
}

/** Which jobs count toward the bill: on an estimate, everything not declined; after that, approved only. */
export const countsToward = (ro: RepairOrder, j: RoJob) => (ro.status === 'estimate' ? j.status !== 'declined' : j.status === 'approved')

export function roTotals(b: RoBundle, s: Settings, users: User[] = []): RoTotals {
  const { ro } = b
  const included = new Set(b.jobs.filter((j) => countsToward(ro, j)).map((j) => j.id))
  const sumJobs = (status: RoJob['status']) =>
    b.lines.filter((l) => b.jobs.some((j) => j.id === l.jobId && j.status === status)).reduce((a, l) => a + lineAmount(l), 0)
  const lines = b.lines.filter((l) => included.has(l.jobId))
  const sum = (k: RoLine['kind'], f: (l: RoLine) => number) => lines.filter((l) => l.kind === k).reduce((a, l) => a + f(l), 0)

  const labor = sum('labor', lineAmount)
  const parts = sum('part', lineAmount)
  const fees = sum('fee', lineAmount)
  const sublet = sum('sublet', lineAmount)
  const lineDiscount = -sum('discount', lineAmount)
  const roDiscount = ((labor + parts) * (ro.discountPct || 0)) / 100
  const discount = round2(lineDiscount + roDiscount)
  const supplies = round2(
    ro.suppliesOverride != null ? ro.suppliesOverride : Math.min((labor * s.shopSuppliesPct) / 100, s.shopSuppliesCap > 0 ? s.shopSuppliesCap : Infinity),
  )
  const subtotal = round2(labor + parts + fees + sublet + supplies - discount)

  // Tax: discount reduces labor and parts proportionally. Tax-exempt customers pay none.
  const discShare = labor + parts > 0 ? 1 - discount / (labor + parts) : 1
  const taxableParts = sum('part', (l) => (l.taxable ? lineAmount(l) : 0)) + sum('sublet', (l) => (l.taxable ? lineAmount(l) : 0))
  const taxableLabor = sum('labor', (l) => (l.taxable ? lineAmount(l) : 0))
  const taxableFees = sum('fee', (l) => (l.taxable ? lineAmount(l) : 0)) + supplies
  const tax = b.customer?.taxExempt
    ? 0
    : round2(
        (taxableParts * Math.max(0, discShare) * s.partsTaxPct) / 100 +
          (taxableLabor * Math.max(0, discShare) * s.laborTaxPct) / 100 +
          (taxableFees * s.feesTaxPct) / 100,
      )
  const total = round2(subtotal + tax)
  const paid = round2(b.payments.reduce((a, p) => a + p.amount, 0))

  const soldHours = round2(sum('labor', (l) => l.qty))
  const clockedHours = round2(b.labor.reduce((a, e) => a + (e.hours || 0), 0))
  const hours = clockedHours > 0 ? clockedHours : soldHours
  const partsCost = round2(sum('part', lineCost))
  const subletCost = round2(sum('sublet', lineCost))
  const feesCost = round2(sum('fee', lineCost))
  // Labor cost: clocked time at each tech's cost; with nothing clocked, sold hours at the RO tech's cost.
  const userById = new Map(users.map((u) => [u.id, u]))
  const laborCost = round2(
    clockedHours > 0
      ? b.labor.reduce((a, e) => a + e.hours * hourlyCost(s, e.userId ? userById.get(e.userId) : null), 0)
      : soldHours * hourlyCost(s, ro.techId ? userById.get(ro.techId) : null),
  )
  const grossProfit = round2(subtotal - partsCost - subletCost - feesCost - laborCost)
  const afterParts = subtotal - partsCost - subletCost - feesCost

  return {
    labor: round2(labor), parts: round2(parts), fees: round2(fees), sublet: round2(sublet), discount, supplies, subtotal, tax, total, paid,
    balance: round2(total - paid), soldHours, clockedHours, partsCost, subletCost, feesCost, laborCost, grossProfit,
    gpPct: subtotal > 0 ? round2((grossProfit / subtotal) * 100) : null,
    partsGpPct: parts > 0 ? round2(((parts - partsCost) / parts) * 100) : null,
    laborGpPct: labor > 0 ? round2(((labor - laborCost) / labor) * 100) : null,
    effectiveHourly: hours > 0 ? round2(afterParts / hours) : null,
    pendingTotal: round2(ro.status === 'estimate' ? 0 : sumJobs('pending')),
    declinedTotal: round2(sumJobs('declined')),
  }
}

/** What the money side of a completed RO says: paid in full, or on account. */
export function payState(ro: RepairOrder, t: RoTotals): 'Paid' | 'A/R' | null {
  if (ro.status !== 'completed') return null
  return t.balance <= 0.005 ? 'Paid' : 'A/R'
}

export type Tint = 'good' | 'warn' | 'bad' | 'none'
export function hourlyTint(eff: number | null, s: Settings): Tint {
  if (eff == null) return 'none'
  if (eff >= s.targetHourly) return 'good'
  if (eff >= s.targetHourly * (1 - s.maybeBandPct / 100)) return 'warn'
  return 'bad'
}

export type VerdictLevel = 'Take' | 'Maybe' | 'Pass'
export interface Reason { tone: 'good' | 'bad' | 'neutral'; text: string }
export interface Verdict {
  level: VerdictLevel | null
  reasons: Reason[]
  projectedHours: number
  projectedHourly: number | null
  projectedProfit: number
  contentScore: number
}
const LEVELS: VerdictLevel[] = ['Pass', 'Maybe', 'Take']
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/**
 * Should I take it? Judged on the estimate (all jobs not declined).
 * 1. Each risk flag pads the sold hours by riskPenaltyPct, the way a shop pads a quote.
 * 2. Projected effective $/hr on those padded hours vs target: at/above = Take, inside the band = Maybe, below = Pass.
 * 3. Three or more risk flags drop it one level.
 * 4. A strong content score lifts it one level, unless the job loses money.
 * 5. A job projected to lose money is always Pass.
 */
export function verdict(b: RoBundle, s: Settings, users: User[] = []): Verdict {
  const ro = b.ro
  const cScore = contentScore(ro.content)
  const flags = ro.riskFlags
  const asEstimate: RoBundle = { ...b, ro: { ...ro, status: 'estimate' }, labor: [] }
  const t = roTotals(asEstimate, s, users)
  const projectedHours = round2(t.soldHours * (1 + (flags.length * s.riskPenaltyPct) / 100))
  const cost = hourlyCost(s, ro.techId ? users.find((u) => u.id === ro.techId) : null)
  const afterParts = t.subtotal - t.partsCost - t.subletCost - t.feesCost
  const projectedProfit = round2(afterParts - projectedHours * cost)
  const projectedHourly = projectedHours > 0 ? round2(afterParts / projectedHours) : null
  const base = { projectedHours, projectedHourly, projectedProfit, contentScore: cScore }

  if (!(t.soldHours > 0)) return { ...base, level: null, reasons: [{ tone: 'neutral', text: 'Add labor hours to a job to get a verdict.' }] }
  if (!(t.subtotal > 0)) return { ...base, level: null, reasons: [{ tone: 'neutral', text: 'Price the jobs to get a verdict.' }] }

  const reasons: Reason[] = []
  const eff = projectedHourly ?? 0
  const floor = s.targetHourly * (1 - s.maybeBandPct / 100)
  let idx: number
  if (eff >= s.targetHourly) {
    idx = 2
    reasons.push({ tone: 'good', text: `Projected ${money(eff)}/hr meets your ${money(s.targetHourly)}/hr target.` })
  } else if (eff >= floor) {
    idx = 1
    reasons.push({ tone: 'neutral', text: `Projected ${money(eff)}/hr is a bit under your ${money(s.targetHourly)}/hr target.` })
  } else {
    idx = 0
    reasons.push({ tone: 'bad', text: `Projected ${money(eff)}/hr is well under your ${money(s.targetHourly)}/hr target.` })
  }
  if (flags.length > 0) {
    reasons.push({
      tone: 'bad',
      text: `${flags.length} risk flag${flags.length > 1 ? 's' : ''} pad the job to ${projectedHours} hrs (from ${t.soldHours}): ${flags
        .map((f) => RISK_FLAGS[f].toLowerCase())
        .join('; ')}.`,
    })
  }
  if (flags.length >= 3 && idx > 0) {
    idx -= 1
    reasons.push({ tone: 'bad', text: 'Three or more risks: dropped one level.' })
  }
  if (projectedProfit <= 0) {
    reasons.push({ tone: 'bad', text: `Projected to lose money (${money(projectedProfit)}).` })
    return { ...base, level: 'Pass', reasons }
  }
  reasons.push({ tone: 'good', text: `Projected profit ${money(projectedProfit)} after parts, labor and overhead.` })
  if (cScore >= s.contentBumpScore) {
    if (idx < 2) {
      idx += 1
      reasons.push({ tone: 'good', text: `Content score ${cScore}/10: worth filming, raised one level.` })
    } else reasons.push({ tone: 'good', text: `Content score ${cScore}/10: film this one.` })
  } else if (cScore > 0) reasons.push({ tone: 'neutral', text: `Content score ${cScore}/10.` })
  return { ...base, level: LEVELS[idx], reasons }
}

/** Hours between two ISO timestamps (for punches / timers). */
export const hoursBetween = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000)
