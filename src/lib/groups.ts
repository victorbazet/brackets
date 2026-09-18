import type { LiveMatch, Standing } from './types'

/**
 * How many groups, and how big.
 *
 * Groups of four are the target — everyone plays three matches and the table is
 * readable at a glance. Field sizes that aren't a multiple of four are spread
 * out rather than left with one lonely pair: sizes never differ by more than
 * one, and a group is never smaller than three unless there are only two groups.
 */
export function planGroupSizes(teamCount: number): number[] {
  let count = Math.max(2, Math.ceil(teamCount / 4))
  while (count > 2 && Math.floor(teamCount / count) < 3) count--
  const base = Math.floor(teamCount / count)
  const extra = teamCount % count
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0))
}

/**
 * Deal the seeded team list into groups, snaking back and forth so the top
 * seeds are spread out: seeds 1..n go left to right, the next n right to left.
 */
export function drawGroups(teamIds: string[], sizes: number[]): string[][] {
  const groups: string[][] = sizes.map(() => [])
  const rows = Math.max(...sizes)
  let next = 0
  for (let row = 0; row < rows; row++) {
    const order = sizes.map((_, i) => i)
    if (row % 2 === 1) order.reverse()
    for (const g of order) {
      if (groups[g].length < sizes[g] && next < teamIds.length) groups[g].push(teamIds[next++])
    }
  }
  return groups
}

/**
 * Round-robin schedule by the circle method: every team plays every other one
 * exactly once, spread over as few matchdays as possible. An odd group sits one
 * team out each matchday.
 */
export function roundRobin(size: number): [number, number][][] {
  const slots = Array.from({ length: size }, (_, i) => i)
  if (size % 2 === 1) slots.push(-1)
  const n = slots.length
  const rounds: [number, number][][] = []
  let wheel = slots
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = wheel[i]
      const b = wheel[n - 1 - i]
      // Alternate who is listed first so nobody is always the home side.
      if (a !== -1 && b !== -1) pairs.push(r % 2 === 0 ? [a, b] : [b, a])
    }
    rounds.push(pairs)
    wheel = [wheel[0], wheel[n - 1], ...wheel.slice(1, n - 1)]
  }
  return rounds
}

export function nextPow2(n: number): number {
  let s = 1
  while (s < n) s *= 2
  return Math.max(2, s)
}

/**
 * Who goes through.
 *
 * The top two of every group always qualify. That lands on a full knockout
 * bracket only when twice the number of groups is itself a power of two (2, 4,
 * 8 or 16 groups) — otherwise the best third-placed teams fill the gap, the way
 * a 6-group Euro sends 12 + 4 into a round of 16. If there still aren't enough
 * thirds to fill it, the remaining slots become first-round byes.
 */
export function qualificationPlan(groupCount: number) {
  const auto = groupCount * 2
  const size = nextPow2(auto)
  const thirds = Math.min(size - auto, groupCount)
  return { size, thirds, qualifiers: auto + thirds, byes: size - auto - thirds }
}

/** Plain-language summary of the draw a field would produce, for the screen. */
export function groupPlanHint(teamCount: number): string {
  if (teamCount < 4) return 'Needs at least 4 teams.'
  const sizes = planGroupSizes(teamCount)
  const { thirds, size, byes } = qualificationPlan(sizes.length)
  const even = sizes.every((s) => s === sizes[0])
  const shape = even ? `${sizes.length} groups of ${sizes[0]}` : `${sizes.length} groups of ${sizes.join(', ')}`
  const extra = thirds ? ` + the ${thirds} best third${thirds > 1 ? 's' : ''}` : ''
  const spare = byes ? ` (${byes} bye${byes > 1 ? 's' : ''})` : ''
  return `${shape} · top 2${extra} → round of ${size}${spare}`
}

type Tally = Omit<Standing, 'rank' | 'settled'> & { beat: Set<string> }

/**
 * Build one group's table from the matches played so far.
 *
 * Order: wins, then the head-to-head record among whoever is level, then points
 * difference, then points scored, then the original seed. Head-to-head is
 * applied inside a block of tied teams only, so it can never leapfrog a team
 * that simply won more matches.
 */
export function rankGroup(teamIds: string[], matches: LiveMatch[], seedOf: (id: string) => number): Standing[] {
  const tally = new Map<string, Tally>(
    teamIds.map((id) => [id, { teamId: id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, diff: 0, beat: new Set() }]),
  )

  for (const m of matches) {
    const [a, b] = m.teams
    if (!m.winnerId || !a || !b) continue
    const ta = tally.get(a)
    const tb = tally.get(b)
    if (!ta || !tb) continue
    ta.played++
    tb.played++
    const [sa, sb] = m.scores
    if (sa !== null && sb !== null) {
      ta.pf += sa
      ta.pa += sb
      tb.pf += sb
      tb.pa += sa
    }
    const win = tally.get(m.winnerId)
    const lose = tally.get(m.winnerId === a ? b : a)
    if (win && lose) {
      win.wins++
      win.beat.add(lose.teamId)
      lose.losses++
    }
  }

  const rows = [...tally.values()].map((t) => ({ ...t, diff: t.pf - t.pa }))
  rows.sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.pf - x.pf || seedOf(x.teamId) - seedOf(y.teamId))

  // Re-sort each block of teams level on wins, this time counting only the
  // matches they played against each other.
  const out: typeof rows = []
  for (let i = 0; i < rows.length; ) {
    let j = i
    while (j < rows.length && rows[j].wins === rows[i].wins) j++
    const block = rows.slice(i, j)
    if (block.length > 1) {
      const ids = new Set(block.map((r) => r.teamId))
      const h2h = (r: (typeof block)[number]) => [...r.beat].filter((id) => ids.has(id)).length
      block.sort(
        (x, y) => h2h(y) - h2h(x) || y.diff - x.diff || y.pf - x.pf || seedOf(x.teamId) - seedOf(y.teamId),
      )
    }
    out.push(...block)
    i = j
  }

  const total = (teamIds.length * (teamIds.length - 1)) / 2
  const settled = matches.filter((m) => m.winnerId).length >= total
  return out.map(({ beat: _beat, ...row }, i) => ({ ...row, rank: i + 1, settled }))
}

/**
 * The third-placed teams, best first.
 *
 * Compared on the same criteria as inside a group. When groups are uneven this
 * is a slight thumb on the scale for whoever played more matches — unavoidable
 * without dropping results, and the same compromise real tournaments make.
 */
export function rankThirds(tables: Standing[][], seedOf: (id: string) => number): Standing[] {
  return tables
    .map((t) => t.find((r) => r.rank === 3))
    .filter((r): r is Standing => !!r)
    .sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.pf - x.pf || seedOf(x.teamId) - seedOf(y.teamId))
}

export const GROUP_NAMES = 'ABCDEFGHIJKLMNOP'
export const groupName = (i: number) => GROUP_NAMES[i] ?? String(i + 1)
