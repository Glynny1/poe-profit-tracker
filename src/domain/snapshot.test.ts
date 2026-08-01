import { describe, expect, it } from "vitest";
import { buildSnapshot, itemKeyFor, scopeHash, type ParsedTab } from "./snapshot";
import { diffSnapshots } from "./diff";
import { PriceIndex, priceKeyForItem } from "./priceKey";
import { FrameType, type StashItem } from "./types";
import type { PriceRow } from "./types";

const C = 1_000_000n;

function row(priceKey: string, chaos: number, count = 100, displayName?: string): PriceRow {
  return {
    priceKey,
    displayName: displayName ?? priceKey,
    chaosMicro: BigInt(Math.round(chaos * 1e6)),
    count,
    listingCount: count,
  };
}

const PRICES = new PriceIndex(
  [
    row("cur:chaos orb", 1, 100, "Chaos Orb"),
    row("cur:divine orb", 169.8, 100, "Divine Orb"),
    row("cur:horned scarab", 2.44, 100, "Horned Scarab"),
    row("cur:fruiting astrolabe", 152.2, 100, "Fruiting Astrolabe"),
    row("uniq:tabula rasa|6|0", 12, 100, "Tabula Rasa"),
    row("uniq:mageblood|0|0", 89358, 100, "Mageblood"),
    row("gem:awakened spell echo|5|20|0", 1200, 100, "Awakened Spell Echo"),
    row("gem:awakened spell echo|1|20|0", 300, 100, "Awakened Spell Echo"),
    row("map:t16", 3.5, 100, "Map (Tier 16)"),
  ],
  0,
);

function currency(name: string, stackSize: number): StashItem {
  return {
    name: "",
    typeLine: name,
    baseType: name,
    stackSize,
    frameType: FrameType.Currency,
  };
}

function tab(tabId: string, items: StashItem[]): ParsedTab {
  return { tabId, name: tabId, type: "PremiumStash", items };
}

describe("fungible summing across tabs", () => {
  it("merges one currency across three tabs into a single line", () => {
    const built = buildSnapshot(
      [
        tab("t1", [currency("Chaos Orb", 100)]),
        tab("t2", [currency("Chaos Orb", 250)]),
        tab("t3", [currency("Chaos Orb", 50)]),
      ],
      PRICES,
    );

    const line = built.lines.find((l) => l.itemKey === "cur:chaos orb")!;
    expect(line.qty).toBe(400);
    expect(line.tabIds).toEqual(["t1", "t2", "t3"]);
    expect(built.totalMicro).toBe(400n * C);
  });

  it("produces zero profit when a stack is reorganised between tabs", () => {
    const before = buildSnapshot(
      [tab("t1", [currency("Chaos Orb", 300)]), tab("t2", [])],
      PRICES,
    );
    const after = buildSnapshot(
      [
        tab("t1", [currency("Chaos Orb", 100)]),
        tab("t2", [currency("Chaos Orb", 200)]),
      ],
      PRICES,
    );

    const r = diffSnapshots(before, after);
    expect(r.quantityMicro).toBe(0n);
    expect(r.priceMicro).toBe(0n);
    expect(r.reconciles).toBe(true);
  });
});

describe("non-fungible identity", () => {
  const tabula: StashItem = {
    name: "Tabula Rasa",
    typeLine: "Simple Robe",
    baseType: "Simple Robe",
    frameType: FrameType.Unique,
    identified: true,
    ilvl: 1,
    sockets: [0, 0, 0, 0, 0, 0].map((group) => ({ group, sColour: "W" })),
  };

  it("counts three identical uniques as qty 3, not one collapsed row", () => {
    // Without a count, two items' worth of value would silently vanish.
    const built = buildSnapshot([tab("t1", [tabula, { ...tabula }, { ...tabula }])], PRICES);
    const lines = built.lines.filter((l) => l.displayName.includes("Tabula"));

    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(3);
    expect(built.totalMicro).toBe(36n * C);
  });

  it("keeps items with distinct GGG ids separate", () => {
    const built = buildSnapshot(
      [tab("t1", [{ ...tabula, id: "aaa" }, { ...tabula, id: "bbb" }])],
      PRICES,
    );
    expect(built.lines.filter((l) => l.itemKey.startsWith("u:"))).toHaveLength(2);
  });

  it("ignores tab position and price notes when hashing identity", () => {
    const a = itemKeyFor({ ...tabula, x: 1, y: 1, note: "~b/o 5 div" }, null);
    const b = itemKeyFor({ ...tabula, x: 9, y: 4 }, null);
    expect(a).toBe(b);
  });

  it("treats a corrupted copy as a different item", () => {
    const a = itemKeyFor(tabula, null);
    const b = itemKeyFor({ ...tabula, corrupted: true }, null);
    expect(a).not.toBe(b);
  });
});

describe("pricing behaviour", () => {
  it("leaves rares unpriced and counts them separately", () => {
    const rare: StashItem = {
      name: "Doom Bane",
      typeLine: "Vaal Regalia",
      baseType: "Vaal Regalia",
      frameType: FrameType.Rare,
      identified: true,
      ilvl: 86,
    };
    const built = buildSnapshot([tab("t1", [rare])], PRICES);

    expect(built.unpricedCount).toBe(1);
    expect(built.totalMicro).toBe(0n);
    expect(built.lines[0].unitMicro).toBeNull();
  });

  it("snaps a gem down to the nearest priced tier and flags it approximate", () => {
    // A 4/20 gem has no row; the honest answer is the 1/20 floor, not the 5/20 price.
    const gem: StashItem = {
      name: "",
      typeLine: "Awakened Spell Echo",
      baseType: "Awakened Spell Echo",
      frameType: FrameType.Gem,
      properties: [
        { name: "Level", values: [["4", 0]] },
        { name: "Quality", values: [["+20%", 1]] },
      ],
    };
    const built = buildSnapshot([tab("t1", [gem])], PRICES);

    expect(built.lines[0].unitMicro).toBe(300n * C);
    expect(built.approximateCount).toBe(1);
  });

  it("drops rows below the confidence threshold", () => {
    // A single listing at 60,000c is noise; counting it invents wealth.
    const thin = new PriceIndex([row("cur:mirror of kalandra", 60000, 1)], 5);
    const built = buildSnapshot([tab("t1", [currency("Mirror of Kalandra", 1)])], thin);

    expect(built.totalMicro).toBe(0n);
    expect(built.unpricedCount).toBe(1);
  });

  it("applies the liquidity haircut to holdings", () => {
    const built = buildSnapshot([tab("t1", [currency("Divine Orb", 10)])], PRICES, {
      liquidityHaircutPct: 85,
    });
    expect(built.totalMicro).toBe((1698n * C * 85n) / 100n);
  });
});

describe("price keys", () => {
  it("keys unlinked and six-linked uniques differently", () => {
    const base: StashItem = {
      name: "The Iron Fortress",
      typeLine: "Crusader Plate",
      baseType: "Crusader Plate",
      frameType: FrameType.Unique,
      identified: true,
    };
    const unlinked = priceKeyForItem(base);
    const sixLink = priceKeyForItem({
      ...base,
      sockets: [0, 0, 0, 0, 0, 0].map((group) => ({ group })),
    });

    expect(unlinked).toBe("uniq:the iron fortress|0|0");
    expect(sixLink).toBe("uniq:the iron fortress|6|0");
  });

  it("normalises a 4-link to 0, because poe.ninja only carries linked rows", () => {
    const item: StashItem = {
      name: "Belly of the Beast",
      typeLine: "Full Wyrmscale",
      baseType: "Full Wyrmscale",
      frameType: FrameType.Unique,
      identified: true,
      sockets: [0, 0, 0, 0].map((group) => ({ group })),
    };
    expect(priceKeyForItem(item)).toBe("uniq:belly of the beast|0|0");
  });

  it("refuses to price an unidentified unique", () => {
    const item: StashItem = {
      name: "",
      typeLine: "Leather Belt",
      baseType: "Leather Belt",
      frameType: FrameType.Unique,
      identified: false,
    };
    expect(priceKeyForItem(item)).toBeNull();
  });

  it("strips GGG style markup from names", () => {
    const item = currency("<<set:MS>><<set:M>><<set:S>>Chaos Orb", 1);
    expect(priceKeyForItem(item)).toBe("cur:chaos orb");
  });

  it("keys maps by tier", () => {
    const map: StashItem = {
      name: "",
      typeLine: "Vaal Temple Map",
      baseType: "Vaal Temple Map",
      frameType: FrameType.Normal,
      properties: [{ name: "Map Tier", values: [["16", 0]] }],
    };
    expect(priceKeyForItem(map)).toBe("map:t16");
  });
});

describe("scopeHash", () => {
  it("is order independent", () => {
    expect(scopeHash(["b", "a", "c"])).toBe(scopeHash(["a", "b", "c"]));
  });
  it("changes when the tracked set changes", () => {
    expect(scopeHash(["a", "b"])).not.toBe(scopeHash(["a", "b", "c"]));
  });
});
