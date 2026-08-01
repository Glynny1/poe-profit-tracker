/**
 * The item <-> price matching contract.
 *
 * Both sides of the match (a stash item, and a poe.ninja price row) are reduced
 * to the same `priceKey` string by functions in this one file, so the two can
 * never drift apart. Where an exact key cannot exist — gems are only priced at
 * discrete level/quality tiers, cluster jewels only at quantised item levels —
 * `PriceIndex` falls back to snapping DOWN to the nearest priced tier and marks
 * the valuation approximate. Snapping down is deliberate: a conservative
 * undervalue is a lower bound, an overvalue is a lie.
 */

import { FrameType, type StashItem, type PriceRow } from "./types";

/** poe.ninja rows and stash items spell the same thing slightly differently. */
export function normalizeName(raw: string): string {
  return raw
    // GGG injects these style markers into item names.
    .replace(/<<set:[A-Z]+>>/g, "")
    .replace(/’/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

/**
 * Link count. poe.ninja only carries a `links` field on rows that are
 * specifically linked, so anything under 5 must normalise to 0 or the key on the
 * item side will never match the key on the row side.
 */
export function getLinks(item: StashItem): number {
  if (!item.sockets?.length) return 0;
  const groups = new Map<number, number>();
  for (const s of item.sockets) groups.set(s.group, (groups.get(s.group) ?? 0) + 1);
  const max = Math.max(...groups.values());
  return max >= 5 ? max : 0;
}

function numericProperty(item: StashItem, name: string): number | null {
  const p = item.properties?.find((x) => x.name === name);
  const raw = p?.values?.[0]?.[0];
  if (raw == null) return null;
  const n = parseInt(String(raw).replace(/[+%]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

export function getQuality(item: StashItem): number {
  return numericProperty(item, "Quality") ?? 0;
}

export function getGemLevel(item: StashItem): number {
  return numericProperty(item, "Level") ?? 1;
}

export function getMapTier(item: StashItem): number | null {
  return numericProperty(item, "Map Tier");
}

/** poe.ninja bands item level for cluster jewels and bases; these are the bands it uses. */
export function ilvlBand(ilvl: number): number {
  if (ilvl >= 84) return 84;
  if (ilvl >= 75) return 75;
  if (ilvl >= 68) return 68;
  return 1;
}

export type ItemCategory =
  | "currency"
  | "unique"
  | "gem"
  | "cluster"
  | "map"
  | "rare"
  | "other";

export function categorise(item: StashItem): ItemCategory {
  const ft = item.frameType;

  // Currency, fragments, scarabs, astrolabes, essences, oils, fossils, delirium
  // orbs and divination cards are all frameType 5/6 and all price by plain name.
  if (ft === FrameType.Currency || ft === FrameType.DivinationCard) return "currency";
  if (ft === FrameType.Gem) return "gem";

  if (item.baseType?.includes("Cluster Jewel")) return "cluster";

  const isMap =
    item.baseType?.endsWith(" Map") ||
    item.typeLine?.endsWith(" Map") ||
    getMapTier(item) !== null;
  if (isMap) return "map";

  if (ft === FrameType.Unique || ft === FrameType.Foil) return "unique";
  if (ft === FrameType.Rare || ft === FrameType.Magic || ft === FrameType.Normal) return "rare";
  return "other";
}

// ---------------------------------------------------------------------------
// Item side
// ---------------------------------------------------------------------------

export function currencyKey(name: string): string {
  return `cur:${normalizeName(name)}`;
}

export function uniqueKey(name: string, links: number, corrupted: boolean): string {
  return `uniq:${normalizeName(name)}|${links}|${corrupted ? 1 : 0}`;
}

export function gemKey(base: string, level: number, quality: number, corrupted: boolean): string {
  return `gem:${normalizeName(base)}|${level}|${quality}|${corrupted ? 1 : 0}`;
}

export function clusterKey(enchant: string, passives: number, band: number): string {
  return `clus:${normalizeName(enchant)}|${passives}|${band}`;
}

export function mapKey(tier: number): string {
  return `map:t${tier}`;
}

/** The enchantment text and passive count that identify a cluster jewel's price row. */
export function clusterParts(item: StashItem): { enchant: string; passives: number } | null {
  const mods = item.enchantMods ?? [];
  let passives = 0;
  let enchant = "";
  for (const m of mods) {
    const p = m.match(/Adds (\d+) Passive Skills?/i);
    if (p) {
      passives = parseInt(p[1], 10);
      continue;
    }
    // "Added Small Passive Skills grant: X" — X is the row's `name` on poe.ninja.
    const g = m.match(/Added Small Passive Skills grant:?\s*(.+)$/i);
    if (g) enchant = g[1].trim();
    else if (!enchant) enchant = m.trim();
  }
  if (!passives || !enchant) return null;
  return { enchant, passives };
}

/**
 * The primary price key for a stash item, or null when the item is not
 * automatically priceable (rares, unidentified uniques, unmatched).
 */
export function priceKeyForItem(item: StashItem): string | null {
  switch (categorise(item)) {
    case "currency":
      return currencyKey(item.typeLine || item.baseType || item.name);

    case "unique": {
      // An unidentified unique cannot be told apart from any other drop of the
      // same base, so it cannot be priced.
      if (item.identified === false) return null;
      const name = item.name || item.typeLine;
      if (!name) return null;
      return uniqueKey(name, getLinks(item), !!item.corrupted);
    }

    case "gem": {
      const base = item.typeLine || item.baseType;
      if (!base) return null;
      return gemKey(base, getGemLevel(item), getQuality(item), !!item.corrupted);
    }

    case "cluster": {
      const parts = clusterParts(item);
      if (!parts) return null;
      return clusterKey(parts.enchant, parts.passives, ilvlBand(item.ilvl ?? 1));
    }

    case "map": {
      const tier = getMapTier(item);
      if (tier == null) return null;
      return mapKey(tier);
    }

    // Rares are not priced by poe.ninja, by design. They are counted and shown
    // separately so the user knows the net worth is a lower bound.
    default:
      return null;
  }
}

/**
 * Fungible = stacks, so identity is the price key and quantities are summed
 * across every tracked tab before diffing. Non-fungible = one row per physical
 * item, keyed by GGG id or a content hash.
 */
export function isFungible(item: StashItem): boolean {
  if (item.stackSize != null || item.maxStackSize != null) return true;
  const c = categorise(item);
  return c === "currency" || c === "map";
}

// ---------------------------------------------------------------------------
// Price index — the row side, plus tier snapping
// ---------------------------------------------------------------------------

interface GemEntry {
  level: number;
  quality: number;
  row: PriceRow;
}
interface ClusterEntry {
  band: number;
  row: PriceRow;
}

export interface PriceLookup {
  row: PriceRow;
  /** True when we snapped to a lower tier rather than matching exactly. */
  approximate: boolean;
}

export class PriceIndex {
  private byKey = new Map<string, PriceRow>();
  private gems = new Map<string, GemEntry[]>();
  private clusters = new Map<string, ClusterEntry[]>();

  constructor(rows: Iterable<PriceRow>, private minCount = 0) {
    for (const row of rows) this.add(row);
    for (const list of this.gems.values()) {
      list.sort((a, b) => b.level - a.level || b.quality - a.quality);
    }
    for (const list of this.clusters.values()) list.sort((a, b) => b.band - a.band);
  }

  private add(row: PriceRow) {
    const existing = this.byKey.get(row.priceKey);
    // Unique variants ("Gem Level, No Requirements" etc.) collapse onto one key
    // because the variant is not derivable from stash JSON. Keep the most liquid
    // row, which is the least-wrong single answer available.
    if (!existing || row.count > existing.count) this.byKey.set(row.priceKey, row);

    const gem = row.priceKey.match(/^gem:(.+)\|(\d+)\|(\d+)\|([01])$/);
    if (gem) {
      const bucket = `${gem[1]}|${gem[4]}`;
      const list = this.gems.get(bucket) ?? [];
      list.push({ level: +gem[2], quality: +gem[3], row });
      this.gems.set(bucket, list);
      return;
    }

    const clus = row.priceKey.match(/^clus:(.+)\|(\d+)\|(\d+)$/);
    if (clus) {
      const bucket = `${clus[1]}|${clus[2]}`;
      const list = this.clusters.get(bucket) ?? [];
      list.push({ band: +clus[3], row });
      this.clusters.set(bucket, list);
    }
  }

  private usable(row: PriceRow): boolean {
    // A row backed by one listing at 60,000c is noise, not a price. Counting it
    // invents wealth that vanishes on the next refresh.
    return row.count >= this.minCount;
  }

  /** Exact key lookup, honouring the confidence threshold. */
  get(priceKey: string): PriceRow | null {
    const row = this.byKey.get(priceKey);
    return row && this.usable(row) ? row : null;
  }

  /** Full lookup for an item, including tier snapping for gems and clusters. */
  lookup(item: StashItem): PriceLookup | null {
    const key = priceKeyForItem(item);
    if (!key) return null;

    const exact = this.get(key);
    if (exact) return { row: exact, approximate: false };

    const category = categorise(item);

    if (category === "gem") {
      const base = normalizeName(item.typeLine || item.baseType);
      const bucket = `${base}|${item.corrupted ? 1 : 0}`;
      const level = getGemLevel(item);
      const quality = getQuality(item);
      // Sorted descending, so the first row at or below both is the best floor.
      const hit = this.gems
        .get(bucket)
        ?.find((e) => e.level <= level && e.quality <= quality && this.usable(e.row));
      if (hit) return { row: hit.row, approximate: true };
    }

    if (category === "cluster") {
      const parts = clusterParts(item);
      if (parts) {
        const bucket = `${normalizeName(parts.enchant)}|${parts.passives}`;
        const band = ilvlBand(item.ilvl ?? 1);
        const hit = this.clusters
          .get(bucket)
          ?.find((e) => e.band <= band && this.usable(e.row));
        if (hit) return { row: hit.row, approximate: true };
      }
    }

    return null;
  }

  get size(): number {
    return this.byKey.size;
  }
}
