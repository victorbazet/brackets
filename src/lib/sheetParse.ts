/**
 * Sheet parsing, with no dependency on the xlsx library or on the browser —
 * the front end feeds it a grid from a .xlsx file, the Worker feeds it a grid
 * parsed from a published-to-web CSV. Both get identical results.
 */

export type ParsedTeam = {
  name: string
  players: string[]
  paid?: boolean
  note?: string
  /** 1-based row number in the sheet — the stable key used when re-syncing */
  row: number
}

export type ParsedSheet = {
  sheetName: string
  /** the banner above the table, e.g. "SPIKEBALL TOURNAMENT - TEAM SIGN-UP" */
  title: string
  headerRow: number
  playerColumns: number
  teams: ParsedTeam[]
  emptyRows: number
}

export const clean = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim()

const isTeamNameHeader = (s: string) => /^team(\s*name)?$/i.test(s) || /team\s*name/i.test(s)
const isPlayerHeader = (s: string) => /^player\s*\d*$/i.test(s) || /^(name|member)\s*\d*$/i.test(s)
const isPaidHeader = (s: string) => /paid|venmo|payment/i.test(s)
const isNoteHeader = (s: string) => /trash|note|comment|smack/i.test(s)
const isIndexHeader = (s: string) => s === '#' || /^(no\.?|num(ber)?|rank|seed)$/i.test(s)

const truthy = (s: string) => /^(y|yes|true|paid|x|✓|✔|1)$/i.test(s.trim())

/** Find the header row: the first row in the top 20 that names a team or player column. */
function findHeaderRow(grid: string[][]): number {
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const row = grid[r] ?? []
    const hasTeam = row.some((c) => isTeamNameHeader(c))
    const hasPlayer = row.some((c) => isPlayerHeader(c))
    if (hasTeam || hasPlayer) return r
  }
  return 0
}

export function parseGrid(sheetName: string, rawGrid: string[][]): ParsedSheet {
  const grid = rawGrid.map((r) => (Array.isArray(r) ? r.map(clean) : []))

  const headerRow = findHeaderRow(grid)
  const header = grid[headerRow] ?? []

  const title =
    grid
      .slice(0, headerRow)
      .map((r) => r.find((c) => c.length > 0) ?? '')
      .find((c) => c.length > 0) ?? sheetName

  const teamCol = header.findIndex((c) => isTeamNameHeader(c))
  const playerCols = header.map((c, i) => (isPlayerHeader(c) ? i : -1)).filter((i) => i >= 0)
  const paidCol = header.findIndex((c) => isPaidHeader(c))
  const noteCol = header.findIndex((c) => isNoteHeader(c))
  const indexCol = header.findIndex((c) => isIndexHeader(c))

  // No recognisable player columns: treat every remaining titled column as a player.
  const cols =
    playerCols.length > 0
      ? playerCols
      : header
          .map((_, i) => i)
          .filter(
            (i) =>
              i !== teamCol &&
              i !== paidCol &&
              i !== noteCol &&
              !isIndexHeader(header[i] ?? '') &&
              (header[i] ?? '').length > 0,
          )

  const teams: ParsedTeam[] = []
  let emptyRows = 0
  let blankRun = 0

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const players = cols.map((i) => row[i] ?? '').filter((v) => v.length > 0)
    const teamName = teamCol >= 0 ? (row[teamCol] ?? '') : ''
    const note = noteCol >= 0 ? (row[noteCol] ?? '') : ''

    // Sign-up sheets end with summary rows ("Teams signed up: 12"). Those sit
    // under the table but still land in the player columns, so stop at the first
    // row that doesn't look like a numbered entry.
    const idx = indexCol >= 0 ? (row[indexCol] ?? '') : ''
    const footerish =
      (indexCol >= 0 && idx.length > 0 && !/^\d+(\.\d+)?$/.test(idx)) ||
      teamName.endsWith(':') ||
      row.some((c) => /^(teams signed up|players total|teams paid|total)\b/i.test(c))
    if (footerish) break

    if (!teamName && players.length === 0) {
      emptyRows++
      if (++blankRun >= 3 && teams.length > 0) break
      continue
    }
    blankRun = 0

    teams.push({
      name: teamName || players.join(' & ') || `Team ${teams.length + 1}`,
      players,
      paid: paidCol >= 0 ? truthy(row[paidCol] ?? '') : undefined,
      note: note || undefined,
      row: r + 1,
    })
  }

  return { sheetName, title, headerRow: headerRow + 1, playerColumns: cols.length, teams, emptyRows }
}

/** Minimal RFC-4180 CSV reader — handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export class SheetLinkError extends Error {}

/**
 * Turn whatever Google Sheets link someone pastes into one that returns CSV.
 *
 * Targets `/export?format=csv`, which is a literal cell dump — the sheet just
 * has to be shared "anyone with the link".
 *
 * Deliberately never produces a `/gviz/tq` url even though it also speaks CSV:
 * gviz runs every column through Google's type inference, which blanks values
 * that don't match the guessed type and merges a title banner into the header
 * row. On a sign-up sheet (banner, header, then a summary row at the bottom)
 * that silently invents garbage teams instead of failing loudly.
 *
 * The tab is addressed by `gid`, which only `/export` honours — `sheet=<name>`
 * is ignored there and quietly returns the first tab.
 */
export function normalizeSheetUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return trimmed
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'docs.google.com' && !host.endsWith('.docs.google.com')) return trimmed

  // A "Publish to web" link exports through its own endpoint; keep it whole.
  const published = url.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/)
  if (published) {
    if (url.searchParams.get('output') === 'csv') return url.toString()
    const gid = tabId(url)
    return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?${gid ? `gid=${gid}&` : ''}single=true&output=csv`
  }

  const id = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1]
  if (!id) {
    throw new SheetLinkError('That’s a Google link, but not a Google Sheet. Open the sheet and copy the link from there.')
  }
  if (url.searchParams.get('format') === 'csv') return url.toString()

  // No gid means "whatever tab is first" — right for a one-tab sheet, and the
  // only sane guess otherwise. Never fall back to gid=0: that's a real tab id
  // that most sheets don't have, and Google answers 400 for it.
  const gid = tabId(url)
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`
}

/** The tab id lives in the hash on /edit links and in the query elsewhere. */
function tabId(url: URL): string | null {
  return url.hash.match(/gid=(\d+)/)?.[1] ?? url.searchParams.get('gid')
}

/** Guess a short event name from a sheet's banner text. */
export function eventNameFromSheet(s: ParsedSheet): string {
  const t = s.title
    .replace(/team\s*sign[\s-]*up/i, '')
    .replace(/tournament/i, '')
    .replace(/[-–—:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const name = t || s.sheetName
  if (name.length <= 2) return s.sheetName
  // Sheets shout their banners ("SPIKEBALL TOURNAMENT") — title-case them.
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
