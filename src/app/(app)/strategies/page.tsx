import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLatestDivineRate } from "@/lib/services/priceBook";
import { formatMoney } from "@/domain/money";
import { Empty, Panel } from "@/components/ui";
import { NewStrategyForm } from "@/components/NewStrategyForm";

export default async function StrategiesPage() {
  const user = await requireUser();
  const rate = await getLatestDivineRate(user.league);
  const fmt = (v: bigint, sign = false) => formatMoney(v, user.displayCurrency, rate, { sign });

  const strategies = await prisma.strategy.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    include: { inputs: true, sales: true },
  });

  return (
    <div className="space-y-6">
      <Panel
        title="Start a strategy"
        subtitle="Records what you spend at the price you paid, so later price moves can't distort the result."
      >
        <NewStrategyForm />
      </Panel>

      <Panel title="Your strategies">
        {strategies.length === 0 ? (
          <Empty>No strategies yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {strategies.map((s) => {
              const cost = s.inputs.reduce((t, i) => t + BigInt(i.qty) * i.unitCostMicro, 0n);
              const realised = s.sales.reduce((t, x) => t + BigInt(x.qty) * x.unitPriceMicro, 0n);
              const net = realised - cost;
              return (
                <li key={s.id}>
                  <Link
                    href={`/strategies/${s.id}`}
                    className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-[#262c3a] px-4 py-3 transition-colors hover:bg-[#1d222d]"
                  >
                    <span className="flex-1 font-medium text-[#e4e8f0]">
                      {s.name}
                      {s.endedAt && <span className="ml-2 text-xs text-[#7d8798]">closed</span>}
                    </span>
                    <span className="text-sm text-[#7d8798]">{s.mapsRun} maps</span>
                    <span className="text-sm text-[#7d8798]">cost {fmt(cost)}</span>
                    <span className="text-sm text-[#4ade80]">realised {fmt(realised)}</span>
                    <span
                      className={`text-sm font-semibold ${net >= 0n ? "text-[#4ade80]" : "text-[#f87171]"}`}
                    >
                      {fmt(net, true)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
