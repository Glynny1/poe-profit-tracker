import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLatestDivineRate } from "@/lib/services/priceBook";
import { formatMoney } from "@/domain/money";
import { Alert, Empty, Panel, Stat } from "@/components/ui";
import { SellButton } from "@/components/SellButton";
import { deleteSale } from "@/app/actions";

export default async function ItemsPage() {
  const user = await requireUser();
  const rate = await getLatestDivineRate(user.league);
  const fmt = (v: bigint, sign = false) => formatMoney(v, user.displayCurrency, rate, { sign });

  const latest = await prisma.snapshot.findFirst({
    where: { userId: user.id, league: user.league },
    orderBy: { capturedAt: "desc" },
    include: { lines: true },
  });

  const sales = await prisma.sale.findMany({
    where: { userId: user.id },
    orderBy: { soldAt: "desc" },
    take: 30,
  });

  const priced = (latest?.lines ?? [])
    .filter((l) => l.unitMicro != null)
    .sort((a, b) => {
      const av = BigInt(a.qty) * a.unitMicro!;
      const bv = BigInt(b.qty) * b.unitMicro!;
      return bv > av ? 1 : bv < av ? -1 : 0;
    });
  const unpriced = (latest?.lines ?? []).filter((l) => l.unitMicro == null);

  const realised = sales.reduce((t, s) => t + BigInt(s.qty) * s.unitPriceMicro, 0n);

  return (
    <div className="space-y-6">
      {!latest ? (
        <Panel title="No holdings yet">
          <Empty>Take a snapshot to see your items.</Empty>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Panel>
              <Stat label="Priced holdings" value={fmt(latest.totalMicro)} />
            </Panel>
            <Panel>
              <Stat
                label="Unpriced lines"
                value={unpriced.length.toLocaleString()}
                tone={unpriced.length ? "warn" : "neutral"}
                hint="Rares and unmatched items"
              />
            </Panel>
            <Panel>
              <Stat label="Realised from sales" value={fmt(realised)} tone="gain" />
            </Panel>
          </div>

          <Panel
            title="Holdings"
            subtitle="Current price shown live. Recording a sale freezes the price at that moment."
          >
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[#8b97ad]">
                <tr className="border-b border-[#2a3346]">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Unit</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                  <th className="pb-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {priced.slice(0, 100).map((l) => (
                  <tr key={l.itemKey} className="border-b border-[#2a3346]/50 last:border-0">
                    <td className="py-2 text-[#e6ebf5]">{l.displayName}</td>
                    <td className="py-2 text-right text-[#8b97ad]">{l.qty.toLocaleString()}</td>
                    <td className="py-2 text-right text-[#8b97ad]">{fmt(l.unitMicro!)}</td>
                    <td className="py-2 text-right">{fmt(BigInt(l.qty) * l.unitMicro!)}</td>
                    <td className="py-2 text-right">
                      {l.priceKey && (
                        <SellButton
                          priceKey={l.priceKey}
                          displayName={l.displayName}
                          maxQty={l.qty}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {unpriced.length > 0 && (
            <Panel
              title="Unpriced"
              subtitle="poe.ninja doesn't price rare items by design, so these count as zero. Your net worth is a lower bound."
            >
              <ul className="grid gap-1 text-sm text-[#8b97ad] sm:grid-cols-2">
                {unpriced.slice(0, 40).map((l) => (
                  <li key={l.itemKey}>
                    {l.displayName}
                    {l.qty > 1 && <span className="text-[#8b97ad]/60"> ×{l.qty}</span>}
                  </li>
                ))}
              </ul>
              {unpriced.length > 40 && (
                <p className="mt-3 text-xs text-[#8b97ad]">
                  and {unpriced.length - 40} more…
                </p>
              )}
            </Panel>
          )}
        </>
      )}

      <Panel
        title="Recorded sales"
        subtitle="The only ground truth the stash API can't give you."
      >
        {sales.length === 0 ? (
          <Empty>
            No sales recorded. A stash diff can&apos;t tell selling from vendoring or consuming —
            recording a sale is what makes realised profit real.
          </Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[#8b97ad]">
              <tr className="border-b border-[#2a3346]">
                <th className="pb-2 font-medium">Sold</th>
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Unit (frozen)</th>
                <th className="pb-2 text-right font-medium">Total</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-[#2a3346]/50 last:border-0">
                  <td className="py-2 text-[#8b97ad]">{s.soldAt.toLocaleDateString("en-GB")}</td>
                  <td className="py-2 text-[#e6ebf5]">
                    {s.displayName}
                    {s.isManualOverride && (
                      <span className="ml-2 text-xs text-[#c8aa6e]">manual price</span>
                    )}
                  </td>
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

      <Alert>
        Prices freeze the moment you record a sale, so looking back shows what you actually got —
        not what the item would be worth today.
      </Alert>
    </div>
  );
}
