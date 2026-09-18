import { useMemo, useState } from 'react'
import { championOf, playableCount, resolveBracket } from '../lib/bracket'
import type { EventT } from '../lib/types'
import { Icon } from './Icon'
import { Empty, SectionLabel } from './ui'

type Props = {
  events: EventT[]
  canEdit: boolean
  onOpen: (id: string) => void
  onNew: () => void
}

/** Where an event stands, without opening it. */
function statusOf(e: EventT): { text: string; live: boolean } {
  if (!e.bracket) {
    return { text: e.teams.length ? `${e.teams.length} teams · sign-ups open` : 'No teams yet', live: false }
  }
  const live = resolveBracket(e.bracket)
  const champ = championOf(e.bracket, live)
  if (champ) {
    return { text: `Won by ${e.teams.find((t) => t.id === champ)?.name ?? 'Unknown'}`, live: false }
  }
  const left = playableCount(live)
  return { text: `${left} match${left === 1 ? '' : 'es'} to play`, live: true }
}

export function HomeView({ events, canEdit, onOpen, onNew }: Props) {
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return events
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.teams.some((t) => t.name.toLowerCase().includes(q) || t.players.some((p) => p.toLowerCase().includes(q))),
    )
  }, [events, query])

  return (
    <div className="space-y-8">
      {canEdit && (
        <button
          onClick={onNew}
          className="group flex w-full items-center gap-4 rounded-2xl bg-paper px-5 py-4 text-ink transition-transform active:scale-[.99]"
        >
          <Icon name="plus" size={22} strokeWidth={2.25} />
          <span className="text-left">
            <span className="display block text-[17px] leading-tight">New event</span>
            <span className="block text-[13px] text-ink/55">Name it, link your sheet, done</span>
          </span>
          <Icon name="chevronRight" size={18} className="ml-auto opacity-40" />
        </button>
      )}

      {events.length === 0 ? (
        <Empty
          icon="trophy"
          title={canEdit ? 'No events yet' : 'Nothing here yet'}
          sub={
            canEdit
              ? 'Create one above. It takes about twenty seconds.'
              : 'Nothing has been set up yet. This page updates on its own.'
          }
        />
      ) : (
        <div>
          <SectionLabel right={<span className="numeric text-[13px] text-muted">{events.length}</span>}>
            Events
          </SectionLabel>

          {events.length > 3 && (
            <div className="relative mb-3">
              <Icon name="search" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search event, team or player"
                className="w-full rounded-xl border border-line bg-surface py-3 pl-11 pr-4 text-paper transition-colors placeholder:text-muted/50 focus:border-line-strong focus:outline-none"
              />
            </div>
          )}

          {matches.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-muted">Nothing matches “{query}”.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {matches.map((e) => {
                const s = statusOf(e)
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => onOpen(e.id)}
                      className="flex w-full items-center gap-4 bg-surface px-4 py-4 text-left transition-colors hover:bg-raised"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="display block truncate text-[17px] leading-tight">{e.name}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                          {s.live && <span className="h-1.5 w-1.5 rounded-full bg-paper" />}
                          <span className="truncate">{s.text}</span>
                        </span>
                      </span>
                      {e.sheetUrl && <Icon name="sheet" size={16} className="text-muted" />}
                      <Icon name="chevronRight" size={17} className="text-muted" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
