import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { microToChaos } from "@/domain/money";
import { refreshPrices } from "@/app/actions";
import { Alert, Button, Empty, Panel, Stat } from "@/components/ui";
import { RelativeAge } from "@/components/RelativeAge";

interface Report {
  type: string;
  ok: boolean;
  rows: number;
  status?: number;
}

/**
 * The debugging screen. When poe.ninja changes shape, which it did in June 2026,
 * breaking every tool built on the old endpoints, this is where you find out,
 * rather than from a net worth that quietly halved.
 */
export default async function PricesPage() {
  const user = await requireUser();

  const book = await prisma.priceBook.findFirst({
    where: { league: user.league },
    orderBy: { fetchedAt: "desc" },
    include: { _count: { select: { prices: true } } },
  });

  const meta = book?.meta as { reports?: Report[] } | null;
  const reports = meta?.reports ?? [];
  const failed = reports.filter((r) => !r.ok);
  const empty = reports.filter((r) => r.ok && r.rows === 0);


  return (
    <div className="space-y-6">
      <Panel
        title="Price book"
        subtitle={book ? `Fetched ${book.fetchedAt.toLocaleString("en-GB")}` : undefined}
        actions={
          <form action={refreshPrices}>
            <Button type="submit">Refresh now</Button>
          </form>
        }
      >
        {!book ? (
          <Empty>No price book yet. Take a snapshot and one will be fetched.</Empty>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Priced items" value={book._count.prices.toLocaleString()} />
            <Stat
              label="Chaos per divine"
              value={microToChaos(book.divineRateMicro).toFixed(1)}
              hint="From the exchange rate, used everywhere"
            />
            <Stat
              label="Age"
              value={<RelativeAge date={book.fetchedAt.toISOString()} />}
              hint="poe.ninja refreshes about every 15 min"
            />
            <Stat
              label="Categories failed"
              value={failed.length.toString()}
              tone={failed.length ? "loss" : "neutral"}
            />
          </div>
        )}
      </Panel>

      {failed.length > 0 && (
        <Alert kind="error">
          <strong>{failed.length} categories failed to fetch:</strong>{" "}
          {failed.map((f) => `${f.type} (HTTP ${f.status ?? "?"})`).join(", ")}. Items in those
          categories are currently unpriced, so your net worth is understated.
        </Alert>
      )}

      {empty.length > 0 && (
        <Alert kind="info">
          {empty.map((e) => e.type).join(", ")} returned no rows. That is normal. The category
          exists but has nothing traded in this league.
        </Alert>
      )}

      <Panel title="Coverage by category" subtitle="Where your prices come from">
        {reports.length === 0 ? (
          <Empty>No fetch report recorded.</Empty>
        ) : (
          <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {reports
              .slice()
              .sort((a, b) => b.rows - a.rows)
              .map((r) => (
                <div
                  key={r.type}
                  className="flex items-center justify-between border-b border-[#262c3a]/50 py-1.5"
                >
                  <span className={r.ok ? "text-[#e4e8f0]" : "text-[#f87171]"}>{r.type}</span>
                  <span className="text-[#7d8798]">
                    {r.ok ? r.rows.toLocaleString() : `HTTP ${r.status ?? "?"}`}
                  </span>
                </div>
              ))}
          </div>
        )}
      </Panel>

      <Alert>
        <strong>What can&apos;t be priced.</strong> poe.ninja doesn&apos;t price rare items at all,
        by design, so they&apos;re excluded and counted separately and net worth is a lower bound.
        Unique variants (different Watcher&apos;s Eye or Precursor&apos;s Emblem rolls) aren&apos;t
        derivable from stash JSON either, so those collapse to the most-traded variant. Gems price
        only at whole tiers, so an off-tier gem snaps down to the nearest priced one.
      </Alert>
    </div>
  );
}
