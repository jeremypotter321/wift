import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { Avatar, daysAgo, Empty, fmtHours, fmtMoney, fmtTime, RoPill, todayIso } from '../ui'
import { hoursBetween } from '../../../shared/calc'
import { vehicleName } from '../../../shared/bundle'

const dateOf = (iso: string) => iso.slice(0, 10)

export function Dashboard() {
  const { data, ix, act, can, user } = useData()
  const nav = useNav()
  const today = todayIso()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
  const lastWeekDay = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`

  const dayStats = (d: string) => {
    const done = data.ros.filter((r) => r.status === 'completed' && r.completedAt === d)
    const sales = done.reduce((a, r) => a + ix.totals(r.id).totals.subtotal, 0)
    const gp = done.reduce((a, r) => a + ix.totals(r.id).totals.grossProfit, 0)
    return { cars: done.length, sales, aro: done.length ? sales / done.length : 0, gp: sales ? (gp / sales) * 100 : null }
  }
  const T = dayStats(today)
  const L = dayStats(lastWeekDay)
  const delta = (a: number, b: number, money = true) => {
    const d = a - b
    if (!d) return 'Same as last week'
    return `${d > 0 ? '▲' : '▼'} ${money ? fmtMoney(Math.abs(d), false) : Math.abs(Math.round(d))} vs same day last week`
  }

  const appts = data.appointments.filter((a) => dateOf(a.start) === today && a.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start))
  const open = data.ros.filter((r) => r.status !== 'completed')
  const stages = [
    ['Estimates', open.filter((r) => r.status === 'estimate').length],
    ['In progress', open.filter((r) => r.status === 'wip' && !/Waiting/.test(r.stage)).length],
    ['Waiting on parts / sublet', open.filter((r) => r.status === 'wip' && /Waiting/.test(r.stage)).length],
    ['Ready for pickup', data.ros.filter((r) => r.status === 'completed' && !r.pickedUpAt).length],
  ] as const
  const wipValue = open.filter((r) => r.status === 'wip').reduce((a, r) => a + ix.totals(r.id).totals.total, 0)
  const waiting = data.ros.filter((r) => r.status === 'wip' && r.stage === 'Waiting on parts')
  const clockedIn = data.punches.filter((p) => !p.clockOut)
  const promisedToday = open.filter((r) => r.promisedAt && dateOf(r.promisedAt) === today)

  return (
    <div className="page">
      <div className="page-head"><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name.split(' ')[0]}</h1></div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        {can.prices && <div className="kpi"><span className="label">Today's sales</span><span className="value">{fmtMoney(T.sales, false)}</span><span className="sub">{delta(T.sales, L.sales)}</span></div>}
        <div className="kpi"><span className="label">Car count</span><span className="value">{T.cars}</span><span className="sub">{delta(T.cars, L.cars, false)}</span></div>
        {can.prices && <div className="kpi"><span className="label">Avg repair order</span><span className="value">{fmtMoney(T.aro, false)}</span><span className="sub">{delta(T.aro, L.aro)}</span></div>}
        {can.profitReports ? (
          <div className="kpi"><span className="label">Gross profit %</span><span className="value">{T.gp == null ? '—' : `${Math.round(T.gp)}%`}</span><span className="sub">{L.gp == null ? 'No sales same day last week' : `Same day last week ${Math.round(L.gp)}%`}</span></div>
        ) : (
          <div className="kpi"><span className="label">Promised today</span><span className="value">{promisedToday.length}</span><span className="sub">{promisedToday.filter((r) => new Date(r.promisedAt) < new Date()).length} late</span></div>
        )}
      </div>

      <div className="split" style={{ marginBottom: 16 }}>
        <section className="card flush">
          <div className="card-head"><h2>Today's appointments</h2><button className="btn sm" onClick={() => nav({ page: 'appointments' })}>Calendar</button></div>
          {appts.length === 0 ? <Empty text="No appointments today." action={<button className="btn sm" onClick={() => nav({ page: 'appointments' })}>Add appointment</button>} /> : (
            <table><tbody>{appts.map((a) => {
              const c = a.customerId ? ix.customers.get(a.customerId) : null
              const v = a.vehicleId ? ix.vehicles.get(a.vehicleId) : null
              const ro = a.roId ? data.ros.find((r) => r.id === a.roId) : null
              return (
                <tr key={a.id}>
                  <td style={{ width: 80 }} className="num strong">{fmtTime(a.start)}</td>
                  <td><b>{c?.name ?? a.title}</b><div className="small muted">{vehicleName(v)} · {a.title}</div></td>
                  <td className="small muted">{a.dropOff ? '⇣ Drop-off' : '◔ Waiting'}</td>
                  <td className="n">{ro ? <button className="link" onClick={() => nav({ page: 'ro', id: ro.id })}><RoPill ro={ro} /></button>
                    : can.prices && <button className="btn sm" onClick={async () => { const r = await act(() => api.createRo({ customerId: a.customerId, vehicleId: a.vehicleId, concern: a.title, appointmentId: a.id })); if (r) nav({ page: 'ro', id: r.id }) }}>Start RO</button>}</td>
                </tr>
              )
            })}</tbody></table>
          )}
        </section>
        <section className="card flush">
          <div className="card-head"><h2>Shop now</h2>{can.prices && <span className="small muted">{fmtMoney(wipValue, false)} in work</span>}</div>
          <table><tbody>
            {stages.map(([label, n]) => (
              <tr key={label} className="click" onClick={() => nav({ page: 'board' })}><td>{label}</td><td className="n strong num">{n}</td></tr>
            ))}
          </tbody></table>
        </section>
      </div>

      <div className="split">
        <section className="card flush">
          <div className="card-head"><h2>Waiting on parts</h2><button className="btn sm" onClick={() => nav({ page: 'pos' })}>Purchase orders</button></div>
          {waiting.length === 0 ? <Empty text="No cars waiting on parts." /> : (
            <table>
              <thead><tr><th>RO</th><th>Vehicle</th><th>Order</th><th className="n">Waiting</th></tr></thead>
              <tbody>{waiting.map((r) => {
                const po = data.pos.find((p) => p.roId === r.id && p.status !== 'received' && p.status !== 'cancelled')
                const vendor = po?.vendorId ? data.vendors.find((v) => v.id === po.vendorId) : null
                const days = daysAgo(po?.orderedAt || r.startedAt)
                return (
                  <tr key={r.id} className="click" onClick={() => nav({ page: 'ro', id: r.id })}>
                    <td className="mono">{r.number}</td><td>{vehicleName(r.vehicleId ? ix.vehicles.get(r.vehicleId) : null)}</td>
                    <td className="small">{po ? `PO ${po.number} · ${vendor?.name ?? ''} · ${po.status}` : <span className="muted">No PO</span>}</td>
                    <td className={`n ${days > 2 ? 'tint-warn strong' : ''}`}>{days} day{days === 1 ? '' : 's'}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          )}
        </section>
        <section className="card flush">
          <div className="card-head"><h2>Clocked in</h2><button className="btn sm" onClick={() => nav({ page: 'timeclock' })}>Time clock</button></div>
          {clockedIn.length === 0 ? <Empty text="Nobody is clocked in." /> : (
            <table><tbody>{clockedIn.map((p) => {
              const u = data.users.find((x) => x.id === p.userId)
              const job = data.labor.find((l) => l.userId === p.userId && l.timerStart)
              const ro = job ? data.ros.find((r) => r.id === job.roId) : null
              return (
                <tr key={p.id}>
                  <td style={{ width: 36 }}><Avatar u={u} sm /></td>
                  <td><b>{u?.name}</b><div className="small muted">In since {fmtTime(p.clockIn)}</div></td>
                  <td className="small">{ro ? <button className="link" onClick={() => nav({ page: 'ro', id: ro.id })}>RO {ro.number}</button> : <span className="muted">No job clock</span>}</td>
                  <td className="n num">{fmtHours(hoursBetween(p.clockIn, new Date().toISOString()))}</td>
                </tr>
              )
            })}</tbody></table>
          )}
        </section>
      </div>
    </div>
  )
}
