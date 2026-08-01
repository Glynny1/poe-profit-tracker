/**
 * Seed a dev user with two snapshots and a strategy, and print a session cookie
 * you can paste into curl (or a browser) to view the authenticated pages.
 *
 *   npm run seed
 *
 * Destructive: recreates the "dev" user each run.
 */

import "dotenv/config";
import { sealData } from "iron-session";
import { prisma } from "../src/lib/prisma";
import { createSnapshot } from "../src/lib/services/snapshots";
import { getFreshPriceBookId } from "../src/lib/services/priceBook";
import { hashPassword } from "../src/lib/session";
import { parseStashJson } from "../src/lib/stashImport";

const LEAGUE = "Allflame";

function tabJson(items: { name: string; qty: number }[]) {
  return JSON.stringify({
    stash: {
      id: "tab-1",
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

await prisma.appUser.deleteMany({ where: { username: "dev" } });

const user = await prisma.appUser.create({
  data: {
    username: "dev",
    passwordHash: await hashPassword("devpassword"),
    league: LEAGUE,
    minCount: 0,
    poeAccount: "Dev#0000",
  },
});

const before = [
  { name: "Chaos Orb", qty: 850 },
  { name: "Divine Orb", qty: 4 },
  { name: "Ambush Scarab", qty: 60 },
];
const after = [
  { name: "Chaos Orb", qty: 1240 },
  { name: "Divine Orb", qty: 6 },
  { name: "Ambush Scarab", qty: 22 },
  { name: "Fruiting Astrolabe", qty: 2 },
];

for (const items of [before, after]) {
  await createSnapshot({
    userId: user.id,
    league: LEAGUE,
    tabs: parseStashJson(tabJson(items)).tabs,
    minCount: 0,
    liquidityHaircutPct: 100,
  });
}

await prisma.trackedTab.create({
  data: {
    userId: user.id,
    league: LEAGUE,
    gggTabId: "tab-1",
    name: "Currency",
    type: "CurrencyStash",
    isTracked: true,
  },
});

const bookId = await getFreshPriceBookId(LEAGUE);
const scarab = await prisma.price.findFirst({
  where: { priceBookId: bookId, displayName: { contains: "Scarab" } },
  orderBy: { count: "desc" },
});

const strategy = await prisma.strategy.create({
  data: { userId: user.id, league: LEAGUE, name: "Abyss T16s", mapsRun: 40 },
});
if (scarab) {
  await prisma.strategyInput.create({
    data: {
      strategyId: strategy.id,
      priceKey: scarab.priceKey,
      displayName: scarab.displayName,
      qty: 40,
      unitCostMicro: scarab.chaosMicro,
      priceBookId: bookId,
    },
  });
  await prisma.sale.create({
    data: {
      userId: user.id,
      strategyId: strategy.id,
      priceKey: scarab.priceKey,
      displayName: scarab.displayName,
      qty: 38,
      unitPriceMicro: scarab.chaosMicro * 2n,
      priceBookId: bookId,
    },
  });
}

const cookie = await sealData(
  { userId: user.id },
  { password: process.env.SESSION_SECRET!, ttl: 0 },
);

console.log(`Seeded user "dev" (password: devpassword)`);
console.log(`Strategy id: ${strategy.id}`);
console.log(`\nCookie for curl:\npoe_profit_session=${cookie}\n`);

await prisma.$disconnect();
