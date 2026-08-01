import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLatestDivineRate } from "@/lib/services/priceBook";
import { formatMoney } from "@/domain/money";
import { Empty, Panel } from "@/components/ui";

export default async function SnapshotsPage() {
  const user = await requireUser();
  const rate = await getLatestDivineRate(user.league);

  const snapshots = await prisma.snapshot.findMany({
    where: { userId: user.id, league: user.league },
    orderBy: { capturedAt: "desc" },
    take: 100,
  });

  return (
    <Panel title="Snapshots" subtitle={`${snapshots.length} in ${user.league}`}>
      {snapshots.length === 0 ? (
        <Empty>No snapshots yet.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-[#8b97ad]">
            <tr className="border-b border-[#2a3346]">
              <th className="pb-2 font-medium">Taken</th>
              <th className="pb-2 text-right font-medium">Net worth</th>
              <th className="pb-2 text-right font-medium">Items</th>
              <th className="pb-2 text-right font-medium">Unpriced</th>
              <th className="pb-2 text-right font-medium">Tabs</th>
              <th className="pb-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s, i) => {
              const prev = snapshots[i + 1];
              const delta = prev ? s.totalMicro - prev.totalMicro : null;
              return (
                <tr key={s.id} className="border-b border-[#2a3346]/50 last:border-0">
                  <td className="py-2">
                    {prev ? (
                      <Link
                        href={`/snapshots/${prev.id}/${s.id}`}
                        className="text-[#e6ebf5] hover:text-[#c8aa6e] hover:underline"
                      >
                        {s.capturedAt.toLocaleString("en-GB")}
                      </Link>
                    ) : (
                      <span className="text-[#e6ebf5]">{s.capturedAt.toLocaleString("en-GB")}</span>
                    )}
                    {s.pinned && <span className="ml-2 text-xs text-[#c8aa6e]">pinned</span>}
                  </td>
                  <td className="py-2 text-right">{formatMoney(s.totalMicro, user.displayCurrency, rate)}</td>
                  <td className="py-2 text-right text-[#8b97ad]">{s.itemCount.toLocaleString()}</td>
                  <td className="py-2 text-right text-[#8b97ad]">{s.unpricedCount}</td>
                  <td className="py-2 text-right text-[#8b97ad]">{s.tabIds.length}</td>
                  <td
                    className={`py-2 text-right ${
                      delta == null
                        ? "text-[#8b97ad]"
                        : delta > 0n
                          ? "text-[#4ade80]"
                          : delta < 0n
                            ? "text-[#f87171]"
                            : "text-[#8b97ad]"
                    }`}
                  >
                    {delta == null
                      ? "—"
                      : formatMoney(delta, user.displayCurrency, rate, { sign: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
