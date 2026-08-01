/**
 * poe.ninja economy API: the shapes we actually consume.
 *
 * Base is https://poe.ninja/poe1/api/economy. The old poe.ninja/api/data/*
 * endpoints return 404 as of mid-2026; any tutorial or sample referencing
 * `currencyoverview` or `itemoverview` is dead.
 *
 * Casing is inconsistent BETWEEN endpoints and that is not a typo here:
 * the exchange endpoint uses `sparkline`, the item endpoint uses `sparkLine`.
 */

/** GET /exchange/current/overview?league=&type= */
export interface ExchangeOverview {
  core: {
    items?: ExchangeItem[];
    /** Divine per chaos, e.g. 0.005932. Its reciprocal is chaos per divine. */
    rates: { divine?: number };
    primary: string;
    secondary: string;
  };
  lines: ExchangeLine[];
  items?: ExchangeItem[];
}

export interface ExchangeLine {
  /** Slug only. There is NO name on this object. Join to `items` by id. */
  id: string;
  /** Value in `core.primary` units, which is chaos for PoE1. */
  primaryValue: number;
  volumePrimaryValue?: number;
  maxVolumeCurrency?: string;
  maxVolumeRate?: number;
  sparkline?: { totalChange: number; data: (number | null)[] };
}

export interface ExchangeItem {
  id: string;
  name: string;
  /** Path only. Prefix with https://web.poecdn.com when it starts with '/'. */
  image?: string;
  category?: string;
  detailsId?: string;
}

/** GET /stash/current/item/overview?league=&type= */
export interface ItemOverview {
  lines: ItemLine[];
}

export interface ItemLine {
  id: number;
  name: string;
  icon?: string;
  baseType?: string;
  itemType?: string;
  itemClass?: number;
  /**
   * Means DIFFERENT THINGS per type: a real level requirement on uniques and
   * gems, but the ITEM LEVEL band on ClusterJewel, BaseType and Wombgift.
   */
  levelRequired?: number;
  variant?: string;
  /** Present ONLY on rows that are specifically linked. Absent means unlinked. */
  links?: number;
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
  relicLevel?: number;
  synthesised?: boolean;
  mutated?: boolean;
  chaosValue: number;
  /** Rounded to 2dp, so never sum these, always compute from chaosValue. */
  divineValue?: number;
  exaltedValue?: number;
  /** The only confidence signal available; there is no lowConfidence flag. */
  count: number;
  listingCount?: number;
  detailsId?: string;
  sparkLine?: { totalChange: number; data: (number | null)[] };
}

/**
 * Fungibles. All priced through the EXCHANGE endpoint so that every chaos value
 * shares one basis with `core.rates.divine`.
 *
 * poe.ninja publishes two chaos:divine ratios that disagree by ~19%: the
 * exchange rate (~168 c/div) and the stash-listing rate (~143 c/div). Mixing
 * them means a stash of nothing but Divine Orbs reports the wrong number of
 * divines. We use exchange for everything and never read the stash currency
 * endpoint at all.
 */
export const EXCHANGE_TYPES = [
  "Currency",
  "Fragment",
  "Scarab",
  "Astrolabe",
  "DivinationCard",
  "Essence",
  "Oil",
  "Fossil",
  "Resonator",
  "DeliriumOrb",
  "Artifact",
  "Tattoo",
  "Omen",
  "Runegraft",
  "AllflameEmber",
  "DjinnCoin",
  "Ducat",
  "EnshroudingCrystal",
] as const;

/** Non-fungibles, priced through the stash item endpoint. */
export const ITEM_TYPES = [
  "UniqueWeapon",
  "UniqueArmour",
  "UniqueAccessory",
  "UniqueFlask",
  "UniqueJewel",
  "UniqueRelic",
  "UniqueTincture",
  "UniqueMap",
  "ForbiddenJewel",
  "ShrineBelt",
  "SkillGem",
  "ImbuedGem",
  "ClusterJewel",
  "Map",
  "BlightedMap",
  "BlightRavagedMap",
  "Invitation",
  "Incubator",
  "Beast",
  "Vial",
  "Memory",
  "IncursionTemple",
  "ValdoMap",
  "Wombgift",
] as const;

export type ExchangeType = (typeof EXCHANGE_TYPES)[number];
export type ItemType = (typeof ITEM_TYPES)[number];
