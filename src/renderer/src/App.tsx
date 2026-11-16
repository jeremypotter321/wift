import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { useStore } from './store'
import { Avatar, ConfirmHost, fmtMoney, Modal, useElapsed } from './ui'
import { vehicleName } from '../../shared/bundle'
import { Dashboard } from './pages/Dashboard'
import { JobBoard } from './pages/JobBoard'
import { RoEditor } from './pages/RoEditor'
import { Appointments } from './pages/Appointments'
import { TimeClock } from './pages/TimeClock'
import { Customers, CustomerDetail } from './pages/Customers'
import { VehicleDetail } from './pages/VehicleDetail'
import { Reminders } from './pages/Reminders'
import { Inventory } from './pages/Inventory'
import { PurchaseOrders, PoDetail } from './pages/PurchaseOrders'
import { Vendors } from './pages/Vendors'
import { Payments } from './pages/Payments'
import { Reports } from './pages/Reports'
import { ExportPage } from './pages/Export'
import { CannedJobs } from './pages/CannedJobs'
import { SettingsPage } from './pages/Settings'
import type { User } from '../../shared/types'

export type Route =
  | { page: 'dashboard' } | { page: 'board'; view?: 'stage' | 'tech' } | { page: 'appointments' } | { page: 'timeclock' }
  | { page: 'customers' } | { page: 'customer'; id: number } | { page: 'vehicle'; id: number } | { page: 'reminders' }
  | { page: 'inventory' } | { page: 'pos' } | { page: 'po'; id: number } | { page: 'vendors' }
  | { page: 'payments' } | { page: 'reports' } | { page: 'export' } | { page: 'canned' } | { page: 'settings' }
  | { page: 'ro'; id: number; tab?: string }

const NavCtx = createContext<(r: Route) => void>(() => {})
export const useNav = () => useContext(NavCtx)

type NavItem = { page: Route['page']; label: string; icon: string; hide?: (u: User | null) => boolean }
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ page: 'dashboard', label: 'Dashboard', icon: '▦' }] },
  { group: 'Shop floor', items: [{ page: 'board', label: 'Job board', icon: '▥' }, { page: 'appointments', label: 'Appointments', icon: '◷' }, { page: 'timeclock', label: 'Time clock', icon: '⏱' }] },
  { group: 'Customers', items: [{ page: 'customers', label: 'Customers', icon: '☺' }, { page: 'reminders', label: 'Reminders', icon: '✉' }] },
  { group: 'Parts', items: [{ page: 'inventory', label: 'Inventory', icon: '▤' }, { page: 'pos', label: 'Purchase orders', icon: '⇲' }, { page: 'vendors', label: 'Vendors', icon: '⌂' }] },
  {
    group: 'Money',
    items: [
      { page: 'payments', label: 'Payments & A/R', icon: '$', hide: (u) => u?.role === 'tech' },
      { page: 'reports', label: 'Reports', icon: '▮', hide: (u) => u?.role === 'tech' },
      { page: 'export', label: 'Accountant export', icon: '⇪', hide: (u) => u?.role !== 'owner' },
    ],
  },
  { group: 'Library', items: [{ page: 'canned', label: 'Canned jobs', icon: '❒' }] },
]
const ACTIVE_FOR: Partial<Record<Route['page'], Route['page']>> = { ro: 'board', customer: 'customers', vehicle: 'customers', po: 'pos' }

export function App() {
  const { data, error, clearError, user, act, can } = useStore()
  const [route, setRoute] = useState<Route>({ page: 'dashboard' })
  const [search, setSearch] = useState(false)
  const [switching, setSwitching] = useState(false)
  // Sidebar: follows the window width (icon rail under 1280px) unless the user toggled it with ⌘\.
  const [sbPref, setSbPref] = useState<boolean | null>(() => { const v = localStorage.getItem('shopboard.sb'); return v == null ? null : v === '1' })
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1280)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1280)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const collapsed = sbPref ?? narrow

  const nav = (r: Route) => {
    setRoute(r)
    document.querySelector('.content')?.scrollTo(0, 0)
  }
  const newRo = async () => {
    const ro = await act(() => api.createRo({}))
    if (ro) nav({ page: 'ro', id: ro.id })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true) }
      else if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); localStorage.setItem('shopboard.sb', collapsed ? '0' : '1'); setSbPref(!collapsed) }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key === '/') { e.preventDefault(); setSearch(true) }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'n' && user?.role !== 'tech') { e.preventDefault(); void newRo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!data) return <div className="empty" style={{ height: '100%', justifyContent: 'center' }}>Loading…</div>
  const active = ACTIVE_FOR[route.page] ?? route.page
  const running = data.labor.filter((l) => l.timerStart)

  return (
    <NavCtx.Provider value={nav}>
      <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
        <nav className="sidebar" aria-label="Main">
          <div className="sb-logo">
            <img src="./icon.png" alt="" />
            <span><b>WIFT</b><small className="ellipsis">{data.settings.shopName}</small></span>
          </div>
          <div className="stripes" aria-hidden><i /><i /><i /></div>
          {user?.role !== 'tech' && (
            <div className="sb-new">
              <button className="btn primary" onClick={newRo} title="New repair order (N)"><span aria-hidden>+</span><span className="sb-label">New RO</span></button>
              <NewMenu nav={nav} />
            </div>
          )}
          <div className="sb-nav">
            {NAV.map((g, gi) => {
              const items = g.items.filter((i) => !i.hide?.(user))
              if (!items.length) return null
              return (
                <div key={gi}>
                  {g.group && <div className="sb-group"><span>{g.group}</span></div>}
                  {items.map((n) => (
                    <button key={n.page} className={`sb-item ${active === n.page ? 'active' : ''}`} aria-current={active === n.page ? 'page' : undefined}
                      title={collapsed ? n.label : undefined} aria-label={n.label} onClick={() => nav({ page: n.page } as Route)}>
                      <span className="ic" aria-hidden>{n.icon}</span><span className="sb-label">{n.label}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="sb-foot">
            {can.settings && (
              <button className={`sb-item ${active === 'settings' ? 'active' : ''}`} aria-label="Settings" onClick={() => nav({ page: 'settings' })}>
                <span className="ic" aria-hidden>⚙</span><span className="sb-label">Settings</span>
              </button>
            )}
            <button className="user-chip" onClick={() => setSwitching(true)} title="Switch user">
              <Avatar u={user} />
              <span className="grow"><span className="ellipsis" style={{ display: 'block' }}>{user?.name}</span><small style={{ color: 'var(--sb-text-2)', textTransform: 'capitalize' }}>{user?.role} · switch</small></span>
            </button>
          </div>
        </nav>

        <div className="main">
          <header className="topbar">
            <button className="searchbox" onClick={() => setSearch(true)} aria-label="Search">
              <span aria-hidden>⌕</span> Search customer, phone, plate, VIN, RO #<kbd>⌘K</kbd>
            </button>
            <span className="grow" />
            <ClockChip running={running} nav={nav} />
          </header>
          {error && <div className="errbar" role="alert"><span>{error}</span><button className="btn sm" onClick={clearError}>Dismiss</button></div>}
          <div className="content">
            <Page route={route} />
          </div>
        </div>
      </div>
      {search && <SearchPalette onClose={() => setSearch(false)} />}
      {switching && <SwitchUser onClose={() => setSwitching(false)} />}
      <ConfirmHost />
    </NavCtx.Provider>
  )
}

function Page({ route }: { route: Route }) {
  const { can } = useStore()
  switch (route.page) {
    case 'dashboard': return <Dashboard />
    case 'board': return <JobBoard initialView={route.view} />
    case 'ro': return <RoEditor key={route.id} id={route.id} initialTab={route.tab} />
    case 'appointments': return <Appointments />
    case 'timeclock': return <TimeClock />
    case 'customers': return <Customers />
    case 'customer': return <CustomerDetail key={route.id} id={route.id} />
    case 'vehicle': return <VehicleDetail key={route.id} id={route.id} />
    case 'reminders': return <Reminders />
    case 'inventory': return <Inventory />
    case 'pos': return <PurchaseOrders />
    case 'po': return <PoDetail key={route.id} id={route.id} />
    case 'vendors': return <Vendors />
    case 'payments': return can.payments ? <Payments /> : <NoAccess />
    case 'reports': return can.payments ? <Reports /> : <NoAccess />
    case 'export': return can.settings ? <ExportPage /> : <NoAccess />
    case 'canned': return <CannedJobs />
    case 'settings': return can.settings ? <SettingsPage /> : <NoAccess />
  }
}
const NoAccess = () => <div className="page"><div className="empty">Your role doesn't have access to this page. Switch user to continue.</div></div>

function NewMenu({ nav }: { nav: (r: Route) => void }) {
  const [open, setOpen] = useState(false)
  const items: [string, Route][] = [['Appointment', { page: 'appointments' }], ['Customer', { page: 'customers' }], ['Purchase order', { page: 'pos' }], ['Payment', { page: 'payments' }]]
  return (
    <div className="rel new-more">
      <button className="btn primary" aria-label="More new items" aria-expanded={open} onClick={() => setOpen(!open)}>▾</button>
      {open && (
        <div className="popover" style={{ left: 0, top: '100%', marginTop: 4 }} onMouseLeave={() => setOpen(false)}>
          {items.map(([label, r]) => <button key={label} className="menu-item" onClick={() => { setOpen(false); nav(r) }}>{label}</button>)}
        </div>
      )}
    </div>
  )
}

function ClockChip({ running, nav }: { running: { id: number; roId: number; jobId: number | null; timerStart: string | null; hours: number; userId: number | null }[]; nav: (r: Route) => void }) {
  const { data, act } = useStore()
  const [open, setOpen] = useState(false)
  const first = running[0]
  const elapsed = useElapsed(first?.timerStart, first?.hours ?? 0)
  if (!first || !data) return null
  const label = (l: typeof first) => {
    const ro = data.ros.find((r) => r.id === l.roId)
    const job = data.jobs.find((j) => j.id === l.jobId)
    return `RO ${ro?.number ?? '?'}${job ? ' · ' + job.title : ''}`
  }
  if (running.length === 1) {
    return (
      <div className="clock-chip" aria-live="off">
        <span className="pulse" aria-hidden />
        <button className="lbl ellipsis" style={{ maxWidth: 320 }} onClick={() => nav({ page: 'ro', id: first.roId })}>{label(first)} · {elapsed}</button>
        <button className="btn sm icon ghost" aria-label="Stop clock" onClick={() => act(() => api.stopClock(first.id))}>■</button>
      </div>
    )
  }
  return (
    <div className="rel">
      <button className="clock-chip" onClick={() => setOpen(!open)}><span className="pulse" aria-hidden /> {running.length} clocks running ▾</button>
      {open && (
        <div className="popover" style={{ right: 0, top: '100%', marginTop: 4, width: 360 }}>
          {running.map((l) => (
            <div key={l.id} className="row" style={{ padding: '4px 8px' }}>
              <span className="grow ellipsis small">{data.users.find((u) => u.id === l.userId)?.name ?? '—'} · {label(l)}</span>
              <button className="btn sm" onClick={() => act(() => api.stopClock(l.id))}>Stop</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const { data, ix, act } = useStore()
  const nav = useNav()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const results = useMemo(() => {
    if (!data || !ix) return []
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    const out: { group: string; title: string; sub: string; go: () => void }[] = []
    if (!s) {
      for (const ro of data.ros.filter((r) => r.status !== 'completed').slice(0, 8)) {
        const c = ro.customerId ? ix.customers.get(ro.customerId) : null
        out.push({ group: 'Open repair orders', title: `RO ${ro.number} · ${c?.name ?? 'No customer'}`, sub: vehicleName(ro.vehicleId ? ix.vehicles.get(ro.vehicleId) : null), go: () => nav({ page: 'ro', id: ro.id }) })
      }
      return out
    }
    const isVin = /^[a-hj-npr-z0-9]{11,17}$/i.test(s) && /\d/.test(s) && /[a-z]/i.test(s)
    for (const c of data.customers) {
      const hit = c.name.toLowerCase().includes(s) || c.company.toLowerCase().includes(s) || (digits.length >= 3 && (c.phone + c.phone2).replace(/\D/g, '').includes(digits)) || c.email.toLowerCase().includes(s)
      if (hit) out.push({ group: 'Customers', title: c.name, sub: [c.phone, c.email].filter(Boolean).join(' · '), go: () => nav({ page: 'customer', id: c.id }) })
    }
    for (const v of data.vehicles) {
      const plate = v.plate.toLowerCase().replace(/\s/g, '')
      const hit = (s.replace(/\s/g, '').length >= 2 && plate.includes(s.replace(/\s/g, ''))) || (isVin || s.length >= 4 ? v.vin.toLowerCase().includes(s) : false) || vehicleName(v).toLowerCase().includes(s)
      if (hit) {
        const owner = v.customerId ? ix.customers.get(v.customerId)?.name : ''
        out.push({ group: 'Vehicles', title: vehicleName(v) || 'Vehicle', sub: [owner, v.plate, v.vin && `VIN …${v.vin.slice(-8)}`].filter(Boolean).join(' · '), go: () => nav({ page: 'vehicle', id: v.id }) })
      }
    }
    for (const ro of data.ros) {
      if (digits && String(ro.number).includes(digits.replace(/^0+/, '')) && (s.startsWith('#') || /^\d+$/.test(s))) {
        const c = ro.customerId ? ix.customers.get(ro.customerId) : null
        out.push({ group: 'Repair orders', title: `RO ${ro.number}`, sub: [c?.name, vehicleName(ro.vehicleId ? ix.vehicles.get(ro.vehicleId) : null)].filter(Boolean).join(' · '), go: () => nav({ page: 'ro', id: ro.id }) })
      }
    }
    if (!out.length) {
      out.push({ group: 'Nothing found', title: `New customer "${q.trim()}"`, sub: 'Create a customer with this name', go: async () => {
        const c = await act(() => api.save('customers', { name: q.trim() }))
        if (c) nav({ page: 'customer', id: c.id })
      } })
    }
    return out.slice(0, 30)
  }, [q, data, ix, nav, act])

  useEffect(() => setSel(0), [q])
  const go = (i: number) => {
    const r = results[i]
    if (!r) return
    onClose()
    void r.go()
  }
  let lastGroup = ''
  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Search">
        <input autoFocus value={q} placeholder="Search customer, phone, plate, VIN, RO #" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(results.length - 1, x + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)) }
            else if (e.key === 'Enter') go(sel)
          }} />
        <div className="results" role="listbox">
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? <div className="grp">{r.group}</div> : null
            lastGroup = r.group
            return (
              <div key={i}>
                {head}
                <div role="option" aria-selected={i === sel} className={`res ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(i)}>
                  <b>{r.title}</b>{r.sub && <span>{r.sub}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SwitchUser({ onClose }: { onClose: () => void }) {
  const { data, setUserId, toast } = useStore()
  const [pick, setPick] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [bad, setBad] = useState(false)
  if (!data) return null
  const choose = (u: User) => {
    if (!u.pin) { setUserId(u.id); toast(`Switched to ${u.name}`); onClose(); return }
    setPick(u); setPin(''); setBad(false)
  }
  const press = (d: string) => {
    if (!pick) return
    const next = (pin + d).slice(0, 6)
    setPin(next)
    if (next.length === pick.pin.length) {
      if (next === pick.pin) { setUserId(pick.id); toast(`Switched to ${pick.name}`); onClose() }
      else { setBad(true); setPin('') }
    }
  }
  return (
    <Modal title={pick ? `PIN for ${pick.name}` : 'Switch user'} onClose={onClose}>
      {!pick ? (
        <div className="stack tight">
          {data.users.filter((u) => u.active).map((u) => (
            <button key={u.id} className="btn lg block" style={{ justifyContent: 'flex-start' }} onClick={() => choose(u)}>
              <Avatar u={u} /> {u.name} <span className="muted" style={{ marginLeft: 'auto', textTransform: 'capitalize' }}>{u.role}{u.pin ? ' · PIN' : ''}</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className="pin-dots" aria-label={`${pin.length} digits entered`}>{Array.from({ length: pick.pin.length }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
          {bad && <p className="neg" style={{ textAlign: 'center', marginTop: 0 }}>Wrong PIN. Try again.</p>}
          <div className="pinpad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
            <button onClick={() => setPick(null)} style={{ fontSize: 14 }}>Back</button>
            <button onClick={() => press('0')}>0</button>
            <button onClick={() => setPin(pin.slice(0, -1))} style={{ fontSize: 14 }} aria-label="Delete digit">⌫</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

