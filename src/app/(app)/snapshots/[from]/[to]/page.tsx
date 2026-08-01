import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeDiff } from "@/lib/services/snapshots";
import { getLatestDivineRate } from "@/lib/services/priceBook";
import { formatMoney } from "@/domain/money";
import { Alert, Empty, Panel, Stat } from "@/components/ui";

const KIND_LABEL: Record<string, string> = {
  added: "new",
  removed: "left your stash",
  increased: "more",
  decreased: "fewer",
  repriced: "price moved",
  became_priceable: "now priceable",
  became_unpriceable: "lost its price",
  out_of_scope: "tab not tracked in both",
  unpriced: "no price",
};

export default async function ComparePage({
  params,
}: {
  params: Promise<{ from: string; to: string }>;
}) {
  const { from, to } = await params;
  const user = await requireUser();
  const rate = await getLatestDivineRate(user.league);
  const fmt = (v: bigint, sign = true) => formatMoney(v, user.displayCurrency, rate, { sign });

  const [a, b] = await Promise.all([
    prisma.snapshot.findFirst({ where: { id: from, userId: user.id } }),
    prisma.snapshot.findFirst({ where: { id: to, userId: user.id } }),
  ]);
  if (!a || !b) notFound();

  const diff = await computeDiff(user.id, from, to);
  const net = diff.quantityMicro + diff.priceMicro + diff.coverageMicro;

  return (
    <div className="space-y-6">
      <Panel
        title="Snapshot comparison"
        subtitle={`${a.capturedAt.toLocaleString("en-GB")} → ${b.capturedAt.toLocaleString("en-GB")}`}
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Profit"
            value={fmt(diff.quantityMicro)}
            tone={diff.quantityMicro >= 0n ? "gain" : "loss"}
            hint="What you actually gained"
          />
          <Stat
            label="Market drift"
            value={fmt(diff.priceMicro)}
            tone="drift"
            hint="Prices moved under what you held"
          />
          <Stat
            label="Coverage"
            value={fmt(diff.coverageMicro)}
            tone={diff.coverageMicro === 0n ? "neutral" : "warn"}
            hint="What we could price changed"
          />
          <Stat
            label="Net worth change"
            value={fmt(net)}
            hint={diff.reconciles ? "✓ the three terms reconcile exactly" : "does not reconcile"}
          />
        </div>
      </Panel>

      {!diff.reconciles && (
        <Alert kind="warn">
          The three terms don&apos;t sum to the net worth change for this interval, so these figures
          can&apos;t be trusted. That&apos;s a bug in the diff engine, not a data quirk.
        </Alert>
      )}

      <Panel title="Every change" subtitle={`${diff.lines.length} lines`}>
        {diff.lines.length === 0 ? (
          <Empty>Nothing changed between these two snapshots.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[#8b97ad]">
              <tr className="border-b border-[#2a3346]">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium">What happened</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Profit</th>
                <th className="pb-2 text-right font-medium">Drift</th>
                <th className="pb-2 text-right font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {diff.lines.map((l) => (
                <tr key={l.itemKey} className="border-b border-[#2a3346]/50 last:border-0">
                  <td className="py-2 text-[#e6ebf5]">{l.displayName}</td>
                  <td className="py-2 text-xs text-[#8b97ad]">{KIND_LABEL[l.kind] ?? l.kind}</td>
                  <td className="py-2 text-right text-[#8b97ad]">
                    {l.qtyDelta > 0 ? `+${l.qtyDelta}` : l.qtyDelta || "—"}
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
                    {l.quantityMicro === 0n ? "—" : fmt(l.quantityMicro)}
                  </td>
                  <td className="py-2 text-right text-[#7dd3fc]">
                    {l.priceMicro === 0n ? "—" : fmt(l.priceMicro)}
                  </td>
                  <td className="py-2 text-right text-[#fbbf24]">
                    {l.coverageMicro === 0n ? "—" : fmt(l.coverageMicro)}
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
