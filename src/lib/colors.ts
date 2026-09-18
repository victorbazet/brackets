import type { Team } from './types'

/**
 * Team identity colours.
 *
 * Validated as a categorical palette against this app's surface (#0b0d12) in
 * dark mode on the *all-pairs* pairlist — any two teams can meet in a match, so
 * checking only neighbouring slots isn't enough here. All nine clear the
 * lightness band, the chroma floor, and 3:1 contrast against the surface.
 *
 * Separation was pushed past the ΔE 15 floor to a worst pair of 18.0: at 15 two
 * blues landed in the same match and read as the same team at arm's length,
 * which is exactly what these colours exist to prevent. That costs count — a
 * looser floor fits eleven hues, this one fits nine.
 *
 * Colour-vision separation sits in the 6–8 warn band (worst pair ΔE 6.0), which
 * is permissible only with secondary encoding: the team name is always rendered
 * beside its colour and the seed number sits inside the swatch, so colour is
 * never the sole identifier.
 *
 * Past nine teams colours repeat. Deliberate — a repeat reads as "look at the
 * name", whereas a near-miss hue reads as a different team you can't quite place.
 */
export const TEAM_COLORS = [
  '#0057dc', // blue
  '#db7213', // orange
  '#00a233', // green
  '#e14dc0', // magenta
  '#008ba0', // teal
  '#cf0046', // crimson
  '#8c7aff', // periwinkle
  '#7f5d00', // olive
  '#814893', // purple
] as const

export const NO_TEAM_COLOR = '#8b94ab'

/**
 * Assign a colour to every team in an event.
 *
 * Keyed off the team id sorted, not the row position, so shuffling the seeds or
 * dragging a team up the list never repaints the field mid-tournament.
 */
export function teamColors(teams: Team[]): Map<string, string> {
  const byId = [...teams].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return new Map(byId.map((t, i) => [t.id, TEAM_COLORS[i % TEAM_COLORS.length]]))
}
