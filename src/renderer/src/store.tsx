import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

export type Snapshot = Awaited<ReturnType<typeof api.snapshot>>

interface Store {
  data: Snapshot | null
  reload: () => Promise<void>
  /** Run a mutation, then refresh. Errors surface in the error bar. */
  act: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  error: string
  clearError: () => void
}
const Ctx = createContext<Store>(null!)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => setData(await api.snapshot()), [])
  const act = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      try {
        const r = await fn()
        await reload()
        return r
      } catch (e) {
        setError(cleanError(e))
        return undefined
      }
    },
    [reload],
  )
  useEffect(() => {
    reload().catch((e) => setError(cleanError(e)))
  }, [reload])
  return <Ctx.Provider value={{ data, reload, act, error, clearError: () => setError('') }}>{children}</Ctx.Provider>
}

const cleanError = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method 'api': (Error: )?/, '')

export const useStore = () => useContext(Ctx)
