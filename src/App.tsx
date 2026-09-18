import { useState } from 'react'
import { EventScreen } from './components/EventScreen'
import { HomeView } from './components/HomeView'
import { Icon } from './components/Icon'
import { ImportDialog } from './components/ImportDialog'
import { NewEventModal, type NewEventResult } from './components/NewEventModal'
import { Button, Field, Modal } from './components/ui'
import { useStore, type Status } from './lib/store'

/** Connection state, and the lock that gates scoring. */
function StatusPill({ status, onUnlock, onLock }: { status: Status; onUnlock: () => void; onLock: () => void }) {
  const { online, standalone, pending, syncing, canEdit } = status

  const text =
    standalone && !online
      ? 'this device'
      : !online
        ? pending
          ? `offline · ${pending}`
          : 'offline'
        : syncing || pending
          ? 'saving'
          : 'live'
  const dim = !online || standalone

  return (
    <button
      onClick={canEdit ? onLock : onUnlock}
      aria-label={canEdit ? 'Lock editing' : 'Unlock editing'}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-line px-2.5 py-2 transition-colors hover:border-line-strong"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${dim ? 'bg-muted' : 'bg-paper'} ${syncing || pending ? 'animate-pulse' : ''}`}
      />
      <span className="label text-muted">{text}</span>
      <Icon name={canEdit ? 'unlock' : 'lock'} size={13} className="text-muted" />
    </button>
  )
}

export default function App() {
  const store = useStore()
  const { state, status, currentEvent } = store

  const [tab, setTab] = useState<'teams' | 'bracket'>('teams')
  const [importOpen, setImportOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  const canEdit = status.canEdit
  const inEvent = !!currentEvent

  const submitPin = async () => {
    const ok = await store.unlock(pin.trim())
    if (ok) {
      setPinOpen(false)
      setPin('')
      setPinError(null)
    } else {
      setPinError('That PIN did not work.')
    }
  }

  const createEvent = async (e: Parameters<typeof store.createEvent>[0]): Promise<NewEventResult> => {
    const { reports } = await store.createEvent(e)
    setTab('teams')
    const failed = reports.find((r) => r.error)
    if (failed?.error) return { added: 0, error: failed.error }
    return { added: reports.reduce((n, r) => n + r.added, 0) }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col">
      <header className="safe-t sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur-md">
        <div className="flex items-center gap-3 px-5 py-4">
          {inEvent && (
            <button
              onClick={() => store.selectEvent(null)}
              aria-label="Back to events"
              className="-ml-1.5 shrink-0 p-1.5 text-muted transition-colors hover:text-paper"
            >
              <Icon name="back" size={20} />
            </button>
          )}
          <div className="mr-auto min-w-0">
            <div className="label text-muted">{inEvent ? 'Event' : 'Brackets'}</div>
            <h1 className="display-black mt-0.5 truncate text-[22px] leading-none">
              {currentEvent?.name ?? 'Tournaments'}
            </h1>
          </div>
          <StatusPill status={status} onUnlock={() => setPinOpen(true)} onLock={store.lock} />
        </div>
      </header>

      {status.error && (
        <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl border border-danger/25 px-4 py-3 text-[13px] leading-relaxed text-danger">
          <Icon name="alert" size={16} className="mt-px" />
          {status.error}
        </div>
      )}

      <main className="flex-1 px-5 py-6">
        {currentEvent ? (
          <EventScreen
            key={currentEvent.id}
            event={currentEvent}
            canEdit={canEdit}
            syncing={status.syncing}
            tab={tab}
            onTab={setTab}
            onChange={(fn) => store.updateEvent(currentEvent.id, fn)}
            onImport={() => setImportOpen(true)}
            onSync={(id) => void store.syncSheets(id)}
            onRemove={store.removeEvent}
          />
        ) : (
          <HomeView
            events={state.events}
            canEdit={canEdit}
            onOpen={(id) => {
              store.selectEvent(id)
              setTab(canEdit ? 'teams' : 'bracket')
            }}
            onNew={() => setNewOpen(true)}
          />
        )}
      </main>

      <NewEventModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={createEvent}
        onImportFile={() => setImportOpen(true)}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        currentEvent={currentEvent}
        onCreateEvents={(events) => {
          events.forEach((e) => store.addEvent({ name: e.name, teamSize: e.teamSize, format: 'single', teams: e.teams }))
          setTab('teams')
        }}
        onAddToCurrent={(teams) => {
          if (!currentEvent) return
          store.updateEvent(currentEvent.id, (e) => ({ ...e, teams: [...e.teams, ...teams] }))
          setTab('teams')
        }}
      />

      <Modal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Run the tournament"
        footer={
          <Button variant="primary" full onClick={submitPin}>
            Unlock
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-muted">
            Enter the admin PIN to add teams and enter results. Without it you can watch the bracket, which is all
            most people need.
          </p>
          <Field label="Admin PIN" value={pin} onChange={setPin} placeholder="••••" autoFocus />
          {pinError && <p className="text-[13px] text-danger">{pinError}</p>}
        </div>
      </Modal>
    </div>
  )
}
