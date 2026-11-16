import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('shop', {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('api', method, args),
})
