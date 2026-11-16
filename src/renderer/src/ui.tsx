import { useEffect, useState, type ReactNode } from 'react'
import type { Tint, Verdict } from '../../shared/calc'
import { CONTENT_FACTORS, RISK_FLAGS, type ContentFactor, type ContentScores, type JobStatus, type RiskFlag } from '../../shared/types'

export const fmtMoney = (n: number | null | undefined, cents = false) => {
  if (n == null || Number.isNaN(n)) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  return `${n < 0 ? '−' : ''}$${s}`
}
export const fmtHours = (n: number | null | undefined) => (n == null ? '—' : `${(Math.round(n * 10) / 10).toLocaleString('en-US')} h`)
export const fmtDate = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

/** Profit stays in the normal text colour unless it's negative (brief: never colour profit green). */
export function Money({ v, cents }: { v: number | null | undefined; cents?: boolean }) {
  return <span className={`num ${v != null && v < 0 ? 'neg' : ''}`}>{fmtMoney(v, cents)}</span>
}

export function Hourly({ v, tint }: { v: number | null; tint: Tint }) {
  if (v == null) return <span className="muted">—</span>
  const mark = tint === 'bad' || tint === 'warn' ? ' ▼' : ''
  return <span className={`num tint-${tint}`}>{fmtMoney(v)}/h{mark}</span>
}

export const statusClass = (s: JobStatus) => `st-${s.toLowerCase().replace(/\s+/g, '-')}`
export const StatusPill = ({ s }: { s: JobStatus }) => <span className={`pill ${statusClass(s)}`}>{s}</span>

/** Number input that lets you clear the field while typing without snapping to 0. */
export function NumInput({ value, onChange, prefix, step = 'any', min = 0, ...rest }: {
  value: number
  onChange: (n: number) => void
  prefix?: string
  step?: string
  min?: number
  'aria-label'?: string
  placeholder?: string
}) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    if ((Number(text) || 0) !== value) setText(value ? String(value) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const input = (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(Number(e.target.value) || 0)
      }}
      {...rest}
    />
  )
  return prefix ? <div className="prefix"><span>{prefix}</span>{input}</div> : input
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  )
}

export function Seg<T extends string | number>({ options, value, onChange, labels }: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labels?: Record<string, string>
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o)} type="button" role="radio" aria-checked={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {labels?.[String(o)] ?? String(o)}
        </button>
      ))}
    </div>
  )
}

const VERDICT_ICON = { Take: '✓', Maybe: '?', Pass: '✕' }

export function VerdictCard({ v, title = 'Should I take it?' }: { v: Verdict; title?: string }) {
  const cls = v.level ? v.level.toLowerCase() : ''
  return (
    <div className={`verdict ${cls}`} aria-live="polite">
      <div className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      <div className="word">
        {v.level ? (
          <>
            <span aria-hidden>{VERDICT_ICON[v.level]}</span> {v.level}
          </>
        ) : (
          <span className="muted" style={{ fontSize: 16, fontWeight: 550 }}>Fill in hours and price to see a verdict</span>
        )}
      </div>
      <ul>
        {v.reasons.map((r, i) => (
          <li key={i} className={r.tone}>
            <span className="mark" aria-hidden>{r.tone === 'good' ? '+' : r.tone === 'bad' ? '−' : '•'}</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      {v.level && (
        <div className="figures">
          <div>Projected $/hr<b>{fmtMoney(v.projectedHourly)}</b></div>
          <div>Projected profit<b className={v.projectedProfit < 0 ? 'neg' : ''}>{fmtMoney(v.projectedProfit)}</b></div>
          <div>Content<b>{v.contentScore}/10</b></div>
        </div>
      )}
    </div>
  )
}

export function ContentEditor({ value, onChange }: { value: ContentScores; onChange: (c: ContentScores) => void }) {
  return (
    <div>
      {(Object.keys(CONTENT_FACTORS) as ContentFactor[]).map((k) => (
        <div className="factor" key={k}>
          <span>{CONTENT_FACTORS[k]}</span>
          <Seg options={[0, 1, 2] as const} labels={{ 0: 'No', 1: 'Some', 2: 'Strong' }} value={value[k] as 0 | 1 | 2} onChange={(n) => onChange({ ...value, [k]: n })} />
        </div>
      ))}
    </div>
  )
}

export function RiskEditor({ value, onChange }: { value: RiskFlag[]; onChange: (f: RiskFlag[]) => void }) {
  return (
    <div className="grid2" style={{ gap: 2 }}>
      {(Object.keys(RISK_FLAGS) as RiskFlag[]).map((k) => (
        <label className="check" key={k}>
          <input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />
          {RISK_FLAGS[k]}
        </label>
      ))}
    </div>
  )
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span>{text}</span>
      {action}
    </div>
  )
}

/** Live hh:mm:ss from an ISO start time plus already-logged hours. */
export function useElapsed(startIso: string | null | undefined, baseHours = 0) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!startIso) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startIso])
  if (!startIso) return '00:00:00'
  const secs = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000 + baseHours * 3600))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(secs / 3600))}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}`
}

export const vehicleOf = (j: { vehicleYear: string; vehicleMake: string; vehicleModel: string }) =>
  [j.vehicleYear, j.vehicleMake, j.vehicleModel].filter(Boolean).join(' ')
