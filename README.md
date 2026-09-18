# Brackets

Tournament brackets for house events — phone-first, because that's what you'll have on you
at the courts. Sign-ups come from a Google Sheet, everything lives in one Cloudflare D1
database, and players get a read-only link that updates itself.

## Who sees what

- **Players** open the URL and watch. Live bracket, who's up next, champion. No login.
- **You** tap the 🔒 in the header, enter the admin PIN, and get teams, seeding, and scoring.

The PIN is a Worker secret. Every write is checked server-side, so a viewer can't score
themselves into the final by poking at the page.

## Run it locally

Two processes — the API and the front end:

```bash
npm install && npm run db:local && npm run dev:api
```

```bash
npm run dev
```

Vite proxies `/api` to the Worker, so open <http://localhost:5173>. Vite also prints a
"Network" URL like `http://192.168.1.x:5173` — that's the one to open on your phone.

For local dev the PIN comes from `.dev.vars` (gitignored):

```
ADMIN_PIN=1234
SHEET_HOOK_TOKEN=some-long-random-string
```

## Deploy it

You'll need a free Cloudflare account.

```bash
npx wrangler login
npx wrangler d1 create brackets
```

Put the `database_id` it prints into `wrangler.jsonc`, then:

```bash
npm run db:remote
npx wrangler secret put ADMIN_PIN
npx wrangler secret put SHEET_HOOK_TOKEN
npm run deploy
```

That gives you `https://brackets.<your-subdomain>.workers.dev` — the link you send the house.
Free tier covers this comfortably; a tournament is a few hundred rows.

**Set `ADMIN_PIN` before you share the URL.** With no PIN configured, the app lets anyone edit.

## Google Sheets

Link a sheet per event: open the event, **⚙ → Sign-up sheet**, or do it while creating the
event. Set the sheet's sharing to **Anyone with the link**, click the tab for that event, and
paste the link straight from the address bar — the tab id travels in the link's `#gid=`.

Under the hood that becomes `/export?format=csv&gid=N`, a literal cell dump.

Two traps worth knowing, both hit in practice:

- **Never use `/gviz/tq`**, even though it also returns CSV and needs no gid. It runs every
  column through Google's type inference, which blanks values that don't fit the guessed type
  and merges a title banner into the header row. On a sign-up sheet it silently produced
  teams named `0` instead of failing.
- **Never default a missing gid to `0`.** Zero is a real tab id that most sheets don't have,
  and Google answers `400`. With no gid, `/export` returns the first tab, which is the right
  guess.

A **Publish to web** CSV link also works and needs no sharing change, but Google serves those
from a cache that can lag several minutes.

Sync behaviour:

- New rows become new teams; edited rows update in place (team ids stay put, so a rename
  mid-tournament doesn't orphan anyone).
- A deleted row removes that team — **but never once the bracket is drawn**, since they may
  already have played. Late sign-ups after the draw appear in the teams list for you to place.
- The Worker re-reads linked sheets **every minute** on a cron.

For instant sync, open the sheet's **Extensions → Apps Script**, paste in
[`google-apps-script.gs`](google-apps-script.gs), fill in your Worker URL and the same
`SHEET_HOOK_TOKEN`, and run `install` once. Every edit then pokes the app directly and the
team appears in a second or two.

You can also skip the sheet entirely and use **Import sheet** to load an `.xlsx` once, or add
teams by hand.

## Using it

1. **Events** — one per game (Spikeball, Dye, …), or one per sheet tab on import.
2. **Teams** — list order *is* the seeding. Arrows to nudge, 🎲 to draw randomly. Odd counts
   get byes automatically.
3. **Bracket** — single elimination, double elimination, or groups followed by a knockout.
   Tap whoever won. Scores optional.

### Groups

Groups of four where everyone plays everyone, then a single-elimination knockout. The field is
split into as many groups of four as it allows — sizes never differ by more than one, and never
drop below three unless there are only two groups — with the top seeds snaked across them.

Group tables are ordered on wins, then the head-to-head record among whoever is level, then
points difference, then points scored, then the original seed. Head-to-head only applies inside
a block of teams on the same number of wins, so it can never leapfrog someone who simply won
more.

**The top two of every group go through.** That fills the knockout exactly when twice the number
of groups is itself a power of two — 2, 4, 8 or 16 groups. It usually isn't, so the best
third-placed teams make up the difference, the way a 6-group Euro sends 12 + 4 into a round of
16. Parity has nothing to do with it:

| Groups | Top 2 | Best thirds | Knockout |
| --- | --- | --- | --- |
| 2 | 4 | — | round of 4 |
| 3 | 6 | 2 | round of 8 |
| 4 | 8 | — | round of 8 |
| 6 | 12 | 4 | round of 16 |
| 8 | 16 | — | round of 16 |

Teams from the same group don't meet again in the first knockout round. For group winners and
runners-up that's settled when the draw is made; for the third-place slots it can't be, since
nobody knows which groups they'll come from, so those slots are handed out once the groups are
in — best third first, taking the first slot that doesn't hand it a rematch.

Each team gets a colour, shown as a stripe down its side of a match card and inside its seed
badge, so you can tell who's who across a court. Colours are keyed to the team, not its
position, so shuffling the seeds never repaints the field.

The palette is nine hues, validated as a categorical palette against the app's dark surface on
the all-pairs pairlist (any two teams can meet). Two decisions worth keeping if you touch
`src/lib/colors.ts`:

- **Separation was pushed to ΔE 18, above the documented 15 floor.** At 15 a palette of eleven
  fits, but two blues landed in the same match and read as one team at arm's length.
- **Past nine teams colours repeat**, on purpose. A repeat tells you to read the name; a
  near-miss hue looks like a different team you can't quite place.

Re-run `scripts/validate_palette.js` from the dataviz skill if you change a hue.

On a phone the bracket opens on **Up next**: every match playable right now, as big tap
targets. Tapping a winner again undoes it, and changing an early result clears whatever
depended on it. On a laptop the same screen draws the full bracket left to right.

## Offline

The scoring phone keeps working if the wifi drops. Results are applied locally, the header
shows `offline · n to send`, and everything flushes when the connection comes back — so a
dead spot behind the house doesn't stop the tournament.

Results are stored per match rather than as one blob, so two people scoring different courts
at the same time don't overwrite each other.

## Layout

```
src/lib/        bracket maths, sheet parsing, sync store   (browser)
src/components/ the three tabs and the match card          (browser)
worker/         API, D1 access, Google Sheets sync         (Cloudflare)
worker/schema.sql
```

`src/lib/sheetParse.ts` is shared: the browser feeds it a grid from an `.xlsx`, the Worker
feeds it one parsed from CSV, and both get identical teams out.

Run `npm run check` to typecheck the browser and Worker sides together.
