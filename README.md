# PoE Profit Tracker

A Path of Exile 1 profit tracker for you and a few friends. Snapshot your stash,
and see **what you actually earned** separated from **what the market did**.

Most trackers report one blended number that quietly mixes those two things. This
one doesn't:

```
net worth change  =  quantity effect  +  price effect  +  coverage effect
                     ───────────────    ────────────    ───────────────
                     what you gained    prices moved    what we could
                     ← THIS IS PROFIT   under you       price changed
```

That split is exact algebra, not an estimate, and the app asserts it reconciles
to the unit before showing you a number.

## What it does

- **Snapshots** your stash and diffs them, so profit is separated from price drift.
- **Strategies** record what you bought for a mapping setup at the price you paid,
  frozen so later market moves can't rewrite history.
- **Finish a run** to compare your stash against the snapshot from when you
  started, listing everything that arrived or left with what it's worth.
- **An archive** of finished runs, with what each earned and per map.
- **Share codes** so you can hand a whole cost sheet to someone else.

## Running it locally

`embedded-postgres` runs a real PostgreSQL server out of `./.local-db`. No Docker,
no system install, no cloud account. The only network call is read-only price data
from poe.ninja.

```bash
npm install
cp .env.example .env
npm run secret          # generate a SESSION_SECRET and paste it into .env
```

Create the tables once, then start the app:

```bash
npm run db:local &      # start the database (first time only, for db:push)
npm run db:push         # create the tables
```

From then on it's a single command. `npm run dev` starts the database itself and
shuts it down again when you stop it:

```bash
npm run dev
```

Open http://localhost:3000. Create an account with:

```bash
npm run user -- create <username>     # prints a generated password once
npm run invite -- friend              # an invite code, if you'd rather register
```

Your data persists in `./.local-db`. `npm run db:local:reset` wipes it.

### Hosting it for your friends

**[docs/deploying.md](docs/deploying.md)** is a click-by-click walkthrough written
for someone with no prior experience: a free Neon database, four environment
variables in Vercel, and the step people miss (Vercel does not rebuild when you
change a variable).

## "Log in with Path of Exile" is not possible right now

GGG's developer docs say, verbatim and currently:

> We are currently unable to process new applications.

There's no way to build against it in the meantime either: confidential clients
"cannot accept IP addresses or localhost domains **even for in-development
projects**", and there's no sandbox.

So stash access sits behind a `StashSource` seam with three adapters. Importing
stash JSON is what ships; a server-side `POESESSID` fetcher and real OAuth are
both drop-in replacements that leave everything downstream untouched.

If you do apply: a confidential client cannot use a localhost redirect URI, so
you need a deployed HTTPS domain first, and the redirect URI is a dedicated
callback route rather than your login page. A login page would ignore the
`?code=` entirely and the sign-in would silently do nothing.

## What the numbers mean

**Profit** is the quantity effect: items you actually gained, valued at frozen
prices. Market drift is shown separately and deliberately not called profit.

**A sale nets to roughly zero, and that's correct.** Selling a 200c scarab is
−1 scarab and +200 chaos. The app reports net income, not gross transactions.

**A stash diff can never tell selling from vendoring, consuming or trading away.**
Nothing fixes that, so the UI says *"left your stash"*, never *"sold"*. The
**Sell** button is the only thing that records what you actually got.

**Character inventory isn't in the stash API.** Snapshot with 3 divines in your
pack, deposit them, snapshot again, and you get +3 div of phantom profit. Empty
your inventory first. This is the single largest noise source in the whole system.

**Change zone before refreshing your stash.** Path of Exile only writes your stash
to its servers when you leave an area, so loot from the map you just finished
won't appear until you take a portal.

**Net worth is a lower bound.** poe.ninja doesn't price rare items at all, by
design, so they're excluded and counted separately.

## Development

```bash
npm test                  # unit tests, including the diff engine's acceptance criteria
npm run typecheck
npm run verify:pipeline   # end-to-end against LIVE poe.ninja data, no database
npm run smoke             # full stack against the local database (needs db:local)
npm run build
```

`verify:pipeline` is the one that matters most. It fetches a real price book and
checks that 10 Divine Orbs value as exactly 10.00 div, that moving a stack between
tabs produces zero profit, that a sale nets to zero, that unticking a tab lands in
coverage rather than profit, and that the three terms reconcile.

### Layout

```
src/domain/       pure logic, no I/O, fully tested
  money.ts        integer micro-chaos; divine is display-only
  priceKey.ts     the item <-> price matching contract
  snapshot.ts     two-lane item identity, tab summing
  diff.ts         the three-term decomposition
  shareCode.ts    strategy share codes
src/lib/
  poeninja/       API client + parsers (verified against the live API)
  stashImport.ts  the Import adapter
  services/       the database layer
src/app/          Next.js pages and server actions
```

**Money is always integer micro-chaos (`chaos × 1e6`, `bigint`).** No floats in the
money path, which is what lets the reconciliation assertion be exact equality
instead of a hopeful epsilon. Divine is converted once, at render.

**Frozen prices are copied values, never joins.** There is deliberately no code
path from a historical figure back to a live price.

### Things that will surprise you about the APIs

- Every poe.ninja tutorial older than ~June 2026 is wrong. `poe.ninja/api/data/*`
  now 404s; the base is `poe.ninja/poe1/api/economy`.
- Scarabs, Fragments and Astrolabes are **exchange** types, not item types, with a
  completely different response shape.
- poe.ninja publishes **two chaos:divine rates that disagree by ~19%**. This app
  uses the exchange rate for everything, so a stash of pure divines reports the
  right number of divines.
- Generic map rows all carry `variant: ", Gen-24"`. The standard advice is to
  filter `/, Gen-\d+/` as legacy — do that and you delete map pricing entirely.
- An invalid category is HTTP 404; a valid but empty one is HTTP 200 with
  `{"lines":[]}`.

---

Prices by [poe.ninja](https://poe.ninja). This product isn't affiliated with or
endorsed by Grinding Gear Games in any way.
