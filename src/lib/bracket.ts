import {
  drawGroups,
  groupName,
  nextPow2,
  planGroupSizes,
  qualificationPlan,
  rankGroup,
  rankThirds,
  roundRobin,
} from './groups'
import type { Bracket, Format, LiveMatch, MatchSkeleton, SlotSource, Standing } from './types'

export { nextPow2, groupName, groupPlanHint, qualificationPlan } from './groups'

/** Standard bracket seeding: 1 plays the lowest seed, 2 is as far away as possible, etc. */
export function seedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const n = order.length * 2
    const next: number[] = []
    for (const s of order) {
      next.push(s, n + 1 - s)
    }
    order = next
  }
  return order
}

const W = (r: number, o: number) => `W-${r}-${o}`
const L = (r: number, o: number) => `L-${r}-${o}`
const G = (g: number, r: number, o: number) => `G${g}-${r}-${o}`
const GF1 = 'F-1-0'
const GF2 = 'F-2-0'

const winner = (matchId: string): SlotSource => ({ kind: 'winner', matchId })
const loser = (matchId: string): SlotSource => ({ kind: 'loser', matchId })
/** An empty slot: seed -1 never exists, so it resolves to nobody and walks over. */
const BYE: SlotSource = { kind: 'seed', seed: -1 }

function roundLabel(side: 'W' | 'L', round: number, totalRounds: number, count: number) {
  if (side === 'W') {
    if (round === totalRounds) return 'Final'
    if (round === totalRounds - 1) return 'Semifinals'
    if (round === totalRounds - 2) return 'Quarterfinals'
    return `Round of ${count * 2}`
  }
  return `Losers R${round}`
}

/** The winners-bracket matches for a knockout of `size`, fed by `first`. */
function knockout(size: number, first: SlotSource[], format: Format): MatchSkeleton[] {
  const rounds = Math.log2(size)
  const matches: MatchSkeleton[] = []
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r
    for (let o = 0; o < count; o++) {
      const sources: [SlotSource, SlotSource] =
        r === 1
          ? [first[o * 2], first[o * 2 + 1]]
          : [winner(W(r - 1, o * 2)), winner(W(r - 1, o * 2 + 1))]
      matches.push({
        id: W(r, o),
        side: 'W',
        round: r,
        order: o,
        sources,
        label:
          format === 'double' && r === rounds ? 'Winners Final' : roundLabel('W', r, rounds, count),
      })
    }
  }
  return matches
}

/**
 * Build the match structure. `teamIds` is in seed order (index 0 = seed 1);
 * for the knockout formats the field is padded to a power of two with byes.
 */
export function buildBracket(teamIds: string[], format: Format): Bracket {
  if (format === 'group') return buildGroupBracket(teamIds)

  const size = nextPow2(teamIds.length)
  const order = seedOrder(size)
  const seeds: (string | null)[] = order.map((s) => teamIds[s - 1] ?? null)

  const rounds = Math.log2(size)
  const first: SlotSource[] = Array.from({ length: size }, (_, i) => ({ kind: 'seed', seed: i }))
  const matches = knockout(size, first, format)

  if (format === 'single') {
    return { format, size, seeds, matches, results: {}, createdAt: Date.now() }
  }

  // --- losers bracket ---
  // For j = 1..rounds-1 there are two losers rounds, each with size/2^(j+1) matches:
  //   round 2j-1 ("minor" for j=1, otherwise LB winners paired against each other)
  //   round 2j   (LB winners against the losers dropping out of winners round j+1)
  for (let j = 1; j <= rounds - 1; j++) {
    const count = size / 2 ** (j + 1)

    const odd = 2 * j - 1
    for (let o = 0; o < count; o++) {
      const sources: [SlotSource, SlotSource] =
        j === 1
          ? [loser(W(1, o * 2)), loser(W(1, o * 2 + 1))]
          : [winner(L(odd - 1, o * 2)), winner(L(odd - 1, o * 2 + 1))]
      matches.push({ id: L(odd, o), side: 'L', round: odd, order: o, sources, label: `Losers R${odd}` })
    }

    const even = 2 * j
    for (let o = 0; o < count; o++) {
      // Flip the incoming winners-bracket losers on alternating rounds so teams
      // are less likely to immediately replay someone they just lost to.
      const from = j % 2 === 1 ? count - 1 - o : o
      const sources: [SlotSource, SlotSource] = [winner(L(odd, o)), loser(W(j + 1, from))]
      matches.push({ id: L(even, o), side: 'L', round: even, order: o, sources, label: `Losers R${even}` })
    }
  }

  const lastLb = 2 * (rounds - 1)
  const fromLosers: SlotSource = lastLb >= 1 ? winner(L(lastLb, 0)) : loser(W(rounds, 0))
  matches.push({
    id: GF1,
    side: 'F',
    round: 1,
    order: 0,
    sources: [winner(W(rounds, 0)), fromLosers],
    label: 'Grand Final',
  })
  matches.push({
    id: GF2,
    side: 'F',
    round: 2,
    order: 0,
    sources: [winner(GF1), loser(GF1)],
    label: 'Grand Final — Reset',
    isReset: true,
  })

  return { format, size, seeds, matches, results: {}, createdAt: Date.now() }
}

/**
 * Two teams from the same group should not meet again in the first knockout
 * round. Swap clashing slots with a same-placed team from another tie until
 * none are left — every accepted swap clears two ties and creates none, so this
 * terminates. Third-place slots are unavoidable: which group they come from
 * isn't known until the groups are played.
 */
function separateGroups(slots: SlotSource[]): SlotSource[] {
  const groupOf = (s: SlotSource) => (s.kind === 'standing' ? s.group : -1)
  const clash = (p: number) => groupOf(slots[p * 2]) >= 0 && groupOf(slots[p * 2]) === groupOf(slots[p * 2 + 1])
  const pairs = slots.length / 2

  for (let guard = 0; guard < pairs * 2; guard++) {
    const i = Array.from({ length: pairs }, (_, p) => p).find(clash)
    if (i === undefined) break
    let fixed = false
    for (let j = 0; j < pairs && !fixed; j++) {
      if (j === i) continue
      for (const a of [0, 1] as const) {
        for (const b of [0, 1] as const) {
          const x = slots[i * 2 + a]
          const y = slots[j * 2 + b]
          if (x.kind !== 'standing' || y.kind !== 'standing' || x.rank !== y.rank) continue
          ;[slots[i * 2 + a], slots[j * 2 + b]] = [y, x]
          if (!clash(i) && !clash(j)) {
            fixed = true
            break
          }
          ;[slots[i * 2 + a], slots[j * 2 + b]] = [x, y]
        }
        if (fixed) break
      }
    }
    if (!fixed) break
  }
  return slots
}

/** Group stage (round robin within each group) feeding a single-elimination knockout. */
function buildGroupBracket(teamIds: string[]): Bracket {
  const sizes = planGroupSizes(teamIds.length)
  const groups = drawGroups(teamIds, sizes)
  const seedIndex = new Map(teamIds.map((id, i) => [id, i]))

  const matches: MatchSkeleton[] = []
  groups.forEach((members, g) => {
    roundRobin(members.length).forEach((day, r) => {
      day.forEach(([a, b], o) => {
        matches.push({
          id: G(g, r + 1, o),
          side: 'G',
          round: r + 1,
          order: o,
          group: g,
          sources: [
            { kind: 'seed', seed: seedIndex.get(members[a]) ?? -1 },
            { kind: 'seed', seed: seedIndex.get(members[b]) ?? -1 },
          ],
          label: `Group ${groupName(g)} · Matchday ${r + 1}`,
        })
      })
    })
  })

  // Qualifiers in seed order: every group winner, then every runner-up, then
  // the best thirds. Standard bracket seeding then puts winners opposite
  // runners-up from the far end of the draw.
  const { size, thirds } = qualificationPlan(groups.length)
  const quals: SlotSource[] = [
    ...groups.map((_, g) => ({ kind: 'standing', group: g, rank: 1 }) as SlotSource),
    ...groups.map((_, g) => ({ kind: 'standing', group: g, rank: 2 }) as SlotSource),
    ...Array.from({ length: thirds }, (_, i) => ({ kind: 'third', index: i }) as SlotSource),
  ]
  const first = separateGroups(seedOrder(size).map((s) => quals[s - 1] ?? BYE))

  matches.push(...knockout(size, first, 'group'))

  return {
    format: 'group',
    size,
    // For this format `seeds` is the plain seeded team list — the group matches
    // index straight into it, and the knockout is fed by the group tables.
    seeds: teamIds.slice(),
    matches,
    results: {},
    groups,
    thirdSlots: thirds,
    createdAt: Date.now(),
  }
}

/**
 * Hand the qualifying third-placed teams their knockout slots.
 *
 * Which group a third place comes from isn't known when the draw is made, so
 * unlike the other slots it can't be separated in advance. Instead the slots are
 * handed out here, once the groups are in: the best third takes the first slot
 * it can without facing its own group again, and so on. If no arrangement
 * avoids every rematch, the plain ranking order stands.
 */
function assignThirds(ids: string[], groupOf: (id: string) => number, forbidden: (number | undefined)[]): string[] {
  const out: string[] = new Array(ids.length)
  const used = new Array(ids.length).fill(false)
  const place = (slot: number): boolean => {
    if (slot === ids.length) return true
    for (let i = 0; i < ids.length; i++) {
      if (used[i] || groupOf(ids[i]) === forbidden[slot]) continue
      used[i] = true
      out[slot] = ids[i]
      if (place(slot + 1)) return true
      used[i] = false
    }
    return false
  }
  return place(0) ? out : ids.slice()
}

/**
 * Fill in every slot from the seeds and the recorded results.
 * Byes advance on their own; a result that no longer matches the teams in a
 * match (because an earlier result changed) is ignored.
 */
export function resolveBracket(bracket: Bracket): LiveMatch[] {
  const byId = new Map<string, LiveMatch>()
  const live: LiveMatch[] = bracket.matches.map((m) => ({
    ...m,
    teams: [null, null],
    ready: [false, false],
    winnerId: null,
    loserId: null,
    auto: false,
    decided: false,
    scores: [null, null],
    skipped: false,
  }))
  for (const m of live) byId.set(m.id, m)

  const seedOf = (id: string) => {
    const i = bracket.seeds.indexOf(id)
    return i < 0 ? bracket.seeds.length : i
  }
  const groupOf = new Map<string, number>()
  bracket.groups?.forEach((members, g) => members.forEach((id) => groupOf.set(id, g)))

  // Which group a third-place slot must not draw: whoever it plays in round one.
  const forbidden: (number | undefined)[] = []
  for (const m of bracket.matches) {
    if (m.side !== 'W' || m.round !== 1) continue
    m.sources.forEach((src, i) => {
      const other = m.sources[i === 0 ? 1 : 0]
      if (src.kind === 'third') forbidden[src.index] = other.kind === 'standing' ? other.group : undefined
    })
  }

  // Recomputed whenever a group result lands, so the knockout slots follow.
  let tables: Standing[][] = []
  /** qualifying thirds, in slot order */
  let thirds: string[] = []
  const refreshTables = () => {
    if (!bracket.groups) return
    tables = bracket.groups.map((members, g) =>
      rankGroup(
        members,
        live.filter((m) => m.side === 'G' && m.group === g),
        seedOf,
      ),
    )
    const best = rankThirds(tables, seedOf)
      .slice(0, bracket.thirdSlots ?? 0)
      .map((r) => r.teamId)
    thirds = assignThirds(best, (id) => groupOf.get(id) ?? -1, forbidden)
  }

  const fill = (m: LiveMatch, i: 0 | 1) => {
    const src = m.sources[i]
    if (src.kind === 'seed') {
      m.teams[i] = bracket.seeds[src.seed] ?? null
      m.ready[i] = true
      return
    }
    if (src.kind === 'standing') {
      // A group place is only handed over once that group is finished — a
      // half-played table would put the wrong team in the knockout.
      const row = tables[src.group]?.find((r) => r.rank === src.rank)
      if (!row?.settled) return
      m.teams[i] = row.teamId
      m.ready[i] = true
      return
    }
    if (src.kind === 'third') {
      if (!tables.length || !tables.every((t) => t[0]?.settled)) return
      m.teams[i] = thirds[src.index] ?? null
      m.ready[i] = true
      return
    }
    const from = byId.get(src.matchId)
    if (!from) return
    if (from.skipped) {
      // A skipped match passes its winners-side team through and produces no loser.
      m.teams[i] = src.kind === 'winner' ? from.teams[0] : null
      m.ready[i] = true
      return
    }
    if (!from.decided) return
    // An empty match (both sides were byes) still resolves — as nobody.
    m.teams[i] = src.kind === 'winner' ? from.winnerId : from.loserId
    m.ready[i] = true
  }

  // Matches are created in dependency order, but resolve to a fixed point anyway
  // so the loser-drops in the losers bracket settle regardless of ordering.
  for (let pass = 0; pass < live.length + 2; pass++) {
    let changed = false
    refreshTables()
    for (const m of live) {
      const before = `${m.teams[0]}|${m.teams[1]}|${m.ready}|${m.winnerId}|${m.decided}|${m.skipped}`

      // The reset grand final only exists if the losers-bracket team won the first one.
      if (m.isReset) {
        const gf1 = byId.get(GF1)
        m.skipped = !(gf1?.winnerId && gf1.winnerId === gf1.teams[1])
        if (m.skipped) {
          m.winnerId = null
          m.loserId = null
          m.decided = false
        }
      }

      if (!m.ready[0]) fill(m, 0)
      if (!m.ready[1]) fill(m, 1)

      if (m.ready[0] && m.ready[1] && !m.skipped) {
        const present = m.teams.filter(Boolean) as string[]
        if (present.length < 2) {
          // bye (or nobody) — decided without playing
          m.winnerId = present[0] ?? null
          m.loserId = null
          m.auto = true
          m.decided = true
          m.scores = [null, null]
        } else {
          const res = bracket.results[m.id]
          if (res && present.includes(res.winnerId)) {
            m.winnerId = res.winnerId
            m.loserId = present.find((t) => t !== res.winnerId) ?? null
            m.scores = res.scores
          } else {
            m.winnerId = null
            m.loserId = null
            m.scores = [null, null]
          }
          m.auto = false
          m.decided = !!m.winnerId
        }
      }

      if (before !== `${m.teams[0]}|${m.teams[1]}|${m.ready}|${m.winnerId}|${m.decided}|${m.skipped}`) changed = true
    }
    if (!changed) break
  }

  return live
}

/** The group tables as they stand, in group order. Empty for other formats. */
export function standings(bracket: Bracket, live: LiveMatch[]): Standing[][] {
  if (!bracket.groups) return []
  const seedOf = (id: string) => {
    const i = bracket.seeds.indexOf(id)
    return i < 0 ? bracket.seeds.length : i
  }
  return bracket.groups.map((members, g) =>
    rankGroup(
      members,
      live.filter((m) => m.side === 'G' && m.group === g),
      seedOf,
    ),
  )
}

/** True once every group match has been played. */
export function groupsComplete(bracket: Bracket, live: LiveMatch[]): boolean {
  if (!bracket.groups) return true
  return live.every((m) => m.side !== 'G' || !!m.winnerId)
}

export function championOf(bracket: Bracket, live: LiveMatch[]): string | null {
  if (bracket.format !== 'double') {
    const rounds = Math.log2(bracket.size)
    return live.find((m) => m.id === W(rounds, 0))?.winnerId ?? null
  }
  const reset = live.find((m) => m.id === GF2)
  if (reset && !reset.skipped) return reset.winnerId
  return live.find((m) => m.id === GF1)?.winnerId ?? null
}

/** Matches grouped into the columns a bracket is drawn in. */
export type Column = { key: string; title: string; matches: LiveMatch[]; group?: number }

export function columns(bracket: Bracket, live: LiveMatch[]): Column[] {
  const out: Column[] = []

  if (bracket.format === 'group' && bracket.groups) {
    bracket.groups.forEach((_, g) => {
      const ms = live.filter((m) => m.side === 'G' && m.group === g)
      if (ms.length) out.push({ key: `G${g}`, title: `Group ${groupName(g)}`, matches: ms, group: g })
    })
  }

  const rounds = Math.log2(bracket.size)
  for (let r = 1; r <= rounds; r++) {
    const ms = live.filter((m) => m.side === 'W' && m.round === r)
    if (ms.length) out.push({ key: `W${r}`, title: ms[0].label, matches: ms })
  }
  if (bracket.format === 'double') {
    for (let r = 1; r <= 2 * (rounds - 1); r++) {
      const ms = live.filter((m) => m.side === 'L' && m.round === r)
      if (ms.length) out.push({ key: `L${r}`, title: `Losers Round ${r}`, matches: ms })
    }
    const gf = live.filter((m) => m.side === 'F' && !m.skipped)
    if (gf.length) out.push({ key: 'F', title: 'Grand Final', matches: gf })
  }
  return out
}

/** True once nothing else can be played. */
export function isComplete(bracket: Bracket, live: LiveMatch[]): boolean {
  return championOf(bracket, live) !== null
}

export function playableCount(live: LiveMatch[]): number {
  return live.filter(
    (m) => !m.skipped && !m.auto && m.ready[0] && m.ready[1] && m.teams[0] && m.teams[1] && !m.winnerId,
  ).length
}

/** The third-place race, best first — only meaningful when thirds can qualify. */
export function thirdPlaceRace(bracket: Bracket, live: LiveMatch[]): Standing[] {
  if (!bracket.groups || !bracket.thirdSlots) return []
  const seedOf = (id: string) => {
    const i = bracket.seeds.indexOf(id)
    return i < 0 ? bracket.seeds.length : i
  }
  return rankThirds(standings(bracket, live), seedOf)
}
