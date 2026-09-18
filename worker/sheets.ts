import { normalizeSheetUrl, parseCsv, parseGrid } from '../src/lib/sheetParse'
import { bumpVersion } from './db'

export type SyncReport = {
  eventId: string
  added: number
  updated: number
  removed: number
  error?: string
}

const ALLOWED_HOSTS = ['docs.google.com', 'www.google.com', 'google.com', 'googleusercontent.com']

/**
 * Only fetch Google-hosted sheet URLs. The URL is admin-set, but the sync also
 * runs from a cron and a webhook, so pin down what the Worker will request.
 */
function checkUrl(raw: string): URL {
  const url = new URL(normalizeSheetUrl(raw))
  if (url.protocol !== 'https:') throw new Error('Sheet link must start with https://')
  const host = url.hostname.toLowerCase()
  if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new Error(`Not a Google Sheets link (${host})`)
  }
  return url
}

const shortId = () => crypto.randomUUID().slice(0, 8)

/**
 * Pull one event's published sheet and fold it into the teams table.
 * Rows are matched on their sheet row number, so editing a name updates that
 * team instead of creating a second one.
 */
export async function syncEvent(
  db: D1Database,
  event: { id: string; sheet_url: string | null; bracket_json: string | null },
): Promise<SyncReport> {
  const report: SyncReport = { eventId: event.id, added: 0, updated: 0, removed: 0 }
  if (!event.sheet_url) return report

  let csv: string
  try {
    const url = checkUrl(event.sheet_url)
    const res = await fetch(url.toString(), {
      headers: { accept: 'text/csv,text/plain' },
      redirect: 'follow',
      cf: { cacheTtl: 0 },
    })
    if (!res.ok) {
      // 400 almost always means the gid names a tab this sheet doesn't have.
      throw new Error(
        res.status === 400 || res.status === 404
          ? 'Google couldn’t find that tab — open the tab you want and re-copy the link from the address bar.'
          : `Sheet returned ${res.status} — set sharing to “Anyone with the link”.`,
      )
    }
    csv = await res.text()
    if (csv.trimStart().startsWith('<')) {
      // Google hands back a sign-in page when the sheet isn't readable.
      throw new Error('Google asked us to sign in — set the sheet’s sharing to “Anyone with the link”.')
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : 'Could not read the sheet'
    await db
      .prepare(`UPDATE events SET sheet_error = ?, sheet_synced_at = ? WHERE id = ?`)
      .bind(report.error, Date.now(), event.id)
      .run()
    return report
  }

  const parsed = parseGrid('sheet', parseCsv(csv))

  const existing = await db
    .prepare(`SELECT id, name, players_json, paid, note, seed, sheet_row FROM teams WHERE event_id = ? ORDER BY seed`)
    .bind(event.id)
    .all<{
      id: string
      name: string
      players_json: string
      paid: number
      note: string | null
      seed: number
      sheet_row: number | null
    }>()

  const byRow = new Map(existing.results.filter((t) => t.sheet_row !== null).map((t) => [t.sheet_row!, t]))
  const seenRows = new Set<number>()
  const stmts: D1PreparedStatement[] = []
  let nextSeed = existing.results.length ? Math.max(...existing.results.map((t) => t.seed)) + 1 : 0

  for (const t of parsed.teams) {
    seenRows.add(t.row)
    const players = JSON.stringify(t.players)
    const paid = t.paid ? 1 : 0
    const prev = byRow.get(t.row)

    if (!prev) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO teams (id, event_id, name, players_json, paid, note, seed, sheet_row)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(shortId(), event.id, t.name, players, paid, t.note ?? null, nextSeed++, t.row),
      )
      report.added++
      continue
    }

    const changed =
      prev.name !== t.name || prev.players_json !== players || prev.paid !== paid || (prev.note ?? null) !== (t.note ?? null)
    if (changed) {
      stmts.push(
        db
          .prepare(`UPDATE teams SET name = ?, players_json = ?, paid = ?, note = ? WHERE id = ?`)
          .bind(t.name, players, paid, t.note ?? null, prev.id),
      )
      report.updated++
    }
  }

  // A row cleared out of the sheet removes that team — but never once the
  // bracket is drawn, since that team may already have played.
  if (!event.bracket_json) {
    for (const [row, team] of byRow) {
      if (seenRows.has(row)) continue
      stmts.push(db.prepare(`DELETE FROM teams WHERE id = ?`).bind(team.id))
      report.removed++
    }
  }

  stmts.push(db.prepare(`UPDATE events SET sheet_error = NULL, sheet_synced_at = ? WHERE id = ?`).bind(Date.now(), event.id))
  // Only bump the version when something actually moved, so idle polling stays quiet.
  if (report.added || report.updated || report.removed) stmts.push(bumpVersion(db))

  await db.batch(stmts)
  return report
}

export async function syncAll(db: D1Database, eventId?: string): Promise<SyncReport[]> {
  const rows = eventId
    ? await db
        .prepare(`SELECT id, sheet_url, bracket_json FROM events WHERE id = ? AND sheet_url IS NOT NULL`)
        .bind(eventId)
        .all<{ id: string; sheet_url: string | null; bracket_json: string | null }>()
    : await db
        .prepare(`SELECT id, sheet_url, bracket_json FROM events WHERE sheet_url IS NOT NULL`)
        .all<{ id: string; sheet_url: string | null; bracket_json: string | null }>()

  const out: SyncReport[] = []
  for (const row of rows.results) out.push(await syncEvent(db, row))
  return out
}
