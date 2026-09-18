-- Brackets — D1 schema.
-- Results live in their own table (not inside the bracket blob) so two phones
-- scoring different courts at the same time can't overwrite each other.

CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  team_size       INTEGER NOT NULL DEFAULT 2,
  format          TEXT NOT NULL DEFAULT 'single',
  -- bracket structure + seeds, JSON; NULL until the bracket is drawn
  bracket_json    TEXT,
  -- published-to-web CSV url for the Google Sheet tab feeding this event
  sheet_url       TEXT,
  sheet_synced_at INTEGER,
  sheet_error     TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  players_json TEXT NOT NULL DEFAULT '[]',
  paid         INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  -- seeding: the order teams appear in the app
  seed         INTEGER NOT NULL DEFAULT 0,
  -- row this team came from in the sheet, so re-syncing updates instead of duplicating
  sheet_row    INTEGER
);
CREATE INDEX IF NOT EXISTS teams_by_event ON teams (event_id, seed);
CREATE UNIQUE INDEX IF NOT EXISTS teams_by_sheet_row ON teams (event_id, sheet_row)
  WHERE sheet_row IS NOT NULL;

CREATE TABLE IF NOT EXISTS results (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  match_id   TEXT NOT NULL,
  winner_id  TEXT NOT NULL,
  score_a    INTEGER,
  score_b    INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, match_id)
);

-- version is bumped on every write; clients poll it to know when to refetch
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('version', '1');
