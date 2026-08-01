import { describe, expect, it } from "vitest";
import { divineRateMicro, parseExchange, parseItems } from "./parse";
import type { ExchangeOverview, ItemOverview } from "./types";
import { PriceIndex } from "@/domain/priceKey";
import { microToChaos } from "@/domain/money";

/** Trimmed from real 2026-07-31 Allflame responses. */
const EXCHANGE: ExchangeOverview = {
  core: { rates: { divine: 0.005932 }, primary: "chaos", secondary: "divine" },
  lines: [
    { id: "chaos", primaryValue: 1, volumePrimaryValue: 11865349 },
    { id: "divine", primaryValue: 168.6, volumePrimaryValue: 900000 },
    { id: "abyss-scarab-of-descending", primaryValue: 2.41, volumePrimaryValue: 17347 },
    { id: "fruiting-astrolabe", primaryValue: 152.2, volumePrimaryValue: 400 },
    // Present in lines but missing from items, so must be dropped, not shown as a slug.
    { id: "orphan-slug", primaryValue: 5, volumePrimaryValue: 1 },
  ],
  items: [
    { id: "chaos", name: "Chaos Orb", image: "/gen/image/chaos.png", category: "Currency" },
    { id: "divine", name: "Divine Orb", image: "/gen/image/divine.png", category: "Currency" },
    {
      id: "abyss-scarab-of-descending",
      name: "Abyss Scarab of Descending",
      image: "/gen/image/scarab.png",
      category: "Fragments",
    },
    { id: "fruiting-astrolabe", name: "Fruiting Astrolabe", category: "Fragments" },
  ],
};

describe("exchange parsing", () => {
  const rows = parseExchange(EXCHANGE);

  it("joins slugs to names via the sibling items array", () => {
    const scarab = rows.find((r) => r.priceKey === "cur:abyss scarab of descending");
    expect(scarab?.displayName).toBe("Abyss Scarab of Descending");
    expect(microToChaos(scarab!.chaosMicro)).toBe(2.41);
  });

  it("drops lines whose slug has no matching item rather than naming them by slug", () => {
    expect(rows.find((r) => r.priceKey.includes("orphan"))).toBeUndefined();
  });

  it("makes CDN image paths absolute", () => {
    const chaos = rows.find((r) => r.priceKey === "cur:chaos orb");
    expect(chaos?.icon).toBe("https://web.poecdn.com/gen/image/chaos.png");
  });

  it("prices scarabs and astrolabes, which are exchange-only types", () => {
    expect(rows.find((r) => r.priceKey === "cur:fruiting astrolabe")).toBeDefined();
  });

  it("derives chaos-per-divine from core.rates.divine", () => {
    const rate = divineRateMicro(EXCHANGE)!;
    expect(microToChaos(rate)).toBeCloseTo(168.577, 2);
  });

  it("returns null when the rate is missing, so a bad book cannot be built", () => {
    expect(divineRateMicro({ ...EXCHANGE, core: { rates: {}, primary: "", secondary: "" } })).toBeNull();
  });
});

describe("map parsing", () => {
  // Every generic tier row in the live league carries variant ", Gen-24".
  // Filtering that variant as "legacy", the standard advice from older tools,
  // would delete map pricing entirely.
  const MAPS: ItemOverview = {
    lines: [
      {
        id: 1,
        name: "Map (Tier 16)",
        variant: ", Gen-24",
        detailsId: "map-tier-16-t0-gen-24",
        chaosValue: 2,
        count: 500,
      },
      {
        id: 2,
        name: "Map (Tier 1)",
        variant: ", Gen-24",
        detailsId: "map-tier-1-t0-gen-24",
        chaosValue: 0.72,
        count: 300,
      },
      {
        id: 3,
        name: "Veritania Vaal Temple Map",
        baseType: "Vaal Temple Map",
        variant: "Atlas",
        chaosValue: 168.6,
        count: 4,
      },
    ],
  };

  const rows = parseItems(MAPS, "Map");

  it("keeps generic tier rows despite the Gen-N variant", () => {
    expect(rows.map((r) => r.priceKey).sort()).toEqual(["map:t1", "map:t16"]);
  });

  it("skips influenced maps, which cannot be matched from stash JSON", () => {
    expect(rows.find((r) => r.displayName.includes("Veritania"))).toBeUndefined();
  });
});

describe("unique parsing", () => {
  const UNIQUES: ItemOverview = {
    lines: [
      { id: 1, name: "The Iron Fortress", links: 6, chaosValue: 5000, count: 20 },
      { id: 2, name: "The Iron Fortress", chaosValue: 900, count: 40 },
      { id: 3, name: "Mageblood", chaosValue: 34900, count: 9, corrupted: false },
      // Two variants of one unique collapse onto the same key; the index keeps
      // the most liquid, because the variant is not derivable from stash JSON.
      { id: 4, name: "Precursor's Emblem", variant: "Fire", chaosValue: 300, count: 3 },
      { id: 5, name: "Precursor's Emblem", variant: "Cold", chaosValue: 900, count: 50 },
    ],
  };
  const rows = parseItems(UNIQUES, "UniqueAccessory");

  it("distinguishes linked from unlinked rows", () => {
    expect(rows.find((r) => r.priceKey === "uniq:the iron fortress|6|0")).toBeDefined();
    expect(rows.find((r) => r.priceKey === "uniq:the iron fortress|0|0")).toBeDefined();
  });

  it("resolves colliding variants to the most liquid row", () => {
    const idx = new PriceIndex(rows, 0);
    const hit = idx.get("uniq:precursor's emblem|0|0");
    expect(microToChaos(hit!.chaosMicro)).toBe(900);
  });
});

describe("gem parsing", () => {
  const GEMS: ItemOverview = {
    lines: [
      {
        id: 1,
        name: "Vaal Summon Skeletons (Summon Skeletons of Archers)",
        baseType: "Vaal Summon Skeletons",
        gemLevel: 21,
        gemQuality: 20,
        corrupted: true,
        chaosValue: 60914,
        count: 1,
      },
      {
        id: 2,
        name: "Awakened Spell Echo",
        baseType: "Awakened Spell Echo",
        gemLevel: 5,
        gemQuality: 20,
        chaosValue: 1200,
        count: 30,
      },
    ],
  };
  const rows = parseItems(GEMS, "SkillGem");

  it("indexes a transfigured gem under the name the stash actually uses", () => {
    // The stash shows "Summon Skeletons of Archers", not poe.ninja's compound name.
    const keys = rows.map((r) => r.priceKey);
    expect(keys).toContain("gem:summon skeletons of archers|21|20|1");
    expect(keys).toContain("gem:vaal summon skeletons|21|20|1");
  });

  it("keys plain gems by level, quality and corruption", () => {
    expect(rows.map((r) => r.priceKey)).toContain("gem:awakened spell echo|5|20|0");
  });
});

describe("cluster jewel parsing", () => {
  const CLUSTERS: ItemOverview = {
    lines: [
      {
        id: 1,
        name: "Minions deal 10% increased Damage",
        baseType: "Large Cluster Jewel",
        variant: "12 passives",
        levelRequired: 84,
        chaosValue: 2360,
        count: 15,
      },
    ],
  };

  it("reads levelRequired as an item level band, not a level requirement", () => {
    const rows = parseItems(CLUSTERS, "ClusterJewel");
    // normalizeName strips punctuation on both sides, so '%' is absent by design.
    expect(rows[0].priceKey).toBe("clus:minions deal 10 increased damage|12|84");
  });
});

describe("robustness", () => {
  it("ignores rows with a zero or missing chaos value", () => {
    const rows = parseItems(
      { lines: [{ id: 1, name: "Broken", chaosValue: 0, count: 5 }] },
      "UniqueWeapon",
    );
    expect(rows).toHaveLength(0);
  });

  it("treats a valid-but-empty category as empty, not as an error", () => {
    expect(parseItems({ lines: [] }, "ImbuedGem")).toEqual([]);
  });
});
