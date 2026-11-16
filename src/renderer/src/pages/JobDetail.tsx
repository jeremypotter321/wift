import { useEffect, useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useJobRows, todayIso, type JobRow } from '../derive'
import { JobForm, type Draft } from '../JobForm'
import { useStore, type Snapshot } from '../store'
import {
  ContentEditor, Empty, Field, fmtDate, fmtHours, fmtMoney, Hourly, Money, NumInput, StatusPill, useElapsed, vehicleOf, VerdictCard,
} from '../ui'
import { contentScore, partsChargedFromCost, verdict } from '../../../shared/calc'
import { JOB_STATUSES, PLATFORMS, type JobStatus } from '../../../shared/types'

type Tab = 'overview' | 'labor' | 'parts' | 'content'

export function JobDetail({ id, initialTab }: { id: number; initialTab?: string }) {
  const { data, act } = useStore()
  const rows = useJobRows(data)
  const nav = useNav()
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'overview')
  const row = rows.find((r) => r.job.id === id)
  if (!data) return null
  if (!row) {
    return (
      <div className="page">
        <Empty text="This job no longer exists." action={<button className="btn" onClick={() => nav({ page: 'jobs' })}>Back to jobs</button>} />
      </div>
    )
  }
  const j = row.job

  async function remove() {
    if (!window.confirm(`Delete "${j.title}" and all its labor, parts and posts? This can't be undone (a backup is kept each time the app opens).`)) return
    await act(() => api.deleteJob(j.id))
    nav({ page: 'jobs' })
  }

  return (
    <div className="page">
      <div className="page-head">
        <button className="crumb" onClick={() => nav({ page: 'jobs' })}>Jobs</button>
        <span className="muted">/</span>
        <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</h1>
        <StatusPill s={j.status} />
        <span className="grow" />
        <select
          style={{ width: 180 }}
          value={j.status}
          aria-label="Status"
          onChange={(e) => act(() => api.saveJob({ id: j.id, status: e.target.value as JobStatus }))}
        >
          {JOB_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn danger" onClick={remove}>Delete</button>
      </div>
      <div className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
        {[j.customerName, vehicleOf(j), j.vin && `VIN ${j.vin}`, `Created ${fmtDate(j.createdAt)}`].filter(Boolean).join(' · ')}
      </div>

      <div className="tabs" role="tablist">
        {(['overview', 'labor', 'parts', 'content'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview & estimate' : t === 'labor' ? `Labor (${fmtHours(row.act.hours)})` : t === 'parts' ? `Parts (${row.parts.length})` : `Content (${row.content}/10)`}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview row={row} data={data} />}
      {tab === 'labor' && <Labor row={row} data={data} />}
      {tab === 'parts' && <Parts row={row} data={data} />}
      {tab === 'content' && <Content row={row} />}
    </div>
  )
}

function Overview({ row, data }: { row: JobRow; data: Snapshot }) {
  const { act } = useStore()
  const initial = useMemo<Draft>(() => ({ ...row.job, customerName: row.job.customerName ?? '' }), [row.job])
  const [draft, setDraft] = useState<Draft>(initial)
  useEffect(() => setDraft(initial), [initial])
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const v = verdict(draft, data.settings)
  const { est, act: a } = row

  return (
    <div className="evaluate">
      <div className="stack">
        <JobForm draft={draft} set={set} settings={data.settings} customers={data.customers} />
        <section className="card stack">
          <h2>Payment</h2>
          <div className="grid3">
            <Field label="Sales tax collected"><NumInput prefix="$" value={draft.salesTax} onChange={(salesTax) => set({ salesTax })} /></Field>
            <Field label="Payment method">
              <select value={draft.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
                <option value="">—</option>
                {['Cash', 'Card', 'Check', 'Transfer', 'Other'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Payment date"><input type="date" value={draft.paymentDate} onChange={(e) => set({ paymentDate: e.target.value })} /></Field>
          </div>
          <span className="small muted">Sales tax rules differ by state (parts are usually taxed, labor often isn't). Enter what you collected; your accountant handles the rest.</span>
        </section>
      </div>
      <div className="sticky stack">
        <div className="card">
          <button className="btn primary big block" disabled={!dirty} onClick={() => act(() => api.saveJob(draft))}>
            {dirty ? 'Save changes' : 'All changes saved'}
          </button>
          {dirty && <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setDraft(initial)}>Discard changes</button>}
        </div>
        <div className="card">
          <h3>Estimate vs actual</h3>
          <div className="compare">
            <span className="h" /><span className="h n">Estimate</span><span className="h n">Actual</span>
            <span>Hours</span><span className="n">{fmtHours(est.hours)}</span>
            <span className={`n ${a.variancePct != null && a.variancePct > 0 ? 'tint-warn' : ''}`}>
              {fmtHours(a.hours)}{a.variancePct != null && ` (${a.variancePct > 0 ? '+' : ''}${Math.round(a.variancePct)}%)`}
            </span>
            <span>Labor</span><span className="n">{fmtMoney(est.laborRevenue)}</span><span className="n">{fmtMoney(a.laborRevenue)}</span>
            <span>Parts charged</span><span className="n">{fmtMoney(est.partsRevenue)}</span><span className="n">{fmtMoney(a.partsRevenue)}</span>
            <span>Parts cost</span><span className="n">{fmtMoney(est.partsCost)}</span><span className="n">{fmtMoney(a.partsCost)}</span>
            <span style={{ fontWeight: 650 }}>Profit</span><span className="n"><Money v={est.profit} /></span><span className="n" style={{ fontWeight: 650 }}><Money v={a.profit} /></span>
            <span style={{ fontWeight: 650 }}>$/hr</span>
            <span className="n"><Hourly v={est.effectiveHourly} tint={row.hourlyIsEstimate ? row.tint : 'none'} /></span>
            <span className="n" style={{ fontWeight: 650 }}><Hourly v={a.effectiveHourly} tint={row.hourlyIsEstimate ? 'none' : row.tint} /></span>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>Actuals come from the Labor and Parts tabs.</p>
        </div>
        <VerdictCard v={v} title="Verdict on the estimate" />
      </div>
    </div>
  )
}

function Labor({ row, data }: { row: JobRow; data: Snapshot }) {
  const { act } = useStore()
  const techs = data.settings.techs.length ? data.settings.techs : ['Owner']
  const [tech, setTech] = useState(techs[0])
  const [date, setDate] = useState(todayIso())
  const [hours, setHours] = useState(0)
  const [note, setNote] = useState('')
  const running = data.timer && data.timer.jobId === row.job.id ? data.timer : null
  const otherRunning = data.timer && data.timer.jobId !== row.job.id ? data.timer : null
  const clock = useElapsed(running?.timerStart, running?.hours ?? 0)

  async function add() {
    if (!(hours > 0)) return
    await act(() => api.saveLabor({ jobId: row.job.id, tech, date, hours, note }))
    setHours(0)
    setNote('')
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="timer">
          <span className="clock" aria-live="off">{clock}</span>
          {running ? (
            <button className="btn big stop" onClick={() => act(() => api.stopTimer(running.id))}>■ Stop</button>
          ) : (
            <button
              className="btn primary big"
              onClick={async () => {
                await act(() => api.startTimer(row.job.id, tech))
                if (row.job.status === 'Accepted' || row.job.status === 'Quoted' || row.job.status === 'Lead') {
                  await act(() => api.saveJob({ id: row.job.id, status: 'In progress' }))
                }
              }}
            >
              ▶ Start
            </button>
          )}
          <Field label="Tech">
            <select value={running?.tech ?? tech} disabled={!!running} onChange={(e) => setTech(e.target.value)} style={{ width: 160 }}>
              {techs.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <span className="small muted" style={{ maxWidth: 320 }}>
            {running
              ? 'Timer is running. Stop it to log the time.'
              : otherRunning
                ? `A timer is running on "${otherRunning.jobTitle}". Starting here stops that one and logs its time.`
                : 'Start the clock when you start on the car. Starting it moves the job to In progress.'}
          </span>
        </div>
      </section>

      <section className="card flush">
        <div className="card-head"><h2>Labor entries</h2><span className="muted num">{fmtHours(row.act.hours)} logged · {fmtHours(row.job.estHours)} estimated</span></div>
        <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} /></Field>
          <Field label="Tech">
            <select value={tech} onChange={(e) => setTech(e.target.value)} style={{ width: 140 }}>{techs.map((t) => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Hours"><div style={{ width: 100 }}><NumInput value={hours} step="0.25" onChange={setHours} /></div></Field>
          <div style={{ flex: 1 }}><Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></Field></div>
          <button className="btn primary" disabled={!(hours > 0)} onClick={add}>Add hours</button>
        </div>
        {row.labor.length === 0 ? (
          <Empty text="No time logged yet. Start the timer or add hours above." />
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Tech</th><th>Note</th><th className="n">Hours</th><th className="n">Cost to you</th><th /></tr></thead>
            <tbody>
              {row.labor.map((l) => (
                <tr key={l.id}>
                  <td className="num">{fmtDate(l.date)}</td>
                  <td>{l.tech}</td>
                  <td className="muted">{l.timerStart ? <b className="tint-good">● running</b> : l.note}</td>
                  <td className="n">{fmtHours(l.hours)}</td>
                  <td className="n">{fmtMoney(l.hours * (data.settings.techCost + data.settings.overheadPerHour))}</td>
                  <td className="n" style={{ width: 90 }}>
                    {!l.timerStart && <button className="btn ghost" style={{ height: 32 }} onClick={() => act(() => api.deleteLabor(l.id))} aria-label="Delete entry">Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Parts({ row, data }: { row: JobRow; data: Snapshot }) {
  const { act } = useStore()
  const [desc, setDesc] = useState('')
  const [supplier, setSupplier] = useState('')
  const [cost, setCost] = useState(0)
  const [charged, setCharged] = useState<number | null>(null) // null = follow markup
  const customerParts = row.job.riskFlags.includes('customerParts')
  const autoCharge = customerParts ? 0 : partsChargedFromCost(cost, data.settings)
  const charge = charged ?? autoCharge

  async function add() {
    if (!desc.trim()) return
    await act(() => api.savePart({ jobId: row.job.id, description: desc.trim(), supplier, cost, charged: charge }))
    setDesc('')
    setCost(0)
    setCharged(null)
  }

  return (
    <section className="card flush">
      <div className="card-head">
        <h2>Parts & sublet</h2>
        <span className="muted num">cost {fmtMoney(row.act.partsCost, true)} · charged {fmtMoney(row.act.partsRevenue, true)} · estimated cost {fmtMoney(row.job.estPartsCost)}</span>
      </div>
      <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
        <div style={{ flex: 2 }}><Field label="Part"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Rotors (pair)" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field></div>
        <Field label="Your cost"><div style={{ width: 120 }}><NumInput prefix="$" value={cost} onChange={setCost} /></div></Field>
        <Field label={charged == null ? `Charge (+${data.settings.partsMarkupPct}%)` : 'Charge'}>
          <div style={{ width: 120 }}><NumInput prefix="$" value={charge} onChange={(n) => setCharged(n)} /></div>
        </Field>
        <button className="btn primary" disabled={!desc.trim()} onClick={add}>Add part</button>
      </div>
      {customerParts && <p className="small muted" style={{ padding: '0 12px' }}>Customer is supplying parts, so the charge defaults to $0.</p>}
      {row.parts.length === 0 ? (
        <Empty text="No parts added yet." />
      ) : (
        <table>
          <thead><tr><th>Part</th><th>Supplier</th><th className="n">Cost</th><th className="n">Charged</th><th className="n">Margin</th><th /></tr></thead>
          <tbody>
            {row.parts.map((p) => (
              <tr key={p.id}>
                <td>{p.description}</td>
                <td className="muted">{p.supplier}</td>
                <td className="n">{fmtMoney(p.cost, true)}</td>
                <td className="n">{fmtMoney(p.charged, true)}</td>
                <td className="n"><Money v={p.charged - p.cost} cents /></td>
                <td className="n" style={{ width: 90 }}><button className="btn ghost" style={{ height: 32 }} onClick={() => act(() => api.deletePart(p.id))}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Content({ row }: { row: JobRow }) {
  const { act } = useStore()
  const [platform, setPlatform] = useState<string>(PLATFORMS[0])
  const [date, setDate] = useState(todayIso())
  const [url, setUrl] = useState('')
  const score = contentScore(row.job.content)
  const totalViews = row.posts.reduce((a, p) => a + p.views, 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 16, alignItems: 'start' }}>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Content score</h2>
          <span style={{ fontSize: 28, fontWeight: 700 }} className="num">{score}/10</span>
        </div>
        <ContentEditor value={row.job.content} onChange={(content) => act(() => api.saveJob({ id: row.job.id, content }))} />
      </section>

      <section className="card flush">
        <div className="card-head"><h2>Posts</h2><span className="muted num">{row.posts.length} posted · {totalViews.toLocaleString('en-US')} views</span></div>
        <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
          <Field label="Platform">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ width: 130 }}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} /></Field>
          <div style={{ flex: 1 }}><Field label="Link (optional)"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field></div>
          <button className="btn primary" onClick={async () => { await act(() => api.savePost({ jobId: row.job.id, platform, date, url, views: 0, likes: 0 })); setUrl('') }}>
            Add post
          </button>
        </div>
        {row.posts.length === 0 ? (
          <Empty text="Not posted yet. Add a post here when it goes up, then update views and likes as they come in." />
        ) : (
          <table>
            <thead><tr><th>Platform</th><th>Date</th><th className="n">Views</th><th className="n">Likes</th><th /></tr></thead>
            <tbody>
              {row.posts.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.url ? <a href="#" onClick={(e) => { e.preventDefault(); void api.openLink(p.url) }}>{p.platform}</a> : p.platform}
                  </td>
                  <td className="num">{fmtDate(p.date)}</td>
                  <td className="n" style={{ width: 130 }}>
                    <NumInput value={p.views} step="1" aria-label="Views" onChange={(views) => void api.savePost({ ...p, views })} />
                  </td>
                  <td className="n" style={{ width: 110 }}>
                    <NumInput value={p.likes} step="1" aria-label="Likes" onChange={(likes) => void api.savePost({ ...p, likes })} />
                  </td>
                  <td className="n" style={{ width: 90 }}><button className="btn ghost" style={{ height: 32 }} onClick={() => act(() => api.deletePost(p.id))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
