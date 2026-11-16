import { useEffect, useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, Field, fmtTime, localDate, Modal, RoPill, Seg, todayIso } from '../ui'
import { vehicleName } from '../../../shared/bundle'
import type { Appointment } from '../../../shared/types'

const OPEN = 7, CLOSE = 18, HOUR_PX = 48
const toLocal = (d: Date) => `${localDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localDate(d) }
const startOfWeek = (iso: string) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d) }
const hourOf = (iso: string) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60 }

export function Appointments() {
  const { data, ix } = useData()
  const nav = useNav()
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [day, setDay] = useState(todayIso())
  const [edit, setEdit] = useState<Partial<Appointment> | null>(null)
  const [drawer, setDrawer] = useState(true)
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])

  const appts = data.appointments.filter((a) => a.status !== 'cancelled')
  const techs = data.users.filter((u) => u.active && u.role !== 'advisor')
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30
  const label = view === 'day' ? new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : view === 'week' ? `Week of ${new Date(startOfWeek(day) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const unscheduled = useMemo(() => data.ros.filter((r) => r.status === 'wip' && !data.appointments.some((a) => a.roId === r.id)), [data])

  const newAt = (date: string, hour: number, userId: number | null) => {
    const s = new Date(`${date}T${String(hour).padStart(2, '0')}:00`)
    setEdit({ start: toLocal(s), end: toLocal(new Date(s.getTime() + 3_600_000)), userId, dropOff: true, title: '' })
  }
  const block = (a: Appointment) => {
    const c = a.customerId ? ix.customers.get(a.customerId) : null
    const v = a.vehicleId ? ix.vehicles.get(a.vehicleId) : null
    const top = (hourOf(a.start) - OPEN) * HOUR_PX
    const h = Math.max(22, (hourOf(a.end || a.start) - hourOf(a.start)) * HOUR_PX - 2)
    return (
      <div key={a.id} className={`appt ${a.roId ? 'has-ro' : ''}`} style={{ top, height: h }} onClick={(e) => { e.stopPropagation(); setEdit(a) }} title={`${c?.name ?? ''} ${a.title}`}>
        <b>{fmtTime(a.start)} {c?.name ?? a.title}</b><br />{vehicleName(v)}<br /><span className="muted">{a.title} · {a.dropOff ? 'Drop-off' : 'Waiting'}</span>
      </div>
    )
  }
  const hours = Array.from({ length: CLOSE - OPEN }, (_, i) => OPEN + i)
  const nowTop = (now.getHours() + now.getMinutes() / 60 - OPEN) * HOUR_PX

  const timeGrid = (cols: { key: string; title: string; date: string; userId: number | null; list: Appointment[] }[]) => (
    <div className="cal" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(140px, 1fr))` }}>
      <div className="cal-head" />
      {cols.map((c) => <div key={c.key} className="cal-head">{c.title}<div className="small muted" style={{ fontWeight: 400 }}>{c.list.length} booked</div></div>)}
      <div>{hours.map((h) => <div key={h} className="cal-time" style={{ height: HOUR_PX }}>{h > 12 ? h - 12 : h} {h >= 12 ? 'PM' : 'AM'}</div>)}</div>
      {cols.map((c) => (
        <div key={c.key} className="cal-col">
          {hours.map((h) => <div key={h} className="cal-slot" onClick={() => newAt(c.date, h, c.userId)} aria-label={`New appointment ${c.title} ${h}:00`} />)}
          {c.list.map(block)}
          {c.date === todayIso() && nowTop > 0 && nowTop < hours.length * HOUR_PX && <div className="now-line" style={{ top: nowTop }} />}
        </div>
      ))}
    </div>
  )

  let body
  if (view === 'day') {
    const today = appts.filter((a) => a.start.slice(0, 10) === day)
    body = timeGrid([
      ...techs.map((u) => ({ key: String(u.id), title: u.name, date: day, userId: u.id, list: today.filter((a) => a.userId === u.id) })),
      { key: 'none', title: 'Unassigned', date: day, userId: null, list: today.filter((a) => !a.userId || !techs.some((u) => u.id === a.userId)) },
    ])
  } else if (view === 'week') {
    const ws = startOfWeek(day)
    body = timeGrid(Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i)
      return { key: d, title: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), date: d, userId: null, list: appts.filter((a) => a.start.slice(0, 10) === d) }
    }))
  } else {
    const first = day.slice(0, 8) + '01'
    const gridStart = startOfWeek(first)
    body = (
      <div>
        <div className="month" style={{ borderBottom: 0 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} style={{ minHeight: 0, fontWeight: 600, cursor: 'default' }}>{d}</div>)}</div>
        <div className="month">
          {Array.from({ length: 42 }, (_, i) => {
            const d = addDays(gridStart, i)
            const list = appts.filter((a) => a.start.slice(0, 10) === d).sort((a, b) => a.start.localeCompare(b.start))
            return (
              <div key={d} className={`${d.slice(0, 7) !== day.slice(0, 7) ? 'out' : ''} ${d === todayIso() ? 'today' : ''}`} onClick={() => { setDay(d); setView('day') }}>
                <b>{Number(d.slice(8))}</b>{list.length > 0 && <span className="muted"> · {list.length}</span>}
                {list.slice(0, 3).map((a) => <span key={a.id} className="mchip">{fmtTime(a.start)} {ix.customers.get(a.customerId ?? -1)?.name ?? a.title}</span>)}
                {list.length > 3 && <span className="small muted">+{list.length - 3} more</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <div className="page-head">
        <h1>Appointments</h1>
        <button className="btn sm" onClick={() => setDay(todayIso())}>Today</button>
        <button className="btn sm icon" aria-label="Previous" onClick={() => setDay(addDays(day, -step))}>‹</button>
        <button className="btn sm icon" aria-label="Next" onClick={() => setDay(addDays(day, step))}>›</button>
        <b>{label}</b>
        <Seg options={['day', 'week', 'month'] as const} labels={{ day: 'Day', week: 'Week', month: 'Month' }} value={view} onChange={setView} />
        <span className="grow" />
        <button className="btn sm" onClick={() => setDrawer(!drawer)}>{drawer ? 'Hide' : 'Show'} unscheduled ({unscheduled.length})</button>
        <button className="btn primary" onClick={() => newAt(day, 9, null)}>+ Appointment</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: drawer ? 'minmax(0,1fr) 280px' : '1fr', gap: 16, alignItems: 'start' }}>
        {body}
        {drawer && (
          <aside className="card flush">
            <div className="card-head"><h2>Unscheduled work</h2></div>
            {unscheduled.length === 0 ? <div className="empty small">Every car in progress has a slot.</div> : unscheduled.map((r) => (
              <div key={r.id} className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--divider)' }}>
                <span className="grow"><button className="link mono small" onClick={() => nav({ page: 'ro', id: r.id })}>RO {r.number}</button><div className="small ellipsis">{ix.customers.get(r.customerId ?? -1)?.name} · {vehicleName(ix.vehicles.get(r.vehicleId ?? -1))}</div></span>
                <button className="btn sm" onClick={() => { const s = new Date(`${day}T09:00`); setEdit({ roId: r.id, customerId: r.customerId, vehicleId: r.vehicleId, userId: r.techId, title: data.jobs.find((j) => j.roId === r.id)?.title ?? '', start: toLocal(s), end: toLocal(new Date(s.getTime() + 2 * 3_600_000)), dropOff: true }) }}>Schedule</button>
              </div>
            ))}
          </aside>
        )}
      </div>
      {edit && <ApptModal appt={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ApptModal({ appt, onClose }: { appt: Partial<Appointment>; onClose: () => void }) {
  const { data, act, can } = useData()
  const nav = useNav()
  const [a, setA] = useState(appt)
  const set = (p: Partial<Appointment>) => setA({ ...a, ...p })
  const vehicles = data.vehicles.filter((v) => !a.customerId || v.customerId === a.customerId)
  const ro = a.roId ? data.ros.find((r) => r.id === a.roId) : null
  const valid = a.start && a.end && a.end > a.start && (a.customerId || a.title?.trim())
  return (
    <Modal title={a.id ? 'Appointment' : 'New appointment'} onClose={onClose}
      foot={<>
        {a.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { if (await confirmDialog('Cancel this appointment?', 'Cancel appointment')) { await act(() => api.save('appointments', { id: a.id, status: 'cancelled' })); onClose() } }}>Cancel appt</button>}
        {a.id && !ro && can.prices && <button className="btn" onClick={async () => { const r = await act(() => api.createRo({ customerId: a.customerId, vehicleId: a.vehicleId, concern: a.title, appointmentId: a.id })); onClose(); if (r) nav({ page: 'ro', id: r.id }) }}>Start RO</button>}
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" disabled={!valid} onClick={async () => { await act(() => api.save('appointments', a)); onClose() }}>Save</button>
      </>}>
      <div className="stack">
        {ro && <div className="row"><RoPill ro={ro} /><button className="link" onClick={() => { onClose(); nav({ page: 'ro', id: ro.id }) }}>Open RO {ro.number}</button></div>}
        <div className="grid2">
          <Field label="Customer"><select value={a.customerId ?? ''} onChange={(e) => set({ customerId: e.target.value ? Number(e.target.value) : null, vehicleId: null })}><option value="">—</option>{data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Vehicle"><select value={a.vehicleId ?? ''} onChange={(e) => set({ vehicleId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleName(v)}</option>)}</select></Field>
        </div>
        <Field label="What for"><input value={a.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Oil service + inspection" /></Field>
        <div className="grid2">
          <Field label="Start"><input type="datetime-local" step={900} value={a.start ?? ''} onChange={(e) => set({ start: e.target.value })} /></Field>
          <Field label="End"><input type="datetime-local" step={900} value={a.end ?? ''} onChange={(e) => set({ end: e.target.value })} /></Field>
        </div>
        {a.end && a.start && a.end <= a.start && <div className="small neg">End must be after start.</div>}
        <div className="grid2">
          <Field label="Tech"><select value={a.userId ?? ''} onChange={(e) => set({ userId: e.target.value ? Number(e.target.value) : null })}><option value="">Unassigned</option>{data.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Customer is"><Seg options={['drop', 'wait'] as const} labels={{ drop: '⇣ Dropping off', wait: '◔ Waiting' }} value={a.dropOff === false ? 'wait' : 'drop'} onChange={(x) => set({ dropOff: x === 'drop' })} /></Field>
        </div>
        <Field label="Notes"><textarea value={a.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
