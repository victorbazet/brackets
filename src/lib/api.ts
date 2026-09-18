import type { Action, EventT } from './types'

export type ServerState = { version: number; events: EventT[] }

const PIN_KEY = 'delt-brackets-pin'

export const getPin = () => localStorage.getItem(PIN_KEY) ?? ''
export const setPin = (pin: string) => localStorage.setItem(PIN_KEY, pin)
export const clearPin = () => localStorage.removeItem(PIN_KEY)

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(getPin() ? { 'x-admin-pin': getPin() } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status)
  }
  return (await res.json()) as T
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const api = {
  version: () => req<{ version: number; needsPin: boolean }>('/api/version'),
  state: () => req<ServerState>('/api/state'),
  checkPin: () => req<{ ok: true }>('/api/check', { method: 'POST' }),
  send: (actions: Action[]) => req<ServerState>('/api/actions', { method: 'POST', body: JSON.stringify({ actions }) }),
  sync: (eventId?: string) =>
    req<ServerState & { reports: { added: number; updated: number; removed: number; error?: string }[] }>(
      `/api/sync${eventId ? `?event=${encodeURIComponent(eventId)}` : ''}`,
      { method: 'POST' },
    ),
}
