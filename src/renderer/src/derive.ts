import { useMemo } from 'react'
import { actuals, contentScore, estimate, hourlyTint, type Actuals, type Estimate, type Tint } from '../../shared/calc'
import type { ContentPost, Job, LaborEntry, Part } from '../../shared/types'
import type { Snapshot } from './store'

export interface JobRow {
  job: Job
  labor: LaborEntry[]
  parts: Part[]
  posts: ContentPost[]
  est: Estimate
  act: Actuals
  /** Actual $/hr once hours are logged, otherwise the estimate. */
  hourly: number | null
  hourlyIsEstimate: boolean
  tint: Tint
  profit: number
  profitIsEstimate: boolean
  content: number
}

export const OPEN_STATUSES = ['Accepted', 'In progress', 'Waiting on parts'] as const

export function useJobRows(data: Snapshot | null): JobRow[] {
  return useMemo(() => {
    if (!data) return []
    const by = <T extends { jobId: number }>(xs: T[]) => {
      const m = new Map<number, T[]>()
      for (const x of xs) m.set(x.jobId, [...(m.get(x.jobId) ?? []), x])
      return m
    }
    const L = by(data.labor)
    const P = by(data.parts)
    const C = by(data.posts)
    return data.jobs.map((job) => {
      const labor = L.get(job.id) ?? []
      const parts = P.get(job.id) ?? []
      const est = estimate(job, data.settings)
      const act = actuals(job, labor, parts, data.settings)
      const started = act.hours > 0
      const hourly = started ? act.effectiveHourly : est.effectiveHourly
      return {
        job, labor, parts, posts: C.get(job.id) ?? [], est, act, hourly, hourlyIsEstimate: !started,
        tint: hourlyTint(hourly, data.settings), profit: started ? act.profit : est.profit, profitIsEstimate: !started,
        content: contentScore(job.content),
      }
    })
  }, [data])
}

export const todayIso = () => new Date().toISOString().slice(0, 10)
export function startOfWeek(): string {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}
export const monthOf = (iso: string) => iso.slice(0, 7)
