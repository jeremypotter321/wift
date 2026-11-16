import { useMemo, useState } from 'react'
import { useNav } from '../App'
import { api } from '../api'
import { useStore } from '../store'
import { Field, fmtMoney } from '../ui'
import { buildReport } from '../../../shared/report'

const iso = (d: Date) => d.toISOString().slice(0, 10)
function preset(p: string): [string, string] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (p) {
    case 'this-month': return [iso(new Date(Date.UTC(y, m, 1))), iso(now)]
    case 'last-month': return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))]
    case 'this-quarter': return [iso(new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))), iso(now)]
    case 'this-year': return [`${y}-01-01`, iso(now)]
    case 'last-year': return [`${y - 1}-01-01`, `${y - 1}-12-31`]
    default: return ['', '']
  }
}
const PRESETS: [string, string][] = [
  ['this-month', 'This month'], ['last-month', 'Last month'], ['this-quarter', 'This quarter'],
  ['this-year', 'This year'], ['last-year', 'Last year'], ['all', 'All time'],
]

export function ExportPage() {
  const { data, act } = useStore()
  const nav = useNav()
  const [p, setP] = useState('this-month')
  const [[from, to], setRange] = useState(preset('this-month'))
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState<{ text: string; url?: string } | null>(null)

  const report = useMemo(() => (data ? buildReport(data.jobs, data.labor, data.parts, data.settings, from, to) : null), [data, from, to])
  if (!data || !report) return null
  const months = report.tables[3].rows
  const revenue = months.reduce((a, r) => a + (r[4] as number), 0)
  const profit = months.reduce((a, r) => a + (r[12] as number), 0)

  async function run(kind: 'sheets' | 'xlsx' | 'csv') {
    setBusy(kind)
    setDone(null)
    try {
      if (kind === 'sheets') {
        const r = await act(() => api.pushSheets(from, to))
        if (r) setDone({ text: 'Pushed to Google Sheets.', url: r.url })
      } else if (kind === 'xlsx') {
        const f = await act(() => api.exportXlsx(from, to))
        if (f) setDone({ text: `Saved ${f}` })
      } else {
        const d = await act(() => api.exportCsv(from, to))
        if (d) setDone({ text: `Saved 4 CSV files to ${d}` })
      }
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page">
      <div className="page-head"><h1>Export for the accountant</h1></div>
      <div className="stack" style={{ maxWidth: 900 }}>
        <section className="card stack">
          <h2>Date range</h2>
          <div className="row wrap">
            {PRESETS.map(([k, label]) => (
              <button key={k} className={`btn ${p === k ? 'primary' : ''}`} style={{ height: 36 }} onClick={() => { setP(k); setRange(preset(k)) }}>{label}</button>
            ))}
          </div>
          <div className="row">
            <Field label="From"><input type="date" value={from} onChange={(e) => { setP('custom'); setRange([e.target.value, to]) }} style={{ width: 170 }} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => { setP('custom'); setRange([from, e.target.value]) }} style={{ width: 170 }} /></Field>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Includes <b className="num">{report.tables[0].rows.length}</b> jobs, <b className="num">{report.tables[1].rows.length}</b> labor entries and{' '}
            <b className="num">{report.tables[2].rows.length}</b> parts. Finished jobs in range: revenue <b className="num">{fmtMoney(revenue)}</b>, profit{' '}
            <b className="num">{fmtMoney(profit)}</b>. Leads and declined jobs are left out. A job counts on the day it was finished.
          </p>
          <p className="small muted" style={{ margin: 0 }}>Four tabs: Jobs, Labor, Parts, Monthly summary.</p>
        </section>

        <div className="grid2">
          <section className="card stack">
            <h2>Google Sheets</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {data.settings.googleSpreadsheetId
                ? 'Updates your Shopboard spreadsheet. Every tab is rewritten with this range.'
                : 'The first push creates a spreadsheet in your Google Drive. Share it with your accountant once; later pushes update it.'}
            </p>
            {data.googleConnected ? (
              <button className="btn primary big" disabled={!!busy} onClick={() => run('sheets')}>{busy === 'sheets' ? 'Pushing…' : 'Push to Google Sheets'}</button>
            ) : (
              <>
                <button className="btn big" disabled>Push to Google Sheets</button>
                <span className="small">Not connected. <a href="#" onClick={(e) => { e.preventDefault(); nav({ page: 'settings' }) }}>Connect Google in Settings</a></span>
              </>
            )}
          </section>
          <section className="card stack">
            <h2>File</h2>
            <p className="small muted" style={{ margin: 0 }}>An Excel workbook (opens in Google Sheets too), or one CSV per tab.</p>
            <button className="btn primary big" disabled={!!busy} onClick={() => run('xlsx')}>{busy === 'xlsx' ? 'Saving…' : 'Save .xlsx'}</button>
            <button className="btn" disabled={!!busy} onClick={() => run('csv')}>{busy === 'csv' ? 'Saving…' : 'Save CSV files'}</button>
          </section>
        </div>

        {done && (
          <div className="okbar" role="status">
            {done.text}{' '}
            {done.url && <a href="#" onClick={(e) => { e.preventDefault(); void api.openLink(done.url!) }}>Open the spreadsheet</a>}
          </div>
        )}
      </div>
    </div>
  )
}
