import type { ContentScores, Job, LaborEntry, Part, Settings } from './types'
import { RISK_FLAGS } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Shop cost of one hour of labor: what the tech costs plus the overhead that hour carries. */
export const hourlyCost = (s: Settings) => s.techCost + s.overheadPerHour

export const partsChargedFromCost = (cost: number, s: Settings) => round2(cost * (1 + s.partsMarkupPct / 100))

export function contentScore(c: ContentScores): number {
  return Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0)
}

export interface Estimate {
  laborRevenue: number
  partsRevenue: number
  partsCost: number
  revenue: number
  hours: number
  profit: number
  effectiveHourly: number | null
}

/** What the job should look like if it goes to plan. */
export function estimate(job: Job, s: Settings, hoursOverride?: number): Estimate {
  const hours = hoursOverride ?? job.estHours
  const laborRevenue = job.quoteType === 'flat' ? job.quotedPrice : job.estHours * s.laborRate
  const partsCost = job.estPartsCost
  const partsRevenue = job.riskFlags.includes('customerParts') ? 0 : partsChargedFromCost(partsCost, s)
  const ownPartsCost = job.riskFlags.includes('customerParts') ? 0 : partsCost
  const revenue = laborRevenue + partsRevenue
  const profit = revenue - ownPartsCost - hours * hourlyCost(s)
  return {
    laborRevenue: round2(laborRevenue),
    partsRevenue: round2(partsRevenue),
    partsCost: round2(ownPartsCost),
    revenue: round2(revenue),
    hours,
    profit: round2(profit),
    effectiveHourly: hours > 0 ? round2((revenue - ownPartsCost) / hours) : null,
  }
}

export interface Actuals {
  hours: number
  laborRevenue: number
  partsRevenue: number
  partsCost: number
  revenue: number
  profit: number
  effectiveHourly: number | null
  /** Positive = took longer than estimated. */
  variancePct: number | null
}

/** What the job has actually done so far, from logged labor and parts. */
export function actuals(job: Job, labor: LaborEntry[], parts: Part[], s: Settings): Actuals {
  const hours = round2(labor.reduce((a, l) => a + (l.hours || 0), 0))
  const laborRevenue = job.quoteType === 'flat' ? job.quotedPrice : hours * s.laborRate
  const partsRevenue = parts.reduce((a, p) => a + (p.charged || 0), 0)
  const partsCost = parts.reduce((a, p) => a + (p.cost || 0), 0)
  const revenue = laborRevenue + partsRevenue
  const profit = revenue - partsCost - hours * hourlyCost(s)
  return {
    hours,
    laborRevenue: round2(laborRevenue),
    partsRevenue: round2(partsRevenue),
    partsCost: round2(partsCost),
    revenue: round2(revenue),
    profit: round2(profit),
    effectiveHourly: hours > 0 ? round2((revenue - partsCost) / hours) : null,
    variancePct: job.estHours > 0 && hours > 0 ? round2(((hours - job.estHours) / job.estHours) * 100) : null,
  }
}

export type Tint = 'good' | 'warn' | 'bad' | 'none'

/** Green at or above target, amber inside the Maybe band, red below it. */
export function hourlyTint(effHourly: number | null, s: Settings): Tint {
  if (effHourly == null) return 'none'
  if (effHourly >= s.targetHourly) return 'good'
  if (effHourly >= s.targetHourly * (1 - s.maybeBandPct / 100)) return 'warn'
  return 'bad'
}

export type VerdictLevel = 'Take' | 'Maybe' | 'Pass'
export interface Reason {
  tone: 'good' | 'bad' | 'neutral'
  text: string
}
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
 * Should I take it?
 * 1. Risk flags pad the hours (each flag adds riskPenaltyPct), the way a shop pads a quote.
 * 2. Projected effective $/hr on those padded hours vs target: at/above = Take, inside the band = Maybe, below = Pass.
 * 3. Three or more risk flags drop it one level.
 * 4. A strong content score lifts it one level, unless the job loses money.
 * 5. A job projected to lose money is always Pass.
 */
export function verdict(job: Job, s: Settings): Verdict {
  const cScore = contentScore(job.content)
  const flags = job.riskFlags
  const projectedHours = round2(job.estHours * (1 + (flags.length * s.riskPenaltyPct) / 100))
  const est = estimate(job, s, projectedHours)
  const base = { projectedHours, projectedHourly: est.effectiveHourly, projectedProfit: est.profit, contentScore: cScore }

  if (!(job.estHours > 0)) {
    return { ...base, level: null, reasons: [{ tone: 'neutral', text: 'Enter estimated hours to get a verdict.' }] }
  }
  if (job.quoteType === 'flat' && !(job.quotedPrice > 0)) {
    return { ...base, level: null, reasons: [{ tone: 'neutral', text: 'Enter the quoted price to get a verdict.' }] }
  }

  const reasons: Reason[] = []
  const eff = est.effectiveHourly ?? 0
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
      text: `${flags.length} risk flag${flags.length > 1 ? 's' : ''} pad the job to ${projectedHours} hrs (from ${job.estHours}): ${flags
        .map((f) => RISK_FLAGS[f].toLowerCase())
        .join('; ')}.`,
    })
  }
  if (flags.length >= 3 && idx > 0) {
    idx -= 1
    reasons.push({ tone: 'bad', text: 'Three or more risks: dropped one level.' })
  }

  if (est.profit <= 0) {
    reasons.push({ tone: 'bad', text: `Projected to lose money (${money(est.profit)}).` })
    return { ...base, level: 'Pass', reasons }
  }
  reasons.push({ tone: 'good', text: `Projected profit ${money(est.profit)} after parts, labor and overhead.` })

  if (cScore >= s.contentBumpScore) {
    if (idx < 2) {
      idx += 1
      reasons.push({ tone: 'good', text: `Content score ${cScore}/10: worth filming, raised one level.` })
    } else {
      reasons.push({ tone: 'good', text: `Content score ${cScore}/10: film this one.` })
    }
  } else if (cScore > 0) {
    reasons.push({ tone: 'neutral', text: `Content score ${cScore}/10.` })
  }

  return { ...base, level: LEVELS[idx], reasons }
}
