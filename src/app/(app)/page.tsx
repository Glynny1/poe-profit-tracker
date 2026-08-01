import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { latestDiff } from "@/lib/services/snapshots";
import { getLatestDivineRate } from "@/lib/services/priceBook";
import { getHoldings } from "@/lib/services/holdings";
import { formatMoney } from "@/domain/money";
import { Alert, Empty, Panel, Stat, Td, Th, Tr } from "@/components/ui";
import { NetWorthChart } from "@/components/NetWorthChart";
import { ChaosAndDivine } from "@/components/Coin";
import { HoldingsTable } from "@/components/HoldingsTable";

export default async function Dashboard() {
  const user = await requireUser();
  const cur = user.displayCurrency;
  const rate = await getLatestDivineRate(user.league);
  const fmt = (v: bigint, sign = false) => formatMoney(v, cur, rate, { sign });

  const snapshots = await prisma.snapshot.findMany({
    where: { userId: user.id, league: user.league },
    orderBy: { capturedAt: "desc" },
    take: 60,
    select: { id: true, capturedAt: true, totalMicro: true, unpricedCount: true, itemCount: true },
  });

  if (snapshots.length === 0) {
    return (
      <Panel title="No snapshots yet">
        <p className="text-sm text-[#7d8798]">
          Import your stash to take the first one.{" "}
          <Link href="/setup" className="text-[#c8aa6e] underline">
            Go to Import
          </Link>
          .
        </p>
      </Panel>
    );
  }

  const latest = snapshots[0];
  const diff = await latestDiff(user.id, user.league);
  const { priced, icons } = await getHoldings(latest.id);

  const series = [...snapshots]
    .reverse()
    .map((s) => ({ t: s.capturedAt.getTime(), value: Number(s.totalMicro) / 1_000_000 }));

  return (
    <div className="space-y-6">
      {/* One thing is big. Profit is what this app exists to answer, so it gets
          the display size and everything else steps down around it. */}
      <Panel variant="hero">
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            {diff ? (
              <Stat
                label="Profit since last snapshot"
                size="hero"
                value={fmt(diff.quantityMicro, true)}
                tone={diff.quantityMicro >= 0n ? "gain" : "loss"}
                hint="What you actually gained or lost, valued at frozen prices."
              />
            ) : (
              <Stat
                label="Profit"
                size="hero"
                value="Not yet"
                hint="Take a second snapshot and this becomes the headline."
              />
            )}

            {diff && (
              <dl className="mt-6 space-y-2 border-t border-[#262c3a] pt-4 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-[#7dd3fc]">{fmt(diff.priceMicro, true)}</dt>
                  <dd className="text-[#7d8798]">
                    market drift, because prices moved rather than you earning it
                  </dd>
                </div>
                {diff.coverageMicro !== 0n && (
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <dt className="text-[#fbbf24]">{fmt(diff.coverageMicro, true)}</dt>
                    <dd className="text-[#7d8798]">
                      pricing coverage, because what we could price changed rather than what you own
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          <div className="flex flex-col justify-center gap-7 lg:border-l lg:border-[#262c3a] lg:pl-10">
            <Stat
              label="Net worth"
              size="md"
              value={
                <ChaosAndDivine micro={latest.totalMicro} divineRateMicro={rate} icons={icons} />
              }
              hint={`Across ${latest.itemCount.toLocaleString()} items`}
            />
            <Stat
              label="Unpriced"
              size="sm"
              value={latest.unpricedCount.toLocaleString()}
              tone={latest.unpricedCount > 0 ? "warn" : "neutral"}
              hint="Rares and unmatched. Net worth is a lower bound."
            />
          </div>
        </div>
      </Panel>

      {diff && !diff.reconciles && (
        <Alert kind="warn">
          <strong>This interval didn&apos;t balance.</strong> The three terms don&apos;t sum to the
          net worth change, so the profit figure above cannot be trusted. This is a bug, so please
          report it rather than working around it.
        </Alert>
      )}

      {series.length > 1 && (
        <Panel title="Net worth over time" subtitle={`${series.length} snapshots`}>
          <NetWorthChart
            data={series}
            currency={cur}
            divineRate={Number(rate) / 1_000_000}
          />
        </Panel>
      )}

      <Panel
        title="Breakdown"
        subtitle={`${priced.length.toLocaleString()} priced holdings in the latest snapshot, most valuable first`}
        actions={
          <Link href="/items" className="text-sm text-[#c8aa6e] hover:underline">
            All items
          </Link>
        }
      >
        <HoldingsTable
          holdings={priced}
          icons={icons}
          divineRateMicro={rate}
          limit={20}
        />
      </Panel>

      <Panel
        title="Biggest movers"
        subtitle="Since the previous snapshot"
        actions={
          <Link href="/snapshots" className="text-sm text-[#c8aa6e] hover:underline">
            All snapshots
          </Link>
        }
      >
        {!diff || diff.lines.length === 0 ? (
          <Empty>Nothing changed between the last two snapshots.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Profit</Th>
                  <Th align="right">Drift</Th>
                </tr>
              </thead>
              <tbody>
                {diff.lines.slice(0, 12).map((l) => (
                  <Tr key={l.itemKey}>
                    <Td>
                      <span className="text-[#e4e8f0]">{l.displayName}</span>
                      {l.kind === "removed" && (
                        // Never "sold": a stash diff cannot tell sold from
                        // vendored from consumed from used in a map.
                        <span className="ml-2 t-caption text-[#7d8798]">left your stash</span>
                      )}
                      {l.kind === "unpriced" && (
                        <span className="ml-2 t-caption text-[#7d8798]">no price</span>
                      )}
                    </Td>
                    <Td align="right" className="text-[#7d8798]">
                      {l.qtyDelta > 0 ? `+${l.qtyDelta}` : l.qtyDelta}
                    </Td>
                    <Td
                      align="right"
                      className={
                        l.quantityMicro > 0n
                          ? "text-[#4ade80]"
                          : l.quantityMicro < 0n
                            ? "text-[#f87171]"
                            : "text-[#7d8798]"
                      }
                    >
                      {l.quantityMicro === 0n ? "-" : fmt(l.quantityMicro, true)}
                    </Td>
                    <Td align="right" className="text-[#7dd3fc]">
                      {l.priceMicro === 0n ? "-" : fmt(l.priceMicro, true)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Alert>
        A stash diff can&apos;t tell selling from vendoring, consuming or trading away, so a sale
        nets to roughly zero (you lose the item, you gain the currency) and that is correct. Use{" "}
        <strong>Sell</strong> on the Items screen to record what you actually got.
      </Alert>
    </div>
  );
}
