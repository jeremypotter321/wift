import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { Field, fmtMoney, NumInput } from '../ui'
import type { Settings } from '../../../shared/types'

const SECTIONS = [
  ['rates', 'Shop & rates'],
  ['techs', 'Techs'],
  ['verdict', 'Verdict'],
  ['google', 'Google Sheets'],
  ['data', 'Data & backup'],
] as const

export function SettingsPage() {
  const { data, act } = useStore()
  const [s, setS] = useState<Settings | null>(data?.settings ?? null)
  const [newTech, setNewTech] = useState('')
  const [msg, setMsg] = useState('')
  const [connecting, setConnecting] = useState(false)
  useEffect(() => setS(data?.settings ?? null), [data?.settings])
  if (!data || !s) return null
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings)
  const set = (p: Partial<Settings>) => setS({ ...s, ...p })
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <span className="grow" />
        {dirty && <button className="btn" onClick={() => setS(data.settings)}>Discard</button>}
        <button className="btn primary" disabled={!dirty} onClick={() => act(() => api.saveSettings(s))}>{dirty ? 'Save settings' : 'Saved'}</button>
      </div>
      {msg && <div className="okbar" style={{ marginBottom: 12 }} role="status">{msg}</div>}
      <div className="settings">
        <nav className="section-nav" aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => <button key={id} className="nav-item" onClick={() => jump(id)}>{label}</button>)}
        </nav>
        <div className="stack">
          <section className="card stack" id="rates">
            <h2>Shop & rates</h2>
            <Field label="Shop name"><input value={s.shopName} onChange={(e) => set({ shopName: e.target.value })} /></Field>
            <div className="grid3">
              <Field label="Labor rate you charge ($/hr)"><NumInput prefix="$" value={s.laborRate} onChange={(laborRate) => set({ laborRate })} /></Field>
              <Field label="Tech cost ($/hr, wages + taxes)"><NumInput prefix="$" value={s.techCost} onChange={(techCost) => set({ techCost })} /></Field>
              <Field label="Overhead ($/hr)"><NumInput prefix="$" value={s.overheadPerHour} onChange={(overheadPerHour) => set({ overheadPerHour })} /></Field>
            </div>
            <div className="grid3">
              <Field label="Target effective $/hr"><NumInput prefix="$" value={s.targetHourly} onChange={(targetHourly) => set({ targetHourly })} /></Field>
              <Field label="Parts markup (%)"><NumInput value={s.partsMarkupPct} onChange={(partsMarkupPct) => set({ partsMarkupPct })} /></Field>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              <b>Overhead</b> = rent, insurance, utilities, tools and software for a month, divided by the hours you work in a month.
              <b> Effective $/hr</b> = what the job brings in after parts cost, divided by hours worked. Shops usually aim for about 90% of their posted rate
              ({fmtMoney(s.laborRate * 0.9)} at {fmtMoney(s.laborRate)}). Markup {s.partsMarkupPct}% means a $100 part is charged at {fmtMoney(100 * (1 + s.partsMarkupPct / 100))}.
            </p>
          </section>

          <section className="card stack" id="techs">
            <h2>Techs</h2>
            <div className="row wrap">
              {s.techs.map((t) => (
                <span className="chip" key={t}>
                  {t}
                  <button aria-label={`Remove ${t}`} onClick={() => set({ techs: s.techs.filter((x) => x !== t) })}>×</button>
                </span>
              ))}
            </div>
            <div className="row">
              <input style={{ width: 240 }} value={newTech} placeholder="Name" onChange={(e) => setNewTech(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newTech.trim()) { set({ techs: [...s.techs, newTech.trim()] }); setNewTech('') } }} />
              <button className="btn" disabled={!newTech.trim() || s.techs.includes(newTech.trim())} onClick={() => { set({ techs: [...s.techs, newTech.trim()] }); setNewTech('') }}>Add tech</button>
            </div>
          </section>

          <section className="card stack" id="verdict">
            <h2>"Should I take it?" tuning</h2>
            <div className="grid3">
              <Field label="Maybe band (% under target)"><NumInput value={s.maybeBandPct} onChange={(maybeBandPct) => set({ maybeBandPct })} /></Field>
              <Field label="Hours padding per risk (%)"><NumInput value={s.riskPenaltyPct} onChange={(riskPenaltyPct) => set({ riskPenaltyPct })} /></Field>
              <Field label="Content score that raises a level"><NumInput value={s.contentBumpScore} step="1" onChange={(contentBumpScore) => set({ contentBumpScore })} /></Field>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Take: projected $/hr at or above {fmtMoney(s.targetHourly)}. Maybe: down to {fmtMoney(s.targetHourly * (1 - s.maybeBandPct / 100))}. Pass: below that, or the job loses money.
              Each risk adds {s.riskPenaltyPct}% to the hours, and 3+ risks drop a level. A content score of {s.contentBumpScore}+ raises a level.
            </p>
          </section>

          <section className="card stack" id="google">
            <h2>Google Sheets</h2>
            <p className="small muted" style={{ margin: 0 }}>
              One-time setup: create a Google OAuth client (Desktop app) and paste it below. The steps are in <code>docs/GOOGLE_SETUP.md</code>.
              Shopboard can only see the spreadsheet it creates, nothing else in your Drive.
            </p>
            <div className="grid2">
              <Field label="Client ID"><input value={s.googleClientId} onChange={(e) => set({ googleClientId: e.target.value.trim() })} /></Field>
              <Field label="Client secret"><input type="password" value={s.googleClientSecret} onChange={(e) => set({ googleClientSecret: e.target.value.trim() })} /></Field>
            </div>
            <div className="row wrap">
              {data.googleConnected ? (
                <>
                  <span className="pill st-done">Connected</span>
                  <button className="btn" onClick={() => act(() => api.googleDisconnect())}>Disconnect</button>
                </>
              ) : (
                <>
                  <span className="pill st-lead">Not connected</span>
                  <button
                    className="btn primary"
                    disabled={connecting || dirty || !s.googleClientId || !s.googleClientSecret}
                    title={dirty ? 'Save settings first' : undefined}
                    onClick={async () => {
                      setConnecting(true)
                      setMsg('')
                      const ok = await act(() => api.googleConnect())
                      setConnecting(false)
                      if (ok) setMsg('Connected to Google.')
                    }}
                  >
                    {connecting ? 'Waiting for Google sign-in in your browser…' : 'Connect Google account'}
                  </button>
                </>
              )}
              {s.googleSpreadsheetId && (
                <button className="btn" onClick={() => api.openLink(`https://docs.google.com/spreadsheets/d/${s.googleSpreadsheetId}/edit`)}>Open spreadsheet</button>
              )}
            </div>
            {s.googleSpreadsheetId && (
              <Field label="Spreadsheet ID (clear it to start a new spreadsheet on the next push)">
                <input value={s.googleSpreadsheetId} onChange={(e) => set({ googleSpreadsheetId: e.target.value.trim() })} />
              </Field>
            )}
          </section>

          <section className="card stack" id="data">
            <h2>Data & backup</h2>
            <p className="small muted" style={{ margin: 0 }}>Everything is saved on this computer. A backup copy is made every time Shopboard opens (the last 15 are kept).</p>
            <div className="row wrap">
              <button className="btn" onClick={async () => { const f = await act(() => api.backupNow()); if (f) setMsg(`Backup saved to ${f}`) }}>Save a backup…</button>
              <button className="btn" onClick={async () => {
                if (!window.confirm('Restore replaces everything in Shopboard with the backup you pick. Your current data is backed up first. Continue?')) return
                const ok = await act(() => api.restore())
                if (ok) setMsg('Backup restored.')
              }}>Restore from backup…</button>
              <button className="btn" onClick={() => api.openDataFolder()}>Open data folder</button>
            </div>
            {data.jobs.length === 0 && (
              <div className="row">
                <button className="btn" onClick={() => act(() => api.loadSample())}>Load sample jobs</button>
                <span className="small muted">Adds 9 example jobs so you can try things out. Delete them when you're done.</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
