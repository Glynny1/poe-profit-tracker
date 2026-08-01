import { prisma } from "@/lib/prisma";

export interface Holding {
  itemKey: string;
  priceKey: string | null;
  displayName: string;
  icon: string | null;
  qty: number;
  unitMicro: bigint | null;
  totalMicro: bigint;
  tabNames: string[];
}

export interface CurrencyIcons {
  chaos: string | null;
  divine: string | null;
}

/**
 * Holdings for a snapshot, with icons and tab names attached.
 *
 * Icons are joined from the price book the snapshot was valued against rather
 * than copied onto every snapshot line. A line already carries priceKey and the
 * snapshot carries priceBookId, so the icon is derivable, and duplicating it per
 * line per snapshot would be a lot of identical URLs for no benefit.
 */
export async function getHoldings(snapshotId: string): Promise<{
  priced: Holding[];
  unpriced: Holding[];
  icons: CurrencyIcons;
}> {
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
    include: { lines: true },
  });
  if (!snapshot) return { priced: [], unpriced: [], icons: { chaos: null, divine: null } };

  const priceKeys = [
    ...new Set(snapshot.lines.map((l) => l.priceKey).filter((k): k is string => !!k)),
  ];

  const [prices, tabs, currency] = await Promise.all([
    prisma.price.findMany({
      where: { priceBookId: snapshot.priceBookId, priceKey: { in: priceKeys } },
      select: { priceKey: true, icon: true },
    }),
    prisma.trackedTab.findMany({
      where: { userId: snapshot.userId, league: snapshot.league },
      select: { gggTabId: true, name: true },
    }),
    prisma.price.findMany({
      where: {
        priceBookId: snapshot.priceBookId,
        priceKey: { in: ["cur:chaos orb", "cur:divine orb"] },
      },
      select: { priceKey: true, icon: true },
    }),
  ]);

  const iconFor = new Map(prices.map((p) => [p.priceKey, p.icon]));
  const tabName = new Map(tabs.map((t) => [t.gggTabId, t.name]));

  const rows: Holding[] = snapshot.lines.map((l) => ({
    itemKey: l.itemKey,
    priceKey: l.priceKey,
    displayName: l.displayName,
    icon: (l.priceKey && iconFor.get(l.priceKey)) || null,
    qty: l.qty,
    unitMicro: l.unitMicro,
    totalMicro: l.unitMicro == null ? 0n : BigInt(l.qty) * l.unitMicro,
    // Fall back to the raw id so a tab imported before it was named still shows
    // something rather than an empty cell.
    tabNames: l.tabIds.map((id) => tabName.get(id) ?? id.slice(0, 8)),
  }));

  const byValue = (a: Holding, b: Holding) =>
    b.totalMicro > a.totalMicro ? 1 : b.totalMicro < a.totalMicro ? -1 : 0;

  return {
    priced: rows.filter((r) => r.unitMicro != null).sort(byValue),
    unpriced: rows.filter((r) => r.unitMicro == null).sort((a, b) => b.qty - a.qty),
    icons: {
      chaos: currency.find((c) => c.priceKey === "cur:chaos orb")?.icon ?? null,
      divine: currency.find((c) => c.priceKey === "cur:divine orb")?.icon ?? null,
    },
  };
}

/** Chaos and Divine Orb icons from the most recent price book for a league. */
export async function getCurrencyIcons(league: string): Promise<CurrencyIcons> {
  const book = await prisma.priceBook.findFirst({
    where: { league },
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });
  if (!book) return { chaos: null, divine: null };

  const rows = await prisma.price.findMany({
    where: { priceBookId: book.id, priceKey: { in: ["cur:chaos orb", "cur:divine orb"] } },
    select: { priceKey: true, icon: true },
  });
  return {
    chaos: rows.find((r) => r.priceKey === "cur:chaos orb")?.icon ?? null,
    divine: rows.find((r) => r.priceKey === "cur:divine orb")?.icon ?? null,
  };
}
