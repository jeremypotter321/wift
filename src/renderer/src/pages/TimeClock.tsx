import { useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { Avatar, csvOf, Empty, fmtHours, fmtTime, localDate, Modal, Seg, todayIso } from '../ui'
import { hoursBetween } from '../../../shared/calc'
import type { User } from '../../../shared/types'

const DAY_START = 7, DAY_END = 19
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localDate(d) }
const startOfWeek = (iso: string) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d) }

export function TimeClock() {
  const { data, act, toast } = useData()
  const [pinFor, setPinFor] = useState<{ u: User; action: 'in' | 'out' } | null>(null)
  const [view, setView] = useState<'day' | 'week'>('day')
  const [day, setDay] = useState(todayIso())
  const users = data.users.filter((u) => u.active)
  const openPunch = (uid: number) => data.punches.find((p) => p.userId === uid && !p.clockOut)

  const doPunch = async (u: User, action: 'in' | 'out') => {
    await act<unknown>(() => (action === 'in' ? api.punchIn(u.id) : api.punchOut(u.id)))
    toast(`${u.name} clocked ${action}`)
  }
  const request = (u: User, action: 'in' | 'out') => (u.pin ? setPinFor({ u, action }) : void doPunch(u, action))

  // Clocked vs billed (sold labor hours on ROs completed that day, credited to the job's tech).
  const stats = (uid: number, from: string, to: string) => {
    const nowIso = new Date().toISOString()
    const clocked = data.punches.filter((p) => p.userId === uid && p.clockIn.slice(0, 10) >= from && p.clockIn.slice(0, 10) <= to)
      .reduce((a, p) => a + hoursBetween(p.clockIn, p.clockOut || nowIso), 0)
    const onJobs = data.labor.filter((l) => l.userId === uid && l.date >= from && l.date <= to).reduce((a, l) => a + l.hours, 0)
    const billed = data.ros.filter((r) => r.status === 'completed' && r.completedAt >= from && r.completedAt <= to)
      .flatMap((r) => data.jobs.filter((j) => j.roId === r.id && j.status === 'approved' && (j.techId ?? r.techId) === uid))
      .flatMap((j) => data.lines.filter((l) => l.jobId === j.id && l.kind === 'labor')).reduce((a, l) => a + l.qty, 0)
    return { clocked, onJobs, billed, eff: onJobs > 0 ? (billed / onJobs) * 100 : null }
  }

  return (
    <div className="page">
      <div className="page-head"><h1>Time clock</h1></div>
      <div className="tiles" style={{ marginBottom: 24 }}>
        {users.map((u) => {
          const p = openPunch(u.id)
          return (
            <div key={u.id} className="tile">
              <div className="row"><Avatar u={u} /><b className="grow">{u.name}</b><span className="small muted" style={{ textTransform: 'capitalize' }}>{u.role}</span></div>
              <div className={p ? 'tint-good strong' : 'muted'}>{p ? `In since ${fmtTime(p.clockIn)}` : 'Out'}</div>
              {p ? <button className="btn danger lg block" onClick={() => request(u, 'out')}>Clock out</button> : <button className="btn primary lg block" onClick={() => request(u, 'in')}>Clock in</button>}
            </div>
          )
        })}
      </div>

      <section className="card flush">
        <div className="card-head">
          <div className="row">
            <h2>Timesheet</h2>
            <Seg options={['day', 'week'] as const} labels={{ day: 'Day', week: 'Week' }} value={view} onChange={setView} />
            <button className="btn sm icon" aria-label="Previous" onClick={() => setDay(addDays(day, view === 'day' ? -1 : -7))}>‹</button>
            <b>{view === 'day' ? new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : `Week of ${new Date(startOfWeek(day) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</b>
            <button className="btn sm icon" aria-label="Next" onClick={() => setDay(addDays(day, view === 'day' ? 1 : 7))}>›</button>
          </div>
          {view === 'week' && <button className="btn sm" onClick={() => {
            const ws = startOfWeek(day)
            const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
            void act(() => api.saveCsv(`timesheet-${ws}.csv`, csvOf(['Tech', ...days, 'Total clocked', 'On jobs', 'Billed'], users.map((u) => {
              const w = stats(u.id, ws, days[6])
              return [u.name, ...days.map((d) => Math.round(stats(u.id, d, d).clocked * 100) / 100), Math.round(w.clocked * 100) / 100, Math.round(w.onJobs * 100) / 100, Math.round(w.billed * 100) / 100]
            }))))
          }}>Export CSV</button>}
        </div>
        {view === 'day' ? (
          <table>
            <thead><tr><th style={{ width: 160 }}>Tech</th><th>{DAY_START} AM – {DAY_END - 12} PM</th><th className="n">Clocked</th><th className="n">On jobs</th><th className="n">Billed</th><th className="n">Efficiency</th></tr></thead>
            <tbody>{users.map((u) => {
              const punches = data.punches.filter((p) => p.userId === u.id && p.clockIn.slice(0, 10) === day)
              const jobs = data.labor.filter((l) => l.userId === u.id && l.date === day)
              const st = stats(u.id, day, day)
              const pos = (iso: string) => Math.min(100, Math.max(0, ((new Date(iso).getHours() + new Date(iso).getMinutes() / 60 - DAY_START) / (DAY_END - DAY_START)) * 100))
              return (
                <tr key={u.id}>
                  <td><div className="row"><Avatar u={u} sm />{u.name}</div></td>
                  <td>
                    <div className="timeline" aria-label={`${u.name} clocked ${fmtHours(st.clocked)}`}>
                      {punches.map((p) => <div key={p.id} className="seg-bar" style={{ left: `${pos(p.clockIn)}%`, width: `${pos(p.clockOut || new Date().toISOString()) - pos(p.clockIn)}%` }} title={`${fmtTime(p.clockIn)} – ${p.clockOut ? fmtTime(p.clockOut) : 'now'}`} />)}
                      {jobs.filter((l) => l.timerStart).map((l) => <div key={l.id} className="job-bar" style={{ left: `${pos(l.timerStart!)}%`, width: `${Math.max(2, pos(new Date().toISOString()) - pos(l.timerStart!))}%` }}>RO {data.ros.find((r) => r.id === l.roId)?.number}</div>)}
                    </div>
                    {jobs.filter((l) => !l.timerStart).length > 0 && <div className="small muted" style={{ marginTop: 2 }}>{jobs.filter((l) => !l.timerStart).map((l) => `RO ${data.ros.find((r) => r.id === l.roId)?.number} ${fmtHours(l.hours)}`).join(' · ')}</div>}
                  </td>
                  <td className="n">{fmtHours(st.clocked)}</td><td className="n">{fmtHours(st.onJobs)}</td><td className="n">{fmtHours(st.billed)}</td>
                  <td className={`n ${st.eff != null && st.eff < 100 ? 'tint-warn' : ''}`}>{st.eff == null ? '—' : `${Math.round(st.eff)}%${st.eff < 100 ? ' ▼' : ''}`}</td>
                </tr>
              )
            })}</tbody>
          </table>
        ) : (
          (() => {
            const ws = startOfWeek(day)
            const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
            return (
              <table>
                <thead><tr><th>Tech</th>{days.map((d) => <th key={d} className="n">{new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</th>)}<th className="n">Clocked</th><th className="n">Billed</th><th className="n">Efficiency</th></tr></thead>
                <tbody>{users.map((u) => {
                  const w = stats(u.id, ws, days[6])
                  return (
                    <tr key={u.id}><td>{u.name}</td>{days.map((d) => { const h = stats(u.id, d, d).clocked; return <td key={d} className="n">{h ? (Math.round(h * 10) / 10).toFixed(1) : <span className="faint">—</span>}</td> })}
                      <td className="n strong">{fmtHours(w.clocked)}</td><td className="n">{fmtHours(w.billed)}</td><td className="n">{w.eff == null ? '—' : `${Math.round(w.eff)}%`}</td></tr>
                  )
                })}</tbody>
              </table>
            )
          })()
        )}
        {users.length === 0 && <Empty text="No users yet. Add techs in Settings ▸ Users." />}
      </section>
      <p className="small muted">Efficiency = hours billed on completed jobs ÷ hours on job clocks. Over 100% means beating book time.</p>
      {pinFor && <PinModal user={pinFor.u} onClose={() => setPinFor(null)} onOk={() => { const p = pinFor; setPinFor(null); void doPunch(p.u, p.action) }} />}
    </div>
  )
}

export function PinModal({ user, onOk, onClose }: { user: User; onOk: () => void; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [bad, setBad] = useState(false)
  const press = (d: string) => {
    const next = (pin + d).slice(0, 6)
    setPin(next)
    if (next.length === user.pin.length) {
      if (next === user.pin) onOk()
      else { setBad(true); setPin('') }
    }
  }
  return (
    <Modal title={`PIN for ${user.name}`} onClose={onClose}>
      <div className="pin-dots">{Array.from({ length: user.pin.length }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      {bad && <p className="neg" style={{ textAlign: 'center', marginTop: 0 }}>Wrong PIN. Try again.</p>}
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <span /><button onClick={() => press('0')}>0</button><button onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete digit" style={{ fontSize: 14 }}>⌫</button>
      </div>
    </Modal>
  )
}
