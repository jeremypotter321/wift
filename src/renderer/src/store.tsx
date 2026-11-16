import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import { indexData } from '../../shared/bundle'
import type { Role, Snapshot, User } from '../../shared/types'

export interface Perms {
  /** Prices, costs and totals on ROs. Techs see work, not money. */
  prices: boolean
  /** Cost, GP and effective $/hr (the shop-only block). */
  profit: boolean
  profitReports: boolean
  settings: boolean
  payments: boolean
  delete: boolean
}
export const permsFor = (role: Role | undefined): Perms => ({
  prices: role !== 'tech',
  profit: role !== 'tech',
  profitReports: role === 'owner',
  settings: role === 'owner',
  payments: role !== 'tech',
  delete: role !== 'tech',
})

interface Store {
  data: Snapshot | null
  ix: ReturnType<typeof indexData> | null
  reload: () => Promise<void>
  /** Run a mutation, then refresh. Errors surface in the error bar. */
  act: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  error: string
  clearError: () => void
  user: User | null
  setUserId: (id: number) => void
  can: Perms
  toast: (msg: string) => void
}
const Ctx = createContext<Store>(null!)
const cleanError = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method 'api': (Error: )?/, '')

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [userId, setUserIdState] = useState<number>(() => Number(localStorage.getItem('shopboard.user')) || 0)
  const [toastMsg, setToastMsg] = useState('')
  const reload = useCallback(async () => setData(await api.snapshot()), [])
  const act = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      try {
        const r = await fn()
        await reload()
        return r
      } catch (e) {
        setError(cleanError(e))
        await reload().catch(() => {})
        return undefined
      }
    },
    [reload],
  )
  useEffect(() => {
    reload().catch((e) => setError(cleanError(e)))
  }, [reload])
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(''), 3500)
    return () => clearTimeout(t)
  }, [toastMsg])

  const ix = useMemo(() => (data ? indexData(data) : null), [data])
  const user = data ? data.users.find((u) => u.id === userId && u.active) ?? data.users.find((u) => u.role === 'owner') ?? data.users[0] ?? null : null
  const value: Store = {
    data, ix, reload, act, error, clearError: () => setError(''), user,
    setUserId: (id) => {
      localStorage.setItem('shopboard.user', String(id))
      setUserIdState(id)
    },
    can: permsFor(user?.role),
    toast: setToastMsg,
  }
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  )
}

export const useStore = () => useContext(Ctx)
/** For pages that only render once data is loaded. */
export function useData() {
  const s = useStore()
  return { ...s, data: s.data!, ix: s.ix! }
}
