import { prisma } from "@/lib/prisma";
import { fetchPriceBook } from "@/lib/poeninja/client";
import { PriceIndex } from "@/domain/priceKey";
import type { PriceRow } from "@/domain/types";

/**
 * poe.ninja's PoE1 data refreshes roughly every 15 minutes and their HTTP cache
 * is ~5. Refetching faster re-reads identical numbers, so we reuse a recent book
 * rather than making a new one per snapshot. This also keeps every snapshot
 * taken in the same window comparable with zero price drift, which is a useful
 * property in itself.
 */
const MAX_AGE_MS = 15 * 60 * 1000;

export async function getFreshPriceBookId(league: string): Promise<string> {
  const existing = await prisma.priceBook.findFirst({
    where: { league, fetchedAt: { gte: new Date(Date.now() - MAX_AGE_MS) } },
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  return refreshPriceBook(league);
}

export async function refreshPriceBook(league: string): Promise<string> {
  const result = await fetchPriceBook(league);

  const book = await prisma.priceBook.create({
    data: {
      league,
      divineRateMicro: result.divineRateMicro,
      source: "poe.ninja",
      meta: {
        // Cast through unknown: Prisma's InputJsonValue won't accept a typed
        // interface array directly, though the runtime shape is plain JSON.
        reports: result.reports as unknown as object[],
        totalRows: result.rows.length,
      },
    },
  });

  // Several categories can legitimately yield the same key (a gem row indexed
  // under both its transfigured and base name, for instance). The composite
  // primary key would reject the duplicate, so collapse to the most liquid row
  // first — the same rule PriceIndex applies in memory.
  const best = new Map<string, PriceRow>();
  for (const row of result.rows) {
    const prev = best.get(row.priceKey);
    if (!prev || row.count > prev.count) best.set(row.priceKey, row);
  }

  const rows = [...best.values()].map((r) => ({
    priceBookId: book.id,
    priceKey: r.priceKey,
    displayName: r.displayName,
    icon: r.icon,
    chaosMicro: r.chaosMicro,
    count: r.count,
    listingCount: r.listingCount,
  }));

  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.price.createMany({ data: rows.slice(i, i + 2000) });
  }

  return book.id;
}

export async function loadPriceIndex(priceBookId: string, minCount: number) {
  const rows = await prisma.price.findMany({
    where: { priceBookId },
    select: {
      priceKey: true,
      displayName: true,
      icon: true,
      chaosMicro: true,
      count: true,
      listingCount: true,
    },
  });
  return new PriceIndex(
    rows.map((r) => ({ ...r, icon: r.icon ?? undefined })),
    minCount,
  );
}

export async function getDivineRate(priceBookId: string): Promise<bigint> {
  const book = await prisma.priceBook.findUnique({
    where: { id: priceBookId },
    select: { divineRateMicro: true },
  });
  return book?.divineRateMicro ?? 1n;
}

/** The most recent rate for a league, for rendering figures that have no book. */
export async function getLatestDivineRate(league: string): Promise<bigint> {
  const book = await prisma.priceBook.findFirst({
    where: { league },
    orderBy: { fetchedAt: "desc" },
    select: { divineRateMicro: true },
  });
  return book?.divineRateMicro ?? 168_000_000n;
}
