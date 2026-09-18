import { useRef, useState } from 'react'
import { eventNameFromSheet, parseWorkbook, type ParsedSheet } from '../lib/importer'
import type { EventT, Team } from '../lib/types'
import { uid } from '../lib/store'
import { Icon } from './Icon'
import { Button, Modal } from './ui'

type Props = {
  open: boolean
  onClose: () => void
  currentEvent: EventT | null
  onCreateEvents: (events: { name: string; teamSize: number; teams: Team[] }[]) => void
  onAddToCurrent: (teams: Team[]) => void
}

const toTeams = (s: ParsedSheet): Team[] =>
  s.teams.map((t) => ({ id: uid(), name: t.name, players: t.players, paid: t.paid, note: t.note }))

export function ImportDialog({ open, onClose, currentEvent, onCreateEvents, onAddToCurrent }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [mode, setMode] = useState<'new' | 'current'>('new')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setSheets(null)
    setPicked({})
    setError(null)
    setBusy(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseWorkbook(file)
      setSheets(parsed)
      setPicked(Object.fromEntries(parsed.map((s) => [s.sheetName, true])))
      setMode(parsed.length > 1 || !currentEvent ? 'new' : 'current')
    } catch {
      setError("Couldn't read that file. Use a .xlsx, .xls or .csv export.")
    } finally {
      setBusy(false)
    }
  }

  const chosen = (sheets ?? []).filter((s) => picked[s.sheetName])
  const totalTeams = chosen.reduce((n, s) => n + s.teams.length, 0)

  function confirm() {
    if (mode === 'current' && currentEvent) {
      onAddToCurrent(chosen.flatMap(toTeams))
    } else {
      onCreateEvents(
        chosen.map((s) => ({
          name: eventNameFromSheet(s),
          teamSize: Math.max(2, s.playerColumns || 2),
          teams: toTeams(s),
        })),
      )
    }
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import sign-up sheet"
      footer={
        sheets && (
          <div className="flex gap-2">
            <Button onClick={reset} variant="ghost">
              Back
            </Button>
            <div className="flex-1">
              <Button onClick={confirm} variant="primary" full disabled={chosen.length === 0}>
                {mode === 'new'
                  ? `Create ${chosen.length} event${chosen.length === 1 ? '' : 's'}${totalTeams ? ` · ${totalTeams} teams` : ''}`
                  : `Add ${totalTeams} team${totalTeams === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        )
      }
    >
      {!sheets ? (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-muted">
            Drop in the sign-up spreadsheet. Each tab becomes its own event, and the header row is found
            automatically — it just needs a <b className="font-medium text-paper">Team Name</b> column and{' '}
            <b className="font-medium text-paper">Player</b> columns.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.ods"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
          />
          <Button variant="primary" full icon="upload" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Reading…' : 'Choose spreadsheet'}
          </Button>
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {sheets.map((s) => (
              <button
                key={s.sheetName}
                onClick={() => setPicked((p) => ({ ...p, [s.sheetName]: !p[s.sheetName] }))}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  picked[s.sheetName] ? 'border-paper bg-raised' : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    picked[s.sheetName] ? 'border-paper bg-paper text-ink' : 'border-line-strong'
                  }`}
                >
                  {picked[s.sheetName] && <Icon name="check" size={13} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="display block text-[15px]">{eventNameFromSheet(s)}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    tab “{s.sheetName}” · {s.teams.length} team{s.teams.length === 1 ? '' : 's'} ·{' '}
                    {s.playerColumns} player column{s.playerColumns === 1 ? '' : 's'}
                  </span>
                  {s.teams.length === 0 && (
                    <span className="mt-1.5 block text-[13px] text-muted">
                      No filled-in rows yet — imports as an empty event you can add teams to.
                    </span>
                  )}
                  {s.teams.length > 0 && (
                    <span className="mt-1.5 block truncate text-[12.5px] text-muted">
                      e.g. {s.teams[0].name} ({s.teams[0].players.join(', ') || 'no players listed'})
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-line bg-surface p-1">
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setMode('new')}
                className={`label rounded-lg px-3 py-2.5 transition-colors ${mode === 'new' ? 'bg-paper text-ink' : 'text-muted hover:text-paper'}`}
              >
                New event per tab
              </button>
              <button
                onClick={() => currentEvent && setMode('current')}
                disabled={!currentEvent}
                className={`label rounded-lg px-3 py-2.5 transition-colors disabled:opacity-40 ${
                  mode === 'current' ? 'bg-paper text-ink' : 'text-muted hover:text-paper'
                }`}
              >
                Add to {currentEvent ? currentEvent.name : 'current'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
