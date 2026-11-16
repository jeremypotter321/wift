import { createContext, useContext, useEffect, useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { ExportPage } from './pages/Export'
import { JobDetail } from './pages/JobDetail'
import { Jobs } from './pages/Jobs'
import { NewJob } from './pages/NewJob'
import { SettingsPage } from './pages/Settings'
import { useStore } from './store'
import { useElapsed } from './ui'

export type Route =
  | { page: 'dashboard' }
  | { page: 'jobs'; status?: string }
  | { page: 'new' }
  | { page: 'job'; id: number; tab?: string }
  | { page: 'export' }
  | { page: 'settings' }

const NavCtx = createContext<(r: Route) => void>(() => {})
export const useNav = () => useContext(NavCtx)

const NAV: { page: Route['page']; label: string; icon: string }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: '▦' },
  { page: 'jobs', label: 'Jobs', icon: '☰' },
  { page: 'new', label: 'Should I take it?', icon: '?' },
  { page: 'export', label: 'Export', icon: '⇪' },
  { page: 'settings', label: 'Settings', icon: '⚙' },
]

export function App() {
  const { data, error, clearError } = useStore()
  const [route, setRoute] = useState<Route>({ page: 'dashboard' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setRoute({ page: 'new' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!data) return <div className="empty" style={{ height: '100%', justifyContent: 'center' }}>Loading…</div>

  return (
    <NavCtx.Provider value={setRoute}>
      <div className="shell">
        <nav className="sidebar" aria-label="Main">
          <div className="brand">
            <span className="brand-mark" aria-hidden>S</span>
            <span>
              Shopboard
              <small>{data.settings.shopName}</small>
            </span>
          </div>
          <button className="btn primary block" style={{ marginBottom: 12 }} onClick={() => setRoute({ page: 'new' })} title="New job (N)">
            + New job
          </button>
          {NAV.map((n) => (
            <button
              key={n.page}
              className={`nav-item ${route.page === n.page || (route.page === 'job' && n.page === 'jobs') ? 'active' : ''}`}
              aria-current={route.page === n.page ? 'page' : undefined}
              onClick={() => setRoute({ page: n.page } as Route)}
            >
              <span aria-hidden style={{ width: 16, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
          <div className="spacer" />
          {data.timer && <TimerChip timer={data.timer} onOpen={() => setRoute({ page: 'job', id: data.timer!.jobId, tab: 'labor' })} />}
        </nav>
        <main className="main">
          {error && (
            <div className="errbar" role="alert">
              <span>{error}</span>
              <button className="btn" onClick={clearError}>Dismiss</button>
            </div>
          )}
          {route.page === 'dashboard' && <Dashboard />}
          {route.page === 'jobs' && <Jobs initialStatus={route.status} />}
          {route.page === 'new' && <NewJob />}
          {route.page === 'job' && <JobDetail key={route.id} id={route.id} initialTab={route.tab} />}
          {route.page === 'export' && <ExportPage />}
          {route.page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </NavCtx.Provider>
  )
}

function TimerChip({ timer, onOpen }: { timer: { timerStart: string | null; hours: number; jobTitle: string; tech: string }; onOpen: () => void }) {
  const t = useElapsed(timer.timerStart, timer.hours)
  return (
    <button className="timer-chip" onClick={onOpen} title="Open the job with the running timer">
      ● Timer running · {timer.tech}
      <span className="t">{t}</span>
      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{timer.jobTitle}</span>
    </button>
  )
}
