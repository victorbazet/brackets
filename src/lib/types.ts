export type Format = 'single' | 'double' | 'group'

export type Team = {
  id: string
  name: string
  players: string[]
  paid?: boolean
  note?: string
}

/** Where a match slot gets its team from. */
export type SlotSource =
  | { kind: 'seed'; seed: number }
  | { kind: 'winner'; matchId: string }
  | { kind: 'loser'; matchId: string }
  /** finished `rank`th (1-based) in group `group` */
  | { kind: 'standing'; group: number; rank: number }
  /** the `index`th best third-placed team across every group (0-based) */
  | { kind: 'third'; index: number }

export type Side = 'W' | 'L' | 'F' | 'G'

/** Immutable structure of the bracket. Who is actually in each slot is derived. */
export type MatchSkeleton = {
  id: string
  side: Side
  round: number
  order: number
  sources: [SlotSource, SlotSource]
  label: string
  /** which group this match belongs to, for side 'G' */
  group?: number
  /** the second grand final, only played if the losers-bracket team wins the first */
  isReset?: boolean
}

export type Result = { winnerId: string; scores: [number | null, number | null] }

export type Bracket = {
  format: Format
  size: number
  /** team ids in seed order, padded with nulls for byes */
  seeds: (string | null)[]
  matches: MatchSkeleton[]
  /** user-entered results, keyed by match id */
  results: Record<string, Result>
  /** group format only: team ids per group, in the order they were drawn */
  groups?: string[][]
  /** group format only: how many best third-placed teams join the knockout */
  thirdSlots?: number
  createdAt: number
}

/** A match with its slots filled in, produced by resolveBracket(). */
export type LiveMatch = MatchSkeleton & {
  teams: [string | null, string | null]
  /** both slots known (a team or a bye) */
  ready: [boolean, boolean]
  winnerId: string | null
  loserId: string | null
  /** decided by a bye rather than by someone playing */
  auto: boolean
  /** nothing more can change here — results can flow onwards (a bye counts) */
  decided: boolean
  scores: [number | null, number | null]
  /** skipped entirely — e.g. a grand final reset that isn't needed */
  skipped: boolean
}

/** One team's line in a group table. */
export type Standing = {
  teamId: string
  played: number
  wins: number
  losses: number
  /** points scored / conceded across the group, when scores were entered */
  pf: number
  pa: number
  diff: number
  /** 1-based position in the group, after tiebreaks */
  rank: number
  /** every match in the group has been played, so this position is final */
  settled: boolean
}

export type EventT = {
  id: string
  name: string
  teamSize: number
  format: Format
  teams: Team[]
  bracket: Bracket | null
  /** published-to-web CSV url of the Google Sheet tab that feeds this event */
  sheetUrl?: string | null
  sheetSyncedAt?: number | null
  sheetError?: string | null
}

export type AppState = {
  version: 1
  events: EventT[]
  currentEventId: string | null
}

/** Every change is one of these, so the browser and the Worker stay in step. */
export type Action =
  | { type: 'event.upsert'; event: Omit<EventT, 'teams' | 'bracket'> }
  | { type: 'event.delete'; id: string }
  | { type: 'teams.set'; eventId: string; teams: Team[] }
  | { type: 'bracket.set'; eventId: string; bracket: Omit<Bracket, 'results'> | null }
  | { type: 'result.set'; eventId: string; matchId: string; winnerId: string; scores: [number | null, number | null] }
  | { type: 'result.clear'; eventId: string; matchId: string }
