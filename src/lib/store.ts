import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, clearPin, getPin, setPin } from './api'
import type { Action, AppState, Bracket, EventT, Team } from './types'

const CACHE_KEY = 'delt-brackets-v1'
const QUEUE_KEY = 'delt-brackets-queue'
const POLL_MS = 4000

export const uid = () => Math.random().toString(36).slice(2, 10)

const empty: AppState = { version: 1, events: [], currentEventId: null }

function loadCache(): AppState {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as AppState
    if (parsed?.version !== 1 || !Array.isArray(parsed.events)) return empty
    return parsed
  } catch {
    return empty
  }
}

function loadQueue(): Action[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Action[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Apply an action to local state, mirroring what the Worker does to D1. */
export function applyAction(events: EventT[], a: Action): EventT[] {
  switch (a.type) {
    case 'event.upsert': {
      const found = events.some((e) => e.id === a.event.id)
      return found
        ? events.map((e) => (e.id === a.event.id ? { ...e, ...a.event } : e))
        : [...events, { ...a.event, teams: [], bracket: null }]
    }
    case 'event.delete':
      return events.filter((e) => e.id !== a.id)
    case 'teams.set':
      return events.map((e) => (e.id === a.eventId ? { ...e, teams: a.teams } : e))
    case 'bracket.set':
      return events.map((e) =>
        e.id === a.eventId
          ? { ...e, format: a.bracket?.format ?? e.format, bracket: a.bracket ? { ...a.bracket, results: {} } : null }
          : e,
      )
    case 'result.set':
      return events.map((e) =>
        e.id === a.eventId && e.bracket
          ? {
              ...e,
              bracket: {
                ...e.bracket,
                results: { ...e.bracket.results, [a.matchId]: { winnerId: a.winnerId, scores: a.scores } },
              },
            }
          : e,
      )
    case 'result.clear':
      return events.map((e) => {
        if (e.id !== a.eventId || !e.bracket) return e
        const results = { ...e.bracket.results }
        delete results[a.matchId]
        return { ...e, bracket: { ...e.bracket, results } }
      })
  }
}

const skeleton = (b: Bracket | null): Omit<Bracket, 'results'> | null => {
  if (!b) return null
  const { results: _results, ...rest } = b
  return rest
}

/**
 * Work out which actions turn `prev` into `next`. This lets the views keep
 * their simple "give me the updated event" API while everything still travels
 * to the server as small, replayable actions.
 */
function diffEvent(prev: EventT, next: EventT): Action[] {
  const out: Action[] = []

  if (
    prev.name !== next.name ||
    prev.teamSize !== next.teamSize ||
    prev.format !== next.format ||
    (prev.sheetUrl ?? null) !== (next.sheetUrl ?? null)
  ) {
    out.push({
      type: 'event.upsert',
      event: {
        id: next.id,
        name: next.name,
        teamSize: next.teamSize,
        format: next.format,
        sheetUrl: next.sheetUrl ?? null,
      },
    })
  }

  if (JSON.stringify(prev.teams) !== JSON.stringify(next.teams)) {
    out.push({ type: 'teams.set', eventId: next.id, teams: next.teams })
  }

  const prevSkeleton = JSON.stringify(skeleton(prev.bracket))
  const nextSkeleton = JSON.stringify(skeleton(next.bracket))
  if (prevSkeleton !== nextSkeleton) {
    // A new bracket clears results server-side too, so don't also diff them.
    out.push({ type: 'bracket.set', eventId: next.id, bracket: skeleton(next.bracket) })
    return out
  }

  const before = prev.bracket?.results ?? {}
  const after = next.bracket?.results ?? {}
  for (const [matchId, r] of Object.entries(after)) {
    const b = before[matchId]
    if (!b || b.winnerId !== r.winnerId || JSON.stringify(b.scores) !== JSON.stringify(r.scores)) {
      out.push({ type: 'result.set', eventId: next.id, matchId, winnerId: r.winnerId, scores: r.scores })
    }
  }
  for (const matchId of Object.keys(before)) {
    if (!(matchId in after)) out.push({ type: 'result.clear', eventId: next.id, matchId })
  }
  return out
}

export type Status = {
  online: boolean
  /** the server wants a PIN for edits */
  needsPin: boolean
  /** we hold a working PIN (or none is required) */
  canEdit: boolean
  pending: number
  syncing: boolean
  error: string | null
  /** no backend reachable — running purely on this device */
  standalone: boolean
}

export function useStore() {
  const [state, setState] = useState<AppState>(loadCache)
  const [status, setStatus] = useState<Status>({
    online: navigator.onLine,
    needsPin: false,
    canEdit: true,
    pending: loadQueue().length,
    syncing: false,
    error: null,
    standalone: false,
  })

  const queue = useRef<Action[]>(loadQueue())
  const version = useRef(0)
  const flushing = useRef(false)

  const persist = useCallback((s: AppState) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(s))
    } catch {
      /* private mode / quota — the session still works */
    }
  }, [])

  const saveQueue = useCallback(() => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.current))
    } catch {
      /* ignore */
    }
    setStatus((s) => ({ ...s, pending: queue.current.length }))
  }, [])

  const adopt = useCallback(
    (events: EventT[], v: number) => {
      version.current = v
      setState((s) => {
        const next: AppState = {
          version: 1,
          events,
          // null means "on the home screen" — a poll must not drag you into an
          // event. An id that no longer exists (deleted elsewhere) sends you home.
          currentEventId: events.some((e) => e.id === s.currentEventId) ? s.currentEventId : null,
        }
        persist(next)
        return next
      })
    },
    [persist],
  )

  /** Send everything queued. Local edits stay authoritative until they land. */
  const flush = useCallback(async () => {
    if (flushing.current || queue.current.length === 0) return
    flushing.current = true
    const batch = queue.current.slice(0, 100)
    setStatus((s) => ({ ...s, syncing: true }))
    try {
      const res = await api.send(batch)
      queue.current = queue.current.slice(batch.length)
      saveQueue()
      if (queue.current.length === 0) adopt(res.events, res.version)
      setStatus((s) => ({ ...s, online: true, standalone: false, error: null }))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Bad PIN: drop the edits rather than retrying forever.
        queue.current = []
        saveQueue()
        clearPin()
        setStatus((s) => ({ ...s, canEdit: false, error: 'That PIN was rejected — your last change was not saved.' }))
      } else {
        setStatus((s) => ({ ...s, online: false, error: null }))
      }
    } finally {
      flushing.current = false
      setStatus((s) => ({ ...s, syncing: false }))
    }
  }, [adopt, saveQueue])

  /** Keep flushing until the queue drains, so callers can wait for the server to catch up. */
  const flushAll = useCallback(async () => {
    const deadline = Date.now() + 6000
    while (queue.current.length > 0 && Date.now() < deadline) {
      if (flushing.current) {
        await new Promise((r) => setTimeout(r, 100))
        continue
      }
      const before = queue.current.length
      await flush()
      // No progress means we're offline or rejected — stop rather than spin.
      if (queue.current.length >= before) break
    }
    return queue.current.length === 0
  }, [flush])

  const dispatch = useCallback(
    (actions: Action[]) => {
      if (actions.length === 0) return
      setState((s) => {
        const next = { ...s, events: actions.reduce(applyAction, s.events) }
        persist(next)
        return next
      })
      queue.current.push(...actions)
      saveQueue()
      void flush()
    },
    [flush, persist, saveQueue],
  )

  // First load: pull server state, and find out whether a PIN is required.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [v, s] = await Promise.all([api.version(), api.state()])
        if (cancelled) return
        let canEdit = !v.needsPin
        if (v.needsPin && getPin()) {
          canEdit = await api
            .checkPin()
            .then(() => true)
            .catch(() => false)
        }
        setStatus((st) => ({ ...st, online: true, standalone: false, needsPin: v.needsPin, canEdit }))
        if (queue.current.length === 0) adopt(s.events, s.version)
        else void flush()
      } catch {
        // No backend (offline, or running the front end on its own): keep using
        // the cached copy on this device.
        if (!cancelled) setStatus((st) => ({ ...st, online: false, standalone: true }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adopt, flush])

  // Poll for other people's changes. /api/version is a single-row read.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return
      if (queue.current.length > 0) {
        void flush()
        return
      }
      try {
        const v = await api.version()
        setStatus((s) =>
          s.online && s.needsPin === v.needsPin && !s.standalone ? s : { ...s, online: true, standalone: false, needsPin: v.needsPin },
        )
        if (v.version !== version.current) {
          const s = await api.state()
          if (queue.current.length === 0) adopt(s.events, s.version)
        }
      } catch {
        setStatus((s) => (s.online ? { ...s, online: false } : s))
      }
    }
    const id = setInterval(tick, POLL_MS)
    const onFocus = () => void tick()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [adopt, flush])

  const currentEvent = useMemo(
    () => state.events.find((e) => e.id === state.currentEventId) ?? null,
    [state.events, state.currentEventId],
  )

  const updateEvent = useCallback(
    (id: string, fn: (e: EventT) => EventT) => {
      const prev = state.events.find((e) => e.id === id)
      if (!prev) return
      dispatch(diffEvent(prev, fn(prev)))
    },
    [dispatch, state.events],
  )

  const addEvent = useCallback(
    (e: { name: string; teamSize: number; format: EventT['format']; teams?: Team[]; sheetUrl?: string | null }) => {
      const id = uid()
      const actions: Action[] = [
        {
          type: 'event.upsert',
          event: { id, name: e.name, teamSize: e.teamSize, format: e.format, sheetUrl: e.sheetUrl ?? null },
        },
      ]
      if (e.teams?.length) actions.push({ type: 'teams.set', eventId: id, teams: e.teams })
      dispatch(actions)
      setState((s) => ({ ...s, currentEventId: id }))
      return id
    },
    [dispatch],
  )

  const removeEvent = useCallback(
    (id: string) => {
      dispatch([{ type: 'event.delete', id }])
      setState((s) => (s.currentEventId === id ? { ...s, currentEventId: null } : s))
    },
    [dispatch],
  )

  const selectEvent = useCallback(
    (id: string | null) => {
      setState((s) => {
        const next = { ...s, currentEventId: id }
        persist(next)
        return next
      })
    },
    [persist],
  )

  /** Replace everything (backup restore). Sent as one batch of actions. */
  const replaceAll = useCallback(
    (next: AppState) => {
      const actions: Action[] = []
      for (const e of state.events) actions.push({ type: 'event.delete', id: e.id })
      for (const e of next.events) {
        actions.push({
          type: 'event.upsert',
          event: { id: e.id, name: e.name, teamSize: e.teamSize, format: e.format, sheetUrl: e.sheetUrl ?? null },
        })
        if (e.teams.length) actions.push({ type: 'teams.set', eventId: e.id, teams: e.teams })
        if (e.bracket) {
          actions.push({ type: 'bracket.set', eventId: e.id, bracket: skeleton(e.bracket) })
          for (const [matchId, r] of Object.entries(e.bracket.results)) {
            actions.push({ type: 'result.set', eventId: e.id, matchId, winnerId: r.winnerId, scores: r.scores })
          }
        }
      }
      dispatch(actions)
    },
    [dispatch, state.events],
  )

  const unlock = useCallback(async (pin: string) => {
    setPin(pin)
    try {
      await api.checkPin()
      setStatus((s) => ({ ...s, canEdit: true, error: null }))
      return true
    } catch {
      clearPin()
      setStatus((s) => ({ ...s, canEdit: false }))
      return false
    }
  }, [])

  const lock = useCallback(() => {
    clearPin()
    setStatus((s) => ({ ...s, canEdit: false }))
  }, [])

  const syncSheets = useCallback(
    async (eventId?: string) => {
      setStatus((s) => ({ ...s, syncing: true }))
      try {
        const res = await api.sync(eventId)
        adopt(res.events, res.version)
        const failed = res.reports.find((r) => r.error)
        setStatus((s) => ({ ...s, syncing: false, error: failed?.error ?? null }))
        return res.reports
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Sync failed'
        setStatus((s) => ({ ...s, syncing: false, error: message }))
        return []
      }
    },
    [adopt],
  )

  /**
   * Create an event and, if a sheet was linked, pull the sign-ups straight away.
   * The sync has to wait for the server to know about the event, so this drains
   * the queue first rather than firing a request that would 404.
   */
  const createEvent = useCallback(
    async (e: { name: string; teamSize: number; format: EventT['format']; sheetUrl?: string | null }) => {
      const id = addEvent(e)
      if (!e.sheetUrl) return { id, reports: [] }
      const landed = await flushAll()
      if (!landed) return { id, reports: [] }
      const reports = await syncSheets(id)
      return { id, reports }
    },
    [addEvent, flushAll, syncSheets],
  )

  return {
    state,
    status,
    currentEvent,
    addEvent,
    createEvent,
    updateEvent,
    removeEvent,
    selectEvent,
    replaceAll,
    unlock,
    lock,
    syncSheets,
  }
}
