import { useState } from 'react'
import type { Format } from '../lib/types'
import { FormatPicker } from './FormatPicker'
import { SheetUrlField, validateSheetUrl } from './SheetLink'
import { Button, Field, Modal } from './ui'

export type NewEventResult = { added: number; error?: string } | null

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (e: { name: string; teamSize: number; format: Format; sheetUrl: string | null }) => Promise<NewEventResult>
  onImportFile: () => void
}

const SIZES = [2, 3, 4]

export function NewEventModal({ open, onClose, onCreate, onImportFile }: Props) {
  const [name, setName] = useState('')
  const [teamSize, setTeamSize] = useState(2)
  const [format, setFormat] = useState<Format>('single')
  const [sheet, setSheet] = useState('')
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setName('')
    setTeamSize(2)
    setFormat('single')
    setSheet('')
    setSheetError(null)
    setBusy(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = async () => {
    const checked = validateSheetUrl(sheet)
    if (checked.error) {
      setSheetError(checked.error)
      return
    }
    setBusy(true)
    const res = await onCreate({
      name: name.trim() || 'New event',
      teamSize,
      format,
      sheetUrl: checked.url,
    })
    setBusy(false)
    if (res?.error) {
      // The event exists but the sheet didn't load — keep them here to fix the link.
      setSheetError(res.error)
      return
    }
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New event"
      footer={
        <Button variant="primary" full onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create event'}
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label="Event name" value={name} onChange={setName} placeholder="Spikeball" autoFocus />

        <div>
          <span className="label mb-2 block text-muted">Players per team</span>
          <div className="flex gap-2">
            {SIZES.map((n) => (
              <button
                key={n}
                onClick={() => setTeamSize(n)}
                className={`display flex-1 rounded-xl border py-3 text-[15px] transition-colors ${
                  teamSize === n ? 'border-paper bg-raised text-paper' : 'border-line bg-surface text-muted hover:border-line-strong'
                }`}
              >
                {n}v{n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label mb-2 block text-muted">Format</span>
          <FormatPicker value={format} onChange={setFormat} />
        </div>

        <div className="border-t border-line pt-5">
          <div className="mb-3 flex items-baseline gap-2">
            <span className="label text-muted">Sign-ups</span>
            <span className="text-[12px] text-muted/60">optional</span>
          </div>
          <SheetUrlField
            label="Link a Google Sheet"
            value={sheet}
            onChange={(v) => {
              setSheet(v)
              setSheetError(null)
            }}
            error={sheetError}
          />
          <button
            onClick={() => {
              close()
              onImportFile()
            }}
            className="mt-4 text-[13.5px] text-muted transition-colors hover:text-paper"
          >
            …or import a spreadsheet file instead
          </button>
        </div>
      </div>
    </Modal>
  )
}
