/**
 * Shapes of the GGG stash API payloads we actually read, and the canonical
 * internal forms we convert them into.
 *
 * Deliberately narrow: the MVP does not read mod arrays, which is why the 3.29
 * breaking change (implicitMods/explicitMods went from string[] to ItemMod[])
 * does not affect us. `enchantMods` is still string[] and IS read, for cluster
 * jewels. If you later add rare pricing, `ItemMod` is where that starts.
 */

export interface ItemProperty {
  name: string;
  /** Each entry is [displayString, formatCode]. */
  values: [string, number][];
  displayMode?: number;
  type?: number;
}

export interface ItemSocket {
  group: number;
  attr?: string;
  sColour?: string;
}

/** 3.29+: implicitMods/explicitMods are objects, not strings. */
export interface ItemMod {
  description: string;
  /**
   * GGG serialises an empty flags set as `[]` (a JSON array), not `{}`, because
   * their serialiser encodes an empty associative array as a list. A strict
   * object schema rejects the whole document — accept both shapes.
   */
  flags?:
    | {
        fractured?: boolean;
        mutated?: boolean;
        crafted?: boolean;
        desecrated?: boolean;
        vestigial?: boolean;
      }
    | [];
}

export interface StashItem {
  /** "a unique 64 digit hexadecimal string" — documented OPTIONAL, so never assume it. */
  id?: string;
  name: string;
  typeLine: string;
  baseType: string;
  rarity?: string;
  identified?: boolean;
  corrupted?: boolean;
  ilvl?: number;
  itemLevel?: number;
  stackSize?: number;
  maxStackSize?: number;
  icon?: string;
  note?: string;
  /** Deprecated in favour of frameTypeId, but still emitted and still the reliable one. */
  frameType?: number;
  frameTypeId?: string;
  sockets?: ItemSocket[];
  socketedItems?: StashItem[];
  properties?: ItemProperty[];
  enchantMods?: string[];
  implicitMods?: ItemMod[];
  explicitMods?: ItemMod[];
  influences?: Record<string, boolean>;
  synthesised?: boolean;
  fractured?: boolean;
  replica?: boolean;
  isRelic?: boolean;
  support?: boolean;
  x?: number;
  y?: number;
  inventoryId?: string;
}

export interface StashTab {
  /** 10 digit hex string. */
  id: string;
  parent?: string;
  folder?: string;
  name: string;
  type: string;
  index?: number;
  metadata?: {
    public?: boolean;
    folder?: boolean;
    /** Can be 2, 4 or 6 hex chars — needs zero-padding before use as a CSS colour. */
    colour?: string;
    items?: number;
    layout?: unknown;
  };
  children?: StashTab[];
  items?: StashItem[];
}

/** GGG frameType enum (PoE1). frameTypeId is documented but has no published enum. */
export const FrameType = {
  Normal: 0,
  Magic: 1,
  Rare: 2,
  Unique: 3,
  Gem: 4,
  Currency: 5,
  DivinationCard: 6,
  Quest: 7,
  Prophecy: 8,
  Foil: 9,
  SupporterFoil: 10,
  Necropolis: 11,
  Gold: 12,
  BreachSkill: 13,
} as const;

/**
 * One canonical line in a snapshot. Fungibles are already summed across every
 * tracked tab at this point — that summing is what makes tab moves, stack merges
 * and stack splits produce a zero delta structurally rather than as a patched-up
 * special case.
 */
export interface SnapshotLine {
  itemKey: string;
  priceKey: string | null;
  displayName: string;
  qty: number;
  /** null when the item could not be priced (rares, unmatched, below min count). */
  unitMicro: bigint | null;
  isFungible: boolean;
  tabIds: string[];
  icon?: string;
}

export interface PriceRow {
  priceKey: string;
  displayName: string;
  icon?: string;
  chaosMicro: bigint;
  count: number;
  listingCount: number;
}
