import { useEffect, useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { Avatar, confirmDialog, Field, fmtMoney, LazyInput, NumInput } from '../ui'
import { matrixPrice } from '../../../shared/calc'
import { CONTENT_FACTORS, ROLES, type ContentFactor, type InspectionTemplate, type MatrixTier, type Settings, type User } from '../../../shared/types'

const SECTIONS = [
  ['shop', 'Shop info'], ['labor', 'Labor rates'], ['matrix', 'Pricing matrix'], ['fees', 'Supplies & fees'], ['tax', 'Taxes'],
  ['users', 'Users & roles'], ['templates', 'Inspection templates'], ['verdict', 'Verdict & content'], ['content', 'Content keywords'], ['google', 'Google Calendar'], ['data', 'Backup & data'],
] as const
type Section = (typeof SECTIONS)[number][0]
const COLORS = ['#1D4ED8', '#0F766E', '#6D28D9', '#B45309', '#B91C1C', '#334155']

export function SettingsPage() {
  const { data, act, toast } = useData()
  const [sec, setSec] = useState<Section>('shop')
  const [s, setS] = useState<Settings>(data.settings)
  useEffect(() => setS(data.settings), [data.settings])
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings)
  const set = (p: Partial<Settings>) => setS({ ...s, ...p })
  const matrixError = checkMatrix(s.partsMatrix)

  return (
    <div className="page">
      <div className="page-head"><h1>Settings</h1></div>
      <div className="settings">
        <nav className="section-nav card" style={{ padding: 6 }} aria-label="Settings sections">
          {SECTIONS.map(([k, label]) => <button key={k} className={`sec-link ${sec === k ? 'on' : ''}`} onClick={() => setSec(k)}>{label}</button>)}
        </nav>
        <div className="stack">
          {sec === 'shop' && (
            <section className="card stack">
              <h2>Shop info</h2>
              <p className="small muted" style={{ margin: 0 }}>Printed at the top of estimates, invoices and inspection reports.</p>
              <Field label="Shop name"><input value={s.shopName} onChange={(e) => set({ shopName: e.target.value })} /></Field>
              <Field label="Address"><input value={s.shopAddress} onChange={(e) => set({ shopAddress: e.target.value })} /></Field>
              <div className="grid2"><Field label="Phone"><input value={s.shopPhone} onChange={(e) => set({ shopPhone: e.target.value })} /></Field><Field label="Email"><input value={s.shopEmail} onChange={(e) => set({ shopEmail: e.target.value })} /></Field></div>
              <Field label="Warranty / terms (printed at the bottom of documents)"><textarea value={s.invoiceTerms} onChange={(e) => set({ invoiceTerms: e.target.value })} /></Field>
              <Field label="Estimate form: additional notes (pre-filled on every printed estimate)"><textarea value={s.estimateNotes} onChange={(e) => set({ estimateNotes: e.target.value })} /></Field>
              <Field label="Estimate form: disclaimer line"><input value={s.estimateDisclaimer} onChange={(e) => set({ estimateDisclaimer: e.target.value })} /></Field>
              <div className="grid3">
                <Field label="Appointment calendar starts at"><select value={s.schedOpen} onChange={(e) => set({ schedOpen: Number(e.target.value), schedClose: Math.max(Number(e.target.value) + 1, s.schedClose) })}>{HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></Field>
                <Field label="…and ends at"><select value={s.schedClose} onChange={(e) => set({ schedClose: Number(e.target.value) })}>{HOURS.filter((h) => h > s.schedOpen).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></Field>
                <span />
              </div>
              <div className="grid3">
                <Field label="Next RO number"><NumInput value={s.nextRoNumber} step="1" onChange={(nextRoNumber) => set({ nextRoNumber })} /></Field>
                <Field label="Reminder after (months without a visit)"><NumInput value={s.reminderMonths} step="1" onChange={(reminderMonths) => set({ reminderMonths })} /></Field>
                <Field label="Google review link (for QR cards)"><input value={s.reviewUrl} onChange={(e) => set({ reviewUrl: e.target.value })} placeholder="https://g.page/r/…" /></Field>
              </div>
            </section>
          )}
          {sec === 'labor' && (
            <section className="card stack">
              <h2>Labor rates</h2>
              <table>
                <thead><tr><th>Name</th><th className="n">Rate / hr</th><th>Default</th><th /></tr></thead>
                <tbody>{s.laborRates.map((r, i) => (
                  <tr key={r.id}>
                    <td><input className="sm" value={r.name} onChange={(e) => set({ laborRates: s.laborRates.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></td>
                    <td style={{ width: 140 }}><NumInput className="sm" prefix="$" value={r.rate} onChange={(rate) => set({ laborRates: s.laborRates.map((x, k) => (k === i ? { ...x, rate } : x)) })} /></td>
                    <td><input type="radio" name="defrate" checked={s.defaultLaborRateId === r.id} onChange={() => set({ defaultLaborRateId: r.id })} aria-label={`Default ${r.name}`} /></td>
                    <td className="n">{s.laborRates.length > 1 && <button className="btn ghost sm" onClick={() => set({ laborRates: s.laborRates.filter((_, k) => k !== i) })}>Remove</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ laborRates: [...s.laborRates, { id: `r${Date.now()}`, name: 'New rate', rate: s.laborRates[0]?.rate ?? 140 }] })}>+ Add rate (e.g. Electrical, Euro specialty)</button>
              <div className="grid3">
                <Field label="Tech cost ($/hr, wages + taxes)"><NumInput prefix="$" value={s.techCost} onChange={(techCost) => set({ techCost })} /></Field>
                <Field label="Overhead ($/hr)"><NumInput prefix="$" value={s.overheadPerHour} onChange={(overheadPerHour) => set({ overheadPerHour })} /></Field>
                <Field label="Target effective $/hr"><NumInput prefix="$" value={s.targetHourly} onChange={(targetHourly) => set({ targetHourly })} /></Field>
              </div>
              <p className="small muted" style={{ margin: 0 }}><b>Overhead</b> = a month of rent, insurance, utilities, tools and software ÷ hours worked in a month. <b>Effective $/hr</b> = what a job brings in after parts ÷ hours. Shops aim for about 90% of the posted rate ({fmtMoney((s.laborRates[0]?.rate ?? 0) * 0.9, false)}).</p>
            </section>
          )}
          {sec === 'matrix' && (
            <section className="card stack">
              <h2>Parts pricing matrix</h2>
              <p className="small muted" style={{ margin: 0 }}>Markup falls as part cost rises. Applied when a part is added to an RO; any line can be overridden by hand.</p>
              <table>
                <thead><tr><th>Cost from</th><th>Cost up to</th><th className="n">Markup %</th><th className="n">Multiplier</th><th className="n">Gross profit</th><th>Example</th><th /></tr></thead>
                <tbody>{s.partsMatrix.map((t, i) => {
                  const from = i === 0 ? 0 : s.partsMatrix[i - 1].upTo ?? 0
                  const example = t.upTo ? Math.round((from + t.upTo) / 2) : Math.round(from * 1.5) || 100
                  return (
                    <tr key={i}>
                      <td className="num">{fmtMoney(from, false)}</td>
                      <td style={{ width: 140 }}>{t.upTo == null ? <span className="muted">and above</span> : <NumInput className="sm" prefix="$" value={t.upTo} onChange={(upTo) => set({ partsMatrix: s.partsMatrix.map((x, k) => (k === i ? { ...x, upTo } : x)) })} />}</td>
                      <td style={{ width: 110 }}><NumInput className="sm" value={t.markupPct} onChange={(markupPct) => set({ partsMatrix: s.partsMatrix.map((x, k) => (k === i ? { ...x, markupPct } : x)) })} /></td>
                      <td className="n num">×{(1 + t.markupPct / 100).toFixed(2)}</td>
                      <td className="n num">{Math.round((t.markupPct / (100 + t.markupPct)) * 100)}%</td>
                      <td className="small muted">${example} part sells for {fmtMoney(example * (1 + t.markupPct / 100))}</td>
                      <td className="n">{t.upTo != null && s.partsMatrix.length > 1 && <button className="btn ghost sm" onClick={() => set({ partsMatrix: s.partsMatrix.filter((_, k) => k !== i) })}>Remove</button>}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
              {matrixError && <div className="neg small">{matrixError}</div>}
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
                const tiers = [...s.partsMatrix]
                const last = tiers.pop()!
                const prev = tiers.at(-1)?.upTo ?? 0
                set({ partsMatrix: [...tiers, { upTo: prev + 100, markupPct: last.markupPct + 10 }, last] })
              }}>+ Add tier</button>
              <TestCost settings={s} />
            </section>
          )}
          {sec === 'fees' && (
            <section className="card stack">
              <h2>Shop supplies & fees</h2>
              <div className="grid2">
                <Field label="Shop supplies (% of labor)"><NumInput value={s.shopSuppliesPct} onChange={(shopSuppliesPct) => set({ shopSuppliesPct })} /></Field>
                <Field label="Cap per RO ($, 0 = no cap)"><NumInput prefix="$" value={s.shopSuppliesCap} onChange={(shopSuppliesCap) => set({ shopSuppliesCap })} /></Field>
              </div>
              <div className="grid2">
                <Field label="Diagnosis fee (added with “+ Diagnosis” on an RO)"><NumInput prefix="$" value={s.diagnosisFee} onChange={(diagnosisFee) => set({ diagnosisFee })} /></Field>
                <span />
              </div>
              <h3>Fee presets</h3>
              <table><thead><tr><th>Fee</th><th className="n">Amount</th><th>Taxable</th><th /></tr></thead>
                <tbody>{s.feePresets.map((f, i) => (
                  <tr key={f.id}>
                    <td><input className="sm" value={f.name} onChange={(e) => set({ feePresets: s.feePresets.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></td>
                    <td style={{ width: 120 }}><NumInput className="sm" prefix="$" value={f.amount} onChange={(amount) => set({ feePresets: s.feePresets.map((x, k) => (k === i ? { ...x, amount } : x)) })} /></td>
                    <td><input type="checkbox" checked={f.taxable} onChange={(e) => set({ feePresets: s.feePresets.map((x, k) => (k === i ? { ...x, taxable: e.target.checked } : x)) })} aria-label="Taxable" /></td>
                    <td className="n"><button className="btn ghost sm" onClick={() => set({ feePresets: s.feePresets.filter((_, k) => k !== i) })}>Remove</button></td>
                  </tr>
                ))}</tbody></table>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ feePresets: [...s.feePresets, { id: `f${Date.now()}`, name: 'New fee', amount: 0, taxable: false }] })}>+ Add fee</button>
              <p className="small muted" style={{ margin: 0 }}>"+ Fee" on an RO job adds the first preset; rename or reprice it on the line.</p>
            </section>
          )}
          {sec === 'tax' && (
            <section className="card stack">
              <h2>Sales tax</h2>
              <div className="grid3">
                <Field label="Parts & sublet (%)"><NumInput value={s.partsTaxPct} onChange={(partsTaxPct) => set({ partsTaxPct })} /></Field>
                <Field label="Labor (%)"><NumInput value={s.laborTaxPct} onChange={(laborTaxPct) => set({ laborTaxPct })} /></Field>
                <Field label="Fees & shop supplies (%)"><NumInput value={s.feesTaxPct} onChange={(feesTaxPct) => set({ feesTaxPct })} /></Field>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Rules differ by state: parts are usually taxed, labor often isn't. Check with your accountant. Individual lines can be marked not taxable, and tax-exempt customers are never charged.</p>
            </section>
          )}
          {sec === 'users' && <UsersSection />}
          {sec === 'templates' && <TemplatesSection />}
          {sec === 'verdict' && (
            <section className="card stack">
              <h2>"Should I take it?" tuning</h2>
              <div className="grid3">
                <Field label="Maybe band (% under target)"><NumInput value={s.maybeBandPct} onChange={(maybeBandPct) => set({ maybeBandPct })} /></Field>
                <Field label="Hours padding per risk (%)"><NumInput value={s.riskPenaltyPct} onChange={(riskPenaltyPct) => set({ riskPenaltyPct })} /></Field>
                <Field label="Content score that raises a level"><NumInput value={s.contentBumpScore} step="1" onChange={(contentBumpScore) => set({ contentBumpScore })} /></Field>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Take: projected $/hr at or above {fmtMoney(s.targetHourly, false)}. Maybe: down to {fmtMoney(s.targetHourly * (1 - s.maybeBandPct / 100), false)}. Pass: below that, or the job loses money. Each risk adds {s.riskPenaltyPct}% to the hours; 3+ risks drop a level; a content score of {s.contentBumpScore}+ raises a level.</p>
            </section>
          )}
          {sec === 'content' && (
            <section className="card stack">
              <h2>Content keywords</h2>
              <p className="small muted" style={{ margin: 0 }}>Scores a job's content potential from words in the car, the customer concern, the job names and notes. One matching keyword scores 1 (“Some”) for that factor, two or more score 2 (“Strong”). Separate keywords with commas.</p>
              {(Object.keys(CONTENT_FACTORS) as ContentFactor[]).map((k) => (
                <Field key={k} label={CONTENT_FACTORS[k]}><input value={s.contentKeywords[k] ?? ''} onChange={(e) => set({ contentKeywords: { ...s.contentKeywords, [k]: e.target.value } })} /></Field>
              ))}
              <label className="check"><input type="checkbox" checked={s.contentAutoScore} onChange={(e) => set({ contentAutoScore: e.target.checked })} />Score automatically: an RO with no content score yet takes the keyword score when its Content tab is opened</label>
            </section>
          )}
          {sec === 'google' && <GoogleSection s={s} set={set} dirty={dirty} />}
          {sec === 'data' && (
            <section className="card stack">
              <h2>Backup & data</h2>
              <p className="small muted" style={{ margin: 0 }}>Everything is stored on this computer. A backup copy is made every time the app opens (the last 15 are kept).</p>
              <div className="row wrap">
                <button className="btn" onClick={async () => { const f = await act(() => api.backupNow()); if (f) toast(`Backup saved to ${f}`) }}>Save a backup…</button>
                <button className="btn" onClick={async () => { if (await confirmDialog('Restore replaces everything with the backup you pick. Your current data is backed up first.', 'Choose backup')) { const ok = await act(() => api.restore()); if (ok) toast('Backup restored') } }}>Restore from backup…</button>
                <button className="btn" onClick={() => api.openDataFolder()}>Open data folder</button>
              </div>
              {data.ros.length === 0 && <div className="row"><button className="btn" onClick={() => act(() => api.loadSample())}>Load sample shop data</button><span className="small muted">Adds example customers, cars and repair orders to try things out.</span></div>}
            </section>
          )}
          {['shop', 'labor', 'matrix', 'fees', 'tax', 'verdict', 'content', 'google'].includes(sec) && (
            <div className="savebar">
              {dirty && <span className="small muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>Unsaved changes</span>}
              <button className="btn" disabled={!dirty} onClick={() => setS(data.settings)}>Discard</button>
              <button className="btn primary" disabled={!dirty || !!matrixError} onClick={async () => { await act(() => api.saveSettings(s)); toast('Settings saved') }}>Save settings</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const HOURS = Array.from({ length: 25 }, (_, h) => h)
const hourLabel = (h: number) => (h === 0 || h === 24 ? 'Midnight' : h === 12 ? 'Noon' : `${h % 12} ${h < 12 ? 'AM' : 'PM'}`)

function checkMatrix(tiers: MatrixTier[]): string {
  if (!tiers.length) return 'Add at least one tier.'
  if (tiers.at(-1)!.upTo != null) return 'The last tier must be open-ended ("and above").'
  for (let i = 1; i < tiers.length - 1; i++) if ((tiers[i].upTo ?? 0) <= (tiers[i - 1].upTo ?? 0)) return `Tier ${i + 1} must end above $${tiers[i - 1].upTo}.`
  if (tiers.some((t) => t.markupPct < 0)) return 'Markups can’t be negative.'
  return ''
}
function TestCost({ settings }: { settings: Settings }) {
  const [c, setC] = useState(42)
  return <div className="row"><span className="small strong">Test a cost:</span><div style={{ width: 120 }}><NumInput className="sm" prefix="$" value={c} onChange={setC} /></div><span className="small">sells for <b>{fmtMoney(matrixPrice(c, settings))}</b></span></div>
}

function UsersSection() {
  const { data, act, user: me } = useData()
  const save = (u: Partial<User> & { id?: number }) => act(() => api.save('users', u))
  return (
    <section className="card stack">
      <h2>Users & roles</h2>
      <table>
        <thead><tr><th /><th>Name</th><th>Role</th><th>PIN</th><th className="n">Own cost $/hr</th><th>Active</th></tr></thead>
        <tbody>{data.users.map((u) => (
          <tr key={u.id}>
            <td style={{ width: 40 }}><button className="btn ghost sm icon" aria-label="Change colour" onClick={() => save({ id: u.id, color: COLORS[(COLORS.indexOf(u.color) + 1) % COLORS.length] })}><Avatar u={u} sm /></button></td>
            <td><LazyInput className="sm" value={u.name} onCommit={(name) => save({ id: u.id, name })} /></td>
            <td style={{ width: 130 }}><select className="sm" value={u.role} disabled={u.id === me?.id} onChange={(e) => save({ id: u.id, role: e.target.value as User['role'] })}>{ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></td>
            <td style={{ width: 120 }}><LazyInput className="sm" type="password" value={u.pin} placeholder="none" aria-label="PIN (4–6 digits)" onCommit={(pin) => /^\d{0,6}$/.test(pin) && save({ id: u.id, pin })} /></td>
            <td style={{ width: 120 }}><NumInput className="sm" prefix="$" value={u.hourlyCost} onChange={(hourlyCost) => save({ id: u.id, hourlyCost })} /></td>
            <td><input type="checkbox" checked={u.active} disabled={u.id === me?.id} onChange={(e) => save({ id: u.id, active: e.target.checked })} aria-label="Active" /></td>
          </tr>
        ))}</tbody>
      </table>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => save({ name: 'New tech', role: 'tech', color: COLORS[data.users.length % COLORS.length] })}>+ Add user</button>
      <div className="small muted stack tight">
        <span><b>Owner:</b> everything, including Settings and profit reports.</span>
        <span><b>Advisor:</b> everything except Settings and profit reports.</span>
        <span><b>Tech:</b> job board, inspections and clocks. No prices, costs or profit.</span>
        <span>PINs are 4–6 digits and are asked when switching user or punching the time clock. Leave blank for no PIN. "Own cost" overrides the shop's tech cost for that person (0 = use the shop default).</span>
      </div>
    </section>
  )
}

function TemplatesSection() {
  const { data, act } = useData()
  const [selId, setSelId] = useState<number | null>(data.templates[0]?.id ?? null)
  const t = data.templates.find((x) => x.id === selId)
  const [text, setText] = useState('')
  const toText = (x: InspectionTemplate) => {
    let out = ''
    let sec = ''
    for (const it of x.items) {
      if (it.section !== sec) { out += `${out ? '\n' : ''}# ${it.section}\n`; sec = it.section }
      out += `${it.name}\n`
    }
    return out
  }
  useEffect(() => setText(t ? toText(t) : ''), [t])
  const parse = (src: string) => {
    let sec = 'General'
    return src.split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => (l.startsWith('#') ? ((sec = l.replace(/^#+\s*/, '')), []) : [{ section: sec, name: l }]))
  }
  return (
    <section className="card stack">
      <h2>Inspection templates</h2>
      <div className="row wrap">
        {data.templates.map((x) => <button key={x.id} className={`btn sm ${x.id === selId ? 'primary' : ''}`} onClick={() => setSelId(x.id)}>{x.name}</button>)}
        <button className="btn sm" onClick={async () => { const n = await act(() => api.save('templates', { name: 'New template', items: [{ section: 'General', name: 'First item' }] })); if (n) setSelId(n.id) }}>+ New template</button>
      </div>
      {t && (
        <>
          <Field label="Name"><LazyInput value={t.name} onCommit={(name) => act(() => api.save('templates', { id: t.id, name }))} /></Field>
          <Field label="Items: one per line. Start a line with # to begin a section."><textarea style={{ minHeight: 340, fontFamily: 'var(--mono)', fontSize: 13 }} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="row">
            <button className="btn primary" disabled={text === toText(t)} onClick={() => act(() => api.save('templates', { id: t.id, items: parse(text) }))}>Save template ({parse(text).length} items)</button>
            <button className="btn danger" onClick={async () => { if (await confirmDialog(`Delete the template "${t.name}"? Past inspections keep their items.`)) { await act(() => api.remove('templates', t.id)); setSelId(null) } }}>Delete</button>
          </div>
        </>
      )}
    </section>
  )
}

function GoogleSection({ s, set, dirty }: { s: Settings; set: (p: Partial<Settings>) => void; dirty: boolean }) {
  const { data, act, toast } = useData()
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  return (
    <section className="card stack">
      <h2>Google Calendar</h2>
      <p className="small muted" style={{ margin: 0 }}>Copies appointments to the shop's business Google Calendar: customer, car, what for, tech and RO number, at the shop's address. Editing or cancelling an appointment here updates or removes the event. Changes made in Google Calendar don't come back here.</p>
      <p className="small muted" style={{ margin: 0 }}>One-time setup: create a Google OAuth client (Desktop app) with the Google Calendar API turned on, and paste it here. Steps are in <code>docs/GOOGLE_SETUP.md</code>. Sign in with the business Google account.</p>
      <div className="grid2">
        <Field label="Client ID"><input value={s.googleClientId} onChange={(e) => set({ googleClientId: e.target.value.trim() })} /></Field>
        <Field label="Client secret"><input type="password" value={s.googleClientSecret} onChange={(e) => set({ googleClientSecret: e.target.value.trim() })} /></Field>
      </div>
      <div className="row wrap">
        {data.googleConnected ? (
          <>{data.calendarAllowed ? <span className="pill p-green">Connected</span> : <span className="pill p-amber">Connected without Calendar access: disconnect and connect again</span>}
            <button className="btn" onClick={() => act(() => api.googleDisconnect())}>Disconnect</button></>
        ) : (
          <><span className="pill p-slate">Not connected</span>
            <button className="btn primary" disabled={connecting || dirty || !s.googleClientId || !s.googleClientSecret} title={dirty ? 'Save settings first' : undefined}
              onClick={async () => { setConnecting(true); const ok = await act(() => api.googleConnect()); setConnecting(false); if (ok) toast('Connected to Google') }}>
              {connecting ? 'Waiting for Google sign-in in your browser…' : 'Connect Google account'}</button></>
        )}
      </div>
      <div className="grid2">
        <Field label="Calendar ID"><input value={s.googleCalendarId} onChange={(e) => set({ googleCalendarId: e.target.value.trim() })} placeholder="primary" /></Field>
        <span />
      </div>
      <p className="small muted" style={{ margin: 0 }}>“primary” is the account's main calendar. To use another calendar, paste its ID from Google Calendar ▸ that calendar's Settings ▸ Integrate calendar.</p>
      <label className="check"><input type="checkbox" checked={s.calendarSync} onChange={(e) => set({ calendarSync: e.target.checked })} />Copy appointments to Google Calendar as they're saved</label>
      <div className="row wrap">
        <button className="btn" disabled={syncing || dirty || !data.googleConnected || !data.calendarAllowed} title={dirty ? 'Save settings first' : undefined}
          onClick={async () => { setSyncing(true); const r = await act(() => api.syncCalendarNow()); setSyncing(false); if (r) toast(`Google Calendar: ${r.written} appointment${r.written === 1 ? '' : 's'} copied${r.removed ? `, ${r.removed} removed` : ''}`) }}>
          {syncing ? 'Copying…' : 'Copy all appointments now'}</button>
        <span className="small muted">{s.calendarLastSync ? `Last copied ${new Date(s.calendarLastSync).toLocaleString()}` : 'Not copied yet'}</span>
      </div>
      {s.calendarLastError && <div className="small neg">Last copy failed: {s.calendarLastError}</div>}
    </section>
  )
}
