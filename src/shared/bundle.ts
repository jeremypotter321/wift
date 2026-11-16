import { roTotals, type RoBundle, type RoTotals } from './calc'
import type { Snapshot } from './types'

export type Data = Pick<Snapshot, 'settings' | 'users' | 'customers' | 'vehicles' | 'ros' | 'jobs' | 'lines' | 'labor' | 'payments'>

/** Index a snapshot once so per-RO lookups are cheap. */
export function indexData(d: Data) {
  const group = <T, K>(xs: T[], key: (x: T) => K) => {
    const m = new Map<K, T[]>()
    for (const x of xs) {
      const k = key(x)
      const a = m.get(k)
      if (a) a.push(x)
      else m.set(k, [x])
    }
    return m
  }
  const jobsByRo = group(d.jobs, (j) => j.roId)
  const linesByJob = group(d.lines, (l) => l.jobId)
  const laborByRo = group(d.labor, (l) => l.roId)
  const paysByRo = group(d.payments, (p) => p.roId)
  const customers = new Map(d.customers.map((c) => [c.id, c]))
  const vehicles = new Map(d.vehicles.map((v) => [v.id, v]))
  const users = new Map(d.users.map((u) => [u.id, u]))
  const cache = new Map<number, { bundle: RoBundle; totals: RoTotals }>()

  function bundle(roId: number): RoBundle {
    const ro = d.ros.find((r) => r.id === roId)!
    const jobs = (jobsByRo.get(roId) ?? []).slice().sort((a, b) => a.sort - b.sort || a.id - b.id)
    return {
      ro,
      jobs,
      lines: jobs.flatMap((j) => (linesByJob.get(j.id) ?? []).slice().sort((a, b) => a.sort - b.sort || a.id - b.id)),
      labor: laborByRo.get(roId) ?? [],
      payments: paysByRo.get(roId) ?? [],
      customer: ro.customerId ? customers.get(ro.customerId) ?? null : null,
    }
  }
  function totals(roId: number) {
    let hit = cache.get(roId)
    if (!hit) {
      const b = bundle(roId)
      hit = { bundle: b, totals: roTotals(b, d.settings, d.users) }
      cache.set(roId, hit)
    }
    return hit
  }
  return { bundle, totals, customers, vehicles, users, linesByJob, jobsByRo }
}

export const vehicleName = (v?: { year: string; make: string; model: string } | null) => (v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '')
export const roLabel = (n: number) => `RO ${n}`
