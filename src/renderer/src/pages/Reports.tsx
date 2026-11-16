import { useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { csvOf, Empty, fmtDate, fmtHours, fmtMoney, fmtShortDate, localDate, todayIso } from '../ui'
import { hoursBetween, lineAmount, round2 } from '../../../shared/calc'
import { vehicleName } from '../../../shared/bundle'

type ReportKey = 'overview' | 'eod' | 'sales' | 'gp' | 'close' | 'declined' | 'techs' | 'content'
const REPORTS: [ReportKey, string, boolean][] = [
  ['overview', 'Overview', false], ['eod', 'End of day', false], ['sales', 'Sales', false], ['gp', 'Gross profit', true],
  ['close', 'Close ratio', false], ['declined', 'Declined jobs', false], ['techs', 'Tech productivity', true], ['content', 'Content performance', false],
]
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localDate(d) }
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)
function periodOf(p: string): [string, string] {
  const t = todayIso()
  if (p === 'today') return [t, t]
  if (p === 'week') { const d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [localDate(d), t] }
  if (p === 'month') return [t.slice(0, 8) + '01', t]
  if (p === 'year') return [t.slice(0, 5) + '01-01', t]
  return [addDays(t, -29), t]
}

export function Reports() {
  const { data, ix, act, can } = useData()
  const nav = useNav()
  const [rep, setRep] = useState<ReportKey>('overview')
  const [preset, setPreset] = useState('month')
  const [[from, to], setRange] = useState(periodOf('month'))
  const span = daysBetween(from, to) + 1
  const prev: [string, string] = [addDays(from, -span), addDays(from, -1)]

  const stats = (a: string, b: string) => {
    const done = data.ros.filter((r) => r.status === 'completed' && r.completedAt >= a && r.completedAt <= b)
    const T = done.map((r) => ix.totals(r.id).totals)
    const sum = (f: (t: (typeof T)[number]) => number) => round2(T.reduce((x, t) => x + f(t), 0))
    const sales = sum((t) => t.subtotal)
    const gp = sum((t) => t.grossProfit)
    const parts = sum((t) => t.parts), partsCost = sum((t) => t.partsCost)
    const labor = sum((t) => t.labor), laborCost = sum((t) => t.laborCost)
    const hours = sum((t) => t.clockedHours || t.soldHours)
    return {
      done, cars: done.length, sales, aro: done.length ? sales / done.length : 0, gp, gpPct: sales ? (gp / sales) * 100 : null,
      parts, partsGp: parts ? ((parts - partsCost) / parts) * 100 : null, labor, laborGp: labor ? ((labor - laborCost) / labor) * 100 : null,
      tax: sum((t) => t.tax), discount: sum((t) => t.discount), supplies: sum((t) => t.supplies), fees: sum((t) => t.fees + t.sublet),
      soldHours: sum((t) => t.soldHours), effHourly: hours ? (sales - sum((t) => t.partsCost + t.subletCost + t.feesCost)) / hours : null,
    }
  }
  const cur = useMemo(() => stats(from, to), [data, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  const old = useMemo(() => stats(prev[0], prev[1]), [data, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const kpi = (label: string, v: number | null, prevV: number | null, fmt: (n: number) => string, owner = false) => {
    if (owner && !can.profitReports) return null
    const d = v != null && prevV != null ? v - prevV : null
    return (
      <div className="kpi" key={label}>
        <span className="label">{label}</span><span className="value">{v == null ? '—' : fmt(v)}</span>
        <span className="sub">{d == null || !prevV ? 'No prior period to compare' : `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} vs previous ${span} days`}</span>
      </div>
    )
  }
  const pct = (n: number) => `${Math.round(n)}%`
  const money = (n: number) => fmtMoney(n, false)

  let table: { headers: string[]; rows: (string | number)[][]; numeric?: number[]; onRow?: (i: number) => void } = { headers: [], rows: [] }
  let extra: React.ReactNode = null
  if (rep === 'overview' || rep === 'sales') {
    table = {
      headers: ['Completed', 'RO', 'Customer', 'Vehicle', 'Labor', 'Parts', 'Sales (pre-tax)', 'Tax', 'Total'], numeric: [4, 5, 6, 7, 8],
      rows: cur.done.map((r) => { const t = ix.totals(r.id).totals; return [fmtShortDate(r.completedAt), r.number, ix.customers.get(r.customerId ?? -1)?.name ?? '', vehicleName(ix.vehicles.get(r.vehicleId ?? -1)), fmtMoney(t.labor), fmtMoney(t.parts), fmtMoney(t.subtotal), fmtMoney(t.tax), fmtMoney(t.total)] }),
      onRow: (i) => nav({ page: 'ro', id: cur.done[i].id }),
    }
    if (rep === 'sales') extra = <SalesChart from={from} to={to} done={cur.done.map((r) => ({ date: r.completedAt, sales: ix.totals(r.id).totals.subtotal }))} />
  } else if (rep === 'eod') {
    const day = to
    const pays = data.payments.filter((p) => p.date === day)
    const methods = [...new Set(pays.map((p) => p.method))]
    const d = stats(day, day)
    table = {
      headers: ['Line', 'Amount'], numeric: [1],
      rows: [
        ...methods.map((m) => [`Payments: ${m}`, fmtMoney(pays.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0))]),
        ['Payments total', fmtMoney(pays.reduce((a, p) => a + p.amount, 0))], ['ROs closed', d.cars], ['Sales (pre-tax)', fmtMoney(d.sales)], ['Sales tax', fmtMoney(d.tax)],
        ['Open A/R (all time)', fmtMoney(data.ros.filter((r) => r.status === 'completed').reduce((a, r) => a + Math.max(0, ix.totals(r.id).totals.balance), 0))],
      ],
    }
    extra = <p className="small muted">End of day for {fmtDate(day)} (the "to" date).</p>
  } else if (rep === 'gp') {
    table = {
      headers: ['RO', 'Customer', 'Sales', 'Parts GP %', 'Labor GP %', 'Gross profit', 'GP %', '$/hr'], numeric: [2, 3, 4, 5, 6, 7],
      rows: cur.done.map((r) => { const t = ix.totals(r.id).totals; return [r.number, ix.customers.get(r.customerId ?? -1)?.name ?? '', fmtMoney(t.subtotal), t.partsGpPct == null ? '—' : pct(t.partsGpPct), t.laborGpPct == null ? '—' : pct(t.laborGpPct), fmtMoney(t.grossProfit), t.gpPct == null ? '—' : pct(t.gpPct), t.effectiveHourly == null ? '—' : money(t.effectiveHourly)] }),
      onRow: (i) => nav({ page: 'ro', id: cur.done[i].id }),
    }
  } else if (rep === 'close') {
    const ros = data.ros.filter((r) => r.createdAt >= from && r.createdAt <= to)
    const rows = ros.map((r) => {
      const jobs = data.jobs.filter((j) => j.roId === r.id)
      const amt = (st?: string) => jobs.filter((j) => !st || j.status === st).flatMap((j) => data.lines.filter((l) => l.jobId === j.id)).reduce((a, l) => a + lineAmount(l), 0)
      return { r, est: amt(), appr: amt('approved') }
    })
    const est = rows.reduce((a, x) => a + x.est, 0), appr = rows.reduce((a, x) => a + x.appr, 0)
    extra = <p className="strong">Estimated {fmtMoney(est)} · approved {fmtMoney(appr)} · close ratio {est ? pct((appr / est) * 100) : '—'}</p>
    table = { headers: ['RO', 'Created', 'Customer', 'Estimated', 'Approved', 'Close %'], numeric: [3, 4, 5], rows: rows.map((x) => [x.r.number, fmtDate(x.r.createdAt), ix.customers.get(x.r.customerId ?? -1)?.name ?? '', fmtMoney(x.est), fmtMoney(x.appr), x.est ? pct((x.appr / x.est) * 100) : '—']), onRow: (i) => nav({ page: 'ro', id: rows[i].r.id }) }
  } else if (rep === 'declined') {
    const jobs = data.jobs.filter((j) => j.status === 'declined').map((j) => ({ j, r: data.ros.find((r) => r.id === j.roId)! })).filter((x) => x.r && x.r.createdAt >= from && x.r.createdAt <= to)
    table = {
      headers: ['Date', 'Customer', 'Vehicle', 'Job', 'Amount', 'Phone'], numeric: [4],
      rows: jobs.map(({ j, r }) => { const c = ix.customers.get(r.customerId ?? -1); return [fmtDate(r.createdAt), c?.name ?? '', vehicleName(ix.vehicles.get(r.vehicleId ?? -1)), j.title, fmtMoney(data.lines.filter((l) => l.jobId === j.id).reduce((a, l) => a + lineAmount(l), 0)), c?.phone ?? ''] }),
      onRow: (i) => nav({ page: 'ro', id: jobs[i].r.id }),
    }
    extra = <p className="small muted">Declined work is your easiest next sale. Call these customers, or open the RO and start a new one from it.</p>
  } else if (rep === 'techs') {
    const nowIso = new Date().toISOString()
    table = {
      headers: ['Tech', 'Clocked in', 'On job clocks', 'Billed hours', 'Efficiency', 'Productivity', 'Labor sold'], numeric: [1, 2, 3, 4, 5, 6],
      rows: data.users.filter((u) => u.active).map((u) => {
        const clocked = data.punches.filter((p) => p.userId === u.id && p.clockIn.slice(0, 10) >= from && p.clockIn.slice(0, 10) <= to).reduce((a, p) => a + hoursBetween(p.clockIn, p.clockOut || nowIso), 0)
        const onJobs = data.labor.filter((l) => l.userId === u.id && l.date >= from && l.date <= to).reduce((a, l) => a + l.hours, 0)
        const lines = cur.done.flatMap((r) => data.jobs.filter((j) => j.roId === r.id && j.status === 'approved' && (j.techId ?? r.techId) === u.id)).flatMap((j) => data.lines.filter((l) => l.jobId === j.id && l.kind === 'labor'))
        const billed = lines.reduce((a, l) => a + l.qty, 0)
        return [u.name, fmtHours(clocked), fmtHours(onJobs), fmtHours(billed), onJobs ? pct((billed / onJobs) * 100) : '—', clocked ? pct((onJobs / clocked) * 100) : '—', fmtMoney(lines.reduce((a, l) => a + lineAmount(l), 0))]
      }),
    }
    extra = <p className="small muted">Efficiency = billed ÷ job-clock hours (beating book time is over 100%). Productivity = job-clock hours ÷ clocked-in hours.</p>
  } else if (rep === 'content') {
    const rows = data.ros.filter((r) => r.createdAt <= to).map((r) => {
      const posts = data.posts.filter((p) => p.roId === r.id && p.date >= from && p.date <= to)
      return { r, posts, views: posts.reduce((a, p) => a + p.views, 0), likes: posts.reduce((a, p) => a + p.likes, 0), score: Object.values(r.content).reduce((a, b) => a + b, 0) }
    }).filter((x) => x.posts.length).sort((a, b) => b.views - a.views)
    table = { headers: ['RO', 'Vehicle', 'Content score', 'Posts', 'Views', 'Likes'], numeric: [2, 3, 4, 5], rows: rows.map((x) => [x.r.number, vehicleName(ix.vehicles.get(x.r.vehicleId ?? -1)), `${x.score}/10`, x.posts.map((p) => p.platform).join(', '), x.views.toLocaleString(), x.likes.toLocaleString()]), onRow: (i) => nav({ page: 'ro', id: rows[i].r.id }) }
    extra = <p className="small muted">Do higher content scores get more views? Compare the score column to views to tune how you score jobs.</p>
  }

  return (
    <div className="page" style={{ maxWidth: 1440 }}>
      <div className="page-head"><h1>Reports</h1></div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <nav className="card section-nav" style={{ padding: 6 }} aria-label="Reports">
          {REPORTS.filter(([, , owner]) => !owner || can.profitReports).map(([k, label]) => <button key={k} className={`sec-link ${rep === k ? 'on' : ''}`} onClick={() => setRep(k)}>{label}</button>)}
        </nav>
        <div className="stack">
          <div className="row wrap">
            <select className="sm" style={{ width: 160 }} aria-label="Period" value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value) setRange(periodOf(e.target.value)) }}>
              <option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="30">Last 30 days</option><option value="year">This year</option><option value="">Custom</option>
            </select>
            <input type="date" className="sm" style={{ width: 150 }} value={from} onChange={(e) => { setPreset(''); setRange([e.target.value, to]) }} aria-label="From" />
            <span className="muted">to</span>
            <input type="date" className="sm" style={{ width: 150 }} value={to} onChange={(e) => { setPreset(''); setRange([from, e.target.value]) }} aria-label="To" />
            <span className="grow" />
            <button className="btn sm" disabled={!table.rows.length} onClick={() => act(() => api.saveCsv(`${rep}-${from}-to-${to}.csv`, csvOf(table.headers, table.rows)))}>Export CSV</button>
          </div>
          {(rep === 'overview' || rep === 'sales' || rep === 'gp') && (
            <div className="kpis">
              {kpi('Sales (pre-tax)', cur.sales, old.sales, money)}
              {kpi('Car count', cur.cars, old.cars, (n) => String(Math.round(n)))}
              {kpi('Avg repair order', cur.aro, old.aro, money)}
              {rep === 'gp' ? kpi('Effective $/hr', cur.effHourly, old.effHourly, money, true) : kpi('Gross profit %', cur.gpPct, old.gpPct, pct, true)}
              {rep === 'gp' && kpi('Parts GP %', cur.partsGp, old.partsGp, pct, true)}
              {rep === 'gp' && kpi('Labor GP %', cur.laborGp, old.laborGp, pct, true)}
              {rep === 'gp' && kpi('Gross profit', cur.gp, old.gp, money, true)}
              {rep === 'gp' && kpi('Hours sold', cur.soldHours, old.soldHours, (n) => fmtHours(n))}
            </div>
          )}
          {rep === 'sales' && (
            <div className="card">
              <h3>Breakdown</h3>
              <div className="totals" style={{ maxWidth: 420 }}>
                <span>Labor</span><span className="r">{fmtMoney(cur.labor)}</span><span>Parts</span><span className="r">{fmtMoney(cur.parts)}</span>
                <span>Fees & sublet</span><span className="r">{fmtMoney(cur.fees)}</span><span>Shop supplies</span><span className="r">{fmtMoney(cur.supplies)}</span>
                <span>Discounts</span><span className="r">{cur.discount ? `−${fmtMoney(cur.discount)}` : fmtMoney(0)}</span><span className="rule" />
                <span className="big">Net sales</span><span className="big r">{fmtMoney(cur.sales)}</span><span>Sales tax collected</span><span className="r">{fmtMoney(cur.tax)}</span>
              </div>
            </div>
          )}
          {extra}
          <section className="card flush">
            {table.rows.length === 0 ? <Empty text="Nothing in this period." /> : (
              <table>
                <thead><tr>{table.headers.map((h, i) => <th key={h} className={table.numeric?.includes(i) ? 'n' : ''}>{h}</th>)}</tr></thead>
                <tbody>{table.rows.map((r, i) => (
                  <tr key={i} className={table.onRow ? 'click' : ''} onClick={() => table.onRow?.(i)}>{r.map((c, k) => <td key={k} className={table.numeric?.includes(k) ? 'n num' : ''}>{c}</td>)}</tr>
                ))}</tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** One series: sales per day (or per week for long ranges). Bars, 2px gaps, 4px rounded tops, hover tooltip; the table below holds the numbers. */
function SalesChart({ from, to, done }: { from: string; to: string; done: { date: string; sales: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const days = daysBetween(from, to) + 1
  const weekly = days > 45
  const buckets: { label: string; start: string; value: number }[] = []
  for (let d = from; d <= to; d = addDays(d, weekly ? 7 : 1)) {
    const end = weekly ? addDays(d, 6) : d
    buckets.push({ label: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), start: d, value: done.filter((x) => x.date >= d && x.date <= end).reduce((a, x) => a + x.sales, 0) })
  }
  const W = 900, H = 220, L = 56, B = 24, T = 12
  const max = Math.max(1, ...buckets.map((b) => b.value))
  const step = Math.pow(10, Math.floor(Math.log10(max)))
  const top = Math.ceil(max / step) * step
  const ticks = [0, top / 2, top]
  const bw = (W - L) / buckets.length
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const labelEvery = Math.ceil(buckets.length / 10)
  return (
    <div className="card chart">
      <h3>Sales {weekly ? 'per week' : 'per day'} (pre-tax)</h3>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales per ${weekly ? 'week' : 'day'} from ${from} to ${to}`}>
          <g className="grid">{ticks.map((t) => <line key={t} x1={L} x2={W} y1={y(t)} y2={y(t)} />)}</g>
          {ticks.map((t) => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{fmtMoney(t, false)}</text>)}
          {buckets.map((b, i) => {
            const x = L + i * bw + 1
            const w = Math.max(1, bw - 2)
            const h = y(0) - y(b.value)
            const r = Math.min(4, w / 2, h)
            return (
              <g key={b.start} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
                {b.value > 0 && <path d={`M${x},${y(0)} V${y(b.value) + r} Q${x},${y(b.value)} ${x + r},${y(b.value)} H${x + w - r} Q${x + w},${y(b.value)} ${x + w},${y(b.value) + r} V${y(0)} Z`} fill="#1D4ED8" opacity={hover == null || hover === i ? 1 : 0.55} />}
                {i % labelEvery === 0 && <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle">{b.label}</text>}
              </g>
            )
          })}
          <line x1={L} x2={W} y1={y(0)} y2={y(0)} stroke="#94a3b8" />
        </svg>
        {hover != null && (
          <div className="popover" style={{ left: `${((L + hover * bw + bw / 2) / W) * 100}%`, top: 0, transform: 'translateX(-50%)', pointerEvents: 'none', padding: '6px 10px', minWidth: 0 }}>
            <div className="small muted">{weekly ? `Week of ${buckets[hover].label}` : buckets[hover].label}</div><b className="num">{fmtMoney(buckets[hover].value)}</b>
          </div>
        )}
      </div>
    </div>
  )
}
