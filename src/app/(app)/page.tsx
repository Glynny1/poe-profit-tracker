import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { latestDiff } from "@/lib/services/snapshots";
import { getLatestDivineRate } from "@/lib/services/priceBook";
import { getHoldings } from "@/lib/services/holdings";
import { formatMoney } from "@/domain/money";
import { Alert, Empty, Panel, Stat } from "@/components/ui";
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
        <p className="text-sm text-[#8b97ad]">
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel>
          <Stat
            label="Net worth"
            value={
              <ChaosAndDivine micro={latest.totalMicro} divineRateMicro={rate} icons={icons} />
            }
            hint={`${latest.itemCount.toLocaleString()} items tracked`}
          />
        </Panel>
        <Panel className="sm:col-span-2">
          {diff ? (
            <>
              <Stat
                label="Profit since last snapshot"
                big
                value={fmt(diff.quantityMicro, true)}
                tone={diff.quantityMicro >= 0n ? "gain" : "loss"}
                hint="Items you actually gained or lost, valued at frozen prices."
              />
              <p className="mt-3 text-sm text-[#7dd3fc]">
                {fmt(diff.priceMicro, true)} market drift
                <span className="text-[#8b97ad]"> (prices moved, you didn&apos;t earn it)</span>
              </p>
              {diff.coverageMicro !== 0n && (
                <p className="mt-1 text-sm text-[#fbbf24]">
                  {fmt(diff.coverageMicro, true)} pricing coverage changed
                  <span className="text-[#8b97ad]">
                    {" "}
                    (what we could price changed, not what you own)
                  </span>
                </p>
              )}
            </>
          ) : (
            <Stat
              label="Profit"
              big
              value="-"
              hint="Take a second snapshot to see a change."
            />
          )}
        </Panel>
        <Panel>
          <Stat
            label="Unpriced items"
            value={latest.unpricedCount.toLocaleString()}
            tone={latest.unpricedCount > 0 ? "warn" : "neutral"}
            hint="Rares and unmatched items. Net worth is a lower bound."
          />
        </Panel>
      </div>

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
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[#8b97ad]">
              <tr className="border-b border-[#2a3346]">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Profit</th>
                <th className="pb-2 text-right font-medium">Drift</th>
              </tr>
            </thead>
            <tbody>
              {diff.lines.slice(0, 15).map((l) => (
                <tr key={l.itemKey} className="border-b border-[#2a3346]/50 last:border-0">
                  <td className="py-2">
                    <span className="text-[#e6ebf5]">{l.displayName}</span>
                    {l.kind === "removed" && (
                      // Never "sold": a stash diff cannot tell sold from
                      // vendored from consumed from used in a map.
                      <span className="ml-2 text-xs text-[#8b97ad]">left your stash</span>
                    )}
                    {l.kind === "unpriced" && (
                      <span className="ml-2 text-xs text-[#8b97ad]">no price</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-[#8b97ad]">
                    {l.qtyDelta > 0 ? `+${l.qtyDelta}` : l.qtyDelta}
                  </td>
                  <td
                    className={`py-2 text-right ${
                      l.quantityMicro > 0n
                        ? "text-[#4ade80]"
                        : l.quantityMicro < 0n
                          ? "text-[#f87171]"
                          : "text-[#8b97ad]"
                    }`}
                  >
                    {l.quantityMicro === 0n ? "-" : fmt(l.quantityMicro, true)}
                  </td>
                  <td className="py-2 text-right text-[#7dd3fc]">
                    {l.priceMicro === 0n ? "-" : fmt(l.priceMicro, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
