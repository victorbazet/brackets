import { useMemo, useState } from 'react'
import { teamColors } from '../lib/colors'
import type { EventT, Team } from '../lib/types'
import { uid } from '../lib/store'
import { Icon } from './Icon'
import { Button, Empty, Field, Modal, SectionLabel } from './ui'

type Props = {
  event: EventT
  onChange: (fn: (e: EventT) => EventT) => void
  onImport: () => void
  onGoToBracket: () => void
  canEdit: boolean
  onLinkSheet: () => void
  onSync: () => void
  syncing: boolean
}

function TeamForm({
  open,
  onClose,
  teamSize,
  initial,
  onSave,
}: {
  open: boolean
  onClose: () => void
  teamSize: number
  initial: Team | null
  onSave: (t: Team) => void
}) {
  const blank = (): Team => ({ id: uid(), name: '', players: Array(teamSize).fill('') })
  const [draft, setDraft] = useState<Team>(initial ?? blank())

  // Re-seed the form whenever it is opened for a different team.
  const [seenId, setSeenId] = useState<string | null>(initial?.id ?? null)
  const key = initial?.id ?? 'new'
  if (open && seenId !== key) {
    setSeenId(key)
    const players = initial ? [...initial.players] : Array(teamSize).fill('')
    while (players.length < teamSize) players.push('')
    setDraft(initial ? { ...initial, players } : blank())
  }

  const setPlayer = (i: number, v: string) =>
    setDraft((d) => {
      const players = [...d.players]
      players[i] = v
      return { ...d, players }
    })

  const save = () => {
    const players = draft.players.map((p) => p.trim()).filter(Boolean)
    const name = draft.name.trim() || players.join(' & ') || 'Unnamed team'
    onSave({ ...draft, name, players })
    setSeenId(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit team' : 'Add team'}
      footer={
        <Button variant="primary" full onClick={save}>
          {initial ? 'Save' : 'Add team'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label="Team name"
          value={draft.name}
          onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
          placeholder="Leave blank to use player names"
          autoFocus
        />
        {draft.players.map((p, i) => (
          <Field key={i} label={`Player ${i + 1}`} value={p} onChange={(v) => setPlayer(i, v)} placeholder="Name" />
        ))}
        <button
          onClick={() => setDraft((d) => ({ ...d, players: [...d.players, ''] }))}
          className="flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-paper"
        >
          <Icon name="plus" size={15} />
          Another player
        </button>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
              draft.paid ? 'border-paper bg-paper text-ink' : 'border-line-strong'
            }`}
          >
            {draft.paid && <Icon name="check" size={13} strokeWidth={3} />}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={!!draft.paid}
            onChange={(e) => setDraft((d) => ({ ...d, paid: e.target.checked }))}
          />
          <span className="text-[15px]">Paid up</span>
        </label>
      </div>
    </Modal>
  )
}

const ago = (ts?: number | null) => {
  if (!ts) return 'never'
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

export function TeamsView({
  event,
  onChange,
  onImport,
  onGoToBracket,
  canEdit,
  onLinkSheet,
  onSync,
  syncing,
}: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)

  const teams = event.teams
  const setTeams = (next: Team[]) => onChange((e) => ({ ...e, teams: next }))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= teams.length) return
    const next = [...teams]
    ;[next[i], next[j]] = [next[j], next[i]]
    setTeams(next)
  }

  const shuffle = () => {
    const next = [...teams]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    setTeams(next)
  }

  const playerCount = teams.reduce((n, t) => n + t.players.length, 0)
  const colors = useMemo(() => teamColors(teams), [teams])

  return (
    <div className="space-y-4">
      {canEdit && (
        <button
          onClick={event.sheetUrl ? onSync : onLinkSheet}
          disabled={syncing}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong disabled:opacity-60"
        >
          <Icon name={event.sheetUrl ? 'sheet' : 'link'} size={17} className="text-muted" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-soft">
            {event.sheetUrl ? `Sheet linked · synced ${ago(event.sheetSyncedAt)}` : 'No sign-up sheet linked'}
          </span>
          <span className="label shrink-0 text-muted">
            {event.sheetUrl ? (syncing ? 'syncing' : 'sync') : 'link'}
          </span>
        </button>
      )}

      {canEdit && teams.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" icon="shuffle" onClick={shuffle} disabled={teams.length < 2}>
            Shuffle
          </Button>
          <Button size="sm" icon="upload" onClick={onImport} aria-label="Import a spreadsheet" />
          <div className="ml-auto">
            <Button
              size="sm"
              variant="primary"
              icon="plus"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Add team
            </Button>
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <Empty
          icon="users"
          title="No teams yet"
          sub={
            canEdit
              ? 'Import the sign-up spreadsheet, or add teams one at a time.'
              : 'Nobody has signed up yet. Add your name to the sheet and it shows up here.'
          }
          action={
            canEdit && (
              <div className="flex gap-2">
                <Button icon="upload" onClick={onImport}>
                  Import
                </Button>
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  Add team
                </Button>
              </div>
            )
          }
        />
      ) : (
        <div>
          <SectionLabel
            right={
              <span className="text-[12px] text-muted">
                <span className="numeric text-soft">{teams.length}</span> teams
                <span className="mx-1.5 text-line-strong">·</span>
                <span className="numeric text-soft">{playerCount}</span> players
              </span>
            }
          >
            Teams
          </SectionLabel>

          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {teams.map((t, i) => (
              <li key={t.id} className="relative flex items-center gap-3 bg-surface py-3 pl-4 pr-2">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ background: colors.get(t.id) }}
                />
                <span className="numeric w-5 shrink-0 text-[13px] text-muted">{i + 1}</span>

                <button
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                  disabled={!canEdit}
                  onClick={() => {
                    setEditing(t)
                    setFormOpen(true)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="display truncate text-[16px]">{t.name}</span>
                    {t.paid && <span className="label shrink-0 text-muted">paid</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">
                    {t.players.join(' · ') || 'no players listed'}
                  </span>
                </button>

                {canEdit && (
                  <div className="flex shrink-0 items-center">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="p-2 text-muted transition-colors hover:text-paper disabled:opacity-20"
                      aria-label={`Move ${t.name} up`}
                    >
                      <Icon name="chevronUp" size={16} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === teams.length - 1}
                      className="p-2 text-muted transition-colors hover:text-paper disabled:opacity-20"
                      aria-label={`Move ${t.name} down`}
                    >
                      <Icon name="chevronDown" size={16} />
                    </button>
                    <button
                      onClick={() => setTeams(teams.filter((x) => x.id !== t.id))}
                      className="p-2 text-muted transition-colors hover:text-danger"
                      aria-label={`Remove ${t.name}`}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {canEdit && event.bracket && (
            <div className="mt-4">
              <Button full onClick={onGoToBracket}>
                Go to bracket
              </Button>
            </div>
          )}
        </div>
      )}

      <TeamForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        teamSize={event.teamSize}
        initial={editing}
        onSave={(t) =>
          setTeams(teams.some((x) => x.id === t.id) ? teams.map((x) => (x.id === t.id ? t : x)) : [...teams, t])
        }
      />
    </div>
  )
}
