import { useState } from 'react'
import { normalizeSheetUrl, SheetLinkError } from '../lib/sheetParse'
import { Icon } from './Icon'
import { Field } from './ui'

/** The three steps to get a publishable CSV link, shown inline so nobody has to guess. */
export function SheetHelp() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left text-[14px] text-soft transition-colors hover:text-paper"
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={15} className="text-muted" />
        Where do I find this link?
      </button>
      {open && (
        <ol className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-muted">
          <li>
            1. In Google Sheets, click <b className="font-medium text-paper">Share</b> and set access to{' '}
            <b className="font-medium text-paper">Anyone with the link</b>.
          </li>
          <li>
            2. Click the <b className="font-medium text-paper">tab for this event</b> at the bottom of the sheet.
          </li>
          <li>
            3. Copy the link straight from your browser’s address bar and paste it here — the tab you’re on is
            part of it.
          </li>
          <li className="pt-1 text-xs">
            Your sheet needs a <b className="font-medium text-paper">Team Name</b> column and{' '}
            <b className="font-medium text-paper">Player 1, Player 2…</b> columns. A title row above them is fine.
          </li>
        </ol>
      )}
    </div>
  )
}

/**
 * A validated Google Sheet link input. Rejects plain `/edit` share links, which
 * Google only exports through an endpoint that corrupts sign-up sheets.
 */
export function SheetUrlField({
  value,
  onChange,
  error,
  label = 'Google Sheet link',
}: {
  value: string
  onChange: (v: string) => void
  error?: string | null
  label?: string
}) {
  return (
    <div className="space-y-3">
      <Field
        label={label}
        value={value}
        onChange={onChange}
        placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
      />
      {error && <p className="text-[13px] leading-relaxed text-danger">{error}</p>}
      <SheetHelp />
    </div>
  )
}

/** Validate a pasted link, returning either the cleaned url or a message to show. */
export function validateSheetUrl(raw: string): { url: string | null; error: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { url: null, error: null }
  try {
    return { url: normalizeSheetUrl(trimmed), error: null }
  } catch (e) {
    return { url: null, error: e instanceof SheetLinkError ? e.message : 'That link doesn’t look right.' }
  }
}
