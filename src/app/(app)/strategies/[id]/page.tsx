import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getFreshPriceBookId, getLatestDivineRate } from "@/lib/services/priceBook";
import { getCurrencyIcons, getHoldings } from "@/lib/services/holdings";
import { computeDiff } from "@/lib/services/snapshots";
import type { ParsedTab } from "@/domain/snapshot";
import { formatMoney } from "@/domain/money";
import { Alert, Empty, Panel, Stat } from "@/components/ui";
import { BatchInputForm } from "@/components/BatchInputForm";
import { StrategyControls } from "@/components/StrategyControls";
import { SellForm } from "@/components/SellForm";
import { FinishRunForm } from "@/components/FinishRunForm";
import { RunResult, type RunLine } from "@/components/RunResult";
import { deleteStrategyInput, deleteSale } from "@/app/actions";

/**
 * Compare the baseline and closing snapshots of a finished run.
 *
 * Icons are joined from the closing snapshot's lines, which carry a priceKey,
 * because a diff line only knows its itemKey.
 */
async function buildRunResult(
  userId: string,
  fromId: string | null,
  toId: string | null,
  divineRateMicro: bigint,
) {
  if (!fromId || !toId) return null;

  const diff = await computeDiff(userId, fromId, toId);
  const { priced, unpriced } = await getHoldings(toId);
  const iconByKey = new Map(
    [...priced, ...unpriced].map((h) => [h.itemKey, h.icon] as const),
  );

  const toLine = (l: (typeof diff.lines)[number]): RunLine => ({
    itemKey: l.itemKey,
    displayName: l.displayName,
    icon: iconByKey.get(l.itemKey) ?? null,
    qtyDelta: l.qtyDelta,
    quantityMicro: l.quantityMicro,
  });

  const byValue = (a: RunLine, b: RunLine) => {
    const av = a.quantityMicro < 0n ? -a.quantityMicro : a.quantityMicro;
    const bv = b.quantityMicro < 0n ? -b.quantityMicro : b.quantityMicro;
    return bv > av ? 1 : bv < av ? -1 : 0;
  };

  return {
    gains: diff.lines.filter((l) => l.quantityMicro > 0n).map(toLine).sort(byValue),
    losses: diff.lines.filter((l) => l.quantityMicro < 0n).map(toLine).sort(byValue),
    netMicro: diff.quantityMicro,
    driftMicro: diff.priceMicro,
    coverageMicro: diff.coverageMicro,
    reconciles: diff.reconciles,
    divineRateMicro,
  };
}

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const rate = await getLatestDivineRate(user.league);
  const fmt = (v: bigint, sign = false) => formatMoney(v, user.displayCurrency, rate, { sign });

  const strategy = await prisma.strategy.findFirst({
    where: { id, userId: user.id },
    include: {
      inputs: { orderBy: { addedAt: "desc" } },
      sales: { orderBy: { soldAt: "desc" } },
    },
  });
  if (!strategy) notFound();

  // Current prices, for the frozen-vs-now comparison (S4).
  const priceBookId = await getFreshPriceBookId(strategy.league);
  const keys = [...new Set(strategy.inputs.map((i) => i.priceKey))];
  const current = new Map(
    (
      await prisma.price.findMany({
        where: { priceBookId, priceKey: { in: keys } },
        select: { priceKey: true, chaosMicro: true },
      })
    ).map((p) => [p.priceKey, p.chaosMicro]),
  );

  // Four figures that are never blended. Cost is frozen at purchase, realised is
  // frozen at sale, unrealised is today's price. They are only summed as
  // micro-chaos and converted to divine once, at render.
  const costMicro = strategy.inputs.reduce((t, i) => t + BigInt(i.qty) * i.unitCostMicro, 0n);
  const realisedMicro = strategy.sales.reduce((t, s) => t + BigInt(s.qty) * s.unitPriceMicro, 0n);
  const unrealisedMicro = strategy.inputs.reduce(
    (t, i) => t + BigInt(i.qty) * (current.get(i.priceKey) ?? i.unitCostMicro),
    0n,
  );
  const netMicro = realisedMicro - costMicro;

  const perMap = strategy.mapsRun > 0 ? netMicro / BigInt(strategy.mapsRun) : null;
  const roi = costMicro > 0n ? Number(realisedMicro) / Number(costMicro) : null;

  // --- finish run -----------------------------------------------------------

  const baseline = strategy.baselineSnapshotId
    ? await prisma.snapshot.findUnique({
        where: { id: strategy.baselineSnapshotId },
        select: { tabIds: true },
      })
    : null;
  const baselineTabIds = baseline?.tabIds ?? [];

  const stagedRow = await prisma.stagedImport.findUnique({ where: { userId: user.id } });
  const stagedTabs = ((stagedRow?.tabs as unknown as ParsedTab[]) ?? []).map((t) => ({
    tabId: t.tabId,
    name: t.name,
    items: t.items?.length ?? 0,
  }));

  const stashUrl = user.poeAccount
    ? `https://www.pathofexile.com/character-window/get-stash-items` +
      `?accountName=${encodeURIComponent(user.poeAccount)}` +
      `&realm=pc&league=${encodeURIComponent(user.league)}&tabs=1&tabIndex=0`
    : null;

  // Icons come from the closing snapshot, since that is what the run's figures
  // were valued against.
  const { icons } = strategy.endSnapshotId
    ? await getHoldings(strategy.endSnapshotId)
    : { icons: await getCurrencyIcons(user.league) };

  const runResult = await buildRunResult(user.id, strategy.baselineSnapshotId, strategy.endSnapshotId, rate);

  return (
    <div className="space-y-6">
      <Panel
        title={strategy.name}
        subtitle={
          strategy.notes ??
          `Started ${strategy.startedAt.toLocaleString("en-GB")}${strategy.endedAt ? ` | closed ${strategy.endedAt.toLocaleString("en-GB")}` : ""}`
        }
        actions={
          <StrategyControls
            strategyId={strategy.id}
            mapsRun={strategy.mapsRun}
            closed={!!strategy.endedAt}
            shared={strategy.shared}
          />
        }
      >
        {/* Net is the question this page exists to answer, so it is the only
            big number and the three inputs to it step down beside it. */}
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Stat
            label="Net"
            size="hero"
            value={fmt(netMicro, true)}
            tone={netMicro >= 0n ? "gain" : "loss"}
            hint={
              [
                roi != null ? `${roi.toFixed(2)}x ROI` : null,
                perMap != null ? `${fmt(perMap)} per map` : null,
              ]
                .filter(Boolean)
                .join(" | ") || "Realised minus cost"
            }
          />
          <div className="grid gap-6 sm:grid-cols-3 lg:border-l lg:border-[#262c3a] lg:pl-10">
            <Stat label="Cost" size="sm" value={fmt(costMicro)} hint="Frozen at what you paid" />
            <Stat
              label="Realised"
              size="sm"
              value={fmt(realisedMicro)}
              tone="gain"
              hint="Frozen at each sale"
            />
            <Stat
              label="Still held"
              size="sm"
              value={fmt(unrealisedMicro)}
              tone="drift"
              hint="At today's price"
            />
          </div>
        </div>
      </Panel>

      <Alert>
        <strong>Cost</strong> and <strong>Realised</strong> are frozen at the moment you recorded
        them; <strong>Still held</strong> uses today&apos;s price. They&apos;re shown separately
        because adding them would mix three different points in time into one meaningless number.
      </Alert>

      <Panel
        title="Add what you bought"
        subtitle="Build the list first, then price the whole basket in one go so every row is frozen at the same moment."
      >
        <BatchInputForm strategyId={strategy.id} />
      </Panel>

      <Panel title="Cost sheet" subtitle={`${strategy.inputs.length} inputs`}>
        {strategy.inputs.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            {/* Deliberately no live price or percentage move. A cost sheet answers
                what this run cost, and a column that drifts every refresh invites
                reading it as profit when it is nothing of the sort. Current value
                of what you still hold is in the P&L card above, where it belongs. */}
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[#7d8798]">
                <tr className="border-b border-[#262c3a]">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Paid each</th>
                  <th className="pb-2 text-right font-medium">Total cost</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {strategy.inputs.map((i) => (
                  <tr key={i.id} className="border-b border-[#262c3a]/50 last:border-0">
                    <td className="py-2">
                      <span className="flex items-center gap-2.5">
                        {i.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={i.icon}
                            alt=""
                            className="size-6 shrink-0 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="size-6 shrink-0 rounded bg-[#1d222d]" />
                        )}
                        <span className="text-[#e4e8f0]">{i.displayName}</span>
                        {i.isManualOverride && (
                          <span className="text-xs text-[#c8aa6e]">your price</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-right text-[#7d8798]">{i.qty}</td>
                    <td className="py-2 text-right">{fmt(i.unitCostMicro)}</td>
                    <td className="py-2 text-right">{fmt(BigInt(i.qty) * i.unitCostMicro)}</td>
                    <td className="py-2 text-right">
                      <form action={deleteStrategyInput.bind(null, i.id)}>
                        <button className="text-xs text-[#7d8798] hover:text-[#f87171]">
                          remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title={strategy.endedAt ? "Run result" : "Finish run"}
        subtitle={
          strategy.endedAt
            ? `Stash compared between ${strategy.startedAt.toLocaleString("en-GB")} and ${strategy.endedAt.toLocaleString("en-GB")}`
            : "Refresh your stash and compare it to when you started."
        }
      >
        <FinishRunForm
          strategyId={strategy.id}
          finished={!!strategy.endSnapshotId}
          stashUrl={stashUrl}
          stagedTabs={stagedTabs}
          baselineTabIds={baselineTabIds}
        />
      </Panel>

      {runResult && (
        <Panel title="What the run produced" subtitle="Valued at the prices when you finished">
          <RunResult {...runResult} icons={icons} mapsRun={strategy.mapsRun} />
        </Panel>
      )}

      <Panel title="Returns" subtitle="Record what you actually sold, at the price you got.">
        <div className="mb-6 border-b border-[#262c3a] pb-6">
          <SellForm strategyId={strategy.id} />
        </div>
        {strategy.sales.length === 0 ? (
          <Empty>No sales recorded against this strategy yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[#7d8798]">
              <tr className="border-b border-[#262c3a]">
                <th className="pb-2 font-medium">Sold</th>
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Each (frozen)</th>
                <th className="pb-2 text-right font-medium">Total</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {strategy.sales.map((s) => (
                <tr key={s.id} className="border-b border-[#262c3a]/50 last:border-0">
                  <td className="py-2 text-[#7d8798]">{s.soldAt.toLocaleDateString("en-GB")}</td>
                  <td className="py-2 text-[#e4e8f0]">{s.displayName}</td>
                  <td className="py-2 text-right text-[#7d8798]">{s.qty}</td>
                  <td className="py-2 text-right text-[#7d8798]">{fmt(s.unitPriceMicro)}</td>
                  <td className="py-2 text-right text-[#4ade80]">
                    {fmt(BigInt(s.qty) * s.unitPriceMicro)}
                  </td>
                  <td className="py-2 text-right">
                    <form action={deleteSale.bind(null, s.id)}>
                      <button className="text-xs text-[#7d8798] hover:text-[#f87171]">remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
