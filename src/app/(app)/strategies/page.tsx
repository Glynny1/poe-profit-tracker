import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLatestDivineRate } from "@/lib/services/priceBook";
import { formatMoney } from "@/domain/money";
import { Empty, Panel, Stat, Td, Th, Tr } from "@/components/ui";
import { NewStrategyForm } from "@/components/NewStrategyForm";
import { ImportCodeForm } from "@/components/ImportCodeForm";

export default async function StrategiesPage() {
  const user = await requireUser();
  const rate = await getLatestDivineRate(user.league);
  const fmt = (v: bigint, sign = false) => formatMoney(v, user.displayCurrency, rate, { sign });

  const strategies = await prisma.strategy.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    include: { inputs: true, sales: true },
  });

  // The run figures were already computed and stored when each run was
  // finished, so this is an indexed lookup rather than recomputing every diff
  // just to render a list.
  const finishedPairs = strategies
    .filter((s) => s.baselineSnapshotId && s.endSnapshotId)
    .map((s) => ({ fromSnapshotId: s.baselineSnapshotId!, toSnapshotId: s.endSnapshotId! }));

  const diffs = finishedPairs.length
    ? await prisma.snapshotDiff.findMany({
        where: { userId: user.id, OR: finishedPairs },
        select: { fromSnapshotId: true, toSnapshotId: true, quantityMicro: true },
      })
    : [];
  const netByPair = new Map(
    diffs.map((d) => [`${d.fromSnapshotId}:${d.toSnapshotId}`, d.quantityMicro]),
  );

  const rows: Row[] = strategies.map((s) => ({
    s,
    cost: s.inputs.reduce((t, i) => t + BigInt(i.qty) * i.unitCostMicro, 0n),
    runNet:
      s.baselineSnapshotId && s.endSnapshotId
        ? (netByPair.get(`${s.baselineSnapshotId}:${s.endSnapshotId}`) ?? null)
        : null,
    finished: !!s.endedAt,
  }));

  const active = rows.filter((r) => !r.finished);
  const done = rows.filter((r) => r.finished);

  // The point of keeping an archive is being able to say what all of it earned.
  const totalNet = done.reduce((t, r) => t + (r.runNet ?? 0n), 0n);
  const totalMaps = done.reduce((t, r) => t + r.s.mapsRun, 0);
  const perMap = totalMaps > 0 ? totalNet / BigInt(totalMaps) : null;

  return (
    <div className="space-y-6">
      {done.length > 0 && (
        <Panel variant="hero">
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <Stat
              label="Earned across finished runs"
              size="hero"
              value={fmt(totalNet, true)}
              tone={totalNet >= 0n ? "gain" : "loss"}
              hint={
                perMap
                  ? `${fmt(perMap)} per map across ${totalMaps.toLocaleString()} maps`
                  : "Set maps run on a strategy to get a per-map figure"
              }
            />
            <div className="grid gap-6 sm:grid-cols-3 lg:border-l lg:border-[#262c3a] lg:pl-10">
              <Stat label="Finished" size="sm" value={done.length.toLocaleString()} />
              <Stat label="Maps run" size="sm" value={totalMaps.toLocaleString()} />
              <Stat label="In progress" size="sm" value={active.length.toLocaleString()} />
            </div>
          </div>
        </Panel>
      )}

      {active.length > 0 && (
        <Panel title="In progress" subtitle="Finish a run to see what your stash actually gained">
          <StrategyTable rows={active} fmt={fmt} showNet={false} />
        </Panel>
      )}

      <Panel
        title="Archive"
        subtitle={
          done.length > 0
            ? "Finished runs, newest first. Net is what your stash gained, already net of what it used up."
            : undefined
        }
      >
        {done.length === 0 ? (
          <Empty>No finished runs yet. Close a strategy and it lands here.</Empty>
        ) : (
          <StrategyTable rows={done} fmt={fmt} showNet />
        )}
      </Panel>

      <Panel title="Start a strategy" variant="quiet">
        <NewStrategyForm />
      </Panel>

      <Panel
        title="Import a share code"
        variant="quiet"
        subtitle="Recreate someone else's cost sheet: the same items and quantities, priced however you choose."
      >
        <ImportCodeForm />
      </Panel>
    </div>
  );
}

interface Row {
  s: { id: string; name: string; mapsRun: number; startedAt: Date; endedAt: Date | null };
  cost: bigint;
  runNet: bigint | null;
  finished: boolean;
}

function StrategyTable({
  rows,
  fmt,
  showNet,
}: {
  rows: Row[];
  fmt: (v: bigint, sign?: boolean) => string;
  showNet: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <Th>Strategy</Th>
            <Th align="right">Maps</Th>
            <Th align="right">Cost</Th>
            {showNet && <Th align="right">Net from the run</Th>}
            {showNet && <Th align="right">Per map</Th>}
            <Th align="right">{showNet ? "Finished" : "Started"}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, cost, runNet }) => {
            const per = runNet != null && s.mapsRun > 0 ? runNet / BigInt(s.mapsRun) : null;
            return (
              <Tr key={s.id}>
                <Td>
                  <Link
                    href={`/strategies/${s.id}`}
                    className="font-medium text-[#e4e8f0] transition-colors duration-150 ease-out hover:text-[#c8aa6e]"
                  >
                    {s.name}
                  </Link>
                </Td>
                <Td align="right" className="text-[#7d8798]">
                  {s.mapsRun || "-"}
                </Td>
                <Td align="right" className="text-[#7d8798]">
                  {fmt(cost)}
                </Td>
                {showNet && (
                  <Td
                    align="right"
                    className={
                      runNet == null
                        ? "text-[#7d8798]"
                        : runNet >= 0n
                          ? "font-semibold text-[#4ade80]"
                          : "font-semibold text-[#f87171]"
                    }
                  >
                    {runNet == null ? "-" : fmt(runNet, true)}
                  </Td>
                )}
                {showNet && (
                  <Td align="right" className="text-[#7d8798]">
                    {per == null ? "-" : fmt(per)}
                  </Td>
                )}
                <Td align="right" className="text-[#7d8798]">
                  {(s.endedAt ?? s.startedAt).toLocaleDateString("en-GB")}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
