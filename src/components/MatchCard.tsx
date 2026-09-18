import { useState } from 'react'
import { NO_TEAM_COLOR } from '../lib/colors'
import { groupName } from '../lib/groups'
import type { LiveMatch } from '../lib/types'
import { Icon } from './Icon'

type Props = {
  match: LiveMatch
  nameOf: (id: string | null) => string
  subOf: (id: string | null) => string
  seedOf: (id: string | null) => number | null
  colorOf: (id: string | null) => string | null
  onPick: (winnerId: string | null) => void
  onScore: (scores: [number | null, number | null]) => void
  compact?: boolean
  /** players watching the bracket can look but not score */
  readOnly?: boolean
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th']

function slotLabel(m: LiveMatch, i: 0 | 1) {
  const src = m.sources[i]
  if (src.kind === 'seed') return 'Bye'
  if (src.kind === 'standing') return `${ORDINAL[src.rank] ?? src.rank} in Group ${groupName(src.group)}`
  if (src.kind === 'third') return src.index === 0 ? 'Best third place' : `Third place #${src.index + 1}`
  const [side, round, order] = src.matchId.split('-')
  const from =
    side === 'F' ? 'the grand final' : `${side === 'L' ? 'losers R' : 'R'}${round} match ${Number(order) + 1}`
  return src.kind === 'winner' ? `Winner of ${from}` : `Loser of ${from}`
}

export function MatchCard({ match, nameOf, subOf, seedOf, colorOf, onPick, onScore, compact, readOnly }: Props) {
  const [showScore, setShowScore] = useState(match.scores.some((s) => s !== null))
  const bothIn = !!match.teams[0] && !!match.teams[1]
  const playable = bothIn && !readOnly
  const done = !!match.winnerId

  const row = (i: 0 | 1) => {
    const id = match.teams[i]
    const known = match.ready[i]
    const isWinner = done && match.winnerId === id
    const isLoser = done && !!id && match.winnerId !== id
    const seed = seedOf(id)
    const color = colorOf(id) ?? NO_TEAM_COLOR

    return (
      <button
        key={i}
        disabled={!id || !playable}
        onClick={() => onPick(isWinner ? null : id)}
        className={`relative flex w-full items-center gap-3 py-3.5 pl-4 pr-3.5 text-left transition-colors disabled:cursor-default ${
          isLoser ? 'opacity-40' : ''
        } ${playable && !isWinner ? 'hover:bg-raised' : ''}`}
      >
        {/* the team's identity colour — the only chroma in the interface */}
        {id && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {id && <span className="numeric w-4 shrink-0 text-[12px] text-muted">{seed ?? ''}</span>}
            <span
              className={`truncate ${
                known && id
                  ? `display text-[16px] ${isWinner ? 'text-paper' : 'text-soft'}`
                  : 'text-[14px] italic text-muted'
              }`}
            >
              {known ? (id ? nameOf(id) : 'Bye') : slotLabel(match, i)}
            </span>
          </span>
          {!compact && id && subOf(id) && (
            <span className="mt-0.5 block truncate pl-6 text-[12.5px] text-muted">{subOf(id)}</span>
          )}
        </span>

        {showScore && playable ? (
          <input
            inputMode="numeric"
            aria-label={`Score for ${nameOf(id)}`}
            value={match.scores[i] ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              const next: [number | null, number | null] = [...match.scores]
              next[i] = v === '' ? null : Number(v)
              onScore(next)
            }}
            className="numeric w-11 shrink-0 rounded-lg border border-line bg-ink py-1.5 text-center text-[14px] focus:border-line-strong focus:outline-none"
          />
        ) : (
          match.scores[i] !== null && (
            <span className={`numeric shrink-0 text-[15px] ${isWinner ? 'text-paper' : 'text-muted'}`}>
              {match.scores[i]}
            </span>
          )
        )}

        {isWinner && <Icon name="check" size={16} className="shrink-0 text-paper" strokeWidth={2.5} />}
      </button>
    )
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface ${bothIn && !done ? 'border-line-strong' : 'border-line'}`}
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-2">
        {/* on the desktop bracket the column heading already names the round */}
        {!compact && <span className="label truncate text-muted">{match.label}</span>}
        {match.auto && <span className="label text-muted/50">bye</span>}
        {bothIn && !done && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-paper" />
            <span className="label text-paper">ready</span>
          </span>
        )}
        {playable && (
          <button
            onClick={() => setShowScore((s) => !s)}
            aria-pressed={showScore}
            className={`label rounded px-1.5 py-0.5 transition-colors ${
              showScore ? 'bg-raised text-paper' : 'text-muted/70 hover:text-paper'
            } ${bothIn && !done ? '' : 'ml-auto'}`}
          >
            score
          </button>
        )}
      </div>
      <div className="divide-y divide-line">
        {row(0)}
        {row(1)}
      </div>
    </div>
  )
}
