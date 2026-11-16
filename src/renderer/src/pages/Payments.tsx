import { useState } from 'react'
import { useNav } from '../App'
import { useData } from '../store'
import { daysAgo, Empty, fmtDate, fmtMoney, Pill, Tabs, todayIso } from '../ui'
import { PaymentModal } from '../ro/Modals'
import { vehicleName } from '../../../shared/bundle'

const BUCKETS = ['0–30 days', '31–60 days', '61–90 days', '90+ days']
const bucketOf = (age: number) => (age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3)

export function Payments() {
  const { data, ix } = useData()
  const nav = useNav()
  const [tab, setTab] = useState<'ar' | 'payments'>('ar')
  const [paying, setPaying] = useState<number | null>(null)
  const [from, setFrom] = useState(todayIso().slice(0, 8) + '01')
  const [to, setTo] = useState(todayIso())

  const ar = data.ros.filter((r) => r.status === 'completed' && ix.totals(r.id).totals.balance > 0.005)
    .map((r) => ({ r, bal: ix.totals(r.id).totals.balance, age: daysAgo(r.completedAt) })).sort((a, b) => b.age - a.age)
  const aging = [0, 0, 0, 0]
  ar.forEach((x) => (aging[bucketOf(x.age)] += x.bal))
  const pays = data.payments.filter((p) => p.date >= from && p.date <= to).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const byMethod = pays.reduce<Record<string, number>>((m, p) => ({ ...m, [p.method]: (m[p.method] ?? 0) + p.amount }), {})

  return (
    <div className="page">
      <div className="page-head"><h1>Payments & A/R</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['ar', `Accounts receivable (${ar.length})`], ['payments', 'Payments received']]} />
      {tab === 'ar' ? (
        <>
          <div className="kpis" style={{ marginBottom: 16 }}>
            {BUCKETS.map((b, i) => <div key={b} className="kpi"><span className="label">{b}</span><span className={`value ${i >= 2 && aging[i] ? 'neg' : ''}`}>{fmtMoney(aging[i], false)}</span><span className="sub">{ar.filter((x) => bucketOf(x.age) === i).length} invoices</span></div>)}
          </div>
          <section className="card flush">
            {ar.length === 0 ? <Empty text="Nobody owes you anything. Nice." /> : (
              <table>
                <thead><tr><th>Customer</th><th>RO</th><th>Vehicle</th><th>Invoiced</th><th>Age</th><th className="n">Balance</th><th /></tr></thead>
                <tbody>{ar.map(({ r, bal, age }) => (
                  <tr key={r.id}>
                    <td>{ix.customers.get(r.customerId ?? -1)?.name ?? '—'}</td>
                    <td><button className="link mono" onClick={() => nav({ page: 'ro', id: r.id })}>{r.number}</button></td>
                    <td className="small">{vehicleName(ix.vehicles.get(r.vehicleId ?? -1))}</td>
                    <td>{fmtDate(r.completedAt)}</td>
                    <td><Pill word={`${age} d`} cls={['p-slate', 'p-amber', 'p-red', 'p-red'][bucketOf(age)]} /></td>
                    <td className="n strong">{fmtMoney(bal)}</td>
                    <td className="n"><button className="btn sm primary" onClick={() => setPaying(r.id)}>Take payment</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 12 }}>
            <input type="date" className="sm" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><span className="muted">to</span>
            <input type="date" className="sm" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            <span className="grow" />
            {Object.entries(byMethod).map(([m, v]) => <span key={m} className="chip">{m} {fmtMoney(v, false)}</span>)}
            <b className="num">Total {fmtMoney(pays.reduce((a, p) => a + p.amount, 0))}</b>
          </div>
          <section className="card flush">
            {pays.length === 0 ? <Empty text="No payments in this range." /> : (
              <table>
                <thead><tr><th>Date</th><th>RO</th><th>Customer</th><th>Method</th><th>Reference</th><th className="n">Amount</th></tr></thead>
                <tbody>{pays.map((p) => {
                  const r = data.ros.find((x) => x.id === p.roId)
                  return (
                    <tr key={p.id} className="click" onClick={() => r && nav({ page: 'ro', id: r.id, tab: 'payments' })}>
                      <td>{fmtDate(p.date)}</td><td className="mono">{r?.number}</td><td>{ix.customers.get(r?.customerId ?? -1)?.name}</td><td>{p.method}</td><td className="muted">{p.reference || p.note}</td><td className="n">{fmtMoney(p.amount)}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
          </section>
        </>
      )}
      {paying && <PaymentModal roId={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}
