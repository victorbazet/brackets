import type { Format } from '../lib/types'

const FORMATS: { key: Format; title: string; sub: string }[] = [
  { key: 'single', title: 'Single elim', sub: 'Lose once, you’re out' },
  { key: 'double', title: 'Double elim', sub: 'Second life in the losers bracket' },
  { key: 'group', title: 'Groups + knockout', sub: 'Round-robin groups, then single elim' },
]

/**
 * Picks the tournament format. One row per format rather than a grid — the
 * group option needs room for the draw it would produce.
 */
export function FormatPicker({
  value,
  onChange,
  hint,
}: {
  value: Format
  onChange: (f: Format) => void
  /** extra line under a format, e.g. the group draw for the current field */
  hint?: Partial<Record<Format, string>>
}) {
  return (
    <div className="space-y-2">
      {FORMATS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          aria-pressed={value === f.key}
          className={`block w-full rounded-xl border p-4 text-left transition-colors ${
            value === f.key ? 'border-paper bg-raised' : 'border-line bg-surface hover:border-line-strong'
          }`}
        >
          <span className="display block text-[15px]">{f.title}</span>
          <span className="mt-1 block text-[12.5px] leading-snug text-muted">{f.sub}</span>
          {value === f.key && hint?.[f.key] && (
            <span className="mt-2 block text-[12.5px] leading-snug text-soft">{hint[f.key]}</span>
          )}
        </button>
      ))}
    </div>
  )
}
