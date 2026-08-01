import { prisma } from "@/lib/prisma";
import { buildSnapshot, scopeHash, type ParsedTab } from "@/domain/snapshot";
import { diffSnapshots, type SnapshotInput } from "@/domain/diff";
import { getFreshPriceBookId, loadPriceIndex } from "./priceBook";
import type { SnapshotLine } from "@/domain/types";
import type { SnapshotSource } from "@prisma/client";

export interface CreateSnapshotArgs {
  userId: string;
  league: string;
  tabs: ParsedTab[];
  source?: SnapshotSource;
  minCount: number;
  liquidityHaircutPct: number;
  pinned?: boolean;
}

/**
 * A snapshot is written all-or-nothing. A half-read stash looks exactly like a
 * mass sale, so a partial capture must never reach the database. The transaction
 * here is what makes that guarantee real rather than aspirational.
 */
export async function createSnapshot(args: CreateSnapshotArgs) {
  if (args.tabs.length === 0) throw new Error("Refusing to snapshot zero tabs.");

  const priceBookId = await getFreshPriceBookId(args.league);
  const index = await loadPriceIndex(priceBookId, args.minCount);

  const built = buildSnapshot(args.tabs, index, {
    minCount: args.minCount,
    liquidityHaircutPct: args.liquidityHaircutPct,
  });

  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.snapshot.create({
      data: {
        userId: args.userId,
        league: args.league,
        // Server-stamped. A client clock is never trusted for ordering, because
        // one skewed clock would corrupt every strategy window it lands inside.
        capturedAt: new Date(),
        scopeHash: scopeHash(built.tabIds),
        tabIds: built.tabIds,
        priceBookId,
        totalMicro: built.totalMicro,
        itemCount: built.itemCount,
        unpricedCount: built.unpricedCount,
        pinned: args.pinned ?? false,
        source: args.source ?? "IMPORT",
      },
    });

    for (let i = 0; i < built.lines.length; i += 2000) {
      await tx.snapshotLine.createMany({
        data: built.lines.slice(i, i + 2000).map((l) => ({
          snapshotId: snapshot.id,
          itemKey: l.itemKey,
          priceKey: l.priceKey,
          displayName: l.displayName,
          qty: l.qty,
          unitMicro: l.unitMicro,
          isFungible: l.isFungible,
          tabIds: l.tabIds,
        })),
      });
    }

    return { snapshot, built };
  });
}

export async function loadSnapshotInput(snapshotId: string): Promise<SnapshotInput | null> {
  const snap = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
    include: { lines: true },
  });
  if (!snap) return null;
  return {
    tabIds: snap.tabIds,
    lines: snap.lines.map(
      (l): SnapshotLine => ({
        itemKey: l.itemKey,
        priceKey: l.priceKey,
        displayName: l.displayName,
        qty: l.qty,
        unitMicro: l.unitMicro,
        isFungible: l.isFungible,
        tabIds: l.tabIds,
      }),
    ),
  };
}

/**
 * Compute and persist the diff between two snapshots. Idempotent: the pair is
 * uniquely constrained, so recomputing returns the stored result.
 */
export async function computeDiff(userId: string, fromId: string, toId: string) {
  const existing = await prisma.snapshotDiff.findUnique({
    where: { fromSnapshotId_toSnapshotId: { fromSnapshotId: fromId, toSnapshotId: toId } },
    include: { lines: { orderBy: { quantityMicro: "desc" } } },
  });
  if (existing) return existing;

  const [a, b] = await Promise.all([loadSnapshotInput(fromId), loadSnapshotInput(toId)]);
  if (!a || !b) throw new Error("Snapshot not found");

  const result = diffSnapshots(a, b);

  return prisma.snapshotDiff.create({
    data: {
      userId,
      fromSnapshotId: fromId,
      toSnapshotId: toId,
      quantityMicro: result.quantityMicro,
      priceMicro: result.priceMicro,
      coverageMicro: result.coverageMicro,
      reconciles: result.reconciles,
      lines: {
        create: result.lines
          // Cap the persisted rows: the interesting ones are the largest movers,
          // and a full stash produces thousands of zero-delta lines that would
          // dominate storage on a free-tier database for no analytical value.
          .filter((l) => l.kind !== "unchanged")
          .slice(0, 400)
          .map((l) => ({
            itemKey: l.itemKey,
            displayName: l.displayName,
            qtyDelta: l.qtyDelta,
            quantityMicro: l.quantityMicro,
            priceMicro: l.priceMicro,
            coverageMicro: l.coverageMicro,
            kind: l.kind,
          })),
      },
    },
    include: { lines: { orderBy: { quantityMicro: "desc" } } },
  });
}

/** The diff between the two most recent snapshots, or null if there is only one. */
export async function latestDiff(userId: string, league: string) {
  const recent = await prisma.snapshot.findMany({
    where: { userId, league },
    orderBy: { capturedAt: "desc" },
    take: 2,
    select: { id: true },
  });
  if (recent.length < 2) return null;
  return computeDiff(userId, recent[1].id, recent[0].id);
}
