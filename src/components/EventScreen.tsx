import { useState } from 'react'
import type { EventT } from '../lib/types'
import { BracketView } from './BracketView'
import { Icon } from './Icon'
import { SheetUrlField, validateSheetUrl } from './SheetLink'
import { TeamsView } from './TeamsView'
import { Button, Field, Modal } from './ui'

type Props = {
  event: EventT
  canEdit: boolean
  syncing: boolean
  tab: 'teams' | 'bracket'
  onTab: (t: 'teams' | 'bracket') => void
  onChange: (fn: (e: EventT) => EventT) => void
  onImport: () => void
  onSync: (eventId: string) => void
  onRemove: (id: string) => void
}

const ago = (ts?: number | null) => {
  if (!ts) return 'never'
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

function SettingsModal({
  open,
  onClose,
  event,
  syncing,
  onChange,
  onSync,
  onRemove,
}: {
  open: boolean
  onClose: () => void
  event: EventT
  syncing: boolean
  onChange: (fn: (e: EventT) => EventT) => void
  onSync: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [name, setName] = useState(event.name)
  const [sheet, setSheet] = useState(event.sheetUrl ?? '')
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [seen, setSeen] = useState<string | null>(null)

  if (open && seen !== event.id) {
    setSeen(event.id)
    setName(event.name)
    setSheet(event.sheetUrl ?? '')
    setSheetError(null)
  }

  const save = () => {
    const checked = validateSheetUrl(sheet)
    if (checked.error) {
      setSheetError(checked.error)
      return
    }
    onChange((e) => ({ ...e, name: name.trim() || event.name, sheetUrl: checked.url }))
    if (checked.url && checked.url !== event.sheetUrl) setTimeout(() => onSync(event.id), 150)
    setSeen(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <Button variant="primary" full onClick={save}>
          Save
        </Button>
      }
    >
      <div className="space-y-6">
        <Field label="Event name" value={name} onChange={setName} />

        <div className="border-t border-line pt-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="label text-muted">Sign-up sheet</span>
            {event.sheetUrl && (
              <button
                onClick={() => onSync(event.id)}
                disabled={syncing}
                className="ml-auto flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-paper disabled:opacity-50"
              >
                <Icon name="refresh" size={14} />
                {syncing ? 'Syncing' : `Synced ${ago(event.sheetSyncedAt)}`}
              </button>
            )}
          </div>
          <SheetUrlField
            value={sheet}
            onChange={(v) => {
              setSheet(v)
              setSheetError(null)
            }}
            error={sheetError ?? event.sheetError}
          />
        </div>

        <div className="border-t border-line pt-5">
          <Button
            variant="danger"
            full
            icon="trash"
            onClick={() => {
              if (confirm(`Delete “${event.name}”, its teams and its bracket — for everyone?`)) {
                onRemove(event.id)
                onClose()
              }
            }}
          >
            Delete this event
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function EventScreen({ event, canEdit, syncing, tab, onTab, onChange, onImport, onSync, onRemove }: Props) {
  const [settings, setSettings] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-xl border border-line bg-surface p-1">
          {(['teams', 'bracket'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onTab(t)}
              className={`label flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 transition-colors ${
                tab === t ? 'bg-paper text-ink' : 'text-muted hover:text-paper'
              }`}
            >
              <Icon name={t === 'teams' ? 'users' : 'bracket'} size={15} />
              {t === 'teams' ? `Teams ${event.teams.length}` : 'Bracket'}
            </button>
          ))}
        </div>
        {canEdit && (
          <button
            onClick={() => setSettings(true)}
            aria-label="Event settings"
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:text-paper"
          >
            <Icon name="settings" size={18} />
          </button>
        )}
      </div>

      {event.sheetError && canEdit && (
        <button
          onClick={() => setSettings(true)}
          className="flex w-full items-start gap-2.5 rounded-xl border border-danger/25 px-4 py-3 text-left text-[13px] leading-relaxed text-danger"
        >
          <Icon name="alert" size={16} className="mt-px" />
          {event.sheetError}
        </button>
      )}

      {tab === 'teams' ? (
        <TeamsView
          event={event}
          canEdit={canEdit}
          onChange={onChange}
          onImport={onImport}
          onGoToBracket={() => onTab('bracket')}
          onLinkSheet={() => setSettings(true)}
          onSync={() => onSync(event.id)}
          syncing={syncing}
        />
      ) : (
        <BracketView event={event} canEdit={canEdit} onChange={onChange} onGoToTeams={() => onTab('teams')} />
      )}

      <SettingsModal
        open={settings}
        onClose={() => setSettings(false)}
        event={event}
        syncing={syncing}
        onChange={onChange}
        onSync={onSync}
        onRemove={onRemove}
      />
    </div>
  )
}
