import { useMemo, useState } from 'react'
import {
  buildBracket,
  championOf,
  columns,
  groupsComplete,
  playableCount,
  resolveBracket,
  standings,
  thirdPlaceRace,
} from '../lib/bracket'
import { teamColors } from '../lib/colors'
import { groupName, groupPlanHint } from '../lib/groups'
import type { EventT, Format, LiveMatch } from '../lib/types'
import { FormatPicker } from './FormatPicker'
import { GroupTable, ThirdsTable } from './GroupTable'
import { MatchCard } from './MatchCard'
import { Button, Empty } from './ui'

type Props = {
  event: EventT
  onChange: (fn: (e: EventT) => EventT) => void
  onGoToTeams: () => void
  canEdit: boolean
}

export function BracketView({ event, onChange, onGoToTeams, canEdit }: Props) {
  const [format, setFormat] = useState<Format>(event.format)
  const [tab, setTab] = useState<string>('next')

  const bracket = event.bracket
  const live = useMemo(() => (bracket ? resolveBracket(bracket) : []), [bracket])
  const cols = useMemo(() => (bracket ? columns(bracket, live) : []), [bracket, live])
  const tables = useMemo(() => (bracket ? standings(bracket, live) : []), [bracket, live])
  const thirds = useMemo(() => (bracket ? thirdPlaceRace(bracket, live) : []), [bracket, live])

  const teamById = useMemo(() => new Map(event.teams.map((t) => [t.id, t])), [event.teams])
  const seedById = useMemo(() => new Map(event.teams.map((t, i) => [t.id, i + 1])), [event.teams])
  const colorById = useMemo(() => teamColors(event.teams), [event.teams])
  const nameOf = (id: string | null) => (id ? (teamById.get(id)?.name ?? 'Unknown') : 'Bye')
  const subOf = (id: string | null) => (id ? (teamById.get(id)?.players.join(' · ') ?? '') : '')
  const seedOf = (id: string | null) => (id ? (seedById.get(id) ?? null) : null)
  const colorOf = (id: string | null) => (id ? (colorById.get(id) ?? null) : null)

  const groupOfTeam = useMemo(() => {
    const map = new Map<string, number>()
    bracket?.groups?.forEach((members, g) => members.forEach((id) => map.set(id, g)))
    return map
  }, [bracket])

  const thirdSlots = bracket?.thirdSlots ?? 0
  const allGroupsIn = !!bracket && groupsComplete(bracket, live)
  const qualifiedThirds = useMemo(
    () => new Set(allGroupsIn ? thirds.slice(0, thirdSlots).map((r) => r.teamId) : []),
    [allGroupsIn, thirds, thirdSlots],
  )

  const setResult = (matchId: string, winnerId: string | null, scores?: [number | null, number | null]) => {
    onChange((e) => {
      if (!e.bracket) return e
      const results = { ...e.bracket.results }
      if (winnerId === null) delete results[matchId]
      else results[matchId] = { winnerId, scores: scores ?? results[matchId]?.scores ?? [null, null] }
      return { ...e, bracket: { ...e.bracket, results } }
    })
  }

  const setScores = (matchId: string, scores: [number | null, number | null]) => {
    onChange((e) => {
      if (!e.bracket) return e
      const prev = e.bracket.results[matchId]
      if (!prev) return e
      return { ...e, bracket: { ...e.bracket, results: { ...e.bracket.results, [matchId]: { ...prev, scores } } } }
    })
  }

  const generate = () => {
    const ids = event.teams.map((t) => t.id)
    onChange((e) => ({ ...e, format, bracket: buildBracket(ids, format) }))
    setTab('next')
  }

  if (!bracket) {
    if (!canEdit) {
      return (
        <Empty
          icon="bracket"
          title="No bracket yet"
          sub="Whoever is running the tournament hasn't drawn it. This page updates on its own once they do."
        />
      )
    }
    if (event.teams.length < 2) {
      return (
        <Empty
          icon="users"
          title="Need at least 2 teams"
          sub="Add or import teams first, then come back to draw the bracket."
          action={
            <Button variant="primary" onClick={onGoToTeams}>
              Go to teams
            </Button>
          }
        />
      )
    }
    const tooFewForGroups = event.teams.length < 4
    return (
      <div className="space-y-5">
        <div>
          <h3 className="display text-[20px]">Draw the bracket</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            {event.teams.length} teams, seeded in the order on the Teams tab.{' '}
            {format === 'group' ? 'Top seeds are spread across the groups.' : 'Odd numbers get first-round byes.'}
          </p>
        </div>
        <FormatPicker
          value={format}
          onChange={setFormat}
          hint={{ group: groupPlanHint(event.teams.length) }}
        />
        <Button variant="primary" full onClick={generate} disabled={format === 'group' && tooFewForGroups}>
          {format === 'group' && tooFewForGroups ? 'Need at least 4 teams for groups' : 'Generate bracket'}
        </Button>
      </div>
    )
  }

  const champ = championOf(bracket, live)
  const ready = live.filter((m) => !m.skipped && !m.auto && m.teams[0] && m.teams[1] && !m.winnerId)
  const remaining = playableCount(live)
  const isGroups = bracket.format === 'group'

  const card = (m: LiveMatch, compact = false) => (
    <MatchCard
      key={m.id}
      match={m}
      nameOf={nameOf}
      subOf={subOf}
      seedOf={seedOf}
      colorOf={colorOf}
      compact={compact}
      readOnly={!canEdit}
      onPick={(w) => setResult(m.id, w)}
      onScore={(s) => setScores(m.id, s)}
    />
  )

  const groupTable = (g: number) => (
    <GroupTable
      key={g}
      title={`Group ${groupName(g)}`}
      rows={tables[g] ?? []}
      nameOf={(id) => nameOf(id)}
      colorOf={(id) => colorOf(id)}
      qualify={2}
      thirdsInPlay={thirdSlots > 0}
      qualifiedThirds={qualifiedThirds}
    />
  )

  const thirdsTable =
    thirdSlots > 0 ? (
      <ThirdsTable
        rows={thirds}
        slots={thirdSlots}
        nameOf={(id) => nameOf(id)}
        colorOf={(id) => colorOf(id)}
        groupNameOf={(id) => groupName(groupOfTeam.get(id) ?? 0)}
      />
    ) : null

  const tabs = [
    { key: 'next', title: `Up next${remaining ? ` (${remaining})` : ''}` },
    ...cols.map((c) => ({ key: c.key, title: c.title })),
    ...(thirdSlots > 0 ? [{ key: 'thirds', title: 'Third place' }] : []),
  ]
  const activeCol = cols.find((c) => c.key === tab)

  const formatLine =
    bracket.format === 'single'
      ? 'Single elimination'
      : bracket.format === 'double'
        ? 'Double elimination'
        : `${bracket.groups?.length ?? 0} groups → round of ${bracket.size}`

  return (
    <div className="space-y-4">
      {champ && (
        <div className="relative overflow-hidden rounded-2xl bg-paper px-5 py-6 text-center text-ink">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ background: colorOf(champ) ?? undefined }}
          />
          <div className="label text-ink/50">Champion</div>
          <div className="display-black mt-1.5 text-[26px] leading-none">{nameOf(champ)}</div>
          {subOf(champ) && <div className="mt-2 text-[14px] text-ink/60">{subOf(champ)}</div>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="mr-auto text-[13px] text-muted">
          {formatLine}
          <span className="mx-1.5 text-line-strong">·</span>
          <span className="numeric">{event.teams.length}</span> teams
        </span>
        {canEdit && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm('Clear this bracket and all its results?')) onChange((e) => ({ ...e, bracket: null }))
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {isGroups && !allGroupsIn && (
        <p className="text-[13px] leading-relaxed text-muted">
          The knockout draw fills in once every group has finished.
        </p>
      )}

      {/* ---------- phone: one round at a time ---------- */}
      <div className="lg:hidden">
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`label shrink-0 rounded-lg px-3 py-2 transition-colors ${
                tab === t.key ? 'bg-paper text-ink' : 'bg-surface text-muted hover:text-paper'
              }`}
            >
              {t.title}
            </button>
          ))}
        </div>

        {tab === 'next' ? (
          ready.length ? (
            <div className="space-y-3">
              <p className="text-[13px] text-muted">
                {canEdit ? 'Tap the team that won.' : 'Matches being played right now.'}
              </p>
              {ready.map((m) => card(m))}
            </div>
          ) : (
            <Empty
              icon={champ ? 'trophy' : 'bracket'}
              title={champ ? 'Tournament complete' : 'Nothing to play'}
              sub={champ ? undefined : 'Finish the matches in earlier rounds first.'}
            />
          )
        ) : tab === 'thirds' ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted">
              Third-placed teams across every group. The top {thirdSlots} join the round of {bracket.size}.
            </p>
            {thirdsTable}
          </div>
        ) : (
          <div className="space-y-3">
            {activeCol?.group !== undefined && groupTable(activeCol.group)}
            {activeCol?.matches.map((m) => card(m))}
          </div>
        )}
      </div>

      {/* ---------- laptop: whole bracket ---------- */}
      <div className="hidden lg:block">
        {isGroups && (
          <section className="mb-8">
            <h3 className="label mb-4 text-muted">Group stage</h3>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {(bracket.groups ?? []).map((_, g) => groupTable(g))}
              {thirdsTable}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-3">
              {cols
                .filter((c) => c.group !== undefined)
                .map((c) => (
                  <div key={c.key} className="space-y-2">
                    <div className="label px-1 text-muted">{c.title}</div>
                    {c.matches.map((m) => card(m, true))}
                  </div>
                ))}
            </div>
          </section>
        )}
        <Section
          title={
            bracket.format === 'single' ? 'Bracket' : bracket.format === 'group' ? 'Knockout' : 'Winners bracket'
          }
          cols={cols.filter((c) => c.key.startsWith('W'))}
          card={card}
          connectors
        />
        {bracket.format === 'double' && (
          <>
            <Section title="Losers bracket" cols={cols.filter((c) => c.key.startsWith('L'))} card={card} />
            <Section title="Grand final" cols={cols.filter((c) => c.key === 'F')} card={card} />
          </>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  cols,
  card,
  connectors,
}: {
  title: string
  cols: { key: string; title: string; matches: LiveMatch[] }[]
  card: (m: LiveMatch, compact?: boolean) => React.ReactNode
  connectors?: boolean
}) {
  if (cols.length === 0) return null
  return (
    <section className="mb-8">
      <h3 className="label mb-4 text-muted">{title}</h3>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-h-[220px] gap-0" style={{ minWidth: 'min-content' }}>
          {cols.map((c, ci) => (
            <div
              key={c.key}
              className="bcol flex min-w-[248px] flex-1 flex-col"
              data-conn={connectors ? '1' : '0'}
              data-first={ci === 0 ? '1' : '0'}
              data-last={ci === cols.length - 1 ? '1' : '0'}
            >
              <div className="label mb-3 px-5 text-center text-muted">{c.title}</div>
              <div className="flex flex-1 flex-col">
                {c.matches.map((m, mi) => (
                  <div key={m.id} className="bslot">
                    <div className="w-full">{card(m, true)}</div>
                    {connectors && ci < cols.length - 1 && mi % 2 === 0 && <span className="bconn-v" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
