import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getFreshPriceBookId } from "@/lib/services/priceBook";

/**
 * Typeahead over the current price book. Used by the strategy input picker, so
 * the user can record any priceable thing: scarabs, fragments, astrolabes and
 * maps, but also delirium orbs, catalysts or logbooks, without the app deciding
 * in advance which costs are allowed to matter.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const priceBookId = await getFreshPriceBookId(user.league);

  const rows = await prisma.price.findMany({
    where: { priceBookId, displayName: { contains: q, mode: "insensitive" } },
    orderBy: { count: "desc" },
    take: 20,
    select: { priceKey: true, displayName: true, chaosMicro: true, icon: true },
  });

  return NextResponse.json({
    results: rows.map((r) => ({
      priceKey: r.priceKey,
      displayName: r.displayName,
      icon: r.icon,
      // bigint is not JSON-serialisable, so cross the boundary as a string.
      chaos: Number(r.chaosMicro) / 1_000_000,
    })),
  });
}
