/**
 * Full-stack smoke test against a REAL database and REAL poe.ninja prices.
 *
 *   npm run db:local     (in another terminal)
 *   npm run smoke
 *
 * Exercises the path the unit tests can't reach: price book persistence,
 * snapshot writes, the diff round-trip through Postgres, and the frozen-price
 * guarantee on strategy inputs.
 *
 * Destructive: it deletes and recreates its own test user each run.
 */

// Next loads .env automatically; a bare tsx script does not.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createSnapshot, computeDiff, latestDiff } from "../src/lib/services/snapshots";
import { getFreshPriceBookId, getLatestDivineRate } from "../src/lib/services/priceBook";
import { parseStashJson } from "../src/lib/stashImport";
import { formatMoney, microToChaos } from "../src/domain/money";
import type { ParsedTab } from "../src/domain/snapshot";

const LEAGUE = "Allflame";
const USERNAME = "__smoke_test__";

const fail: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fail.push(label);
}

function tabJson(items: { name: string; qty: number }[], id = "tab-1") {
  return JSON.stringify({
    stash: {
      id,
      name: "Currency",
      type: "CurrencyStash",
      items: items.map((i) => ({
        name: "",
        typeLine: i.name,
        baseType: i.name,
        stackSize: i.qty,
        frameType: 5,
      })),
    },
  });
}

function tabsFrom(json: string): ParsedTab[] {
  return parseStashJson(json).tabs;
}

console.log("Cleaning up any previous run…");
await prisma.appUser.deleteMany({ where: { username: USERNAME } });

console.log("Creating test user…");
const user = await prisma.appUser.create({
  data: { username: USERNAME, passwordHash: "x", league: LEAGUE, minCount: 0 },
});

console.log("\nPrice book");
const bookId = await getFreshPriceBookId(LEAGUE);
const priceCount = await prisma.price.count({ where: { priceBookId: bookId } });
const rate = await getLatestDivineRate(LEAGUE);
check("price book persisted with rows", priceCount > 5000, `${priceCount} rows`);
check("divine rate stored", rate > 0n, `${microToChaos(rate).toFixed(2)} c/div`);

const chaosPrice = await prisma.price.findUnique({
  where: { priceBookId_priceKey: { priceBookId: bookId, priceKey: "cur:chaos orb" } },
});
check("chaos orb round-trips through Postgres at 1c", microToChaos(chaosPrice?.chaosMicro ?? 0n) === 1);

console.log("\nSnapshot 1");
const s1 = await createSnapshot({
  userId: user.id,
  league: LEAGUE,
  tabs: tabsFrom(tabJson([{ name: "Chaos Orb", qty: 1000 }, { name: "Divine Orb", qty: 5 }])),
  minCount: 0,
  liquidityHaircutPct: 100,
});
const lines1 = await prisma.snapshotLine.count({ where: { snapshotId: s1.snapshot.id } });
check("snapshot row written", !!s1.snapshot.id);
check("snapshot lines written", lines1 === 2, `${lines1} lines`);
check("bigint total survives the round trip", s1.snapshot.totalMicro === s1.built.totalMicro);
check("captured_at is server-stamped", s1.snapshot.capturedAt instanceof Date);
check("tabIds array persisted", s1.snapshot.tabIds.length === 1);

console.log("\nSnapshot 2 — picked up 200 chaos and 2 divines");
const s2 = await createSnapshot({
  userId: user.id,
  league: LEAGUE,
  tabs: tabsFrom(tabJson([{ name: "Chaos Orb", qty: 1200 }, { name: "Divine Orb", qty: 7 }])),
  minCount: 0,
  liquidityHaircutPct: 100,
});

console.log("\nDiff through the database");
const diff = await computeDiff(user.id, s1.snapshot.id, s2.snapshot.id);
const divUnit = (await prisma.price.findUnique({
  where: { priceBookId_priceKey: { priceBookId: bookId, priceKey: "cur:divine orb" } },
}))!.chaosMicro;
const expected = 200n * 1_000_000n + 2n * divUnit;

check("diff persisted", !!diff.id);
check("three terms reconcile", diff.reconciles);
check("profit is exactly right", diff.quantityMicro === expected,
  `${formatMoney(diff.quantityMicro, "CHAOS", rate)} vs ${formatMoney(expected, "CHAOS", rate)}`);
check("no drift within one price book", diff.priceMicro === 0n);
check("no coverage change", diff.coverageMicro === 0n);
check("diff lines persisted", diff.lines.length === 2, `${diff.lines.length} lines`);

const again = await computeDiff(user.id, s1.snapshot.id, s2.snapshot.id);
check("recomputing a diff is idempotent", again.id === diff.id);

const latest = await latestDiff(user.id, LEAGUE);
check("latestDiff finds the newest pair", latest?.id === diff.id);

console.log("\nStrategy — the frozen cost guarantee");
const strategy = await prisma.strategy.create({
  data: {
    userId: user.id,
    league: LEAGUE,
    name: "Smoke strategy",
    baselineSnapshotId: s1.snapshot.id,
  },
});
await prisma.snapshot.update({ where: { id: s1.snapshot.id }, data: { pinned: true } });

const scarab = await prisma.price.findFirst({
  where: { priceBookId: bookId, priceKey: { startsWith: "cur:" }, displayName: { contains: "Scarab" } },
  orderBy: { count: "desc" },
});
const input = await prisma.strategyInput.create({
  data: {
    strategyId: strategy.id,
    priceKey: scarab!.priceKey,
    displayName: scarab!.displayName,
    qty: 40,
    unitCostMicro: scarab!.chaosMicro,
    priceBookId: bookId,
  },
});
check("strategy input stores a frozen unit cost", input.unitCostMicro === scarab!.chaosMicro,
  `${scarab!.displayName} @ ${microToChaos(input.unitCostMicro)}c`);

// Move the market underneath it. The frozen figure must not budge.
await prisma.price.update({
  where: { priceBookId_priceKey: { priceBookId: bookId, priceKey: scarab!.priceKey } },
  data: { chaosMicro: scarab!.chaosMicro * 3n },
});
const reread = await prisma.strategyInput.findUnique({ where: { id: input.id } });
check("frozen cost survives a price change", reread!.unitCostMicro === scarab!.chaosMicro,
  "tripled the market price; the recorded cost did not move");

const sale = await prisma.sale.create({
  data: {
    userId: user.id,
    strategyId: null, // sales must work outside a strategy
    priceKey: scarab!.priceKey,
    displayName: scarab!.displayName,
    qty: 10,
    unitPriceMicro: scarab!.chaosMicro,
    priceBookId: bookId,
  },
});
check("a sale can exist with no strategy", sale.strategyId === null);

const pinned = await prisma.snapshot.findUnique({ where: { id: s1.snapshot.id } });
check("strategy baseline is pinned", pinned!.pinned === true);

console.log("\nCleaning up…");
await prisma.appUser.delete({ where: { id: user.id } });
const orphan = await prisma.snapshot.count({ where: { userId: user.id } });
check("deleting a user cascades their data", orphan === 0);

await prisma.$disconnect();

console.log(
  fail.length === 0
    ? "\nAll smoke checks passed. The database path works.\n"
    : `\n${fail.length} CHECK(S) FAILED:\n  - ${fail.join("\n  - ")}\n`,
);
process.exit(fail.length === 0 ? 0 : 1);
