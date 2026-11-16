import { useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useData } from '../store'
import { Avatar, fmtMoney, fmtTime, Menu, RoPill, Seg } from '../ui'
import { payState } from '../../../shared/calc'
import { vehicleName } from '../../../shared/bundle'
import type { RepairOrder, RoStatus } from '../../../shared/types'

export function JobBoard({ initialView }: { initialView?: 'stage' | 'tech' }) {
  const { data, ix, act, can, toast } = useData()
  const nav = useNav()
  const [view, setView] = useState<'stage' | 'tech'>(initialView ?? 'stage')
  const [q, setQ] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dropTarget, setDropTarget] = useState('')

  const s = q.trim().toLowerCase()
  const active = data.ros.filter((ro) => {
    if (ro.status === 'completed') {
      const t = ix.totals(ro.id).totals
      const closed = payState(ro, t) === 'Paid' && !!ro.pickedUpAt
      if (closed && !showDone) return false
    }
    if (!s) return true
    const c = ro.customerId ? ix.customers.get(ro.customerId) : null
    const v = ro.vehicleId ? ix.vehicles.get(ro.vehicleId) : null
    return `${ro.number} ${c?.name ?? ''} ${vehicleName(v)} ${v?.plate ?? ''}`.toLowerCase().includes(s)
  })

  async function moveTo(ro: RepairOrder, status: RoStatus) {
    if (ro.status === status) return
    if (status === 'wip' && ro.status === 'estimate' && !data.jobs.some((j) => j.roId === ro.id && j.status === 'approved')) {
      toast('Approve at least one job first (Get signature on the RO).')
      return nav({ page: 'ro', id: ro.id })
    }
    await act(() => api.setRoStatus(ro.id, status))
  }
  async function assign(ro: RepairOrder, techId: number | null) {
    const jobs = data.jobs.filter((j) => j.roId === ro.id && (j.techId == null || j.techId === ro.techId))
    await act(() => api.saveMany([{ entity: 'ros', data: { id: ro.id, techId } }, ...jobs.map((j) => ({ entity: 'jobs' as const, data: { id: j.id, techId } }))]))
  }

  const columns: { key: string; title: string; ros: RepairOrder[]; drop: (ro: RepairOrder) => void }[] =
    view === 'stage'
      ? (['estimate', 'wip', 'completed'] as RoStatus[]).map((st) => ({
          key: st, title: st === 'estimate' ? 'Estimates' : st === 'wip' ? 'Work in progress' : 'Completed',
          ros: active.filter((r) => r.status === st), drop: (ro) => void moveTo(ro, st),
        }))
      : [
          { key: 'none', title: 'Unassigned', ros: active.filter((r) => !r.techId && r.status !== 'completed'), drop: (ro) => void assign(ro, null) },
          ...data.users.filter((u) => u.active && (u.role === 'tech' || u.role === 'owner')).map((u) => ({
            key: String(u.id), title: u.name, ros: active.filter((r) => r.techId === u.id && r.status !== 'completed'), drop: (ro: RepairOrder) => void assign(ro, u.id),
          })),
        ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>Job board</h1>
        <input style={{ width: 260 }} className="sm" placeholder="Search board" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search board" />
        <Seg options={['stage', 'tech'] as const} labels={{ stage: 'By stage', tech: 'By tech' }} value={view} onChange={setView} />
        <label className="check small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show paid & picked up</label>
        <span className="grow" />
        {can.prices && <button className="btn primary" onClick={async () => { const ro = await act(() => api.createRo({})); if (ro) nav({ page: 'ro', id: ro.id }) }}>+ New RO</button>}
      </div>
      <div className="board">
        {columns.map((col) => {
          const total = col.ros.reduce((a, r) => a + ix.totals(r.id).totals.total, 0)
          if (collapsed[col.key]) {
            return <div key={col.key} className="col collapsed" onClick={() => setCollapsed({ ...collapsed, [col.key]: false })} title="Expand"><b>{col.title}</b> <span className="muted">{col.ros.length}</span></div>
          }
          const hours = view === 'tech' ? data.jobs.filter((j) => col.ros.some((r) => r.id === j.roId)).flatMap((j) => data.lines.filter((l) => l.jobId === j.id && l.kind === 'labor')).reduce((a, l) => a + l.qty, 0) : 0
          return (
            <section key={col.key} className={`col ${dropTarget === col.key ? 'drop' : ''}`} aria-label={col.title}
              onDragOver={(e) => { e.preventDefault(); setDropTarget(col.key) }} onDragLeave={() => setDropTarget('')}
              onDrop={(e) => { e.preventDefault(); setDropTarget(''); const ro = data.ros.find((r) => r.id === Number(e.dataTransfer.getData('text/ro'))); if (ro) col.drop(ro) }}>
              <div className="col-head">
                <span>{col.title}</span><span className="muted">{col.ros.length}</span>
                <span className="grow" />
                {view === 'tech' && <span className="small muted">{hours} h sold</span>}
                {can.prices && view === 'stage' && <span className="small muted num">{fmtMoney(total, false)}</span>}
                <button className="btn ghost sm icon" aria-label={`Collapse ${col.title}`} onClick={() => setCollapsed({ ...collapsed, [col.key]: true })}>«</button>
              </div>
              {col.ros.length === 0 && <div className="small faint" style={{ textAlign: 'center', padding: 16 }}>Nothing here</div>}
              {col.ros.map((ro) => <RoCard key={ro.id} ro={ro} onMove={moveTo} />)}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function RoCard({ ro, onMove }: { ro: RepairOrder; onMove: (ro: RepairOrder, s: RoStatus) => void }) {
  const { data, ix, can } = useData()
  const nav = useNav()
  const { totals: t } = ix.totals(ro.id)
  const c = ro.customerId ? ix.customers.get(ro.customerId) : null
  const v = ro.vehicleId ? ix.vehicles.get(ro.vehicleId) : null
  const tech = ro.techId ? ix.users.get(ro.techId) : null
  const insp = data.inspectionItems.filter((i) => data.inspections.some((x) => x.roId === ro.id && x.id === i.inspectionId))
  const now = insp.filter((i) => i.rating === 'now').length
  const soon = insp.filter((i) => i.rating === 'soon').length
  const late = ro.promisedAt && ro.status !== 'completed' && new Date(ro.promisedAt) < new Date()
  const appt = data.appointments.find((a) => a.roId === ro.id)
  const promisedToday = ro.promisedAt && new Date(ro.promisedAt).toDateString() === new Date().toDateString()
  return (
    <article className="rcard" draggable onDragStart={(e) => e.dataTransfer.setData('text/ro', String(ro.id))} tabIndex={0}
      onClick={() => nav({ page: 'ro', id: ro.id })} onKeyDown={(e) => e.key === 'Enter' && nav({ page: 'ro', id: ro.id })}>
      <div className="row between small">
        <span className="mono muted">RO {ro.number}</span>
        {ro.promisedAt && <span className={late ? 'neg strong' : 'muted'}>{late ? '◷ Late · ' : ''}{promisedToday ? fmtTime(ro.promisedAt) : new Date(ro.promisedAt).toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric' })}</span>}
      </div>
      <b className="ellipsis">{c?.name ?? 'No customer'}</b>
      <span className="small ellipsis">{vehicleName(v) || 'No vehicle'}{v?.engine ? ` · ${v.engine}` : ''}</span>
      <div className="chips">
        <RoPill ro={ro} t={t} />
        <Avatar u={tech} sm />
        {appt && <span className="small muted">{appt.dropOff ? '⇣ Drop-off' : '◔ Waiting'}</span>}
        {now > 0 && <span className="small tint-bad strong">✕ {now} Now</span>}
        {soon > 0 && <span className="small tint-warn strong">! {soon} Soon</span>}
        {can.prices && <span className="small num strong" style={{ marginLeft: 'auto' }}>{fmtMoney(t.total, false)}</span>}
        <span onClick={(e) => e.stopPropagation()}>
          <Menu label="⋯" className="btn ghost sm icon" items={[
            ro.status !== 'estimate' && { label: 'Move to Estimates', onClick: () => onMove(ro, 'estimate') },
            ro.status !== 'wip' && { label: 'Move to Work in progress', onClick: () => onMove(ro, 'wip') },
            ro.status !== 'completed' && { label: 'Move to Completed', onClick: () => onMove(ro, 'completed') },
          ]} />
        </span>
      </div>
    </article>
  )
}
