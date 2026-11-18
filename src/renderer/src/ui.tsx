import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { payState, type RoTotals, type Tint, type Verdict } from '../../shared/calc'
import { CONTENT_FACTORS, RISK_FLAGS, type ContentFactor, type ContentScores, type RepairOrder, type RiskFlag, type User } from '../../shared/types'

// ---------- formatting ----------
export const fmtMoney = (n: number | null | undefined, cents = true) => {
  if (n == null || Number.isNaN(n)) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  return `${n < 0 ? '−' : ''}$${s}`
}
export const fmtHours = (n: number | null | undefined) => (n == null ? '—' : `${(Math.round(n * 10) / 10).toLocaleString('en-US')} h`)
export const fmtDate = (d: string) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
export const fmtShortDate = (d: string) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')
export const fmtTime = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`)
export const todayIso = () => localDate(new Date())
export const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const daysAgo = (iso: string) => (iso ? Math.floor((Date.now() - new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).getTime()) / 86_400_000) : 0)
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

export function Money({ v, cents = true }: { v: number | null | undefined; cents?: boolean }) {
  return <span className={`num ${v != null && v < 0 ? 'neg' : ''}`}>{fmtMoney(v, cents)}</span>
}
export function Hourly({ v, tint }: { v: number | null; tint: Tint }) {
  if (v == null) return <span className="faint">—</span>
  return <span className={`num tint-${tint}`}>{fmtMoney(v, false)}/h{tint === 'bad' || tint === 'warn' ? ' ▼' : ''}</span>
}
export const Avatar = ({ u, sm }: { u?: User | null; sm?: boolean }) =>
  u ? <span className={`avatar ${sm ? 'sm' : ''}`} style={{ background: u.color || '#475569' }} title={u.name} aria-label={u.name}>{initials(u.name)}</span> : null

// ---------- RO status pill ----------
export function roPill(ro: RepairOrder, t?: RoTotals): { word: string; cls: string } {
  if (ro.status === 'completed' && t) {
    const p = payState(ro, t)
    if (p === 'Paid') return { word: 'Paid', cls: 'p-teal' }
    if (p === 'A/R' && ro.pickedUpAt) return { word: 'On account', cls: 'p-violet' }
  }
  if (ro.status === 'completed') return { word: ro.stage || 'Ready for pickup', cls: 'p-green' }
  if (ro.status === 'wip') return { word: ro.stage || 'In progress', cls: /Waiting/.test(ro.stage) ? 'p-amber' : 'p-blue' }
  return { word: ro.stage === 'Not started' || !ro.stage ? 'Estimate' : ro.stage, cls: 'p-slate' }
}
export const Pill = ({ word, cls }: { word: string; cls: string }) => <span className={`pill ${cls}`}>{word}</span>
export const RoPill = ({ ro, t }: { ro: RepairOrder; t?: RoTotals }) => <Pill {...roPill(ro, t)} />

// ---------- inputs ----------
/** Number input that can be cleared while typing without snapping to 0. */
export function NumInput({ value, onChange, prefix, step = 'any', min, className, onBlur, ...rest }: {
  value: number; onChange: (n: number) => void; prefix?: string; step?: string; min?: number; className?: string; onBlur?: () => void
  'aria-label'?: string; placeholder?: string; disabled?: boolean
}) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    if ((Number(text) || 0) !== value) setText(value ? String(value) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const input = (
    <input type="number" inputMode="decimal" step={step} min={min} value={text} className={className} onBlur={onBlur}
      onChange={(e) => { setText(e.target.value); onChange(Number(e.target.value) || 0) }} {...rest} />
  )
  return prefix ? <div className="prefix"><span>{prefix}</span>{input}</div> : input
}
/** Text input that saves on blur / Enter instead of every keystroke. */
export function LazyInput({ value, onCommit, className, ...rest }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; 'aria-label'?: string; type?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input value={v} className={className} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} {...rest} />
  )
}
/** Like LazyInput, but wraps and grows with its text so long descriptions are never cut off. Enter commits; Shift+Enter is a new line. */
export function LazyText({ value, onCommit, className, ...rest }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; 'aria-label'?: string }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setV(value), [value])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  })
  return (
    <textarea ref={ref} rows={1} value={v} className={`autogrow ${className ?? ''}`} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } }} {...rest} />
  )
}
export function LazyNum({ value, onCommit, ...rest }: { value: number; onCommit: (n: number) => void; prefix?: string; step?: string; className?: string; 'aria-label'?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <NumInput value={v} onChange={setV} onBlur={() => v !== value && onCommit(v)} {...rest} />
}
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className ?? ''}`}>{label}{children}</label>
}
export function Seg<T extends string | number>({ options, value, onChange, labels, className }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Record<string, string>; className?: string
}) {
  return (
    <div className={`seg ${className ?? ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={String(o)} type="button" role="radio" aria-checked={o === value} className={`${o === value ? 'on' : ''} opt-${String(o)}`} onClick={() => onChange(o)}>
          {labels?.[String(o)] ?? String(o)}
        </button>
      ))}
    </div>
  )
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, ReactNode][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  )
}
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="empty"><span>{text}</span>{action}</div>
}

// ---------- modal + menu ----------
export function Modal({ title, onClose, children, foot, size }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; size?: 'wide' | 'xl' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h2>{title}</h2><button className="btn ghost icon" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  )
}
export function Menu({ label, items, className }: { label: ReactNode; items: ({ label: string; onClick: () => void; danger?: boolean } | false | null)[]; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="rel" ref={ref}>
      <button className={className ?? 'btn ghost icon'} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>{label}</button>
      {open && (
        <div className="popover" role="menu" style={{ right: 0, top: '100%', marginTop: 4 }}>
          {items.filter(Boolean).map((it) => it && (
            <button key={it.label} role="menuitem" className={`menu-item ${it.danger ? 'danger' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick() }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
/** Confirm with the app's own dialog. Returns a promise of the answer. */
let confirmHost: ((q: { text: string; ok: string; resolve: (b: boolean) => void }) => void) | null = null
export function confirmDialog(text: string, ok = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => (confirmHost ? confirmHost({ text, ok, resolve }) : resolve(window.confirm(text))))
}
export function ConfirmHost() {
  const [q, setQ] = useState<{ text: string; ok: string; resolve: (b: boolean) => void } | null>(null)
  useEffect(() => {
    confirmHost = setQ
    return () => { confirmHost = null }
  }, [])
  if (!q) return null
  const done = (b: boolean) => { q.resolve(b); setQ(null) }
  return (
    <Modal title="Are you sure?" onClose={() => done(false)} foot={<><button className="btn" onClick={() => done(false)}>Cancel</button><button className="btn solid-danger" autoFocus onClick={() => done(true)}>{q.ok}</button></>}>
      <p style={{ margin: 0 }}>{q.text}</p>
    </Modal>
  )
}

// ---------- verdict + content + risks ----------
const VERDICT_ICON = { Take: '✓', Maybe: '?', Pass: '✕' }
export function VerdictCard({ v, children }: { v: Verdict; children?: ReactNode }) {
  return (
    <div className={`verdict ${v.level?.toLowerCase() ?? ''}`} aria-live="polite">
      <div className="small muted strong" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Should I take it?</div>
      <div className="word">{v.level ? <><span aria-hidden>{VERDICT_ICON[v.level]}</span> {v.level}</> : <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>Add labor hours and prices to see a verdict.</span>}</div>
      <ul>
        {v.reasons.map((r, i) => (
          <li key={i} className={r.tone}><span className="mark" aria-hidden>{r.tone === 'good' ? '+' : r.tone === 'bad' ? '−' : '•'}</span><span>{r.text}</span></li>
        ))}
      </ul>
      {v.level && (
        <div className="figures">
          <div>Projected $/hr<b>{fmtMoney(v.projectedHourly, false)}</b></div>
          <div>Projected profit<b className={v.projectedProfit < 0 ? 'neg' : ''}>{fmtMoney(v.projectedProfit, false)}</b></div>
          <div>Content<b>{v.contentScore}/10</b></div>
        </div>
      )}
      {children}
    </div>
  )
}
export function ContentEditor({ value, onChange }: { value: ContentScores; onChange: (c: ContentScores) => void }) {
  return (
    <div className="stack tight">
      {(Object.keys(CONTENT_FACTORS) as ContentFactor[]).map((k) => (
        <div className="row between" key={k}>
          <span>{CONTENT_FACTORS[k]}</span>
          <Seg options={[0, 1, 2] as const} labels={{ 0: 'No', 1: 'Some', 2: 'Strong' }} value={(value[k] ?? 0) as 0 | 1 | 2} onChange={(n) => onChange({ ...value, [k]: n })} />
        </div>
      ))}
    </div>
  )
}
export function RiskEditor({ value, onChange }: { value: RiskFlag[]; onChange: (f: RiskFlag[]) => void }) {
  return (
    <div>
      {(Object.keys(RISK_FLAGS) as RiskFlag[]).map((k) => (
        <label className="check small" key={k} style={{ minHeight: 30 }}>
          <input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />
          {RISK_FLAGS[k]}
        </label>
      ))}
    </div>
  )
}

/** Live h:mm:ss from an ISO start plus already-logged hours. */
export function useElapsed(startIso: string | null | undefined, baseHours = 0) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!startIso) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startIso])
  if (!startIso) return '0:00:00'
  const secs = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000 + baseHours * 3600))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(secs / 3600)}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}`
}

/** Download-free CSV builder for small tables. */
export function csvOf(headers: string[], rows: (string | number)[][]) {
  const esc = (c: string | number) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
