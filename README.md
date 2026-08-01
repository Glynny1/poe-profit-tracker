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

---

## Setup — fully local, no accounts needed

`embedded-postgres` runs a real PostgreSQL server out of `./.local-db`. No Docker,
no system install, no cloud account. The only network call is read-only price data
from poe.ninja.

```bash
npm install
cp .env.example .env      # the defaults already point at the local database
```

Generate a session secret and put it in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Create the tables once, then start the app:

```bash
npm run db:local &   # start the database (first time only, for db:push)
npm run db:push      # create the tables
```

From then on it's a single command — `npm run dev` starts the database itself and
shuts it down again when you stop it:

```bash
npm run dev
```

Open http://localhost:3000, register with your `INVITE_CODE`, and go to **Import**.

Your data persists in `./.local-db` between runs. `npm run db:local:reset` wipes it
and starts fresh. Re-run `npm run db:push` after any change to `schema.prisma`.

### If you see `P1001: Can't reach database server`

The database isn't running. Normally `npm run dev` handles that, so this means
either you're running `npm run db:push`/`npm run smoke` on their own (start
`npm run db:local` in another terminal first), or a previous Postgres was killed
without shutting down and left the port held. `npm run dev` clears a stale lock
file automatically, but if a zombie process is still holding the port it will tell
you so and print the two commands to clear it:

```bash
netstat -ano | findstr :5433
taskkill /PID <pid> /F
```

Want sample data to look at instead of importing your own?

```bash
npm run seed        # creates user "dev" / password "devpassword" with two snapshots
```

### Later: hosting it for your friends

Create a free [neon.tech](https://neon.tech) database, then in Vercel set these
**four** environment variables before deploying:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon's **pooled** connection string (`-pooler` in the host) |
| `SESSION_SECRET` | 32+ random characters — generate a fresh one, not your local one |
| `INVITE_CODE` | whatever you'll give your friends |
| `CONTACT_EMAIL` | your email, sent to poe.ninja in the User-Agent |

Then run `npm run db:push` once locally with `DATABASE_URL` pointed at Neon, to
create the tables.

The build itself does **not** require any of these — it's verified to succeed with
none set, so a missing variable shows up as a clear runtime error rather than a
failed deploy. `embedded-postgres` is an optional dependency for the same reason:
it's a 108 MB local-only binary, and a hosting platform failing to fetch it must
never break a deploy. If you want to skip it entirely, set Vercel's install command
to `npm install --omit=optional`.

**4. Get your stash JSON.** While logged in to pathofexile.com, open this in your
browser and copy the whole response:

```
https://www.pathofexile.com/character-window/get-stash-items?accountName=YourName%231234&realm=pc&league=Allflame&tabs=1&tabIndex=0
```

Increase `tabIndex` and paste each tab in turn — imports accumulate. Two things
that will bite you: the `#` in your account name **must** be written `%23`, and
`realm=pc` is required. Get either wrong and you get a permission error that looks
like a login failure.

Then tick the tabs you want tracked and press **Take snapshot**.

---

## The state of "Log in with Path of Exile"

You can't have it yet, and that isn't a design choice. GGG's developer docs say,
verbatim and currently:

> We are currently unable to process new applications.

There's no way to build against it in the meantime either — confidential clients
"cannot accept IP addresses or localhost domains **even for in-development
projects**", and there's no sandbox.

So the app is built behind a `StashSource` seam with three adapters:

| Adapter | Status |
|---|---|
| **Import** — paste/upload stash JSON | **shipped**, this is what you use today |
| **Session** — server-side `POESESSID` | not built; see the caveats below |
| **OAuth** — the real thing | drops in if GGG reopens registration |

Everything downstream of the seam — pricing, snapshots, diffs, strategies — is
identical for all three, so switching later is an adapter, not a rewrite.

Worth doing once, costs nothing: check
[your applications page](https://www.pathofexile.com/my-account/applications) in
case you already have a client, and email `oauth@grindinggear.com` by hand
describing a private, non-commercial tool for ~5 users needing only
`account:profile` and `account:stashes`.

### Before you build the session-cookie adapter

Three things the code can't fix for you:

1. **It breaks GGG's ToS.** §16 forbids disclosing session credentials to third
   parties, and GGG staff have publicly said not to give POESESSID to third-party
   apps. Fine for five friends in private; do not publish or monetise it.
2. **You'd be storing account-takeover credentials.** POESESSID is a full website
   session. Encrypt at rest with a key held outside the database, never log it,
   and offer a one-click wipe.
3. **Rate limits are per-IP and you'd all share your server's.** Measured live:
   30 req/60s, 90/1800s, 180/7200s, with bans up to an hour. With ~8 tracked tabs
   that's roughly 20 snapshots per 2 hours across everyone — fine for manual
   snapshots, hopeless for background polling.

---

## What the numbers mean

**Profit** is the quantity effect: items you actually gained, valued at frozen
prices. **Market drift** is shown separately and deliberately not called profit.

**A sale nets to roughly zero, and that's correct.** Selling a 200c scarab is
−1 scarab and +200 chaos. The app reports net income, not gross transactions.

**A stash diff can never tell selling from vendoring, consuming or trading away.**
Nothing fixes that, so the UI says *"left your stash"*, never *"sold"*. The
**Sell** button is the only thing that records what you actually got — it freezes
the price at that instant, and works outside strategies too, because most trades
aren't part of one.

**Character inventory isn't in the stash API.** Snapshot with 3 divines in your
pack, deposit them, snapshot again, and you get +3 div of phantom profit. Empty
your inventory before snapshotting. This is the single largest noise source in
the whole system.

**Net worth is a lower bound.** poe.ninja doesn't price rare items at all, by
design — they're excluded and counted separately. Unique variants (different
Watcher's Eye rolls) aren't derivable from stash JSON either, so those collapse
to the most-traded variant. Gems price only at whole tiers, so an off-tier gem
snaps down to the nearest priced one.

**The liquidity haircut** in Settings values what you're still holding at a share
of list price. The gap between poe.ninja's list price and what you actually get
selling in bulk is the biggest systematic error in tools like this; 85% is
realistic.

---

## Development

```bash
npm test                  # 57 unit tests — the diff engine's acceptance criteria
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
src/lib/
  poeninja/       API client + parsers (verified against the live API)
  stashImport.ts  the Import adapter
  services/       the database layer
src/app/          Next.js pages and server actions
```

**Money is always integer micro-chaos (`chaos × 1e6`, `bigint`).** There are no
floats in the money path — that's what lets the reconciliation assertion be exact
equality instead of a hopeful epsilon. Divine is converted once, at render.

**Frozen prices are copied values, never joins.** `StrategyInput.unitCostMicro`
and `Sale.unitPriceMicro` are written once. There is deliberately no code path
from a historical figure back to a live price.

### Things that will surprise you about the APIs

- Every poe.ninja tutorial older than ~June 2026 is wrong. `poe.ninja/api/data/*`
  now 404s; the base is `poe.ninja/poe1/api/economy`.
- Scarabs, Fragments and Astrolabes are **exchange** types, not item types, with
  a completely different response shape (a slug and no name — you join to a
  sibling `items[]` array for the name).
- poe.ninja publishes **two chaos:divine rates that disagree by ~19%**. This app
  uses the exchange rate for everything and never reads the stash currency
  endpoint, so a stash of pure divines reports the right number of divines.
- Generic map rows all carry `variant: ", Gen-24"`. The standard advice from older
  tools is to filter `/, Gen-\d+/` as legacy — do that and you delete map pricing
  entirely.
- An invalid category is HTTP 404; a valid but empty one is HTTP 200 with
  `{"lines":[]}`. Treat 404 as "category retired", not as an error to retry.
- `levelRequired` means *item level* on ClusterJewel/BaseType/Wombgift and *level
  requirement* everywhere else.

---

Prices by [poe.ninja](https://poe.ninja). This product isn't affiliated with or
endorsed by Grinding Gear Games in any way.
