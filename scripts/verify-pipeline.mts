/**
 * End-to-end check of the value pipeline against LIVE poe.ninja data, with no
 * database involved: parse stash JSON -> price it -> snapshot -> diff.
 *
 *   npx tsx scripts/verify-pipeline.mts
 *
 * This is the part that can be subtly wrong in ways tests with fake prices would
 * never catch, so it runs against the real API on purpose.
 */

// Next loads .env automatically; a bare tsx script does not.
import "dotenv/config";
import { fetchPriceBook } from "../src/lib/poeninja/client";
import { PriceIndex } from "../src/domain/priceKey";
import { buildSnapshot } from "../src/domain/snapshot";
import { diffSnapshots } from "../src/domain/diff";
import { parseStashJson } from "../src/lib/stashImport";
import { formatMoney, microToChaos } from "../src/domain/money";

const LEAGUE = process.argv[2] ?? "Allflame";

function currency(name: string, stackSize: number, tab = "t1") {
  return { name: "", typeLine: name, baseType: name, stackSize, frameType: 5, tab };
}

function stash(items: Record<string, unknown>[]) {
  return JSON.stringify({
    stash: { id: "t1", name: "Currency", type: "CurrencyStash", items },
  });
}

const fail: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fail.push(label);
}

console.log(`Fetching live price book for ${LEAGUE}…`);
const book = await fetchPriceBook(LEAGUE);
const index = new PriceIndex(book.rows, 0);
const rate = book.divineRateMicro;

console.log(`\nPrice book: ${book.rows.length} rows, ${index.size} unique keys`);
console.log(`Divine rate: ${microToChaos(rate).toFixed(2)} chaos per divine\n`);

console.log("Price book sanity");
check("no category failed to fetch", book.reports.every((r) => r.ok),
  book.reports.filter((r) => !r.ok).map((r) => r.type).join(", "));
check("chaos orb is priced at 1c", microToChaos(index.get("cur:chaos orb")?.chaosMicro ?? 0n) === 1);
check("scarabs are priced", (index.get("cur:ambush scarab")?.chaosMicro ?? 0n) > 0n);
check("astrolabes are priced", (index.get("cur:fruiting astrolabe")?.chaosMicro ?? 0n) > 0n);
check("maps are priced by tier", (index.get("map:t16")?.chaosMicro ?? 0n) > 0n);

// A stash of nothing but divines must render as exactly that many divines. If the
// price basis and the rate ever diverge, this is where it shows.
const divOnly = buildSnapshot(
  parseStashJson(stash([currency("Divine Orb", 10)])).tabs,
  index,
);
const asDivine = Number(divOnly.totalMicro) / Number(rate);
check("10 divines value as exactly 10.00 div", Math.abs(asDivine - 10) < 0.005,
  `got ${asDivine.toFixed(4)}`);

console.log("\nSnapshot + diff pipeline");

const before = buildSnapshot(
  parseStashJson(
    stash([currency("Chaos Orb", 1000), currency("Divine Orb", 5), currency("Ambush Scarab", 40)]),
  ).tabs,
  index,
);
const after = buildSnapshot(
  parseStashJson(
    stash([currency("Chaos Orb", 1500), currency("Divine Orb", 7), currency("Ambush Scarab", 20)]),
  ).tabs,
  index,
);

const d = diffSnapshots(before, after);
check("three terms reconcile exactly", d.reconciles);
check("no drift when both sides share a price book", d.priceMicro === 0n);
check("net equals the net worth delta", d.netMicro === d.totalAfter - d.totalBefore);

const scarabUnit = index.get("cur:ambush scarab")!.chaosMicro;
const divUnit = index.get("cur:divine orb")!.chaosMicro;
const expected = 500n * 1_000_000n + 2n * divUnit - 20n * scarabUnit;
check("profit matches hand-computed value", d.quantityMicro === expected,
  `${formatMoney(d.quantityMicro, "CHAOS", rate)} vs ${formatMoney(expected, "CHAOS", rate)}`);

console.log("\nTab reorganisation must be invisible");
const split = buildSnapshot(
  [
    { tabId: "t1", name: "a", type: "P", items: [currency("Chaos Orb", 400)] },
    { tabId: "t2", name: "b", type: "P", items: [currency("Chaos Orb", 600)] },
  ],
  index,
);
const whole = buildSnapshot(
  [
    { tabId: "t1", name: "a", type: "P", items: [currency("Chaos Orb", 1000)] },
    { tabId: "t2", name: "b", type: "P", items: [] },
  ],
  index,
);
const moved = diffSnapshots(split, whole);
check("moving a stack between tabs yields zero profit", moved.quantityMicro === 0n);
check("moving a stack between tabs yields zero drift", moved.priceMicro === 0n);

console.log("\nA sale nets to zero");
// Sell 20 scarabs for their chaos value: lose the scarabs, gain the chaos.
const scarabChaos = Number(microToChaos(scarabUnit));
const sellBefore = buildSnapshot(
  parseStashJson(stash([currency("Ambush Scarab", 20), currency("Chaos Orb", 0)])).tabs,
  index,
);
const sellAfter = buildSnapshot(
  parseStashJson(
    stash([currency("Ambush Scarab", 0), currency("Chaos Orb", Math.round(scarabChaos * 20))]),
  ).tabs,
  index,
);
const sale = diffSnapshots(sellBefore, sellAfter);
check("selling nets to roughly zero", Math.abs(microToChaos(sale.quantityMicro)) < scarabChaos,
  formatMoney(sale.quantityMicro, "CHAOS", rate, { sign: true }));

console.log("\nUnticking a tab must not read as a loss");
const twoTabs = buildSnapshot(
  [
    { tabId: "t1", name: "a", type: "P", items: [currency("Chaos Orb", 100)] },
    { tabId: "t2", name: "b", type: "P", items: [currency("Divine Orb", 40)] },
  ],
  index,
);
const oneTab = buildSnapshot(
  [{ tabId: "t1", name: "a", type: "P", items: [currency("Chaos Orb", 100)] }],
  index,
);
const scoped = diffSnapshots(twoTabs, oneTab);
check("dropped tab lands in coverage, not profit", scoped.quantityMicro === 0n);
check("dropped tab value is negative coverage", scoped.coverageMicro === -(40n * divUnit));
check("scoped diff still reconciles", scoped.reconciles);

console.log(
  fail.length === 0
    ? "\nAll pipeline checks passed.\n"
    : `\n${fail.length} CHECK(S) FAILED:\n  - ${fail.join("\n  - ")}\n`,
);
process.exit(fail.length === 0 ? 0 : 1);
