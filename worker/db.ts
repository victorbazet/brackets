import type { Action, Bracket, EventT, Team } from '../src/lib/types'

export type Env = {
  DB: D1Database
  ADMIN_PIN?: string
  SHEET_HOOK_TOKEN?: string
  ASSETS: Fetcher
}

type EventRow = {
  id: string
  name: string
  team_size: number
  format: string
  bracket_json: string | null
  sheet_url: string | null
  sheet_synced_at: number | null
  sheet_error: string | null
  position: number
}
type TeamRow = {
  id: string
  event_id: string
  name: string
  players_json: string
  paid: number
  note: string | null
  seed: number
  sheet_row: number | null
}
type ResultRow = {
  event_id: string
  match_id: string
  winner_id: string
  score_a: number | null
  score_b: number | null
}

export async function getVersion(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT value FROM meta WHERE key = 'version'`).first<{ value: string }>()
  return Number(row?.value ?? 1)
}

export function bumpVersion(db: D1Database) {
  return db.prepare(`UPDATE meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'version'`)
}

/** The whole tournament state, shaped exactly like the front end's AppState.events. */
export async function readState(db: D1Database): Promise<{ version: number; events: EventT[] }> {
  const [version, events, teams, results] = await Promise.all([
    getVersion(db),
    db.prepare(`SELECT * FROM events ORDER BY position, created_at`).all<EventRow>(),
    db.prepare(`SELECT * FROM teams ORDER BY event_id, seed`).all<TeamRow>(),
    db.prepare(`SELECT * FROM results`).all<ResultRow>(),
  ])

  const teamsByEvent = new Map<string, Team[]>()
  for (const t of teams.results) {
    const list = teamsByEvent.get(t.event_id) ?? []
    list.push({
      id: t.id,
      name: t.name,
      players: safeJson<string[]>(t.players_json, []),
      paid: t.paid === 1,
      note: t.note ?? undefined,
    })
    teamsByEvent.set(t.event_id, list)
  }

  const resultsByEvent = new Map<string, Bracket['results']>()
  for (const r of results.results) {
    const map = resultsByEvent.get(r.event_id) ?? {}
    map[r.match_id] = { winnerId: r.winner_id, scores: [r.score_a, r.score_b] }
    resultsByEvent.set(r.event_id, map)
  }

  return {
    version,
    events: events.results.map((e) => {
      const skeleton = e.bracket_json ? safeJson<Omit<Bracket, 'results'> | null>(e.bracket_json, null) : null
      return {
        id: e.id,
        name: e.name,
        teamSize: e.team_size,
        format: e.format === 'double' || e.format === 'group' ? e.format : 'single',
        teams: teamsByEvent.get(e.id) ?? [],
        bracket: skeleton ? { ...skeleton, results: resultsByEvent.get(e.id) ?? {} } : null,
        sheetUrl: e.sheet_url,
        sheetSyncedAt: e.sheet_synced_at,
        sheetError: e.sheet_error,
      }
    }),
  }
}

function safeJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/** Turn one client action into the statements that carry it out. */
export function statementsFor(db: D1Database, a: Action): D1PreparedStatement[] {
  switch (a.type) {
    case 'event.upsert': {
      const e = a.event
      return [
        db
          .prepare(
            `INSERT INTO events (id, name, team_size, format, sheet_url, position, created_at)
             VALUES (?, ?, ?, ?, ?, COALESCE((SELECT position FROM events WHERE id = ?), (SELECT COUNT(*) FROM events)), ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               team_size = excluded.team_size,
               format = excluded.format,
               sheet_url = excluded.sheet_url`,
          )
          .bind(e.id, e.name, e.teamSize, e.format, e.sheetUrl ?? null, e.id, Date.now()),
      ]
    }

    case 'event.delete':
      return [
        db.prepare(`DELETE FROM results WHERE event_id = ?`).bind(a.id),
        db.prepare(`DELETE FROM teams WHERE event_id = ?`).bind(a.id),
        db.prepare(`DELETE FROM events WHERE id = ?`).bind(a.id),
      ]

    case 'teams.set': {
      // Full replace: the list order is the seeding, so rewriting it is the
      // simplest way to cover add / edit / delete / reorder / shuffle.
      const out = [db.prepare(`DELETE FROM teams WHERE event_id = ?`).bind(a.eventId)]
      a.teams.forEach((t, i) => {
        out.push(
          db
            .prepare(
              `INSERT INTO teams (id, event_id, name, players_json, paid, note, seed, sheet_row)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              t.id,
              a.eventId,
              t.name,
              JSON.stringify(t.players ?? []),
              t.paid ? 1 : 0,
              t.note ?? null,
              i,
              (t as Team & { sheetRow?: number }).sheetRow ?? null,
            ),
        )
      })
      return out
    }

    case 'bracket.set':
      return [
        // Redrawing a bracket wipes the old results with it.
        db.prepare(`DELETE FROM results WHERE event_id = ?`).bind(a.eventId),
        db
          .prepare(`UPDATE events SET bracket_json = ?, format = COALESCE(?, format) WHERE id = ?`)
          .bind(a.bracket ? JSON.stringify(a.bracket) : null, a.bracket?.format ?? null, a.eventId),
      ]

    case 'result.set':
      return [
        db
          .prepare(
            `INSERT INTO results (event_id, match_id, winner_id, score_a, score_b, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(event_id, match_id) DO UPDATE SET
               winner_id = excluded.winner_id,
               score_a = excluded.score_a,
               score_b = excluded.score_b,
               updated_at = excluded.updated_at`,
          )
          .bind(a.eventId, a.matchId, a.winnerId, a.scores?.[0] ?? null, a.scores?.[1] ?? null, Date.now()),
      ]

    case 'result.clear':
      return [db.prepare(`DELETE FROM results WHERE event_id = ? AND match_id = ?`).bind(a.eventId, a.matchId)]
  }
}

export async function applyActions(db: D1Database, actions: Action[]): Promise<void> {
  const stmts = actions.flatMap((a) => statementsFor(db, a))
  if (stmts.length === 0) return
  stmts.push(bumpVersion(db))
  await db.batch(stmts)
}
