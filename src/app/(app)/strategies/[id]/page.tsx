import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getFreshPriceBookId, getLatestDivineRate } from "@/lib/services/priceBook";
import { formatMoney, microToChaos } from "@/domain/money";
import { Alert, Empty, Panel, Stat } from "@/components/ui";
import { AddInputForm } from "@/components/AddInputForm";
import { StrategyControls } from "@/components/StrategyControls";
import { SellForm } from "@/components/SellForm";
import { deleteStrategyInput, deleteSale } from "@/app/actions";

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

  return (
    <div className="space-y-6">
      <Panel
        title={strategy.name}
        subtitle={
          strategy.notes ??
          `Started ${strategy.startedAt.toLocaleString("en-GB")}${strategy.endedAt ? ` · closed ${strategy.endedAt.toLocaleString("en-GB")}` : ""}`
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Cost" value={fmt(costMicro)} hint="Frozen at what you paid" />
          <Stat
            label="Realised"
            value={fmt(realisedMicro)}
            tone="gain"
            hint="Frozen at each sale"
          />
          <Stat
            label="Still held"
            value={fmt(unrealisedMicro)}
            tone="drift"
            hint="Valued at today's price"
          />
          <Stat
            label="Net"
            value={fmt(netMicro, true)}
            tone={netMicro >= 0n ? "gain" : "loss"}
            hint={
              [
                roi != null ? `${roi.toFixed(2)}× ROI` : null,
                perMap != null ? `${fmt(perMap)} / map` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "realised − cost"
            }
          />
        </div>
      </Panel>

      <Alert>
        <strong>Cost</strong> and <strong>Realised</strong> are frozen at the moment you recorded
        them; <strong>Still held</strong> uses today&apos;s price. They&apos;re shown separately
        because adding them would mix three different points in time into one meaningless number.
      </Alert>

      <Panel
        title="Add what you bought"
        subtitle="The price is copied onto the row now and never recalculated."
      >
        <AddInputForm strategyId={strategy.id} league={strategy.league} />
      </Panel>

      <Panel title="Cost sheet" subtitle={`${strategy.inputs.length} inputs`}>
        {strategy.inputs.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[#8b97ad]">
              <tr className="border-b border-[#2a3346]">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Paid each</th>
                <th className="pb-2 text-right font-medium">Now</th>
                <th className="pb-2 text-right font-medium">Move</th>
                <th className="pb-2 text-right font-medium">Total cost</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {strategy.inputs.map((i) => {
                const now = current.get(i.priceKey) ?? null;
                const movePct =
                  now != null && i.unitCostMicro > 0n
                    ? (microToChaos(now) / microToChaos(i.unitCostMicro) - 1) * 100
                    : null;
                return (
                  <tr key={i.id} className="border-b border-[#2a3346]/50 last:border-0">
                    <td className="py-2 text-[#e6ebf5]">
                      {i.displayName}
                      {i.isManualOverride && (
                        <span className="ml-2 text-xs text-[#c8aa6e]">your price</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-[#8b97ad]">{i.qty}</td>
                    <td className="py-2 text-right">{fmt(i.unitCostMicro)}</td>
                    <td className="py-2 text-right text-[#8b97ad]">
                      {now == null ? "—" : fmt(now)}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        movePct == null
                          ? "text-[#8b97ad]"
                          : movePct > 0
                            ? "text-[#4ade80]"
                            : movePct < 0
                              ? "text-[#f87171]"
                              : "text-[#8b97ad]"
                      }`}
                    >
                      {movePct == null
                        ? "—"
                        : `${movePct > 0 ? "+" : ""}${movePct.toFixed(1)}%`}
                    </td>
                    <td className="py-2 text-right">{fmt(BigInt(i.qty) * i.unitCostMicro)}</td>
                    <td className="py-2 text-right">
                      <form action={deleteStrategyInput.bind(null, i.id)}>
                        <button className="text-xs text-[#8b97ad] hover:text-[#f87171]">
                          remove
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Returns" subtitle="Record what you actually sold, at the price you got.">
        <div className="mb-6 border-b border-[#2a3346] pb-6">
          <SellForm strategyId={strategy.id} />
        </div>
        {strategy.sales.length === 0 ? (
          <Empty>No sales recorded against this strategy yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[#8b97ad]">
              <tr className="border-b border-[#2a3346]">
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
                <tr key={s.id} className="border-b border-[#2a3346]/50 last:border-0">
                  <td className="py-2 text-[#8b97ad]">{s.soldAt.toLocaleDateString("en-GB")}</td>
                  <td className="py-2 text-[#e6ebf5]">{s.displayName}</td>
                  <td className="py-2 text-right text-[#8b97ad]">{s.qty}</td>
                  <td className="py-2 text-right text-[#8b97ad]">{fmt(s.unitPriceMicro)}</td>
                  <td className="py-2 text-right text-[#4ade80]">
                    {fmt(BigInt(s.qty) * s.unitPriceMicro)}
                  </td>
                  <td className="py-2 text-right">
                    <form action={deleteSale.bind(null, s.id)}>
                      <button className="text-xs text-[#8b97ad] hover:text-[#f87171]">remove</button>
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
