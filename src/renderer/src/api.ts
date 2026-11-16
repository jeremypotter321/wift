import type { Api } from '../../main/index'

declare global {
  interface Window {
    shop: { call: (method: string, ...args: unknown[]) => Promise<unknown> }
  }
}

type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never }

/** Typed bridge to the main process. Every call goes through the allow-listed `api` object in main/index.ts. */
export const api = new Proxy({} as Async<Api>, {
  get: (_t, method: string) => (...args: unknown[]) => window.shop.call(method, ...args),
})
