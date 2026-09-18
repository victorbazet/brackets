import { NO_TEAM_COLOR } from '../lib/colors'
import type { Standing } from '../lib/types'

type Props = {
  title: string
  rows: Standing[]
  nameOf: (id: string) => string
  colorOf: (id: string) => string | null
  /** places that go through automatically — the first `qualify` rows */
  qualify: number
  /** a third place might still go through, so mark it as in the balance */
  thirdsInPlay?: boolean
  /** ids that have actually claimed a third-place slot, once the groups are done */
  qualifiedThirds?: Set<string>
}

const cell = 'px-1.5 py-2 text-right tabular-nums'

export function GroupTable({ title, rows, nameOf, colorOf, qualify, thirdsInPlay, qualifiedThirds }: Props) {
  const through = (r: Standing) =>
    r.rank <= qualify || (r.rank === qualify + 1 && !!qualifiedThirds?.has(r.teamId))
  const maybe = (r: Standing) => !through(r) && r.rank === qualify + 1 && !!thirdsInPlay && !r.settled

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="label text-muted">{title}</span>
        {rows[0]?.settled && <span className="label ml-auto text-muted/50">final</span>}
      </div>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="label border-b border-line text-muted/60">
            <th className="w-7 px-1.5 py-1.5 text-center font-normal">#</th>
            <th className="px-1.5 py-1.5 text-left font-normal">Team</th>
            <th className="w-8 px-1.5 py-1.5 text-right font-normal" title="Played">P</th>
            <th className="w-8 px-1.5 py-1.5 text-right font-normal" title="Won">W</th>
            <th className="w-8 px-1.5 py-1.5 text-right font-normal" title="Lost">L</th>
            <th className="w-11 px-1.5 py-1.5 text-right font-normal" title="Points difference">+/−</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.teamId} className={through(r) ? '' : maybe(r) ? 'opacity-80' : 'opacity-45'}>
              <td className="relative px-1.5 py-2 text-center">
                {/* a solid rail means through, a hollow one means still in the balance */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-[3px] ${maybe(r) ? 'opacity-40' : ''}`}
                  style={{ background: through(r) || maybe(r) ? (colorOf(r.teamId) ?? NO_TEAM_COLOR) : undefined }}
                />
                <span className="numeric text-[12px] text-muted">{r.rank}</span>
              </td>
              <td className="max-w-0 truncate px-1.5 py-2">
                <span className={`display text-[15px] ${through(r) ? 'text-paper' : 'text-soft'}`}>
                  {nameOf(r.teamId)}
                </span>
              </td>
              <td className={`${cell} numeric text-muted`}>{r.played}</td>
              <td className={`${cell} numeric text-paper`}>{r.wins}</td>
              <td className={`${cell} numeric text-muted`}>{r.losses}</td>
              <td className={`${cell} numeric text-muted`}>
                {r.diff > 0 ? `+${r.diff}` : r.diff < 0 ? r.diff : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Who is winning the race for the leftover knockout slots. */
export function ThirdsTable({
  rows,
  slots,
  nameOf,
  colorOf,
  groupNameOf,
}: {
  rows: Standing[]
  slots: number
  nameOf: (id: string) => string
  colorOf: (id: string) => string | null
  groupNameOf: (id: string) => string
}) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-2.5">
        <span className="label text-muted">
          Third place — best {slots} go through
        </span>
      </div>
      <div className="divide-y divide-line">
        {rows.map((r, i) => (
          <div key={r.teamId} className={`relative flex items-center gap-3 py-2.5 pl-4 pr-3 ${i < slots ? '' : 'opacity-45'}`}>
            {i < slots && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: colorOf(r.teamId) ?? NO_TEAM_COLOR }}
              />
            )}
            <span className="numeric w-4 shrink-0 text-[12px] text-muted">{i + 1}</span>
            <span className={`display min-w-0 flex-1 truncate text-[15px] ${i < slots ? 'text-paper' : 'text-soft'}`}>
              {nameOf(r.teamId)}
            </span>
            <span className="label shrink-0 text-muted/60">Grp {groupNameOf(r.teamId)}</span>
            <span className="numeric shrink-0 text-[14px] text-muted">
              {r.wins}W · {r.diff > 0 ? `+${r.diff}` : r.diff}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
