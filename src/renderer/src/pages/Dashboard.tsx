import { useNav } from '../App'
import { monthOf, OPEN_STATUSES, startOfWeek, todayIso, useJobRows } from '../derive'
import { useStore } from '../store'
import { Empty, fmtHours, fmtMoney, Hourly, Money, StatusPill, vehicleOf } from '../ui'
import { hourlyTint } from '../../../shared/calc'
import { JOB_STATUSES } from '../../../shared/types'

export function Dashboard() {
  const { data } = useStore()
  const rows = useJobRows(data)
  const nav = useNav()
  if (!data) return null
  const s = data.settings

  const open = rows.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.job.status))
  const week = startOfWeek()
  const hoursWeek = data.labor.filter((l) => l.date >= week && l.date <= todayIso()).reduce((a, l) => a + l.hours, 0)

  const month = monthOf(todayIso())
  const doneThisMonth = rows.filter((r) => (r.job.status === 'Done' || r.job.status === 'Paid') && monthOf(r.job.finishedAt || '') === month)
  const actualProfit = doneThisMonth.reduce((a, r) => a + r.act.profit, 0)
  const estProfit = doneThisMonth.reduce((a, r) => a + r.est.profit, 0)

  // Effective $/hr across everything finished in the last 90 days, weighted by hours.
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const recent = rows.filter((r) => (r.job.status === 'Done' || r.job.status === 'Paid') && (r.job.finishedAt || '') >= since && r.act.hours > 0)
  const recentHours = recent.reduce((a, r) => a + r.act.hours, 0)
  const avgHourly = recentHours > 0 ? recent.reduce((a, r) => a + (r.act.revenue - r.act.partsCost), 0) / recentHours : null

  const unposted = rows
    .filter((r) => r.content >= 5 && r.posts.length === 0 && r.job.status !== 'Declined' && r.job.status !== 'Lead')
    .sort((a, b) => b.content - a.content)
    .slice(0, 5)
  const counts = Object.fromEntries(JOB_STATUSES.map((st) => [st, rows.filter((r) => r.job.status === st).length]))

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty
            text="No jobs yet. Price up your first job to see if it's worth taking."
            action={<button className="btn primary" onClick={() => nav({ page: 'new' })}>+ New job</button>}
          />
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="label">Open jobs</span>
              <span className="value">{open.length}</span>
              <span className="sub">
                {OPEN_STATUSES.map((st) => `${counts[st]} ${st.toLowerCase()}`).join(' · ')}
              </span>
            </div>
            <div className="kpi">
              <span className="label">Hours this week</span>
              <span className="value">{fmtHours(hoursWeek)}</span>
              <span className="sub">Logged since Monday</span>
            </div>
            <div className="kpi">
              <span className="label">Profit this month</span>
              <span className="value"><Money v={actualProfit} /></span>
              <span className="sub">
                {doneThisMonth.length} job{doneThisMonth.length === 1 ? '' : 's'} finished · estimated {fmtMoney(estProfit)}
              </span>
            </div>
            <div className="kpi">
              <span className="label">Effective $/hr</span>
              <span className="value"><Hourly v={avgHourly == null ? null : Math.round(avgHourly)} tint={hourlyTint(avgHourly, s)} /></span>
              <span className="sub">Last 90 days · target {fmtMoney(s.targetHourly)}/h</span>
            </div>
          </div>

          <div className="row wrap" style={{ marginBottom: 16 }}>
            {JOB_STATUSES.map((st) => (
              <button key={st} className="btn" style={{ height: 36 }} onClick={() => nav({ page: 'jobs', status: st })}>
                <StatusPill s={st} /> <span className="num">{counts[st]}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <section className="card flush">
              <div className="card-head"><h2>In the shop</h2><span className="small muted">Hours logged vs estimate</span></div>
              {open.length === 0 ? (
                <Empty text="Nothing in the shop right now." />
              ) : (
                <table>
                  <thead>
                    <tr><th>Job</th><th>Status</th><th className="n">Hours</th><th className="n">Profit</th><th className="n">$/hr</th></tr>
                  </thead>
                  <tbody>
                    {open.map((r) => (
                      <tr key={r.job.id} className="click" onClick={() => nav({ page: 'job', id: r.job.id })}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.job.title}</div>
                          <div className="small muted">{[r.job.customerName, vehicleOf(r.job)].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td><StatusPill s={r.job.status} /></td>
                        <td className={`n ${r.act.hours > r.job.estHours && r.job.estHours > 0 ? 'tint-warn' : ''}`}>
                          {fmtHours(r.act.hours)} / {fmtHours(r.job.estHours)}
                        </td>
                        <td className="n"><Money v={r.profit} />{r.profitIsEstimate && <span className="small muted"> est</span>}</td>
                        <td className="n"><Hourly v={r.hourly} tint={r.tint} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card flush">
              <div className="card-head"><h2>Film these</h2><span className="small muted">Score 5+, not posted yet</span></div>
              {unposted.length === 0 ? (
                <Empty text="No unposted jobs with a content score of 5 or more." />
              ) : (
                <table>
                  <tbody>
                    {unposted.map((r) => (
                      <tr key={r.job.id} className="click" onClick={() => nav({ page: 'job', id: r.job.id, tab: 'content' })}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.job.title}</div>
                          <div className="small muted">{vehicleOf(r.job) || r.job.customerName}</div>
                        </td>
                        <td className="n" style={{ fontWeight: 650 }}>{r.content}/10</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
